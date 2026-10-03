import assert from "node:assert/strict";
import test from "node:test";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const { holidayMathStats: stats, holidayAccuracyLabel: label } =
  await loadHolidayTestModule("src/lib/holiday-math-700-stats.ts");
const attempt = (correct, extra = {}) => ({
  correct,
  score: correct ? 2 : 1,
  maxScore: 2,
  submissions: 1,
  wrongCount: correct ? 0 : 1,
  hinted: false,
  updatedAt: "",
  ...extra,
});

test("unanswered accuracy is absent, not zero percent", () => {
  assert.deepEqual(stats({}), {
    answered: 0,
    correct: 0,
    accuracy: null,
    previouslyWrong: 0,
  });
  assert.equal(label(null), "—");
});
test("chapter counts are isolated and overall accuracy is weighted by questions", () => {
  const records = {
    M6A_CH01_Q001: attempt(true),
    M6A_CH01_Q002: attempt(false),
    M6A_CH02_Q001: attempt(true),
  };
  assert.equal(stats(records, "CH01").accuracy, 50);
  assert.equal(stats(records, "CH02").accuracy, 100);
  assert.equal(stats(records, "CH03").accuracy, null);
  assert.equal(stats(records).accuracy, 66.7);
  assert.equal(label(stats(records).accuracy), "66.7%");
});
test("repeated submissions count one question and latest correct status wins", () => {
  const records = {
    M6A_CH01_Q001: attempt(false, { submissions: 4, wrongCount: 4 }),
  };
  assert.equal(stats(records).answered, 1);
  assert.equal(stats(records).accuracy, 0);
  records.M6A_CH01_Q001 = attempt(true, { submissions: 5, wrongCount: 4 });
  assert.deepEqual(stats(records), {
    answered: 1,
    correct: 1,
    accuracy: 100,
    previouslyWrong: 1,
  });
});
test("partial multi-item scores do not count as a fully correct question", () => {
  const records = { M6A_CH07_Q100: attempt(false, { score: 9, maxScore: 10 }) };
  assert.equal(stats(records).correct, 0);
  assert.equal(stats(records).accuracy, 0);
  assert.equal(label(stats(records).accuracy), "0%");
});
test("only valid original 700 question IDs count", () => {
  const records = Object.fromEntries(
    [
      "M6A_CH01_Q000",
      "M6A_CH08_Q001",
      "M6A_CH01_Q101",
      "prefix_M6A_CH01_Q001",
    ].map((id) => [id, attempt(true)]),
  );
  records.M6A_CH01_Q100 = attempt(true);
  assert.equal(stats(records).answered, 1);
  assert.equal(stats(records, "CH07").answered, 0);
});
