import assert from "node:assert/strict";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const state = await loadHolidayTestModule("src/lib/national-day-english-practice-progress-state.ts");
const stats = await loadHolidayTestModule("src/lib/national-day-english-practice-stats.ts");
const { emptyEnglishPracticeProgress, normalizeEnglishPracticeProgress, applyEnglishPracticeFeedback,
  validEnglishPracticeId, normalizeEnglishPracticeLocation, englishPracticeScope } = state;
const at = "2026-10-06T00:00:00.000Z";
const nextAt = "2026-10-06T00:00:01.000Z";
const result = (questionId, correct = true, selected = "A") => ({
  questionId, correct, selected, correctOption: "C", correctText: "PRIVATE_EXPECTED_ANSWER", explanation: "PRIVATE_EXPLANATION",
});
const feedback = (blockId, results) => ({ blockId, results, maxScore: results.length, score: results.filter((item) => item.correct).length });
const singleFeedback = (blockId, questionId, correct = true, selected = "A") => ({
  ...feedback(blockId, [result(questionId, correct, selected)]), questionId,
});
let progress = emptyEnglishPracticeProgress();
assert.deepEqual(stats.englishPracticeStats(progress), { answered: 0, correct: 0, accuracy: null });
assert.equal(stats.englishPracticeAccuracyLabel(null), "—");
assert.equal(stats.englishPracticeAccuracyLabel(66.7), "66.7%");
for (const id of ["CH01-Q001", "CH09-Q010", "CH10-Q099", "CH24-Q100"]) assert.equal(validEnglishPracticeId(id), true);
for (const id of ["CH00-Q001", "CH25-Q001", "CH01-Q000", "CH01-Q101", "CH01-Q1", "CH01-Q001-x", "__proto__", "../../math"]) assert.equal(validEnglishPracticeId(id), false);

progress = applyEnglishPracticeFeedback(progress, feedback("CH01-B001", [result("CH01-Q001", false)]), at);
assert.deepEqual(stats.englishPracticeStats(progress), { answered: 1, correct: 0, accuracy: 0 });
assert.equal(progress.attempts["CH01-Q001"].submissions, 1);
assert.equal(progress.attempts["CH01-Q001"].wrongCount, 1);
progress = applyEnglishPracticeFeedback(progress, feedback("CH01-B001", [result("CH01-Q001")]), nextAt);
assert.deepEqual(stats.englishPracticeStats(progress), { answered: 1, correct: 1, accuracy: 100 });
assert.equal(progress.attempts["CH01-Q001"].submissions, 2);
assert.equal(progress.attempts["CH01-Q001"].wrongCount, 1);
assert.equal(JSON.stringify(progress).includes("PRIVATE_"), false);
assert.equal(JSON.stringify(progress).includes("correctOption"), false);
assert.equal(JSON.stringify(progress).includes("explanation"), false);

const cloze = Array.from({ length: 5 }, (_, index) => result(`CH01-Q${String(26 + index).padStart(3, "0")}`, index < 3));
assert.equal(applyEnglishPracticeFeedback(progress, feedback("CH01-B026", cloze.slice(0, 4)), nextAt), progress);
assert.equal(applyEnglishPracticeFeedback(progress, feedback("CH01-B026", [cloze[0], cloze[0], ...cloze.slice(2)]), nextAt), progress);
assert.equal(applyEnglishPracticeFeedback(progress, { ...feedback("CH01-B026", cloze), score: 5 }, nextAt), progress);
assert.equal(applyEnglishPracticeFeedback(progress, feedback("CH01-B026", cloze.map((item) => ({ ...item, questionId: item.questionId.replace("CH01", "CH02") }))), nextAt), progress);
assert.equal(applyEnglishPracticeFeedback(progress, feedback("CH01-B069", cloze), nextAt), progress);
assert.equal(applyEnglishPracticeFeedback(progress, feedback("CH01-B026", cloze), "bad date"), progress);
progress = applyEnglishPracticeFeedback(progress, feedback("CH01-B026", cloze), nextAt);
assert.deepEqual(stats.englishPracticeStats(progress), { answered: 6, correct: 4, accuracy: 66.7 });
assert.deepEqual(stats.englishPracticeStats(progress, "CH02"), { answered: 0, correct: 0, accuracy: null });
assert.equal(progress.location.chapter, "CH01");
assert.equal(progress.location.page, 3);
assert.equal(progress.location.id, "CH01-Q026");
const changedDraft = { ...progress, drafts: { ...progress.drafts, "CH01-Q026": "B" } };
assert.equal(applyEnglishPracticeFeedback(changedDraft, feedback("CH01-B026", cloze), nextAt), changedDraft);

