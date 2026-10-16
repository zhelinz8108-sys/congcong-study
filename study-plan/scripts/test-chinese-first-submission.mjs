import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { verifySix } from "./test-chinese-six.mjs";
import { appRoot } from "./holiday-math-test-utils.mjs";

const { lib, server, bankModule } = verifySix();
const item = bankModule.sixPrivateItem("sentence-01"), question = item.questions[0];
const old = { id: "old", itemId: item.id, startedAt: "2020-01-01", responses: { [question.id]: { value: "第一次保留的答案", submittedAt: "2020-01-02", correct: null, selfScore: "full" } } };
const newer = { id: "new", itemId: item.id, startedAt: "2021-01-01", responses: { [question.id]: { value: "后来的答案", submittedAt: "2021-01-02", correct: null } } };
const state = { attempts: { new: newer, old }, current: { [item.id]: "new" }, reviewed: [] };
const snapshot = JSON.stringify(state);
assert.equal(lib.sixFirstAttempt(state, item.id).responses[question.id].value, old.responses[question.id].value);
assert.equal(lib.sixAttemptStats(lib.sixFirstAttempt(state, item.id), item.questions.length).evaluated, 0);
assert.throws(() => server.transitionSixProgress(state, { action: "answer", itemId: item.id, attemptId: "new", questionId: question.id, value: "覆盖" }), /永久锁定/);
assert.deepEqual(server.transitionSixProgress(state, { action: "start", itemId: item.id }), state);
assert.equal(JSON.stringify(state), snapshot);

