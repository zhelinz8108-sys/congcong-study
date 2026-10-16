import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import ts from "typescript";

// This regression never contacts a server or PostgreSQL. Actual route, bank,
// native-release, grading and persistence code run against an in-memory SQL
// adapter. The existing encrypted content key is loaded into memory only;
// neither credentials nor private answers are written to the test report.
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const builtin = createRequire(import.meta.url);
const root = path.resolve("src"), bankRoot = path.resolve("content/grade6-bank");
const immutablePaths = ["manifest.json", "questions.public.json", "questions.native.public.json", "sealed/answers.encrypted.json", "sealed/native-answers.encrypted.json", "sealed/detailed-solutions.encrypted.json"];
const fingerprints = () => Object.fromEntries(immutablePaths.filter(p => fs.existsSync(path.join(bankRoot, p))).map(p => [p, createHash("sha256").update(fs.readFileSync(path.join(bankRoot, p))).digest("hex")]));
const beforeHashes = fingerprints();
const rawManifest = JSON.parse(fs.readFileSync(path.join(bankRoot, "manifest.json"), "utf8"));
const rawQuestions = JSON.parse(fs.readFileSync(path.join(bankRoot, "questions.public.json"), "utf8"));
const native = JSON.parse(fs.readFileSync(path.join(bankRoot, "questions.native.public.json"), "utf8"));
const originalIds = rawManifest.collections.flatMap(c => c.questions.map(q => q.id));
const originalPositions = new Map(originalIds.map((id, i) => [id, i]));
const originalById = new Map(rawQuestions.map(q => [q.id, q]));
const cache = new Map(), first = new Map(), rows = new Map(), tails = new Map();
const subject = "00000000-0000-4000-8000-000000000626";
const otherSubject = "00000000-0000-4000-8000-000000000627";
let student = "isolated-dedup-student", mutations = 0, schemaQueries = 0;
const key = (s, scope, id) => JSON.stringify([s, scope, id]);
const clone = value => JSON.parse(JSON.stringify(value));
const snapshot = () => JSON.stringify({ rows: [...rows], first: [...first], mutations });
async function sql(text, p = []) {
  text = text.trim();
  if (text.startsWith("CREATE") || text.startsWith("ALTER")) { schemaQueries++; return { rows: [] }; }
  if (text.startsWith("INSERT INTO student_first_submissions")) {
    const [s, scope, id, answers, feedback, submittedAt] = p, k = key(s, scope, id);
    assert(!first.has(k), "first submission is immutable");
    first.set(k, { answer: JSON.parse(answers), feedback: JSON.parse(feedback), submittedAt });
    mutations++; return { rows: [] };
  }
  if (text.startsWith("INSERT INTO grade6_bank_responses")) {
    const [s, sub, id, answer, submitted, outcome, score, maxScore, submissions] = p, k = key(s, sub, id);
    if (rows.has(k)) return { rows: [] };
    const row = { question_id: id, student_id: s, subject_id: sub, answers: JSON.parse(answer), submitted, outcome, score, max_score: maxScore, submissions, updated_at: "2026-10-12T00:00:00.000Z", revision: 1 };
    rows.set(k, row); mutations++; return { rows: [clone(row)] };
  }
  if (text.startsWith("UPDATE grade6_bank_responses")) {
    assert(text.includes("AND submitted=FALSE AND submissions=0"), "SQL must guard frozen first submissions");
    const [s, sub, id, answers, submitted, outcome, score, maxScore, count, revision] = p;
    const row = rows.get(key(s, sub, id));
    if (!row || row.revision !== revision || row.submitted || row.submissions > 0) return { rows: [] };
    Object.assign(row, { answers: JSON.parse(answers), submitted, outcome, score, max_score: maxScore, submissions: row.submissions + count, revision: row.revision + 1, updated_at: "2026-10-12T00:00:01.000Z" });
    mutations++; return { rows: [clone(row)] };
  }
  if (text.includes("FROM grade6_bank_responses")) {
    let found = [...rows.values()].filter(row => row.student_id === p[0]);
    if (text.includes("AND question_id=$2")) found = found.filter(row => row.question_id === p[1] && (row.submitted || row.submissions > 0));
    else if (text.includes("AND question_id=$3")) found = found.filter(row => row.question_id === p[2] && (row.subject_id === p[1] || text.includes("OR submitted=TRUE") && (row.submitted || row.submissions > 0)));
    else found = found.filter(row => row.subject_id === p[1] || row.submitted || row.submissions > 0);
    return { rows: clone(found) };
  }
  throw new Error("Unsupported SQL in isolated regression");
}
const once = {
  firstSubmission: async (s, scope, id) => clone(first.get(key(s, scope, id)) ?? null),
  firstSubmissions: async (s, scope) => Object.fromEntries([...first].filter(([k]) => JSON.parse(k)[0] === s && JSON.parse(k)[1] === scope).map(([k, v]) => [JSON.parse(k)[2], clone(v)])),
  withFirstSubmissionLock: async (s, scope, id, callback) => {
    const k = key(s, scope, id), previous = tails.get(k) ?? Promise.resolve();
    let release; const hold = new Promise(resolve => { release = resolve; });
    tails.set(k, previous.then(() => hold)); await previous;
    try { return await callback({ query: sql }, first.get(k) ?? null); }
    finally { release(); }
  },
};
class NextResponse {
  constructor(value, init = {}) { this.value = value; this.status = init.status ?? 200; this.headers = init.headers ?? {}; }
  static json(value, init = {}) { return new NextResponse(value, init); }
}
const readonlyFs = {
  readFile: async (filename, ...args) => {
    const absolute = path.resolve(filename);
    assert(absolute.startsWith(bankRoot + path.sep), "runtime file reads must stay within immutable bank content");
    return fsp.readFile(absolute, ...args);
  },
};
function load(relative) {
  const filename = path.resolve(root, relative);
  assert(filename.startsWith(root + path.sep));
  if (cache.has(filename)) return cache.get(filename);
  const moduleRecord = { exports: {} }; cache.set(filename, moduleRecord.exports);
  const require = spec => {
    if (spec === "server-only") return {};
    if (spec === "node:fs/promises") return readonlyFs;
    if (["node:crypto", "node:path"].includes(spec)) return builtin(spec);
    if (spec.startsWith("node:") || ["pg", "http", "https", "net", "tls", "fs"].includes(spec)) throw new Error("Network, database and write capabilities are forbidden");
    if (spec === "next/server") return { NextResponse };
    if (spec === "@/lib/db") return { pool: { query: sql, connect: () => { throw new Error("Real database connection forbidden"); } } };
    if (spec === "@/server/first-submission") return once;
    if (spec === "@/lib/family-access") return { STUDENT_PROFILE_COOKIE: "test-profile", parseStudentProfileCookie: () => ({ id: student }) };
    if (spec === "@/server/holiday-math-700/http") return {
      holidayAccess: (request, write = false) => request.authenticated === false ? NextResponse.json({ error: "unauthenticated" }, { status: 401 }) : write && request.origin !== "http://isolated.test" ? NextResponse.json({ error: "origin" }, { status: 403 }) : null,
      holidayBody: request => request.body,
      holidayHeaders: { "Cache-Control": "private, no-store" },
    };
    const target = spec.startsWith("@/") ? path.resolve(root, spec.slice(2)) : path.resolve(path.dirname(filename), spec);
    if (!spec.startsWith("@/") && !spec.startsWith(".")) throw new Error("Unexpected dependency " + spec);
    return load(path.relative(root, path.extname(target) ? target : target + ".ts"));
  };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, {
    module: moduleRecord, exports: moduleRecord.exports, require, process: { cwd: () => process.cwd(), env: { NODE_ENV: "production", HOLIDAY_MATH_700_KEY: process.env.HOLIDAY_MATH_700_KEY } },
    globalThis: {}, Date, Buffer, Uint8Array, Error, console, fetch: () => { throw new Error("Network forbidden"); },
  }, { filename });
  cache.set(filename, moduleRecord.exports); return moduleRecord.exports;
}
function request(body, url = "http://isolated.test/api", authenticated = true, origin = "http://isolated.test") {
  return { body, nextUrl: new URL(url), authenticated, origin, headers: { get: () => null }, cookies: { get: () => undefined } };
}
function noPrivateKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [name, child] of Object.entries(value)) {
    assert(!["answerText", "answerImages", "rules", "expected", "answerStatus", "reviewRequired", "ciphertext", "feedback", "detailedSolution", "private", "sourceKeyImages"].includes(name), "private key leaked in public response: " + name);
    noPrivateKeys(child);
  }
}

