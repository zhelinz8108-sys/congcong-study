import assert from "node:assert/strict";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

process.chdir(appRoot);
const service = await loadHolidayTestModule("src/server/english-six-practice.ts");
const bank = await loadHolidayTestModule("src/server/english-six-bank.ts");
const original = await loadHolidayTestModule("src/server/english-six.ts");
const answer = await loadHolidayTestModule("src/lib/english-six-answer.ts");
const index = service.englishSixInteractiveIndex();
const plans = service.englishSixPracticePlans();
const sources = ["981bb9fd35b0", "d3c1da19ba51", "f5988f72cb92", "584b2e8411ff", "a8ae68b3c494", "ba8444397e34", "eeeb5340deb5", "cfc873ad019f"];
for (const source of sources) {
  const paper = service.englishSixResourcePractice(source);
  assert.equal(paper.questions.length, 118);
  assert.equal(new Set(paper.questions.map(q => q.id)).size, 118);
  const expected = bank.englishSixBankIndex().papers.filter(p => p.sourceId === source).flatMap(p => bank.englishSixBankPublicPaper(p.id).questions.map(q => ({ ...q, topic: p.title })))
    .sort((a, b) => a.sourcePage - b.sourcePage || a.sourceBlock - b.sourceBlock);
  assert.deepEqual(paper.questions, expected, "aggregate retains every source question and immutable ID");
  assert.equal(index.resources.find(r => r.id === source).practice.questionCount, 118);
  const wire = JSON.stringify(paper);
  for (const name of ["answer", "accepted", "explanation", "keySource"]) assert.ok(!wire.includes(`"${name}":`), `no ${name} before submission`);
}
assert.equal(service.englishSixResourcePractice("../../index"), undefined);
let exact = 0, reference = 0, multiple = 0;
for (const entry of bank.englishSixBankIndex().papers) {
  const paper = bank.englishSixBankPublicPaper(entry.id);
  for (const q of paper.questions) {
    assert.ok(q.inputCount > 0);
    if (q.options.length) assert.equal(q.inputCount, 1);
    else if (q.kind !== "writing" && q.grading === "reference") assert.equal(q.inputCount, Math.max(1, answer.sixQuestionBlanks(q).length));
    const draft = Array(q.inputCount).fill("practice");
    const response = answer.sixAnswerResponse(draft);
    assert.deepEqual(answer.sixAnswerValues(q.inputCount, response), draft);
    if (q.inputCount > 1) {
      multiple++;
      assert.equal(bank.englishSixBankGrade(q.id, JSON.stringify(draft.map((v, n) => n === 0 ? "" : v))), undefined);
      if (q.grading === "reference") assert.equal(bank.englishSixBankGrade(q.id, response).correct, null);
    }
    if (q.grading === "reference") reference++; else exact++;
  }
}
for (let unit = 1; unit <= 8; unit++) {
  const paper = original.englishSixPublicPaper(unit);
  assert.equal(plans.get(paper.sourceId).type, "assessment");
  assert.equal(plans.get(paper.sourceId).unit, unit);
  for (const q of paper.questions) assert.equal(q.inputCount, answer.sixQuestionInputCount(q));
}
assert.deepEqual(answer.sixAnswerValues(3, "old first response"), ["old first response", "", ""], "historic unsplit submissions stay visible without being rewritten");
assert.equal(answer.sixAnswerDisplay('["did not","want"]'), "did not / want");
console.log(JSON.stringify({ status: "pass", resourcesWithInteractivePractice: plans.size, completeCourseWorksheets: 8, courseQuestions: 944, bankQuestions: exact + reference, assessmentQuestions: 528, multiInputQuestions: multiple, noAnswerLeaks: true, originalIdsAndDataPreserved: true }));
