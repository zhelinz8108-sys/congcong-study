import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHmac } from "node:crypto";
import { readTestNativeBankAnswers } from "./grade6-bank-test-utils.mjs";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

// This cannot target production. The matching dev server must run with
// GRADE6_BANK_TEST_MEMORY=1 and a disposable access secret, never PostgreSQL.
const base = "http://127.0.0.1:3026";
const subject = "00000000-0000-4000-8000-000000000626";
const payload = `v1.${Date.now() + 3600000}`;
const token = `${payload}.${createHmac("sha256", "grade6-local-qa-secret").update(payload).digest("base64url")}`;
const cookie = `congcong_family_access=${token}`;
const root = "content/grade6-bank";
const rawManifest = JSON.parse(await fs.readFile(root + "/manifest.json", "utf8"));
const baseQuestions = JSON.parse(await fs.readFile(root + "/questions.public.json", "utf8"));
const release = JSON.parse(await fs.readFile(root + "/questions.native.public.json", "utf8"));
const native = new Map(release.questions.map((q) => [q.id, q]));
const privateAnswers = new Map((await readTestNativeBankAnswers()).map((q) => [q.id, q]));
const [bank, grader, schema, retirement] = await Promise.all([
  loadHolidayTestModule("src/server/grade6-bank/bank.ts"),
  loadHolidayTestModule("src/lib/grade6-bank-grader.ts"),
  loadHolidayTestModule("src/lib/grade6-bank-input-schema.ts"),
  loadHolidayTestModule("src/server/grade6-bank/retired-duplicates.ts"),
]);
const { getBankQuestion, getArchivedBankQuestion, getBankResultPlan, getPrivateBankAnswer } = bank;
const { gradeBankFinalAnswers } = grader;
const { bankNativeInputSchema } = schema;
const { RETIRED_BANK_DUPLICATES, activeBankManifest, isRetiredBankQuestion } = retirement;
const manifest = activeBankManifest(rawManifest);
assert.equal(native.size, 2394);
assert.equal(rawManifest.total, 2394, "archival seal remains complete");
assert.equal(privateAnswers.size, native.size);
const archivedQuestions = await Promise.all(baseQuestions.map(async ({ id }) => {
  const question = await getArchivedBankQuestion(id);
  assert(question, id + " archived question missing");
  return question;
}));
const questions = await Promise.all(archivedQuestions.filter(q => !isRetiredBankQuestion(q.id)).map(async archived => {
  const question = await getBankQuestion(archived.id);
  assert(question, archived.id + " active question missing");
  assert.deepEqual(question, archived);
  return question;
}));
assert.equal(questions.length, manifest.total);
assert.equal(manifest.total, 2363, "every active question has an objective final-result assessment");
assert.equal(manifest.total, rawManifest.total - RETIRED_BANK_DUPLICATES.length);
assert.deepEqual(JSON.parse(JSON.stringify(manifest.collections.flatMap(c => c.questions.map(q => q.id)))), rawManifest.collections.flatMap(c => c.questions.map(q => q.id)).filter(id => !isRetiredBankQuestion(id)));
const plans = new Map(await Promise.all(questions.map(async question => {
  const plan = await getBankResultPlan(question.id), answer = await getPrivateBankAnswer(question.id);
  const fixtureAnswer = privateAnswers.get(question.id);
  assert(plan?.ready && plan.rules.length > 0, question.id + " final-result plan missing");
  assert(answer && fixtureAnswer && answer.answerText === fixtureAnswer.answerText, question.id + " authenticated private reference mismatch");
  assert(plan.resultInputIds.length === plan.rules.length, question.id + " result coverage mismatch");
  assert(plan.resultInputIds.every(id => question.inputs.some(field => field.id === id)), question.id + " unknown result input");
  return [question.id, plan];
})));
let reads = 0, automatic = 0, correct = 0, incorrect = 0, resubmissions = 0, stale = 0, retiredChecks = 0;
let isolatedWritesAllowed = false;
async function request(route, body, method = "GET", origin = base, authenticated = true) {
  if (!["GET", "HEAD"].includes(method)) assert(isolatedWritesAllowed, "Refuse writes before a fresh isolated-memory handshake");
  const response = await fetch(base + route, {
    method, headers: { "X-Grade6-QA": "isolated-memory-v1", ...(authenticated ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json", Origin: origin } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000), redirect: "manual",
  });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { /* HTML */ }
  return { status: response.status, text, json, cache: response.headers.get("cache-control"), isolated: response.headers.get("x-grade6-qa-memory") };
}
async function parallel(items, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  }));
}
function assertNoKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert(!["answerText", "answerImages", "rules", "expected", "answerStatus", "reviewRequired", "ciphertext", "feedback", "resultParts", "answerSpans"].includes(key));
    if (child && typeof child === "object") assertNoKeys(child);
  }
}
const handshake = await request("/api/math/grade6-bank/qa-mode");
assert.equal(handshake.status, 200);
assert.equal(handshake.isolated, "isolated");
assert.equal(handshake.json.isolatedTestMemory, true);
const before = await request(`/api/math/grade6-bank/progress?subject_id=${subject}`);
assert.equal(before.status, 200);
assert.equal(before.isolated, "isolated", "Refuse all writes unless server confirms disposable dev-memory mode");
// A fresh isolated memory store is mandatory; do not touch even local real data.
assert.deepEqual(before.json.responses, {});
isolatedWritesAllowed = true;
// Removed questions must be rejected at every old URL/API entry point, without
// writing an attempt or leaking the archived private answer. These deliberately
// rejected writes are only permitted after the isolated-memory handshake above.
for (const { removeId } of RETIRED_BANK_DUPLICATES) {
  const q = archivedQuestions.find(row => row.id === removeId);
  assert(q);
  const body = { subject_id: subject, question_id: q.id, answers: {}, base_revision: 0, input_schema: bankNativeInputSchema(q) };
  for (const response of [
    await request(`/api/math/grade6-bank/questions/${q.id}`),
    await request(`/api/math/grade6-bank/questions/${q.id}/images/0`),
    await request("/api/math/grade6-bank/draft", body, "PUT"),
    await request("/api/math/grade6-bank/submit", body, "POST"),
  ]) { assert.equal(response.status, 410, q.id); assertNoKeys(response.json); retiredChecks++; }
  const deniedFeedback = await request(`/api/math/grade6-bank/feedback?subject_id=${subject}&question_id=${encodeURIComponent(q.id)}`);
  assert.equal(deniedFeedback.status, 403); assertNoKeys(deniedFeedback.json);
}
assert.deepEqual((await request(`/api/math/grade6-bank/progress?subject_id=${subject}`)).json.responses, {}, "retired attempts must never create a draft or submission");
for (const c of manifest.collections) {
  const html = await request(`/subjects/${subject}/math/problem-bank/${c.id}`);
  assert.equal(html.status, 200); assert(html.text.includes(c.title));
  assert(!/<(?:iframe|embed|object)\b/.test(html.text));
}
await parallel(questions, async (q) => {
  const response = await request(`/api/math/grade6-bank/questions/${q.id}`);
  assert.equal(response.status, 200, q.id); assert(response.cache?.includes("no-store"));
  assertNoKeys(response.json);
  assert.deepEqual(response.json.native, JSON.parse(JSON.stringify(q.native)));
  assert.deepEqual(response.json.inputs, JSON.parse(JSON.stringify(q.inputs)));
  assert.deepEqual(response.json.questionImages, []);
  for (const key of ["id", "collectionId", "number", "chapter", "originalNumber", "difficulty"]) assert.deepEqual(response.json[key], q[key]);
  reads++;
});
assert.deepEqual((await request(`/api/math/grade6-bank/progress?subject_id=${subject}`)).json.responses, {});
assert.equal((await request(`/api/math/grade6-bank/questions/${questions[0].id}`, undefined, "GET", base, false)).status, 401);
for (const route of ["/content/grade6-bank/questions.native.public.json", "/content/grade6-bank/sealed/native-answers.encrypted.json", "/api/math/grade6-bank/answers"]) assert.equal((await request(route)).status, 404);
function fixture(q) {
  const plan = plans.get(q.id);
  assert(plan?.ready, q.id + " objective fixture requires a result plan");
  const rules = new Map(plan.rules.map(rule => [rule.id, rule]));
  // Working fields remain empty; only the requested final results are assessed.
  return Object.fromEntries(q.inputs.map(field => {
    const rule = rules.get(field.id);
    return [field.id, rule ? rule.resultParts?.map(part => part.expected).join("；") ?? rule.expected[0] : ""];
  }));
}
function gradeFixture(q, answers) {
  const plan = plans.get(q.id);
  return gradeBankFinalAnswers(privateAnswers.get(q.id), answers, plan.rules, plan.fractionGroups);
}
function incorrectFixture(q, answers) {
  const plan = plans.get(q.id);
  for (const rule of plan.rules) {
    const field = q.inputs.find(input => input.id === rule.id);
    const candidates = field.kind === "choice" ? field.choices : ["隔离验收的故意错误结果"];
    for (const value of candidates) {
      const candidate = { ...answers, [rule.id]: value };
      if (gradeFixture(q, candidate).outcome === "incorrect") return candidate;
    }
  }
  throw new Error(q.id + " has no valid incorrect-result fixture");
}
function assertFeedback(question, feedback, expected) {
  const answer = privateAnswers.get(question.id), plan = plans.get(question.id);
  assert.equal(feedback.outcome, expected.outcome, question.id);
  assert.equal(feedback.score, expected.score, question.id);
  assert.equal(feedback.maxScore, expected.maxScore, question.id);
  assert.deepEqual(feedback.answerImages, []);
  if (question.resultAssessment === "closed-v1") {
    const letter = plan.rules.find(rule => rule.id === "result-choice")?.expected[0];
    const prefix = `${letter}. `;
    const option = question.native.blocks.filter(block => block.type === "paragraph" && block.content.length === 1 && block.content[0].type === "text" && block.content[0].value.startsWith(prefix)).at(-1);
    assert(option, question.id + " closed-result option missing");
    const conclusion = `正确选项：${letter}。${option.content[0].value.slice(prefix.length)}`;
    assert(feedback.answerText === `${conclusion}\n\n${answer.answerText}`, question.id + " closed conclusion and complete original explanation must be retained");
  } else assert(feedback.answerText === answer.answerText, question.id + " private feedback mismatch");
}
const cases = questions.map((q, index) => {
  const right = fixture(q), wrong = incorrectFixture(q, right);
  assert.equal(gradeFixture(q, right).outcome, "correct", q.id + " correct fixture");
  assert.equal(gradeFixture(q, wrong).outcome, "incorrect", q.id + " incorrect fixture");
  const answers = index % 2 ? wrong : right;
  return { q, answers, replacement: index % 2 ? right : wrong, expected: gradeFixture(q, answers) };
});
// Every submitted test response stays in the disposable development memory map.
await parallel(cases, async ({ q, answers, replacement, expected }) => {
  const body = { subject_id: subject, question_id: q.id, answers, base_revision: 0, input_schema: bankNativeInputSchema(q) };
  assert.equal((await request(`/api/math/grade6-bank/feedback?subject_id=${subject}&question_id=${encodeURIComponent(q.id)}`)).status, 403, "unsubmitted answers stay private");
  const legacyBody = { ...body }; delete legacyBody.input_schema;
  assert.equal((await request("/api/math/grade6-bank/draft", legacyBody, "PUT")).status, 400, q.id + " old bundle blocked");
  assert.equal((await request("/api/math/grade6-bank/submit", { ...body, answers: {} }, "POST")).status, 400, q.id);
  const result = await request("/api/math/grade6-bank/submit", body, "POST");
  assert.equal(result.status, 200, q.id);
  assertFeedback(q, result.json.feedback, expected);
  assert.equal(result.json.response.outcome, expected.outcome, q.id);
  assert.equal(result.json.response.revision, 1);
  const conflict = await request("/api/math/grade6-bank/draft", body, "PUT");
  assert.equal(conflict.status, 409, q.id); assert.equal(conflict.json.response.submitted, true);
  assertNoKeys(conflict.json); stale++;
  const lockedDraft = await request("/api/math/grade6-bank/draft", { ...body, base_revision: 1 }, "PUT");
  assert.equal(lockedDraft.status, 409, q.id + " current-revision drafts are also locked");
  assert.equal(lockedDraft.json.response.revision, 1);
  const readOnlyFeedback = await request(`/api/math/grade6-bank/feedback?subject_id=${subject}&question_id=${encodeURIComponent(q.id)}`);
  assert.equal(readOnlyFeedback.status, 200);
  assert.equal(readOnlyFeedback.json.feedback.outcome, result.json.feedback.outcome);
  assert.equal(readOnlyFeedback.json.response.revision, 1);
  assertFeedback(q, readOnlyFeedback.json.feedback, expected);
  assert.equal(readOnlyFeedback.json.response.outcome, expected.outcome, q.id);
  automatic++;
  if (expected.outcome === "correct") correct++;
  else incorrect++;
  // A first incorrect submission is just as immutable as a correct one.
  const replacementResult = await request("/api/math/grade6-bank/submit", { ...body, answers: replacement, base_revision: 1 }, "POST");
  assert.equal(replacementResult.status, 409, q.id);
  assert.equal(replacementResult.json.response.outcome, expected.outcome, q.id);
  assert.equal(replacementResult.json.response.revision, 1);
  assertNoKeys(replacementResult.json); resubmissions++;
});
const body = { subject_id: subject, question_id: questions[0].id, answers: fixture(questions[0]), base_revision: 1, input_schema: bankNativeInputSchema(questions[0]) };
assert.equal((await request("/api/math/grade6-bank/submit", body, "POST", "https://untrusted.example")).status, 403);
assert.equal((await request("/api/math/grade6-bank/submit", { ...body, expected: "forged" }, "POST")).status, 400);
const progress = (await request(`/api/math/grade6-bank/progress?subject_id=${subject}`)).json;
assertNoKeys(progress);
assert.equal(Object.keys(progress.responses).length, questions.length);
assert(Object.keys(progress.responses).every(id => !isRetiredBankQuestion(id)));
for (const { q, expected } of cases) {
  const response = progress.responses[q.id];
  assert(response?.submitted, q.id + " submitted progress missing");
  assert.equal(response.outcome, expected.outcome, q.id);
  assert.equal(response.score, expected.score, q.id);
  assert.equal(response.maxScore, expected.maxScore, q.id);
  assert.equal(response.revision, 1, q.id);
}
assert.equal(automatic, manifest.total);
assert(correct > 0 && incorrect > 0, "both objective verdicts must be exercised");
console.log(JSON.stringify({ passed: true, archiveTotal: rawManifest.total, activeTotal: manifest.total, retiredDuplicates: RETIRED_BANK_DUPLICATES.length, retiredChecks, reads, automatic, correct, incorrect, closedVariants: questions.filter(q => q.resultAssessment === "closed-v1").length, rejectedResubmissions: resubmissions, stale, collections: manifest.collections.length, isolatedTestMemory: true, studentWrites: 0 }));