const { RETIRED_BANK_DUPLICATES: duplicates } = load("server/grade6-bank/retired-duplicates.ts");
assert(Array.isArray(duplicates) && duplicates.length > 0, "confirmed duplicate list must exist");
const retiredIds = new Set(duplicates.map(row => row.removeId));
assert.equal(retiredIds.size, duplicates.length, "retired ids must be unique");
for (const row of duplicates) {
  assert(originalById.has(row.keepId) && originalById.has(row.removeId), "duplicate pair must have original records");
  assert(!retiredIds.has(row.keepId), "a keeper must not itself be retired");
  assert(originalPositions.get(row.keepId) < originalPositions.get(row.removeId), "preserve first appearance in manifest order");
  assert.equal(typeof row.reason, "string"); assert(row.reason.trim());
}
const bank = load("server/grade6-bank/bank.ts");
const manifest = await bank.getBankManifest();
assert.equal(rawManifest.total, 2394, "raw sealed source must remain unchanged");
assert.equal(native.total, rawManifest.total);
assert.equal(native.questions.length, rawManifest.total);
assert.equal(manifest.total, rawManifest.total - retiredIds.size);
assert.equal(manifest.collections.length, rawManifest.collections.length);
assert.equal(manifest.sourceFiles, rawManifest.sourceFiles);
assert.deepEqual(clone(manifest.collections.map(c => c.id)), rawManifest.collections.map(c => c.id));
const activeIds = manifest.collections.flatMap(c => c.questions.map(q => q.id));
assert.deepEqual(clone(activeIds), originalIds.filter(id => !retiredIds.has(id)), "order and ids must be original subsequence");
assert.equal(new Set(activeIds).size, manifest.total);
for (const collection of manifest.collections) {
  const original = rawManifest.collections.find(c => c.id === collection.id);
  const expected = original.questions.filter(q => !retiredIds.has(q.id));
  assert.deepEqual(clone(collection.questions), expected, "question numbers and metadata must not be renumbered");
  assert.equal(collection.questionCount, expected.length);
  for (const difficulty of [1, 2, 3, 4]) assert.equal(collection.difficultyCounts[difficulty] ?? 0, expected.filter(q => q.difficulty === difficulty).length);
}
const questionRoute = load("app/api/math/grade6-bank/questions/[questionId]/route.ts");
const imageRoute = load("app/api/math/grade6-bank/questions/[questionId]/images/[index]/route.ts");
const draftRoute = load("app/api/math/grade6-bank/draft/route.ts");
const submitRoute = load("app/api/math/grade6-bank/submit/route.ts");
const feedbackRoute = load("app/api/math/grade6-bank/feedback/route.ts");
const progressRoute = load("app/api/math/grade6-bank/progress/route.ts");
const progress = load("server/grade6-bank/progress.ts");
const { bankNativeInputSchema } = load("lib/grade6-bank-input-schema.ts");
const { bankStats } = load("lib/grade6-bank-types.ts");
const feedbackRequest = id => request(undefined, `http://isolated.test/api?subject_id=${subject}&question_id=${encodeURIComponent(id)}`);
let publicReads = 0, retiredEndpointChecks = 0;
for (const id of activeIds) {
  const response = await questionRoute.GET(request(), { params: Promise.resolve({ questionId: id }) });
  assert.equal(response.status, 200, id);
  noPrivateKeys(response.value);
  assert.equal(response.value.id, id);
  assert.equal(response.value.number, originalById.get(id).number);
  assert(response.value.native && response.value.inputs.length > 0);
  assert.deepEqual(clone(response.value.questionImages), []);
  assert(response.headers["Cache-Control"].includes("no-store"));
  publicReads++;
}
assert.equal(mutations, 0, "public reads do not persist learner state");

