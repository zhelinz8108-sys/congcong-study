import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import nextEnv from "@next/env";
import ts from "typescript";

// Transpile actual route/store code into a network-free isolated VM. The only
// database is an in-memory SQL adapter; no learner data is loaded or written.
// The existing encrypted question key is read into memory only for real grading.
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const nativeRequire = createRequire(import.meta.url);
const root = path.resolve("src"), cache = new Map(), first = new Map(), rows = new Map(), tails = new Map(), cloud = [];
let student = "test-student", mutations = 0;
const key = (s, scope, id) => JSON.stringify([s, scope, id]);
const rowKey = (s, subject, id) => key(s, subject, id);
const sql = async (text, p = []) => {
  text = text.trim();
  if (text.startsWith("CREATE") || text.startsWith("ALTER")) return { rows: [] };
  if (text.includes("FROM student_cloud_state")) return { rows: structuredClone(cloud.filter(row => row.student_id === p[0] && row.scope.startsWith(p[1].split("%")[0]))) };
  if (text.startsWith("INSERT INTO student_first_submissions")) { const [s, scope, id, answer, feedback, date] = p; assert(!first.has(key(s, scope, id))); first.set(key(s, scope, id), { answer: JSON.parse(answer), feedback: JSON.parse(feedback), submittedAt: date }); mutations++; return { rows: [] }; }
  if (text.startsWith("INSERT INTO grade6_bank_responses")) {
    const [s, subject, id, answer, submitted, outcome, score, max, submissions] = p, k = rowKey(s, subject, id);
    if (rows.has(k)) return { rows: [] };
    const r = { question_id: id, student_id: s, subject_id: subject, answers: JSON.parse(answer), submitted, outcome, score, max_score: max, submissions, updated_at: new Date().toISOString(), revision: 1 };
    rows.set(k, r); mutations++; return { rows: [structuredClone(r)] };
  }
  if (text.startsWith("UPDATE grade6_bank_responses")) {
    assert(text.includes("AND submitted=FALSE AND submissions=0"), "atomic SQL must guard the first submission");
    const [s, subject, id, answer, submitted, outcome, score, max, count, revision] = p;
    const r = rows.get(rowKey(s, subject, id)); if (!r || r.revision !== revision || r.submitted || r.submissions > 0) return { rows: [] };
    Object.assign(r, { answers: JSON.parse(answer), submitted, outcome, score, max_score: max, submissions: r.submissions + count, revision: r.revision + 1, updated_at: new Date().toISOString() }); mutations++; return { rows: [structuredClone(r)] };
  }
  if (text.includes("FROM grade6_bank_responses")) {
    let found = [...rows.values()].filter(r => r.student_id === p[0]);
    if (text.includes("AND question_id=$2")) found = found.filter(r => r.question_id === p[1] && (r.submitted || r.submissions > 0));
    else if (text.includes("AND question_id=$3")) found = found.filter(r => r.question_id === p[2] && (r.subject_id === p[1] || text.includes("OR submitted=TRUE") && (r.submitted || r.submissions > 0)));
    else found = found.filter(r => r.subject_id === p[1] || r.submitted || r.submissions > 0);
    return { rows: structuredClone(found) };
  }
  throw new Error("Unsupported isolated SQL");
};
const once = {
  firstSubmission: async (s, scope, id) => first.get(key(s, scope, id)) ?? null,
  firstSubmissions: async (s, scope) => Object.fromEntries([...first].filter(([k]) => JSON.parse(k)[0] === s && JSON.parse(k)[1] === scope).map(([k, r]) => [JSON.parse(k)[2], structuredClone(r)])),
  withFirstSubmissionLock: async (s, scope, id, callback) => {
    const k = key(s, scope, id), previous = tails.get(k) ?? Promise.resolve(); let release;
    const hold = new Promise(resolve => { release = resolve; }); tails.set(k, previous.then(() => hold)); await previous;
    try { return await callback({ query: sql }, first.get(k) ?? null); } finally { release(); }
  },
  saveFirstSubmission: async (s, scope, id, answer, grade, legacy) => once.withFirstSubmissionLock(s, scope, id, async () => {
    const k = key(s, scope, id), old = first.get(k); if (old) return { ...structuredClone(old), replayed: true };
    const record = legacy ?? { answer: structuredClone(answer), feedback: await grade(answer), submittedAt: new Date().toISOString() };
    first.set(k, structuredClone(record)); mutations++; return { ...structuredClone(record), replayed: !!legacy };
  }),
};
const response = { json: (value, init = {}) => ({ status: init.status ?? 200, value, headers: init.headers }) };
function load(relative) {
  const file = path.resolve(root, relative); if (cache.has(file)) return cache.get(file);
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
  const module = { exports: {} }; cache.set(file, module.exports);
  const require = spec => {
    if (spec === "server-only") return {};
    if (spec.startsWith("node:")) return nativeRequire(spec);
    if (spec === "next/server") return { NextResponse: response };
    if (spec === "@/lib/db") return { pool: { query: sql } };
    if (spec === "@/server/first-submission") return once;
    if (spec === "@/server/holiday-math-700/http") return { holidayAccess: () => null, holidayBody: r => r.body, holidayHeaders: { "Cache-Control": "private, no-store" } };
    if (spec === "@/server/grade6-bank/http") return { bankProfile: () => ({ id: student }) };
    let p = spec.startsWith("@/") ? path.resolve(root, spec.slice(2)) : path.resolve(path.dirname(file), spec); if (!path.extname(p)) p += ".ts";
    return load(path.relative(root, p));
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { module, exports: module.exports, require, process: { env: { NODE_ENV: "production", HOLIDAY_MATH_700_KEY: process.env.HOLIDAY_MATH_700_KEY } }, globalThis: {}, Date, Buffer, console }, { filename: file });
  cache.set(file, module.exports); return module.exports;
}
const progress = load("server/grade6-bank/progress.ts");
const wrong = { questionId: "q1", outcome: "incorrect", score: 0, maxScore: 1, message: "wrong", answerText: "private", answerImages: [], fields: [] };
const correct = { ...wrong, outcome: "correct", score: 1 };
await progress.saveBankResponse(student, "subject-a", "q1", { a: "wrong" }, 0);
const submitted = await progress.saveBankResponse(student, "subject-a", "q1", { a: "wrong" }, 1, wrong);
assert.equal(submitted.submissions, 1);
const count = mutations;
for (const [subject, revision] of [["subject-a", 2], ["subject-other", 0]]) {
  await assert.rejects(progress.saveBankResponse(student, subject, "q1", { a: "correct" }, revision), /已提交并锁定/);
  await assert.rejects(progress.saveBankResponse(student, subject, "q1", { a: "correct" }, revision, correct), /已提交并锁定/);
}
assert.equal(mutations, count, "locked answer/grade/clock/revision must not change");
assert.equal((await progress.bankProgress(student, "subject-other")).responses.q1.score, 0);
assert.equal((await progress.bankResponse(student, "subject-other", "q1")).answers.a, "wrong");
const race = await Promise.allSettled([
  progress.saveBankResponse(student, "subject-a", "q2", { a: "wrong" }, 0, { ...wrong, questionId: "q2" }),
  progress.saveBankResponse(student, "subject-b", "q2", { a: "correct" }, 0, { ...correct, questionId: "q2" }),
]);
assert.equal(race.filter(r => r.status === "fulfilled").length, 1, "different subject cannot create another graded attempt");
assert.equal((await progress.bankResponse(student, "subject-b", "q2")).score, 0);
rows.set(rowKey(student, "old", "legacy"), { question_id: "legacy", student_id: student, subject_id: "old", answers: { aggregate: "historic" }, submitted: false, outcome: null, score: null, max_score: 0, submissions: 3, updated_at: new Date().toISOString(), revision: 8 });
await assert.rejects(progress.saveBankResponse(student, "new", "legacy", { a: "new" }, 0, correct), /已提交并锁定/);
assert.equal(rows.get(rowKey(student, "old", "legacy")).revision, 8);
const legacyProgress = await progress.bankProgress(student, "new");
const legacyStats = load("lib/grade6-bank-types.ts").bankStats(["legacy"], legacyProgress.responses);
assert.equal(legacyStats.answered, 1, "an old submitted-then-edited record is still answered");
assert.equal(legacyStats.review, 1, "lost historic grades must not be invented");
student = "second-student";
await progress.saveBankResponse(student, "subject-a", "q1", { a: "correct" }, 0, correct);
assert.equal((await progress.bankResponse(student, "subject-a", "q1")).score, 1, "student identities remain independent");

