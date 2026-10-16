import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import crypto from "node:crypto";

// In-memory fixtures only. No real keys, network, cookies, database or students.
const compile = async file => ts.transpileModule(await fs.readFile(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function execute(source, require, additions = {}) {
  const moduleRecord = { exports: {} };
  const context = { module: moduleRecord, exports: moduleRecord.exports, require, Buffer, ...additions };
  vm.runInNewContext(source, context); return moduleRecord.exports;
}
const validation = execute(await compile("src/lib/grade6-bank-solution.ts"), name => { throw new Error("Unexpected dependency: " + name); });
const fixture = id => ({ id, thought: "把 1/2 和 1/4 化成相同分母，再相加。", steps: [{ title: "通分", content: "1/2＝2/4。", fieldIds: ["answer-1"] }, { title: "相加并检查", content: "2/4＋1/4＝3/4；分母不变，只加分子。", fieldIds: ["answer-1"] }], answerSummary: "3/4", pitfalls: ["不能把分母相加。"] });
validation.assertBankDetailedSolution(fixture("q"), "q", ["answer-1"]);
for (const edit of [row => { row.id = "other"; }, row => { row.steps = []; }, row => { row.steps[0].fieldIds = ["unknown"]; }, row => { row.steps.forEach(step => { delete step.fieldIds; }); }, row => { row.expected = ["private key"]; }, row => { row.pitfalls = []; }]) {
  const row = fixture("q"); edit(row); assert.throws(() => validation.assertBankDetailedSolution(row, "q", ["answer-1"]));
}
const nativeRaw = await fs.readFile("content/grade6-bank/questions.native.public.json", "utf8");
const native = JSON.parse(nativeRaw), publicDigest = crypto.createHash("sha256").update(nativeRaw).digest("hex");
const inventSecret = "ab".repeat(32);
const solutions = native.questions.map(question => ({ ...fixture(question.id), steps: fixture(question.id).steps.map(step => ({ ...step, fieldIds: question.inputs.map(field => field.id) })) }));
function seal(rows = solutions) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(inventSecret, Buffer.concat([Buffer.from("grade6-detailed-v1:"), salt]), 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(Buffer.from("grade6-detailed-v1:solutions:" + publicDigest));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ version: 1, total: 2394, solutions: rows })), cipher.final()]);
  return { version: 1, publicDigest, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}