// Seed only invented historical records, deliberately giving one retired item
// a frozen zero score even when its answer happens to be correct. Reading a
// newer solution must not regrade it or transfer its answer into the keeper.
const historicId = duplicates[0].removeId, keeperId = duplicates[0].keepId;
const archived = await bank.getArchivedBankQuestion(historicId);
assert.equal(archived.id, historicId); assert(archived.native);
const historicAnswer = await bank.getPrivateBankAnswer(historicId);
const historicAnswers = Object.fromEntries(archived.inputs.map(field => [field.id, historicAnswer.rules.find(rule => rule.id === field.id)?.expected[0] ?? "historic test answer"]));
const historicResponse = { answers: historicAnswers, submitted: true, outcome: "incorrect", score: 0, maxScore: archived.inputs.length, submissions: 1, updatedAt: "2026-09-30T00:00:00.000Z", revision: 9 };
rows.set(key(student, subject, historicId), { question_id: historicId, student_id: student, subject_id: subject, ...historicResponse, max_score: historicResponse.maxScore, updated_at: historicResponse.updatedAt });
const draftId = duplicates.length > 1 ? duplicates[1].removeId : historicId;
if (draftId !== historicId) rows.set(key(student, subject, draftId), { question_id: draftId, student_id: student, subject_id: subject, answers: { answer: "unsent old draft" }, submitted: false, outcome: null, score: null, max_score: 0, submissions: 0, updated_at: "2026-09-29T00:00:00.000Z", revision: 2 });
const historyBefore = snapshot();
for (const { removeId } of duplicates) {
  assert(bank.isRetiredBankQuestion(removeId));
  assert.equal(await bank.getBankQuestion(removeId), undefined);
  const oldQuestion = await bank.getArchivedBankQuestion(removeId);
  assert.equal(oldQuestion.id, removeId);
  const body = { subject_id: subject, question_id: removeId, answers: Object.fromEntries(oldQuestion.inputs.map(field => [field.id, "test answer"])), base_revision: 0, input_schema: bankNativeInputSchema(oldQuestion) };
  for (const response of [
    await questionRoute.GET(request(), { params: Promise.resolve({ questionId: removeId }) }),
    await imageRoute.GET(request(), { params: Promise.resolve({ questionId: removeId, index: "0" }) }),
    await draftRoute.PUT(request(body)),
    await submitRoute.POST(request(body)),
  ]) { assert.equal(response.status, 410, removeId); noPrivateKeys(response.value); retiredEndpointChecks++; }
  assert.equal(snapshot(), historyBefore, "retired endpoints must not write, remap or delete historical records");
  const feedback = await feedbackRoute.GET(feedbackRequest(removeId));
  if (removeId === historicId) {
    assert.equal(feedback.status, 200);
    assert.equal(feedback.value.response.score, 0); assert.equal(feedback.value.feedback.score, 0);
    assert.equal(feedback.value.response.revision, 9);
    assert.deepEqual(clone(feedback.value.response.answers), historicAnswers);
    assert(feedback.value.feedback.answerText, "permitted archived feedback remains available");
  } else { assert.equal(feedback.status, 403, "retired unsubmitted/draft answers stay private"); noPrivateKeys(feedback.value); }
  assert.equal(snapshot(), historyBefore, "feedback must stay read-only");
}
const restored = await progress.bankProgress(student, subject);
assert(restored.responses[historicId], "historical retired responses are retained");
assert.equal(restored.responses[keeperId], undefined, "never copy a duplicate score/answer into keeper");
assert.equal(bankStats(activeIds, restored.responses).answered, 0, "active counts exclude archived duplicate attempts");
assert.equal(bankStats([historicId], restored.responses).answered, 1);
assert.equal(snapshot(), historyBefore);
student = "independent-isolated-student";
assert.equal((await feedbackRoute.GET(feedbackRequest(historicId))).status, 403, "a different learner cannot read retired feedback");
student = "isolated-dedup-student";
assert.equal((await feedbackRoute.GET(request(undefined, `http://isolated.test/api?subject_id=${subject}&question_id=${historicId}`, false))).status, 401);
for (const qid of ["unknown-question-id"]) {
  const body = { subject_id: subject, question_id: qid, answers: { answer: "x" }, base_revision: 0 };
  for (const response of [
    await questionRoute.GET(request(), { params: Promise.resolve({ questionId: qid }) }),
    await imageRoute.GET(request(), { params: Promise.resolve({ questionId: qid, index: "0" }) }),
    await draftRoute.PUT(request(body)), await submitRoute.POST(request(body)), await feedbackRoute.GET(feedbackRequest(qid)),
  ]) assert.equal(response.status, 404);
}
assert.equal(snapshot(), historyBefore);