// One-screen mode grades one numbered cloze blank without modifying its siblings or legacy attempts.
const single = singleFeedback("CH01-B026", "CH01-Q029");
const singleProgress = applyEnglishPracticeFeedback(progress, single, nextAt);
assert.notEqual(singleProgress, progress);
assert.deepEqual(stats.englishPracticeStats(singleProgress), { answered: 6, correct: 5, accuracy: 83.3 });
assert.equal(singleProgress.attempts["CH01-Q029"].submissions, 2);
assert.equal(singleProgress.attempts["CH01-Q029"].wrongCount, 1);
assert.deepEqual(singleProgress.location, { chapter: "CH01", page: 3, id: "CH01-Q029" });
for (const id of ["CH01-Q001", "CH01-Q026", "CH01-Q027", "CH01-Q028", "CH01-Q030"]) {
  assert.deepEqual(singleProgress.attempts[id], progress.attempts[id]);
}
assert.equal(JSON.stringify(singleProgress).includes("PRIVATE_"), false);
assert.equal(JSON.stringify(singleProgress).includes("correctOption"), false);
assert.deepEqual(normalizeEnglishPracticeProgress(singleProgress), singleProgress);
assert.equal(applyEnglishPracticeFeedback(emptyEnglishPracticeProgress(), single, nextAt).updatedAt, "");
for (const malformed of [
  { ...single, questionId: null },
  { ...single, questionId: undefined },
  { ...single, questionId: "CH01-Q001" },
  { ...single, questionId: "CH02-Q029" },
  { ...single, questionId: "CH25-Q029" },
  { ...single, questionId: "CH01-Q000" },
  { ...single, results: [] },
  { ...single, results: [result("CH01-Q029"), result("CH01-Q030")] },
  { ...single, results: [result("CH01-Q030")] },
  { ...single, results: [result("CH01-Q029", true, "B")] },
  { ...single, results: [{ ...result("CH01-Q029"), selected: "Z" }] },
  { ...single, results: [{ ...result("CH01-Q029"), correct: "true" }] },
  { ...single, maxScore: 5 },
  { ...single, score: 0 },
  { ...single, score: 2 },
  { ...single, score: NaN },
]) assert.equal(applyEnglishPracticeFeedback(progress, malformed, nextAt), progress);
assert.equal(applyEnglishPracticeFeedback(changedDraft, singleFeedback("CH01-B026", "CH01-Q026"), nextAt), changedDraft);
// A forged extra field cannot become persisted state even on an otherwise valid response.
const extras = applyEnglishPracticeFeedback(progress, {
  ...single, expectedAnswers: "PRIVATE_EXPECTED_ANSWER", explanation: "PRIVATE_EXPLANATION",
  attempts: { "CH01-Q030": result("CH01-Q030") }, location: { id: "CH01-Q100" },
}, nextAt);
assert.deepEqual(extras, singleProgress);

const contaminated = {
  ...progress, expectedAnswers: "PRIVATE_ANSWER", explanation: "PRIVATE_EXPLANATION",
  drafts: { ...progress.drafts, "CH25-Q001": "A", "CH01-Q099": "E", "CH01-Q098": { letter: "A" } },
  attempts: { ...progress.attempts, "CH01-Q001": { ...progress.attempts["CH01-Q001"], correctText: "PRIVATE_ANSWER" },
    "CH25-Q100": progress.attempts["CH01-Q001"], "CH02-Q001": { ...progress.attempts["CH01-Q001"], correct: "true" },
    "CH02-Q002": { ...progress.attempts["CH01-Q001"], submissions: -1 },
    "CH02-Q003": { ...progress.attempts["CH01-Q001"], wrongCount: 100 },
    "CH02-Q004": { ...progress.attempts["CH01-Q001"], selected: "Z" },
    "CH02-Q005": { ...progress.attempts["CH01-Q001"], correct: false, wrongCount: 0 },
    "CH02-Q006": { ...progress.attempts["CH01-Q001"], at: "bad date" } },
};
assert.deepEqual(normalizeEnglishPracticeProgress(contaminated), progress);
assert.equal(JSON.stringify(normalizeEnglishPracticeProgress(contaminated)).includes("PRIVATE_"), false);
for (const raw of [null, [], 1, "invalid", { drafts: [], attempts: [], updatedAt: "bad" }]) assert.deepEqual(normalizeEnglishPracticeProgress(raw), emptyEnglishPracticeProgress());
assert.deepEqual(normalizeEnglishPracticeLocation({ chapter: "CH24", page: 10, id: "CH24-Q100" }), { chapter: "CH24", page: 10, id: "CH24-Q100" });
assert.deepEqual(normalizeEnglishPracticeLocation({ chapter: "CH01", page: 1, id: "CH24-Q100", correctOption: "A" }), { chapter: "CH01", page: 1 });
assert.equal(normalizeEnglishPracticeLocation({ chapter: "CH25", page: 1 }), undefined);
assert.equal(normalizeEnglishPracticeLocation({ chapter: "CH01", page: 11 }), undefined);
const subject = "8bd6f79b-99f5-4e68-a961-872d60d260b1";
assert.equal(englishPracticeScope(subject), `english:holiday2400:${subject}:v1`);
assert.notEqual(englishPracticeScope(subject), `math:holiday700:${subject}:v1`);
assert.notEqual(englishPracticeScope(subject), englishPracticeScope("another-subject"));
assert.throws(() => englishPracticeScope("../../math"), /Invalid subject/);

