import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

process.chdir(appRoot);
process.env.NODE_ENV = "production";
const root = "content/english-six";
const read = file => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const review = read("quality-review.private.json");
const bank = await loadHolidayTestModule("src/server/english-six-bank.ts");
const original = await loadHolidayTestModule("src/server/english-six.ts");
const quality = await loadHolidayTestModule("src/server/english-six-quality.ts");
const answers = await loadHolidayTestModule("src/lib/english-six-answer.ts");
const all = new Map();
let auto = 0, reference = 0;
for (const entry of read("bank/index.json").papers) {
  const privatePaper = bank.englishSixBankPrivatePaper(entry.id), publicPaper = bank.englishSixBankPublicPaper(entry.id);
  for (const field of ["answer", "explanation", "accepted", "keySource", "before", "after", "reasons"])
    assert.ok(!JSON.stringify(publicPaper).includes(`"${field}":`), `${entry.id}: private ${field}`);
  for (const q of privatePaper.questions) all.set(q.id, { q, public: publicPaper.questions.find(item => item.id === q.id), file: `bank/papers/${entry.id}.json` });
}
for (let unit = 1; unit <= 8; unit++) {
  const pub = original.englishSixPublicPaper(unit);
  assert.ok(!JSON.stringify(pub).includes('"answer":'));
  for (const q of original.englishSixPaper(unit).questions) all.set(q.id, { q, public: pub.questions.find(item => item.id === q.id), file: `practice/${unit}.json` });
}
const get = suffix => {
  const found = [...all.values()].filter(row => row.q.id === suffix || row.q.id.endsWith(`-${suffix}`));
  assert.equal(found.length, 1, suffix);
  return found[0].q;
};
const grade = (id, response) => {
  const match = /^u([1-8])-/.exec(id);
  const value = match ? original.englishSixGrade(Number(match[1]), id, response) : bank.englishSixBankGrade(id, response);
  if (!value) throw new Error("Invalid response shape");
  return value;
};
assert.equal(all.size, 5572);
for (const { q, public: pub } of all.values()) {
  assert.ok(q.answer.trim() && q.explanation.trim(), q.id);
  if (q.promptRuns) assert.equal(q.promptRuns.map(run => run.text).join(""), q.prompt, q.id);
  for (const option of q.options) if (option.runs) assert.equal(option.runs.map(run => run.text).join(""), option.text, q.id);
  if (/对[画划]线/.test(q.prompt)) assert.ok(q.promptRuns?.some(run => run.underline), q.id);
  if (q.options.length) {
    assert.ok(q.options.some(option => option.id === q.answer), q.id);
    if (q.grading === "exact" && q.accepted?.length) assert.deepEqual(q.accepted, [[q.answer]], q.id);
    const feedback = grade(q.id, q.answer);
    assert.equal(feedback.correct, q.grading === "reference" ? null : true, q.id);
  } else if (q.grading === "exact") {
    const values = q.accepted.map(variants => variants[0]);
    assert.equal(answers.sixQuestionInputCount(pub), values.length, q.id);
    const response = values.length > 1 ? JSON.stringify(values) : values[0];
    assert.equal(grade(q.id, response).correct, true, q.id);
  }
  if (q.grading === "reference" || !q.options.length && q.grading !== "exact") reference++; else auto++;
}
for (const change of review.changes) {
  const { q, file } = all.get(change.id);
  assert.equal(file, change.file);
  for (const [field, expected] of Object.entries(change.after)) assert.deepEqual(q[field] ?? null, expected, `${q.id}: ${field}`);
  assert.equal(quality.englishSixQualityRevision(q.id), review.revision);
  const response = q.options.length ? q.answer : q.grading === "exact" ?
    (q.accepted.length > 1 ? JSON.stringify(q.accepted.map(v => v[0])) : q.accepted[0][0]) :
    (answers.sixQuestionInputCount(all.get(q.id).public) > 1 ? JSON.stringify(Array(answers.sixQuestionInputCount(all.get(q.id).public)).fill("old answer")) : "old answer");
  const saved = { correct: false, answer: "old key", explanation: "old explanation" };
  const frozen = JSON.stringify(saved);
  const feedback = quality.englishSixReviewedFeedback(q.id, saved, () => grade(q.id, response));
  assert.equal(feedback.answer, q.answer);
  assert.equal(feedback.correct, change.historical === "reference" ? null : grade(q.id, response).correct);
  assert.equal(JSON.stringify(saved), frozen, "never mutate a saved record");
  const current = { ...grade(q.id, response), contentRevision: review.revision };
  assert.equal(quality.englishSixReviewedFeedback(q.id, current, () => { throw new Error("must not regrade"); }), current);
  const fallback = quality.englishSixReviewedFeedback(q.id, saved, () => { throw new Error("old blank count"); });
  assert.equal(fallback.correct, null);
  assert.equal(fallback.answer, q.answer);
}
const expect = (id, answer) => assert.equal(get(id).answer, answer, id);
expect("4fcedbdeb803", "B"); expect("6a2dec77e4d3", "A"); expect("4c3a1196ba77", "A"); expect("u7-q48", "B");
expect("9d62cd602ded", "He developed hybrid rice in 1973."); expect("a3dc8842559f", "开始打扫我们的学校");
expect("98fb03a5c203", "How lovely the cats are!"); expect("d0eb4eb6d083", "made");
assert.equal(get("605ab5d5ce02").options.find(o => o.id === "C").text, "will");
assert.ok(get("49e4dcdbc20d").prompt.includes("above the ground floor"));
assert.ok(get("u5-q41").context.indexOf("5. _______") < get("u5-q41").context.indexOf("We will meet"));
for (const id of ["u4-q9", "u3-q9", "u7-q1", "1f5d40298684", "9de275874708"]) assert.equal(get(id).grading, "reference");
const writing = get("d12dc287b99b").answer.split("\n").slice(1).join(" ").split(/\s+/).length;
assert.ok(writing >= 50 && writing <= 60);
assert.ok(get("d12dc287b99b").explanation.includes(`${writing}词`));
console.log(JSON.stringify({ questions: all.size, revised: review.changes.length, auto, reference, historicalFeedbackReadOnly: true, privateBeforeSubmit: true, checks: "passed" }));
