import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { readTestBankAnswers, readTestBankImage } from "./grade6-bank-test-utils.mjs";

const moduleOf = async (name) => {
  const source = await fs.readFile(path.join("src/lib", name), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
};
const { bankNumber, gradeBankAnswer } = await moduleOf("grade6-bank-grader.ts");
const { bankStats } = await moduleOf("grade6-bank-types.ts");
for (const [input, expected] of [["3/4", .75], ["75%", .75], ["３／４", .75], ["1又1/2", 1.5], ["-1又1/2", -1.5], ["0.75", .75]]) assert.equal(bankNumber(input), expected, input);
for (const input of ["1/0", "1+2", "process.exit()", "Infinity", "3/4米", "", "3/4;1"]) assert.equal(bankNumber(input), null, input);
const key = { id: "test", answerStatus: "source_matched", reviewRequired: false, answerText: "", answerImages: [], rules: [{ id: "a", expected: ["3/4"], numeric: true }, { id: "b", expected: ["12"], numeric: true, unit: "厘米" }] };
assert.equal(gradeBankAnswer(key, { a: "75%", b: "12厘米" }).outcome, "correct");
assert.equal(gradeBankAnswer(key, { a: ".5", b: "12米" }).outcome, "incorrect");
assert.equal(gradeBankAnswer(key, { a: "3/4", b: "" }).score, 1);
assert.equal(gradeBankAnswer({ ...key, reviewRequired: true }, { a: "75%", b: "12" }).outcome, "review");
assert.equal(gradeBankAnswer({ ...key, answerStatus: "missing" }, { a: "75%", b: "12" }).outcome, "missing");
assert.equal(gradeBankAnswer({ ...key, answerStatus: "mismatch" }, { a: "75%", b: "12" }).outcome, "missing");
const record = (outcome) => ({ submitted: true, outcome });
assert.deepEqual(bankStats(["a", "b", "c", "d", "e", "f"], { a: record("correct"), b: record("incorrect"), c: record("review"), d: record("missing"), e: { submitted: false } }), { answered: 4, correct: 1, graded: 2, review: 2, accuracy: 50 });
assert.equal(bankStats([], {}).accuracy, null);

const root = path.join("content", "grade6-bank");
const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json")));
const questions = JSON.parse(await fs.readFile(path.join(root, "questions.public.json")));
const answers = await readTestBankAnswers();
const qmap = new Map(questions.map((q) => [q.id, q])), amap = new Map(answers.map((a) => [a.id, a]));
assert.equal(questions.length, manifest.total); assert.equal(amap.size, questions.length); assert.equal(qmap.size, questions.length);
assert.equal(manifest.total, 2394, "Full six-upper source import required, not a partial fixture");
assert.equal(manifest.collections.length, 14);
assert.equal(manifest.collections.filter((c) => c.mode === "chapter").length, 8);
assert.equal(manifest.collections.filter((c) => c.mode === "exam").length, 6);
let references = 0, rulesTested = 0;
for (const c of manifest.collections) {
  assert.equal(c.questionCount, c.questions.length);
  for (const [i, ref] of c.questions.entries()) {
    const q = qmap.get(ref.id); assert(q); references++; assert.equal(q.collectionId, c.id); assert.equal(q.number, i + 1);
    if (c.mode === "chapter" && i) assert(c.questions[i - 1].difficulty <= ref.difficulty, "difficulty order");
  }
}
assert.equal(references, questions.length);
const forbidden = new Set(["answer", "answerText", "answerImages", "explanationText", "grading", "rules", "expected", "correctAnswer", "sourceKeyImages"]);
function checkPublic(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, v] of Object.entries(value)) { assert(!forbidden.has(key), "Private field in public payload: " + key); checkPublic(v); }
}
checkPublic(manifest); checkPublic(questions);
for (const q of questions) {
  const a = amap.get(q.id); assert(a); assert(q.inputs.length); assert(q.questionImages.length || q.prompt.trim(), "Empty source question " + q.id);
  assert(!["missing", "mismatch"].includes(a.answerStatus), "Unresolved source answer: " + q.id);
  assert(a.answerImages.length || a.answerText.trim(), "No paired feedback: " + q.id);
  for (const img of q.questionImages) assert((await fs.stat(path.join(root, "public", img))).size > 0);
  for (const img of a.answerImages) assert((await readTestBankImage(img)).length > 0);
  if (!a.reviewRequired) {
    assert.equal(a.rules.length, q.inputs.length, "Incomplete multi-part grading: " + q.id);
    const expected = Object.fromEntries(a.rules.map((r) => [r.id, r.expected[0]]));
    assert.equal(gradeBankAnswer(a, expected).outcome, "correct", q.id);
    const wrong = Object.fromEntries(a.rules.map((r) => [r.id, "This is deliberately incorrect"]));
    assert.equal(gradeBankAnswer(a, wrong).outcome, "incorrect", q.id); rulesTested++;
  } else assert(["review", "missing"].includes(gradeBankAnswer(a, {}).outcome));
}
console.log(JSON.stringify({ passed: true, questions: questions.length, collections: manifest.collections.length, gradingKeysTested: rulesTested, publicPrivateSeparation: true, chapterOrder: true }));