// Mock storage is confined to this process; no real student writes, HTTP or env
// propagation. Shared insert-only store concurrency is separately tested.
const require = createRequire(import.meta.url), cache = new Map(), saved = new Map();
let legacy = [], serial = Promise.resolve(), legacyReadError = false;
const key = (student, scope, id) => JSON.stringify([student, scope, id]);
function load(file) {
  const filename = path.resolve(appRoot, file);
  if (cache.has(filename)) return cache.get(filename);
  const loaded = { exports: {} }; cache.set(filename, loaded.exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  function dependency(specifier) {
    if (specifier === "server-only") return {};
    if (specifier === "@/lib/cloud-progress-schema") return { ensureCloudProgressSchema: async () => {} };
    if (specifier === "@/lib/local-fallback") return { localDataFallbackAllowed: () => false };
    if (specifier === "@/lib/db") return { pool: { query: async sql => { assert.match(sql, /^SELECT payload/); if (legacyReadError) throw new Error("isolated history read failure"); return { rows: [{ payload: legacy }] }; } } };
    if (specifier === "./first-submission") return {
      firstSubmissions: async (student, scope) => Object.fromEntries([...saved].filter(([k]) => { const [s, sc] = JSON.parse(k); return s === student && sc === scope; }).map(([k, record]) => [JSON.parse(k)[2], record])),
      saveFirstSubmission: (student, scope, id, answer, grade, retained) => {
        const action = serial.then(async () => {
          const idKey = key(student, scope, id); const prior = saved.get(idKey);
          if (prior) return { ...prior, replayed: true };
          const record = retained ?? { answer, feedback: await grade(answer), submittedAt: new Date().toISOString() };
          saved.set(idKey, record); return { ...record, replayed: Boolean(retained) };
        }); serial = action.catch(() => {}); return action;
      },
    };
    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      let target = specifier.startsWith("@/") ? path.join(appRoot, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      if (!path.extname(target)) target += ".ts";
      return load(target);
    }
    return require(specifier);
  }
  new Function("require", "module", "exports", code)(dependency, loaded, loaded.exports); return loaded.exports;
}
const reading = load("src/server/chinese-reading-progress.ts"), source = load("src/lib/chinese-reading.ts");
let total = 0;
for (const passage of source.CHINESE_READING_PASSAGES) {
  const publicPassage = reading.readingPublicPassage(passage.id);
  for (const q of publicPassage.questions) for (const privateKey of ["answer", "acceptedAnswers", "explanation", "scoringPoints", "template", "mistakeTags"]) assert.equal(q[privateKey], undefined);
  for (const q of passage.questions) {
    total++; assert.equal(reading.gradeReadingSubmission(passage.id, q.id, q.answer).isCorrect, q.type === "short" ? null : true);
  }
}
const passage = source.CHINESE_READING_PASSAGES[0], q = passage.questions.find(q => q.type === "choice");
assert.deepEqual((await reading.readingStudentResults("isolated", passage.id)).records, {});
assert.throws(() => reading.gradeReadingSubmission(passage.id, q.id, "invalid choice"), /有效选项/);
const wrong = q.options.find(value => value !== q.answer);
const submitted = await reading.submitReadingResponse("isolated", passage.id, q.id, wrong);
assert.equal(submitted.feedback.isCorrect, false);
const [changed, concurrent] = await Promise.all([
  reading.submitReadingResponse("isolated", passage.id, q.id, q.answer),
  reading.submitReadingResponse("isolated", passage.id, q.id, q.answer),
]);
assert.equal(changed.answer, wrong); assert.equal(concurrent.answer, wrong);
assert.equal(changed.replayed, true); assert.equal(changed.feedback.isCorrect, false);
assert.equal((await reading.readingStudentResults("isolated", passage.id)).records[q.id].answer, wrong);
assert.deepEqual((await reading.readingStudentResults("other-student", passage.id)).records, {});
legacy = [{ id: `subject:${passage.id}:${q.id}`, passageId: passage.id, questionId: q.id, response: wrong, updatedAt: "2021-02-03T00:00:00Z" }];
const historical = await reading.submitReadingResponse("historical", passage.id, q.id, q.answer);
assert.equal(historical.answer, wrong); assert.equal(historical.submittedAt, legacy[0].updatedAt); assert.equal(historical.replayed, true);
// A retained mistake stays wrong even when its text is accepted by the current
// grader. Historical outcomes must never be recomputed by the new lock layer.
legacy = [{ passageId: passage.id, questionId: q.id, response: q.answer, updatedAt: "2021-02-03T00:00:00Z" }];
const retainedRead = await reading.readingStudentResults("retained-old-mistake", passage.id);
assert.equal(retainedRead.records[q.id].feedback.isCorrect, false);
const retainedSaved = await reading.submitReadingResponse("retained-old-mistake", passage.id, q.id, q.answer);
assert.equal(retainedSaved.feedback.isCorrect, false);
assert.equal(retainedSaved.replayed, true);
const shortQuestion = passage.questions.find(value => value.type === "short");
assert.ok(shortQuestion);
legacy = [{ passageId: passage.id, questionId: shortQuestion.id, response: shortQuestion.answer, updatedAt: "2021-02-03T00:00:00Z" }];
assert.equal((await reading.readingStudentResults("old-open-response", passage.id)).records[shortQuestion.id].feedback.isCorrect, null);
legacy = [];
assert.equal((await reading.readingStudentResults("isolated")).mistakes.length, 1);
// Database history failure must not unlock an old answer or seed a new score.
legacyReadError = true;
const savedCountBeforeFailure = saved.size;
await assert.rejects(reading.readingStudentResults("isolated", passage.id), /isolated history read failure/);
await assert.rejects(reading.submitReadingResponse("isolated-db-failure", passage.id, q.id, q.answer), /isolated history read failure/);
assert.equal(saved.size, savedCountBeforeFailure);
legacyReadError = false;
// Exercise production fail-closed with fallback explicitly enabled, using an
// isolated process object and filesystem mocks; no actual env or data changes.
const isolatedSix = { exports: {} };
let filesystemCalls = 0;
const isolatedSixCode = ts.transpileModule(readFileSync(path.join(appRoot, "src/server/chinese-six-progress.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function("require", "module", "exports", "process", isolatedSixCode)(specifier => {
  if (specifier === "server-only") return {};
  if (specifier === "@/lib/db") return { pool: { connect: async () => { throw new Error("must not connect after schema failure"); } } };
  if (specifier === "@/lib/cloud-progress-schema") return { ensureCloudProgressSchema: async () => { throw new Error("isolated schema failure"); } };
  if (specifier === "@/lib/local-fallback") return { localDataFallbackAllowed: () => true };
  if (specifier === "node:fs/promises") return Object.fromEntries(["mkdir", "readFile", "rename", "writeFile"].map(name => [name, async () => { filesystemCalls++; throw new Error("filesystem forbidden in this test"); }]));
  if (specifier === "@/lib/chinese-six") return lib;
  if (specifier === "./chinese-six-bank") return bankModule;
  return require(specifier);
}, isolatedSix, isolatedSix.exports, { env: { NODE_ENV: "production" }, cwd: () => appRoot });
await assert.rejects(isolatedSix.exports.sixStudentProgress("isolated-prod-outage", { action: "start", itemId: item.id }), /isolated schema failure/);
assert.equal(filesystemCalls, 0);
console.log(JSON.stringify({ chineseSix: "permanent cross-attempt lock", readingQuestions: total, checks: "server grading, private public DTO, same student replay, concurrent replay, account separation, retained legacy lock, no self-scoring", studentWrites: 0 }));