let full = emptyEnglishPracticeProgress();
for (let chapter = 1; chapter <= 24; chapter++) {
  const prefix = `CH${String(chapter).padStart(2, "0")}`;
  const sizes = [...Array(25).fill(1), ...Array(3).fill(5), ...Array(25).fill(1), ...Array(3).fill(5), ...Array(10).fill(1), ...Array(2).fill(5)];
  let number = 1;
  for (let block = 0; block < sizes.length; block++) {
    const results = Array.from({ length: sizes[block] }, () => result(`${prefix}-Q${String(number++).padStart(3, "0")}`));
    full = applyEnglishPracticeFeedback(full, feedback(`${prefix}-B${String(block + 1).padStart(3, "0")}`, results), at);
  }
  assert.equal(number, 101);
  assert.deepEqual(stats.englishPracticeStats(full, prefix), { answered: 100, correct: 100, accuracy: 100 });
}
assert.deepEqual(stats.englishPracticeStats(full), { answered: 2400, correct: 2400, accuracy: 100 });
assert.equal(JSON.stringify(full).includes("PRIVATE_"), false);
assert.deepEqual(normalizeEnglishPracticeProgress(full), full);

// All 2400 single-item submissions, including each member of every five-blank block.
let individual = emptyEnglishPracticeProgress();
let individualCount = 0;
for (let chapter = 1; chapter <= 24; chapter++) {
  const prefix = `CH${String(chapter).padStart(2, "0")}`;
  const sizes = [...Array(25).fill(1), ...Array(3).fill(5), ...Array(25).fill(1), ...Array(3).fill(5), ...Array(10).fill(1), ...Array(2).fill(5)];
  let number = 1;
  for (let block = 0; block < sizes.length; block++) {
    const blockId = `${prefix}-B${String(block + 1).padStart(3, "0")}`;
    for (let member = 0; member < sizes[block]; member++) {
      const id = `${prefix}-Q${String(number++).padStart(3, "0")}`;
      individual = { ...individual, drafts: { ...individual.drafts, [id]: "A" } };
      const wrong = applyEnglishPracticeFeedback(individual, singleFeedback(blockId, id, false), at);
      assert.notEqual(wrong, individual);
      assert.equal(wrong.attempts[id].correct, false);
      individual = { ...wrong, drafts: { ...wrong.drafts, [id]: "B" } };
      const right = applyEnglishPracticeFeedback(individual, singleFeedback(blockId, id, true, "B"), nextAt);
      assert.notEqual(right, individual);
      assert.equal(right.attempts[id].correct, true);
      assert.equal(right.attempts[id].submissions, 2);
      assert.equal(right.attempts[id].wrongCount, 1);
      assert.deepEqual(right.location, { chapter: prefix, page: Math.ceil(Number(id.slice(-3)) / 10), id });
      individual = right;
      individualCount++;
    }
  }
  assert.equal(number, 101);
  assert.deepEqual(stats.englishPracticeStats(individual, prefix), { answered: 100, correct: 100, accuracy: 100 });
}
assert.equal(individualCount, 2400);
assert.deepEqual(stats.englishPracticeStats(individual), { answered: 2400, correct: 2400, accuracy: 100 });
assert.equal(JSON.stringify(individual).includes("PRIVATE_"), false);
assert.equal(JSON.stringify(individual).includes("correctOption"), false);
assert.equal(JSON.stringify(individual).includes("explanation"), false);
assert.deepEqual(normalizeEnglishPracticeProgress(individual), individual);
// The old v1 scope / state still reads identically after enabling individual grading.
assert.deepEqual(normalizeEnglishPracticeProgress(full), full);
console.log("PASS: 2400 individual items with wrong-to-right retries / exact resume locations; 1632 legacy blocks; malformed single feedback atomicity; unique latest stats; no persisted answer key; unchanged v1 scope. No network or database writes.");
