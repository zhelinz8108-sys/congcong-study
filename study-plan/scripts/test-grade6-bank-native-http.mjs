import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHmac } from "node:crypto";
import { readTestNativeBankAnswers } from "./grade6-bank-test-utils.mjs";
import vm from "node:vm";
import ts from "typescript";
import { validationModule } from "./grade6-bank-native-authoring.mjs";

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
const { assertBankDrawing } = await validationModule();
const schemaCompiled = ts.transpileModule(await fs.readFile("src/lib/grade6-bank-input-schema.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const schemaContext = { module: { exports: {} }, exports: {}, Error, require: (name) => {
  if (name.endsWith("grade6-bank-native-validation")) return { assertBankDrawing };
  throw new Error("Unexpected input-schema dependency");
} };
schemaContext.exports = schemaContext.module.exports;
vm.runInNewContext(schemaCompiled, schemaContext);
const { bankNativeInputSchema } = schemaContext.module.exports;
const retirementCompiled = ts.transpileModule(await fs.readFile("src/server/grade6-bank/retired-duplicates.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const retirementContext = { module: { exports: {} }, exports: {}, Error, require: name => {
  if (name === "server-only") return {};
  throw new Error("Unexpected retirement dependency");
} };
retirementContext.exports = retirementContext.module.exports;
vm.runInNewContext(retirementCompiled, retirementContext);
const { RETIRED_BANK_DUPLICATES, activeBankManifest, isRetiredBankQuestion } = retirementContext.module.exports;
const manifest = activeBankManifest(rawManifest);
assert.equal(native.size, 2394);
assert.equal(rawManifest.total, 2394, "archival seal remains complete");
assert.equal(privateAnswers.size, native.size);
const archivedQuestions = baseQuestions.map((q) => ({ ...q, ...native.get(q.id), questionImages: [] }));
const questions = archivedQuestions.filter(q => !isRetiredBankQuestion(q.id));
assert.equal(questions.length, manifest.total);
assert.equal(manifest.total, rawManifest.total - RETIRED_BANK_DUPLICATES.length);
assert.deepEqual(JSON.parse(JSON.stringify(manifest.collections.flatMap(c => c.questions.map(q => q.id)))), rawManifest.collections.flatMap(c => c.questions.map(q => q.id)).filter(id => !isRetiredBankQuestion(id)));
let reads = 0, automatic = 0, review = 0, wrong = 0, stale = 0, retiredChecks = 0;
async function request(route, body, method = "GET", origin = base, authenticated = true) {
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
    assert(!["answerText", "answerImages", "rules", "expected", "answerStatus", "reviewRequired", "ciphertext", "feedback"].includes(key));
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
// Removed questions must be rejected at every old URL/API entry point, without
// writing an attempt or leaking the archived private answer. These deliberately
// rejected writes are only permitted after the isolated-memory handshake above.
for (const { removeId } of RETIRED_BANK_DUPLICATES) {
  const q = archivedQuestions.find(row => row.id === removeId);
  assert(q);
  const body = { subject_id: subject, question_id: q.id, answers: fixture(q), base_revision: 0, input_schema: bankNativeInputSchema(q) };
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
  assert.deepEqual(response.json.native, q.native);
  assert.deepEqual(response.json.inputs, q.inputs);
  assert.deepEqual(response.json.questionImages, []);
  for (const key of ["id", "collectionId", "number", "chapter", "originalNumber", "difficulty"]) assert.deepEqual(response.json[key], q[key]);
  reads++;
});
assert.deepEqual((await request(`/api/math/grade6-bank/progress?subject_id=${subject}`)).json.responses, {});
assert.equal((await request(`/api/math/grade6-bank/questions/${questions[0].id}`, undefined, "GET", base, false)).status, 401);
for (const route of ["/content/grade6-bank/questions.native.public.json", "/content/grade6-bank/sealed/native-answers.encrypted.json", "/api/math/grade6-bank/answers"]) assert.equal((await request(route)).status, 404);
function fixture(q) {
  const a = privateAnswers.get(q.id);
  return Object.fromEntries(q.inputs.map((field) => {
    const rule = a.rules.find((rule) => rule.id === field.id);
    if (rule) return [field.id, rule.expected[0]];
    if (field.kind === "choice") return [field.id, field.choices[0]];
    if (field.kind === "drawing") {
      const b = q.native.blocks.find((b) => b.type === "drawing" && b.fieldId === field.id);
      return [field.id, JSON.stringify({ version: 1, viewBox: b.viewBox, items: [{ type: "line", from: [b.viewBox[0], b.viewBox[1]], to: [b.viewBox[0] + b.viewBox[2] / 2, b.viewBox[1] + b.viewBox[3] / 2] }] })];
    }
    return [field.id, "隔离验收作答"];
  }));
}
// Every submitted test response stays in the disposable development memory map.
await parallel(questions, async (q) => {
  const a = privateAnswers.get(q.id), answers = fixture(q);
  const body = { subject_id: subject, question_id: q.id, answers, base_revision: 0, input_schema: bankNativeInputSchema(q) };
  assert.equal((await request(`/api/math/grade6-bank/feedback?subject_id=${subject}&question_id=${encodeURIComponent(q.id)}`)).status, 403, "unsubmitted answers stay private");
  const legacyBody = { ...body }; delete legacyBody.input_schema;
  assert.equal((await request("/api/math/grade6-bank/draft", legacyBody, "PUT")).status, 400, q.id + " old bundle blocked");
  assert.equal((await request("/api/math/grade6-bank/submit", { ...body, answers: {} }, "POST")).status, 400, q.id);
  const result = await request("/api/math/grade6-bank/submit", body, "POST");
  assert.equal(result.status, 200, q.id);
  assert.equal(result.json.feedback.outcome, a.reviewRequired ? "review" : "correct", q.id);
  assert(result.json.feedback.answerText === a.answerText, q.id + " private feedback mismatch");
  assert.deepEqual(result.json.feedback.answerImages, []);
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
  if (a.reviewRequired) review++;
  else {
    automatic++;
    const incorrect = Object.fromEntries(q.inputs.map((field) => [field.id, field.kind === "choice" ? field.choices.find((value) => !a.rules.find((r) => r.id === field.id).expected.includes(value)) : "故意错误"]));
    assert(Object.values(incorrect).every(Boolean));
    const wrongResult = await request("/api/math/grade6-bank/submit", { ...body, answers: incorrect, base_revision: 1 }, "POST");
    assert.equal(wrongResult.status, 409, q.id); assert.equal(wrongResult.json.response.outcome, "correct");
    assert.equal(wrongResult.json.response.revision, 1); assertNoKeys(wrongResult.json); wrong++;
  }
});
const body = { subject_id: subject, question_id: questions[0].id, answers: fixture(questions[0]), base_revision: 2, input_schema: bankNativeInputSchema(questions[0]) };
assert.equal((await request("/api/math/grade6-bank/submit", body, "POST", "https://untrusted.example")).status, 403);
assert.equal((await request("/api/math/grade6-bank/submit", { ...body, expected: "forged" }, "POST")).status, 400);
const progress = (await request(`/api/math/grade6-bank/progress?subject_id=${subject}`)).json;
assertNoKeys(progress);
assert.equal(Object.keys(progress.responses).length, questions.length);
assert(Object.keys(progress.responses).every(id => !isRetiredBankQuestion(id)));
console.log(JSON.stringify({ passed: true, archiveTotal: rawManifest.total, activeTotal: manifest.total, retiredDuplicates: RETIRED_BANK_DUPLICATES.length, retiredChecks, reads, automatic, review, rejectedResubmissions: wrong, stale, collections: manifest.collections.length, isolatedTestMemory: true, studentWrites: 0 }));