for (const [routeFile, url] of [["app/api/math/generated-practice/route.ts", "http://isolated/api?unit=unit-1&difficulty=medium"], ["app/api/math/grade-six/route.ts", "http://isolated/api"]]) {
  const api = load(routeFile), get = await api.GET({ nextUrl: new URL(url) }); assert.equal(get.status, 200);
  const questions = get.value.questions ?? Object.values(get.value.units).flat(); assert(questions.length >= 100);
  assert(!JSON.stringify(questions).match(/"(?:answer|answerIndex|acceptableAnswers|explanation|wrongReasons)":/));
  const q = questions[0], generated = !!get.value.questions;
  const firstResult = await api.POST({ body: { question_id: q.id, value: generated ? "deliberately wrong" : (q.options.length - 1) } });
  assert.equal(firstResult.status, 200);
  const retry = await api.POST({ body: { question_id: q.id, value: generated ? firstResult.value.feedback.answer : firstResult.value.feedback.answerIndex } });
  assert.deepEqual(retry.value, firstResult.value, "later correct answer replays original first score");
  const reload = await api.GET({ nextUrl: new URL(url) }); assert.deepEqual(reload.value.attempts[q.id].feedback, firstResult.value.feedback);
}
const generatedApi = load("app/api/math/generated-practice/route.ts");
for (let unit = 1; unit <= 8; unit++) for (const difficulty of ["medium", "hard", "super"]) {
  const response = await generatedApi.GET({ nextUrl: new URL(`http://isolated/api?unit=unit-${unit}&difficulty=${difficulty}`) });
  assert.equal(response.status, 200); assert.equal(response.value.questions.length, 100);
  assert(!JSON.stringify(response.value.questions).match(/"(?:answer|answerIndex|acceptableAnswers|explanation|wrongReasons)":/), "all generated chapter/difficulty question payloads must be public-only");
}

