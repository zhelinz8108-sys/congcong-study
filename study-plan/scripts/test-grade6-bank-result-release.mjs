import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

// Production uses authenticated sealed data and performs no database/network
// writes. The explicit authoring mode is only for a private local work pack.
const local = process.argv.includes("--private-authoring");
const { gradeBankFinalAnswers, bankExactNumber } = await loadHolidayTestModule("src/lib/grade6-bank-grader.ts");
const { buildBankResultPlan } = await loadHolidayTestModule("src/server/grade6-bank/result-plan.ts");
const { applyBankResultDescriptor, bankFractionGroups } = await loadHolidayTestModule("src/server/grade6-bank/result-descriptor.ts");
const { assertBankNative } = await loadHolidayTestModule("src/lib/grade6-bank-native-validation.ts");
const { isRetiredBankQuestion } = await loadHolidayTestModule("src/server/grade6-bank/retired-duplicates.ts");
const base = JSON.parse(await fs.readFile("content/grade6-bank/questions.public.json", "utf8"));
let getQuestion, getAnswer, getPlan, getTeaching;
if (local) {
  const { authoringRows } = await import("./grade6-bank-native-authoring.mjs");
  const authored = new Map((await authoringRows()).map(({ row }) => [row.id, row]));
  const payload = JSON.parse(await fs.readFile("content/grade6-bank/private/result-assessments.authoring.json", "utf8"));
  getAnswer = async id => ({ id, ...authored.get(id).private, answerImages: [] });
  const plans = new Map(), questions = new Map();
  for (const original of base) {
    const row = authored.get(original.id), answer = await getAnswer(original.id);
    let question = { ...original, inputs: row.inputs, native: row.native, questionImages: [] };
    let plan = buildBankResultPlan(question, answer);
    if (payload.descriptors[original.id]) {
      const described = applyBankResultDescriptor(question, answer, payload.descriptors[original.id]);
      question = described.question; plan = described.plan;
    }
    if (plan) { plan = { ...plan, fractionGroups: bankFractionGroups(question, plan) }; question.resultInputIds = plan.resultInputIds; }
    plans.set(original.id, plan); questions.set(original.id, question);
  }
  getQuestion = async id => questions.get(id); getPlan = async id => plans.get(id);
} else {
  const bank = await loadHolidayTestModule("src/server/grade6-bank/bank.ts");
  getQuestion = bank.getBankQuestion; getAnswer = bank.getPrivateBankAnswer; getPlan = bank.getBankResultPlan;
  const { getBankDetailedSolution } = await loadHolidayTestModule("src/server/grade6-bank/detailed-solution.ts");
  const { bankResultTeaching } = await loadHolidayTestModule("src/server/grade6-bank/result-teaching.ts");
  getTeaching = async id => bankResultTeaching(id, await getBankDetailedSolution(id), (await getAnswer(id)).answerText);
}

const forbidden = new Set(["answerText", "answerImages", "rules", "expected", "reviewRequired", "answerStatus", "ciphertext", "private"]);
function assertPublic(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) { assert.ok(!forbidden.has(key), "Private key leaked through public question"); assertPublic(child); }
}
const fraction = value => { const n = bankExactNumber(value); assert.ok(n); return `${n.numerator}/${n.denominator}`; };
let questions = 0, choices = 0, fields = 0, alternatives = 0, joint = 0;
for (const source of base) {
  if (isRetiredBankQuestion(source.id)) continue;
  const question = await getQuestion(source.id), answer = await getAnswer(source.id), plan = await getPlan(source.id);
  assert.ok(question && plan?.ready && plan.rules.length, `Missing final-result coverage: ${source.id}`);
  assertPublic(question); assertBankNative(question.inputs, question.native);
  const correct = Object.fromEntries(question.inputs.map(field => [field.id, ""]));
  for (const rule of plan.rules) correct[rule.id] = rule.resultParts ? rule.resultParts.map(part => part.expected).join("；") : rule.expected[0];
  assert.equal(gradeBankFinalAnswers(answer, correct, plan.rules, plan.fractionGroups).outcome, "correct", source.id);
  const wrong = Object.fromEntries(question.inputs.map(field => [field.id, field.kind === "choice" ? field.choices.find(value => !plan.rules.find(rule => rule.id === field.id)?.expected.includes(value)) ?? "A" : "__deliberately_wrong_final_result__"]));
  assert.equal(gradeBankFinalAnswers(answer, wrong, plan.rules, plan.fractionGroups).outcome, "incorrect", source.id);
  for (const rule of plan.rules) {
    const numeric = rule.expected.find(value => bankExactNumber(value) !== null);
    if (numeric && (rule.numeric || /[./%]/.test(numeric))) {
      assert.equal(gradeBankFinalAnswers(answer, { ...correct, [rule.id]: fraction(numeric) }, plan.rules, plan.fractionGroups).outcome, "correct", source.id + " fraction/decimal equivalence"); alternatives++;
    }
    if (rule.resultParts) {
      const equivalent = rule.resultParts.map(part => fraction(part.expected)).join("；");
      assert.equal(gradeBankFinalAnswers(answer, { ...correct, [rule.id]: equivalent }, plan.rules, plan.fractionGroups).outcome, "correct", source.id + " compound result"); alternatives++;
    }
  }
  for (const group of plan.fractionGroups ?? []) {
    const a = bankExactNumber(correct[group.numeratorId]), b = bankExactNumber(correct[group.denominatorId]);
    if (a?.denominator === BigInt(1) && b?.denominator === BigInt(1)) {
      assert.equal(gradeBankFinalAnswers(answer, { ...correct, [group.numeratorId]: String(a.numerator * BigInt(2)), [group.denominatorId]: String(b.numerator * BigInt(2)) }, plan.rules, plan.fractionGroups).outcome, "correct", source.id + " joint fraction equivalence"); joint++;
    }
  }
  if (question.resultAssessment === "closed-v1") {
    assert.equal(question.inputs.length, 1); choices++;
    for (const letter of ["A", "B", "C", "D"]) assert.equal(gradeBankFinalAnswers(answer, { "result-choice": letter }, plan.rules).outcome === "correct", plan.rules[0].expected.includes(letter), source.id);
  }
  if (getTeaching) {
    const teaching = await getTeaching(source.id);
    assert.ok(teaching.detailedSolution?.steps.length >= 2 && teaching.detailedSolution.pitfalls.length && teaching.answerText.trim(), source.id + " complete explanation");
    if (question.resultAssessment === "closed-v1") assert.equal(teaching.detailedSolution.steps[0].title, "本题选项判定");
  }
  questions++; fields += plan.rules.length;
}
assert.equal(questions, 2363, "All active questions must have an objective outcome");
console.log(JSON.stringify({ passed: true, questions, objectiveVariants: choices, resultFields: fields, equivalentFractionChecks: alternatives, jointFractions: joint, completeAuthenticatedSolutions: !local, originalLearnerRecordsWritten: 0 }));