let activeQuestion, activeAnswer;
for (const id of activeIds) {
  const answer = await bank.getPrivateBankAnswer(id);
  if (!answer.reviewRequired && answer.rules.length > 0) { activeQuestion = await bank.getBankQuestion(id); activeAnswer = answer; break; }
}
assert(activeQuestion, "an active automatically graded question is required");
const correctAnswers = Object.fromEntries(activeAnswer.rules.map(rule => [rule.id, rule.expected[0]]));
const body = { subject_id: subject, question_id: activeQuestion.id, answers: correctAnswers, base_revision: 0, input_schema: bankNativeInputSchema(activeQuestion) };
assert.equal((await feedbackRoute.GET(feedbackRequest(activeQuestion.id))).status, 403);
assert.equal((await submitRoute.POST(request(body, undefined, false))).status, 401);
assert.equal((await submitRoute.POST(request(body, undefined, true, "https://untrusted.example"))).status, 403);
assert.equal((await submitRoute.POST(request({ ...body, input_schema: "legacy" }))).status, 400);
assert.equal(snapshot(), historyBefore, "rejected active attempts must not write");
const savedDraft = await draftRoute.PUT(request(body)); assert.equal(savedDraft.status, 200); assert.equal(savedDraft.value.revision, 1);
const submitted = await submitRoute.POST(request({ ...body, base_revision: 1 }));
assert.equal(submitted.status, 200); assert.equal(submitted.value.response.outcome, "correct");
assert.equal(submitted.value.response.revision, 2); assert.equal(submitted.value.response.submissions, 1);
assert.equal(submitted.value.feedback.answerText, activeAnswer.answerText);
assert(submitted.value.feedback.detailedSolution, "active post-submit detailed solution remains available");
const lockedSnapshot = snapshot();
const wrong = Object.fromEntries(activeQuestion.inputs.map(field => [field.id, field.kind === "choice" ? field.choices.find(choice => !activeAnswer.rules.find(rule => rule.id === field.id)?.expected.includes(choice)) : "deliberately wrong"]));
for (const sub of [subject, otherSubject]) {
  const lockedBody = { ...body, subject_id: sub, answers: wrong, base_revision: sub === subject ? 2 : 0 };
  for (const response of [await draftRoute.PUT(request(lockedBody)), await submitRoute.POST(request(lockedBody))]) {
    assert.equal(response.status, 409); assert.equal(response.value.response.score, submitted.value.response.score);
    assert.equal(response.value.response.revision, 2); noPrivateKeys(response.value);
  }
  assert.equal(snapshot(), lockedSnapshot, "first answer/grade cannot change via draft, retry or subject alias");
}
const finalProgress = await progressRoute.GET(request(undefined, `http://isolated.test/api?subject_id=${subject}`));
assert.equal(finalProgress.status, 200); noPrivateKeys(finalProgress.value);
const stats = bankStats(activeIds, finalProgress.value.responses);
assert.equal(stats.answered, 1); assert.equal(stats.correct, 1); assert.equal(stats.accuracy, 100);
assert(finalProgress.value.responses[historicId]);
assert.deepEqual(fingerprints(), beforeHashes, "sealed bank/source files must remain byte-for-byte unchanged");
console.log(JSON.stringify({ passed: true, archiveTotal: rawManifest.total, retiredDuplicates: retiredIds.size, activeTotal: manifest.total, collections: manifest.collections.length, publicNativeQuestionsVerified: publicReads, retiredEndpointChecks, checks: ["manifest subsequence and unchanged original numbers", "collection and difficulty counts", "first appearance retained", "all active native payloads public-only", "retired question/image/draft/submit 410", "unknown 404", "archived first score preserved and not merged", "archived feedback only after own submission", "active stats exclude archived history", "first submission still immutable across subject aliases", "private solutions only after successful submit", "raw/sealed content unchanged"], studentWrites: 0, networkRequests: 0, isolatedMockMutations: mutations, isolatedSchemaQueries: schemaQueries }));
