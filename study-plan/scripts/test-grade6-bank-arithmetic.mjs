import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const { evaluateBankArithmetic: evaluate } = await loadHolidayTestModule("src/lib/grade6-bank-arithmetic.ts");
const value = (numerator, denominator = 1) => ({ numerator: BigInt(numerator), denominator: BigInt(denominator) });

test("exact rational arithmetic respects precedence, grouping and left associativity", () => {
  for (const [expression, numerator, denominator = 1] of [
    ["1+2*3", 7], ["(1+2)*3", 9], ["[7-(2+1)]/8", 1, 2],
    ["8/2/2", 2], ["8-2-3", 3], ["-3*-2+1", 7], ["1/(-2)", -1, 2],
    ["0.1+0.2-0.3", 0], [".125", 1, 8], ["1.", 1],
    ["12.5%", 1, 8], ["50%/25%", 2], ["(1+1)%", 1, 50],
    ["1000000000000000001-1000000000000000000", 1],
    ["２．５＋１／２", 3], ["3×4÷8", 3, 2],
  ]) assert.deepEqual(evaluate(expression), value(numerator, denominator), expression);
});

test("native TeX fractions, mixed numbers and bracket-sizing commands preserve meaning", () => {
  for (const [expression, numerator, denominator = 1] of [
    [String.raw`\frac{1}{2}+\dfrac{1}{4}`, 3, 4],
    [String.raw`\frac12`, 1, 2], [String.raw`\frac49`, 4, 9],
    [String.raw`\frac7{12}`, 7, 12], [String.raw`\frac{7}2`, 7, 2],
    [String.raw`2\frac12`, 5, 2], [String.raw`\frac01`, 0],
    [String.raw`\frac{1+1}{2\times3}`, 1, 3],
    [String.raw`\frac{\frac{1}{2}}{\tfrac{3}{4}}`, 2, 3],
    [String.raw`2\frac{1}{2}`, 5, 2], [String.raw`-2\frac{1}{2}`, -5, 2],
    [String.raw`8\times\left(\frac{3}{4}\div\frac{1}{4}-2\frac{1}{2}\right)`, 4],
    [String.raw`\left[\frac{2}{3}+\left(1-\frac{1}{6}\right)\right]`, 3, 2],
    [String.raw`12.5\%`, 1, 8], ["2又1/2", 5, 2], ["2带1/2", 5, 2],
    ["2 1/2", 5, 2], ["-0又1/2", -1, 2], [String.raw`2\frac{1}{2}%`, 1, 40],
  ]) assert.deepEqual(evaluate(expression), value(numerator, denominator), expression);
});

test("representative CH02 native calculations match independently calculated final results", () => {
  const book = JSON.parse(readFileSync(new URL("../content/grade6-bank/questions.native.public.json", import.meta.url), "utf8"));
  const math = question => question.native.blocks.flatMap(block => block.type === "paragraph" ? block.content : block.type === "table" ? block.rows.flat(2) : []).filter(inline => inline.type === "math").map(inline => inline.tex);
  // Expected values were calculated independently by cancellation/common
  // denominators; no private teacher key or evaluator-generated oracle is used.
  for (const [id, expected] of [
    ["SYNC-CH02-P065-0001", [[5, 32], [8, 5], [3, 7]]],
    ["SYNC-CH02-P066-0005", [[5, 3]]],
    ["SYNC-CH02-P066-0006", [[8, 15], [4]]],
    ["SYNC-CH02-P066-0007", [[5, 2], [75, 4], [13, 17], [4, 3]]],
    ["SYNC-CH02-P070-0024", [[1, 5], [3, 2]]],
    ["SYNC-CH02-P072-0031", [[4039]]],
    ["SYNC-CH02-P125-0277", [[23, 36]]],
    ["SYNC-CH02-P125-0278", [[0], [9, 8], [341, 25]]],
    ["G6E-CH02-Q004", [[1000], [10], [2, 3]]],
    ["G6E-CH03-Q032", [[11]]],
  ]) {
    const expressions = math(book.questions.find(question => question.id === id));
    assert.ok(expressions.length >= expected.length, id);
    expected.forEach(([numerator, denominator = 1], index) => assert.deepEqual(evaluate(expressions[index]), value(numerator, denominator), `${id} expression ${index + 1}`));
  }
});

test("rejects incomplete, symbolic, unsafe and mathematically invalid expressions", () => {
  for (const expression of [
    "", " ", ".", "1..2", "1+", "1 2", "2(3+4)", "2**3", "2^3", "2²", "1e3", "NaN", "Infinity", "1/0", "0/0", "1/(2-2)",
    "1=1", "x+1", "10/x", "3cm", "π*2", "1:2", "1;2", "1,2", "1+2 junk", "(1+2]", "[1+2", "1+2)", "50%%",
    String.raw`\frac123`, String.raw`\frac4.9`, String.raw`\frac-12`, String.raw`\frac1x`, String.raw`\frac10`,
    String.raw`\frac{}{2}`, String.raw`\frac{1}{0}`, String.raw`\frac{1}{2`,
    String.raw`2\frac{3}{2}`, String.raw`2\frac{-1}{2}`, String.raw`2\frac{1}{2}\frac{1}{3}`,
    String.raw`\left 1+2`, String.raw`\right 1`, String.raw`\sqrt{4}`, String.raw`\text{1}`, String.raw`\pi`,
    String.raw`\input{secret}`, String.raw`\newcommand{\x}{1}`, String.raw`\href{javascript:alert(1)}{1}`,
    "globalThis.process.exit()", "1/*comment*/2", "${process.env.KEY}",
  ]) assert.equal(evaluate(expression), null, expression);
});

test("resource limits bound source, tokens, nesting, literals and rational growth", () => {
  assert.equal(evaluate(" ".repeat(4097)), null);
  assert.equal(evaluate("1+".repeat(300) + "1"), null);
  assert.equal(evaluate("(".repeat(65) + "1" + ")".repeat(65)), null);
  assert.equal(evaluate("-".repeat(65) + "1"), null);
  assert.equal(evaluate("9".repeat(129)), null);
  assert.equal(evaluate(Array(10).fill("9".repeat(128)).join("*")), null);
  const large = "9".repeat(128);
  assert.deepEqual(evaluate(`${large}/${large}`), value(1));
  assert.deepEqual(evaluate("(".repeat(20) + "1/3" + ")".repeat(20)), value(1, 3));
});
