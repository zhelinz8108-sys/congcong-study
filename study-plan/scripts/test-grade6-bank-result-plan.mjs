import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const { buildBankResultPlan } = await loadHolidayTestModule("src/server/grade6-bank/result-plan.ts");

const text = value => ({ type: "text", value });
const math = tex => ({ type: "math", tex });
const paragraph = (...content) => ({ type: "paragraph", content });
const field = (id, label = "计算过程") => ({ id, label, kind: "text" });
const answer = (answerText, rules = [], reviewRequired = true) => ({ id: "synthetic", answerText, rules, reviewRequired, answerStatus: "verified_native", answerImages: [] });
const question = (inputs, blocks = []) => ({ id: "synthetic", inputs, native: { version: 1, blocks } });

test("each pure calculation gets its own final numeric rule and no empty-rule success", () => {
  const q = question([field("process-1"), field("process-2")], [
    paragraph(text("脱式计算。")), paragraph(text("（1）"), math("\\frac{3}{8}+\\frac{1}{8}")), { type: "response", fieldId: "process-1" },
    paragraph(text("（2）"), math("0.5\\times3")), { type: "response", fieldId: "process-2" },
  ]);
  const plan = buildBankResultPlan(q, answer("（1）3/8＋1/8＝1/2。（2）0.5×3＝1.5。展示计算过程。"));
  assert.ok(plan?.ready);
  assert.deepEqual(plan.resultInputIds, ["process-1", "process-2"]);
  assert.deepEqual(plan.rules.map(rule => rule.expected), [["1/2"], ["3/2"]]);
  assert.ok(plan.rules.every(rule => rule.numeric));
  assert.equal(buildBankResultPlan(question([field("work")]), answer("请展示推理过程。")), null);
});

test("a complete arithmetic expression is independently checked against an explicit teacher result", () => {
  const q = question([field("work")], [paragraph(text("计算。")), paragraph(math("0.25+0.25")), { type: "response", fieldId: "work" }]);
  assert.ok(buildBankResultPlan(q, answer("0.25＋0.25＝1/2。")));
  assert.equal(buildBankResultPlan(q, answer("0.25＋0.25＝3/4。")), null, "a source disagreement must fail closed");
  const partial = question([field("work")], [paragraph(text("计算。")), paragraph(math("0.25+q")), { type: "response", fieldId: "work" }]);
  assert.equal(buildBankResultPlan(partial, answer("写清解题过程。")), null);
});

test("word problems require one explicit final outcome per field; no last-number guessing", () => {
  const q = question([field("answer", "最终答案")], [paragraph(text("一共有多少人？"))]);
  assert.deepEqual(buildBankResultPlan(q, answer("3×4＝12（人）。"))?.rules, [{ id: "answer", expected: ["12"], numeric: true, unit: "人" }]);
  assert.equal(buildBankResultPlan(q, answer("男生3×4＝12（人），女生5×4＝20（人）。")), null);
  assert.equal(buildBankResultPlan(q, answer("男生12人，女生20人。")), null);
  assert.equal(buildBankResultPlan(q, answer("先设x＝12，再求另一个量。")), null, "an intermediate variable is not a requested final answer");
  assert.equal(buildBankResultPlan(q, answer("答：12人，女生20人。")), null);
  assert.equal(buildBankResultPlan(question([field("why", "说明理由")]), answer("3×4＝12（人）。")), null);
});

test("explicit solved variables are supported only in equation/proportion tasks", () => {
  const q = question([field("work", "解方程过程")], [paragraph(text("解方程。"))]);
  assert.equal(buildBankResultPlan(q, answer("2x＝3，x＝3/2。验算：2×3/2＝3。"))?.rules[0].expected[0], "3/2");
  assert.equal(buildBankResultPlan(q, answer("2x＝3，x＝3÷2＝3/2。"))?.rules[0].expected[0], "3/2");
  assert.equal(buildBankResultPlan(q, answer("x＝2，y＝3。")), null);
  assert.equal(buildBankResultPlan(q, answer("x＝2或x＝-2。")), null);
});

test("calculation instructions and a terminal answer-slot equality preserve the whole expression", () => {
  const q = question([field("work")], [paragraph(text("计算下面各题，能简算的要简算。")), paragraph(math("0.25+0.25=")), { type: "response", fieldId: "work" }]);
  assert.equal(buildBankResultPlan(q, answer("保留简便过程。"))?.rules[0].expected[0], "1/2");
  const invalid = question([field("work")], [paragraph(text("计算下面各题。")), paragraph(math("0.25+0.25=0.5=")), { type: "response", fieldId: "work" }]);
  assert.equal(buildBankResultPlan(invalid, answer("请完整计算。")), null);
});

test("existing objective rules remain authoritative while an explicit separate working slot can be optional", () => {
  const original = [{ id: "result", expected: ["0.25"], numeric: true }];
  const q = question([field("result", "最终结果"), field("work", "计算过程")]);
  const plan = buildBankResultPlan(q, answer("答案0.25；过程供参考。", original));
  assert.deepEqual(plan?.resultInputIds, ["result"]);
  assert.deepEqual(plan?.optionalInputIds, ["work"]);
  assert.deepEqual(plan?.rules, original);
  assert.equal(buildBankResultPlan(question([field("result", "第1题结果"), field("process-2", "第2题计算过程")]), answer("暂无可核验的第二题结果。", original)), null);
});

test("drawn results, source ambiguity, repeating notation and unsupported forms stay manual", () => {
  const q = question([field("result", "答案")]);
  for (const note of ["原题没有明确精度，参考1.5。", "条件不完整。", "取整口径不同。", "依赖模型假设。", "允许另一种结果。", "结果待确认。", "0.333…（3循环）。", "误算2+2＝5，正确结果为4。"]) {
    assert.equal(buildBankResultPlan(q, answer(note)), null, note);
  }
  assert.equal(buildBankResultPlan(question([{ id: "drawing", label: "画出最终图形", kind: "drawing" }]), answer("按要求作图。")), null);
  assert.equal(buildBankResultPlan(question([field("n", "答案"), { id: "drawing", label: "画出旋转图形", kind: "drawing" }]), answer("数值为2，按要求作图。", [{ id: "n", expected: ["2"], numeric: true }])), null);
  assert.equal(buildBankResultPlan(q, answer("答案待核对。", [], true)), null);
});

if (process.argv.includes("--audit-private-fixtures")) {
  const { authoringRows } = await import("./grade6-bank-native-authoring.mjs");
  const rows = (await authoringRows()).map(entry => entry.row);
  const plans = rows.map(row => ({ row, plan: buildBankResultPlan(row, { id: row.id, ...row.private, answerImages: [] }) }));
  const ready = plans.filter(item => item.plan);
  for (const { row, plan } of ready) {
    assert.ok(plan.rules.length > 0 && plan.resultInputIds.length === plan.rules.length);
    assert.equal(plan.resultInputIds.length + plan.optionalInputIds.length, row.inputs.length);
    assert.ok(!row.inputs.some(field => field.kind === "drawing"));
  }
  const first = plans.filter(item => /^SYNC-CH02-P(?:065|066)-000[1-7]$/.test(item.row.id));
  assert.equal(first.length, 7);
  assert.ok(first.every(item => item.plan));
  console.log(JSON.stringify({ total: rows.length, ready: ready.length, formerlyReviewReady: ready.filter(item => item.row.private.reviewRequired).length, manual: rows.length - ready.length, firstSevenChapterTwo: first.length, firstSevenFields: first.reduce((n, item) => n + item.plan.rules.length, 0) }));
}