const loaderSource = await compile("src/server/grade6-bank/detailed-solution.ts");
function loader(envelope, secret = inventSecret) {
  return execute(loaderSource, name => {
    if (name === "server-only") return {};
    if (name === "node:crypto") return crypto;
    if (name === "node:path") return { default: path, ...path };
    if (name === "node:fs/promises") return { readFile: async file => {
      if (file.endsWith("questions.native.public.json")) return nativeRaw;
      if (file.endsWith("detailed-solutions.encrypted.json") && envelope) return JSON.stringify(envelope);
      const error = new Error("Missing fixture"); error.code = "ENOENT"; throw error;
    } };
    if (name.endsWith("grade6-bank-solution")) return validation;
    throw new Error("Unexpected dependency: " + name);
  }, { process: { cwd: () => "/isolated-fixtures", env: { HOLIDAY_MATH_700_KEY: secret } } });
}
assert.equal(await loader(null).getBankDetailedSolution("q"), null);
const valid = seal(), active = loader(valid);
for (const question of native.questions) assert.equal((await active.getBankDetailedSolution(question.id)).id, question.id);
assert.equal(await active.getBankDetailedSolution("unknown"), null);
await assert.rejects(loader({ ...valid, publicDigest: "wrong" }).getBankDetailedSolution(native.questions[0].id));
await assert.rejects(loader(valid, "cd".repeat(32)).getBankDetailedSolution(native.questions[0].id));
await assert.rejects(loader(seal(solutions.slice(1))).getBankDetailedSolution(native.questions[0].id));
await assert.rejects(loader(seal([...solutions.slice(1), solutions[1]])).getBankDetailedSolution(native.questions[0].id));
const missingField = structuredClone(solutions); delete missingField[0].steps[0].fieldIds; delete missingField[0].steps[1].fieldIds;
await assert.rejects(loader(seal(missingField)).getBankDetailedSolution(native.questions[0].id));
let solutionReads = 0;
const detailed = fixture("q");
const feedback = execute(await compile("src/server/grade6-bank/feedback.ts"), name => {
  if (name === "server-only") return {};
  if (name === "./bank") return { getPrivateBankAnswer: async () => ({ answerText: "Original answer", answerImages: [] }), readBankImage: async () => { throw new Error("No images"); } };
  if (name.endsWith("grade6-bank-grader")) return { gradeBankAnswer: () => ({ outcome: "correct", score: 1, maxScore: 1, fields: [] }) };
  if (name.endsWith("first-submission")) return { firstSubmission: async () => ({ feedback: { feedback: { outcome: "incorrect", score: 0, maxScore: 1, fields: [], answerText: "Frozen old text" } } }) };
  if (name === "./progress") return { bankIsIsolatedTestMemory: () => false };
  if (name === "./detailed-solution") return { getBankDetailedSolution: async () => { solutionReads++; return detailed; } };
  throw new Error("Unexpected dependency: " + name);
});
const oldResponse = { submitted: true, submissions: 1, outcome: "incorrect", score: 0, maxScore: 1, answers: { "answer-1": "wrong first answer" } };
await assert.rejects(feedback.savedBankFeedback("q", { ...oldResponse, submitted: false, submissions: 0 }, "fixture"));
assert.equal(solutionReads, 0);
const restored = await feedback.savedBankFeedback("q", oldResponse, "fixture");
assert.equal(restored.score, 0); assert.equal(restored.outcome, "incorrect"); assert.equal(restored.detailedSolution, detailed);
assert.equal(oldResponse.answers["answer-1"], "wrong first answer");
const noGrade = await feedback.savedBankFeedback("q", { ...oldResponse, outcome: "review", score: null, maxScore: 0 }, "fixture");
assert.equal(noGrade.score, null); assert.equal(noGrade.outcome, "review");
assert(!/detailed-solution|DetailedSolution/.test(await fs.readFile("src/app/api/math/grade6-bank/questions/[questionId]/route.ts", "utf8")));
assert(!/detailed-solution|DetailedSolution/.test(await fs.readFile("src/server/grade6-bank/native-release.ts", "utf8")));
// Exercise the actual POST module with isolated dependencies: teaching content
// may be returned only AFTER the immutable atomic save succeeds. It is never
// part of the saved score snapshot, nor returned on a stale/repeated attempt.
const submitSource = await compile("src/app/api/math/grade6-bank/submit/route.ts");
class IsolatedConflict extends Error { constructor(response) { super("Locked first attempt"); this.response = response; } }
let deniedSubmit = false, staleSubmit = false, storedFeedback;
const submission = execute(submitSource, name => {
  if (name === "next/server") return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } };
  if (name.endsWith("grade6-bank/http")) return { bankAccess: () => deniedSubmit ? { status: 401, body: { error: "Authentication required" } } : null, bankRetired: () => null, bankBody: async () => ({ subject_id: "fixture-subject", question_id: "q", answers: { "answer-1": "3/4" }, base_revision: 0, input_schema: "fixture" }), bankFailure: () => { throw new Error("Unexpected route failure"); }, bankHeaders: { "Cache-Control": "no-store" }, bankInputSchema() {}, bankProfile: () => ({ id: "isolated-learner" }), bankSubject: value => value, bankStudentAnswers: value => value };
  if (name.endsWith("grade6-bank/bank")) return { getBankQuestion: async () => ({ id: "q", inputs: [{ id: "answer-1" }] }), getPrivateBankAnswer: async () => ({ answerText: "3/4", answerImages: [] }), readBankImage: () => { throw new Error("No image fixture"); } };
  if (name.endsWith("grade6-bank/progress")) return { bankBaseRevision: value => value, BankRevisionConflict: IsolatedConflict, saveBankResponse: async (_student, _subject, _question, _answers, _revision, value) => { if (staleSubmit) throw new IsolatedConflict(oldResponse); storedFeedback = value; return { submitted: true, score: 1, outcome: "correct", answers: { "answer-1": "3/4" } }; } };
  if (name.endsWith("grade6-bank-grader")) return { gradeBankAnswer: () => ({ outcome: "correct", score: 1, maxScore: 1, fields: [] }) };
  if (name.endsWith("grade6-bank/detailed-solution")) return { getBankDetailedSolution: async () => detailed };
  throw new Error("Unexpected dependency: " + name);
});
const accepted = await submission.POST({});
assert.equal(accepted.status, 200); assert.equal(accepted.body.feedback.detailedSolution, detailed);
assert.equal(storedFeedback.detailedSolution, undefined, "Do not persist teaching content in immutable score snapshots");
staleSubmit = true;
const rejected = await submission.POST({});
assert.equal(rejected.status, 409); assert.equal(rejected.body.response.score, 0);
assert(!/detailedSolution|answerSummary|thought|answerText/.test(JSON.stringify(rejected.body)), "Repeated submission must not return new private teaching content");
deniedSubmit = true;
const denied = await submission.POST({}); assert.equal(denied.status, 401);
assert(!/detailedSolution|answerSummary/.test(JSON.stringify(denied.body)));
console.log(JSON.stringify({ passed: true, privateLoaderCoverage: native.total, encryptionTamperAndIncompleteRejected: true, preSubmitPrivateReadBlocked: true, historicScoresUnchanged: true, onlyAtomicAcceptedSubmissionReturnsDetails: true, privateTeachingNotStoredInScores: true, realStudentWrites: 0 }));