const mathOnce = load("server/math-first-attempts.ts");
const holidayQuestions = load("server/holiday-math-700/questions.public.json");
const holidayPrivate = load("server/holiday-math-700/private-bank.ts");
const holiday = holidayQuestions.find(q => holidayPrivate.holidayPrivateAnswer(q.id).answer.kind === "number");
assert(holiday, "real numeric holiday question is required");
const holidayId = holiday.id;
assert.equal(await mathOnce.readHolidayFeedback(student, holidayId), null, "unsubmitted private answers must not be readable");
const holidayFirst = await mathOnce.submitHolidayOnce(student, holidayId, "999999");
assert.equal(holidayFirst.feedback.correct, false);
const holidayRetry = await mathOnce.submitHolidayOnce(student, holidayId, holidayPrivate.holidayPrivateAnswer(holidayId).answer.value);
assert(JSON.stringify(holidayFirst.feedback) === JSON.stringify(holidayRetry.feedback), "holiday retry cannot replace the original incorrect result");
const holidayProgress = await mathOnce.holidayFirstProgress(student, "another-subject");
assert.equal(holidayProgress.attempts[holidayId].score, 0);
assert.equal(holidayProgress.drafts[holidayId], "999999");
assert(!JSON.stringify(holidayProgress).match(/"(?:solution|choice_rationales|common_mistakes|expected)":/));

const nationalRubrics = load("data/national-day-math-grading-day1.json");
const nationalId = Object.keys(nationalRubrics)[0], rubric = nationalRubrics[nationalId];
const nationalWrong = Object.fromEntries(rubric.fields.map(field => [field.id, "deliberately wrong"]));
const nationalRight = Object.fromEntries(rubric.fields.map(field => [field.id, field.accepted[0]]));
assert.equal(await mathOnce.readNationalFeedback(student, nationalId), null);
const nationalFirst = await mathOnce.submitNationalOnce(student, nationalId, nationalWrong);
assert.equal(nationalFirst.feedback.correct, false);
const nationalRetry = await mathOnce.submitNationalOnce(student, nationalId, nationalRight);
assert(JSON.stringify(nationalFirst.feedback) === JSON.stringify(nationalRetry.feedback), "knowledge quiz retry cannot replace the original incorrect result");
const nationalProgress = await mathOnce.nationalFirstProgress(student, "another-subject");
assert.equal(nationalProgress.attempts[nationalId].correct, false);
assert(JSON.stringify(JSON.parse(nationalProgress.attempts[nationalId].value)) === JSON.stringify(nationalWrong));
assert(!JSON.stringify(nationalProgress).match(/"(?:steps|expected|accepted)":/));

student = "legacy-student";
cloud.push({ student_id: student, scope: "math:holiday700:old-subject:v1", updated_at: "2026-01-01T00:00:00Z", payload: { drafts: { [holidayId]: "999999" }, attempts: { [holidayId]: { submissions: 2, score: 0, maxScore: 1, correct: false, updatedAt: "2026-01-01T00:00:00Z" } } } });
cloud.push({ student_id: student, scope: "math:national-day:old-subject:v1", updated_at: "2026-01-01T00:00:00Z", payload: { attempts: { [nationalId]: { value: JSON.stringify(nationalWrong), checked: true, correct: false } } } });
cloud.push({ student_id: student, scope: "math:holiday700:new-subject:v1", updated_at: "2026-02-01T00:00:00Z", payload: { drafts: { [holidayId]: "newer-alias-answer" }, attempts: { [holidayId]: { submissions: 1, score: 1, maxScore: 1, correct: true } } } });
cloud.push({ student_id: student, scope: "math:national-day:new-subject:v1", updated_at: "2026-02-01T00:00:00Z", payload: { attempts: { [nationalId]: { value: JSON.stringify(nationalRight), checked: true, correct: true } } } });
assert.equal((await mathOnce.holidayFirstProgress(student, "new-subject")).attempts[holidayId].correct, false);
assert.equal((await mathOnce.nationalFirstProgress(student, "new-subject")).attempts[nationalId].correct, false);
assert.equal((await mathOnce.submitHolidayOnce(student, holidayId, holidayPrivate.holidayPrivateAnswer(holidayId).answer.value)).feedback.correct, false);
assert.equal((await mathOnce.submitNationalOnce(student, nationalId, nationalRight)).feedback.correct, false);

console.log(JSON.stringify({ passed: true, scenarios: ["atomic SQL guards", "draft and resubmit locked", "different subject locked", "first score frozen", "cross-subject concurrent submit", "legacy submitted-then-edited records preserved", "independent student identities", "generated questions public until submit", "grade-six public until submit", "retry returns original result", "reload restores original result", "holiday 700 real grading and immutable score", "knowledge quiz real grading and immutable score", "old cloud submissions lock across subjects", "public progress contains no private solutions"], studentWrites: 0, mockMutations: mutations }));
