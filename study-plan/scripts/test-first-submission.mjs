import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Actual source code; process-local SQL adapter only. No env files, network,
// student credentials or production write interfaces are used by this test.
const require = createRequire(import.meta.url), root = path.resolve("src"), cache = new Map();
const first = new Map(), tails = new Map(), responses = new Map();
const q = { id: "q1", set_id: "set", question_type: "choice", correct_answer: "B", score: 2, auto_grade: true, prompt: "test", explanation: "private", options: [] };
const questions = new Map([[q.id, q], ["q2", { ...q, id: "q2" }], ["legacy", { ...q, id: "legacy" }]]);
const attempts = new Map([["a1", { id: "a1", student_id: "learner", set_id: "set", status: "in_progress" }], ["a2", { id: "a2", student_id: "learner", set_id: "set", status: "in_progress" }], ["foreign", { id: "foreign", student_id: "other", set_id: "set", status: "in_progress" }]]);
const key = (student, scope, id) => JSON.stringify([student, scope, id]);
let writes = 0;
async function query(raw, args = [], client) {
  const sql = raw.trim().replace(/\s+/g, " ");
  if (sql.startsWith("CREATE")) return { rows: [] };
  if (sql === "BEGIN") return { rows: [] };
  if (sql === "COMMIT" || sql === "ROLLBACK") { client?.releaseLock?.(); return { rows: [] }; }
  if (sql.includes("pg_advisory_xact_lock")) {
    const previous = tails.get(args[0]) ?? Promise.resolve(); let release;
    const held = new Promise(resolve => { release = resolve; }); tails.set(args[0], previous.then(() => held));
    await previous; client.releaseLock = release; return { rows: [] };
  }
  if (sql.startsWith("SELECT") && sql.includes("FROM student_first_submissions")) {
    const entries = [...first].filter(([k]) => { const [s, scope, id] = JSON.parse(k); return s === args[0] && scope === args[1] && (args.length < 3 || id === args[2]); });
    return { rows: entries.map(([k, row]) => ({ ...structuredClone(row), question_id: JSON.parse(k)[2] })) };
  }
  if (sql.startsWith("INSERT INTO student_first_submissions")) {
    const k = key(...args.slice(0, 3)); assert(!first.has(k), "the ledger must only INSERT once");
    const row = { answer: JSON.parse(args[3]), feedback: JSON.parse(args[4]), submitted_at: args[5] };
    first.set(k, row); writes++; return { rows: [structuredClone(row)] };
  }
  if (sql.includes("FROM math_attempts WHERE")) {
    const a = attempts.get(args[0]); return { rows: a && a.student_id === args[1] ? [a] : [] };
  }
  if (sql.includes("FROM math_questions WHERE id")) {
    const item = questions.get(args[0]); return { rows: item?.set_id === args[1] ? [item] : [] };
  }
  if (sql.includes("FROM math_questions WHERE set_id")) return { rows: [...questions.values()].filter(item => item.set_id === args[0]) };
  if (sql.startsWith("SELECT") && sql.includes("FROM math_responses")) {
    const historical = [...responses.values()].filter(r => attempts.get(r.attempt_id)?.status === "submitted" && attempts.get(r.attempt_id)?.student_id === (sql.includes("DISTINCT ON") ? args[0] : args[1]) && (sql.includes("DISTINCT ON") || r.question_id === args[0]));
    return { rows: historical.map(r => ({ ...r, submitted_at: "2020-01-01T00:00:00Z" })) };
  }
  if (sql.startsWith("INSERT INTO math_responses")) {
    const [id, attemptId, questionId, answer, correct, status, score, maxScore, feedback] = args;
    responses.set(key("learner", attemptId, questionId), { id, attempt_id: attemptId, question_id: questionId, response_text: answer, is_correct: correct, grading_status: status, score, max_score: maxScore, feedback });
    writes++; return { rows: [] };
  }
  throw new Error(`Unsupported isolated SQL: ${sql.slice(0, 80)}`);
}
const pool = { query, connect: async () => { const client = { query: (sql, args) => query(sql, args, client), release: () => client.releaseLock?.() }; return client; } };
function load(relative) {
  const file = path.resolve(root, relative); if (cache.has(file)) return cache.get(file);
  const module = { exports: {} }; cache.set(file, module.exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const dependency = spec => {
    if (spec === "server-only") return {};
    if (spec === "@/lib/db") return { pool };
    if (spec === "@/lib/math-question-bank") return { ensureMathQuestionBankSchema: async () => {}, gradeMathResponse: (item, text, selfRating) => { assert.equal(selfRating, null); const correct = text === item.correct_answer; return { isCorrect: correct, status: correct ? "correct" : "incorrect", score: correct ? item.score : 0, maxScore: item.score, feedback: "server grade" }; } };
    if (spec.startsWith("@/")) return load(`${spec.slice(2)}.ts`);
    return require(spec);
  };
  new Function("require", "module", "exports", code)(dependency, module, module.exports); return module.exports;
}
const store = load("server/first-submission.ts");
let grades = 0;
const grade = answer => { grades++; return { correct: answer === "right" }; };
const race = await Promise.all([store.saveFirstSubmission("learner", "test:v1", "one", "wrong", grade), store.saveFirstSubmission("learner", "test:v1", "one", "right", grade)]);
assert.equal(grades, 1); assert.equal(race[0].answer, "wrong"); assert.equal(race[1].answer, "wrong"); assert.equal(race[1].replayed, true);
const timestamp = race[0].submittedAt, before = writes;
for (let i = 0; i < 5; i++) assert.equal((await store.saveFirstSubmission("learner", "test:v1", "one", "right", grade)).submittedAt, timestamp);
assert.equal(writes, before); assert.equal((await store.firstSubmission("learner", "test:v1", "one")).feedback.correct, false);
assert.equal((await store.saveFirstSubmission("other", "test:v1", "one", "right", grade)).feedback.correct, true);
await assert.rejects(store.saveFirstSubmission("learner", "test:v1", "bad", "x", () => { throw new Error("grading failed"); }), /grading failed/);
assert.equal(await store.firstSubmission("learner", "test:v1", "bad"), null);
await assert.rejects(store.saveFirstSubmission("learner", "bad scope", "one", "x", grade), /无效/);
const legacy = await store.saveFirstSubmission("learner", "test:v1", "old", "right", grade, { answer: "historical wrong", feedback: { correct: false }, submittedAt: "2020-01-01T00:00:00Z" });
assert.equal(legacy.answer, "historical wrong"); assert.equal(legacy.feedback.correct, false);

const policy = load("lib/immutable-progress-policy.ts");
const old = { drafts: { q1: "wrong" }, attempts: { q1: { checked: true, correct: false, submissions: 1 } }, last: "one" };
const merged = policy.mergeProgressWithoutChangingScores("math:holiday700:subject:v1", old, { drafts: { q1: "right", q2: "draft" }, attempts: { q1: { correct: true }, q2: { correct: true } }, last: "two" });
assert.deepEqual(merged.attempts, old.attempts); assert.equal(merged.drafts.q1, "wrong"); assert.equal(merged.drafts.q2, "draft");
assert.deepEqual(policy.mergeProgressWithoutChangingScores("english:holiday2400:other:v1", null, { attempts: { q1: { selected: "A", correct: true } } }).attempts, {});
const listen = { exercises: { one: { submitted: true, score: 0, attempts: 1, answers: { a: "wrong" } } } };
assert.deepEqual(policy.mergeProgressWithoutChangingScores("listening:yiben-grade6:v1", listen, { exercises: {} }).exercises.one, listen.exercises.one);
assert(policy.dedicatedProgressScope("chinese:reading:attempts:v1"));
assert(policy.dedicatedProgressScope("chinese:reading:mistakes:v1"));
for (const scope of ["math:holiday700:subject:v1", "math:national-day:subject:v1", "english:holiday2400:subject:v1", "english:national-day:subject:v1", "listening:yiben-grade6:v1", "grammar:course:v1"]) {
  for (const invalid of [[], null, false, "clear"]) assert.deepEqual(policy.mergeProgressWithoutChangingScores(scope, old, invalid), old, `${scope} must not erase legacy records with non-object payloads`);
}
await store.saveFirstSubmission("learner", "test:v1", "same-client", "answer", async (_answer, client) => {
  assert.equal(typeof client.query, "function");
  const originals = await store.firstSubmissions("learner", "test:v1", client);
  assert.equal(originals.one.answer, "wrong");
  return { correct: null };
});

const legacyBank = load("server/legacy-math-first.ts");
assert.equal((await legacyBank.legacyMathQuestions("learner", "set"))[0].correct_answer, undefined);
const initial = await legacyBank.submitLegacyMathQuestion("learner", "a1", "q1", "A");
assert.equal(initial.feedback.isCorrect, false);
const count = writes;
const changed = await legacyBank.submitLegacyMathQuestion("learner", "a2", "q1", "B");
assert.equal(changed.response_text, "A"); assert.equal(changed.feedback.isCorrect, false); assert.equal(writes, count);
await assert.rejects(legacyBank.submitLegacyMathQuestion("learner", "foreign", "q1", "B"), /不存在/);
const crossAttempt = await Promise.all([legacyBank.submitLegacyMathQuestion("learner", "a1", "q2", "A"), legacyBank.submitLegacyMathQuestion("learner", "a2", "q2", "B")]);
assert.equal(crossAttempt[0].response_text, crossAttempt[1].response_text); assert.equal(crossAttempt[1].feedback.isCorrect, false);
const rendered = await legacyBank.legacyMathQuestions("learner", "set");
assert.equal(rendered.find(item => item.id === "q1").locked, true); assert.equal(rendered.find(item => item.id === "q1").response_text, "A");
console.log(JSON.stringify({ sharedLedger: "PASS", genericScoreForgeryAndErase: "PASS", legacyMathCrossAttemptAndPrivateAnswers: "PASS", concurrentReplay: "PASS", studentWrites: 0 }));
