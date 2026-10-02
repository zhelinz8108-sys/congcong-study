import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

async function importTypescript(path, transform = (source) => source) {
  const source = transform(readFileSync(new URL(path, import.meta.url), "utf8"));
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return import(`data:text/javascript,${encodeURIComponent(javascript)}`);
}

const { checkMathAnswer: check, normalizeNationalDayMathAnswer: normalize } = await importTypescript("../src/lib/national-day-math-answer.ts");
const progress = await importTypescript("../src/lib/national-day-math-progress.ts", (source) => source
  .replace(/^import .* from "react";$/m, "const useCallback = () => {}; const useEffect = () => {}; const useMemo = () => {}; const useRef = () => {}; const useState = () => {};")
  .replace(/^import .* from "@\/lib\/cloud-progress";$/m, "const loadCloudState = () => {};"));

test("only authored accepted answers enable checking", () => {
  assert.equal(check("12"), null);
  assert.equal(check("12", []), null);
  assert.equal(check("√", undefined), null);
  assert.equal(check("北偏东35°，800米", []), null);
  assert.equal(check("", ["12"]), false);
  assert.equal(check("12", ["12"]), true);
  assert.equal(check("13", ["12"]), false);
});

test("normalization preserves decimal points, operators and separate fields", () => {
  assert.equal(normalize(" 答案：１．５０。 "), "1.50");
  assert.equal(normalize("3∶4"), "3:4");
  assert.equal(normalize("３／４"), "3/4");
  assert.notEqual(normalize("1.2"), normalize("12"));
  assert.notEqual(normalize("1，2"), normalize("12"));
  assert.notEqual(normalize("1 2"), normalize("12"));
  assert.notEqual(normalize("1+2"), normalize("12"));
});

test("finite decimals, reduced fractions and mixed numbers are equivalent", () => {
  for (const value of ["3/4", "6/8", "0.75", "０．７５０", "¾"]) assert.equal(check(value, ["3/4"]), true, value);
  for (const value of ["1又1/2", "1 1/2", "3/2", "1.5"]) assert.equal(check(value, ["1.5"]), true, value);
  assert.equal(check("−1又1/2", ["-1.5"]), true);
  assert.equal(check("1/-2", ["-0.5"]), true);
  assert.equal(check(".5", ["1/2"]), true);
  assert.equal(check("1/0", ["1"]), false);
  assert.equal(check("0.3333", ["1/3"]), false);
  assert.equal(check("0.45", ["0.6"]), false);
  assert.equal(check("1,000.5", ["1000.5"]), true);
  assert.notEqual(check("1,2", ["12"]), true);
});

test("compatible units convert without dropping a required unit", () => {
  assert.equal(check("300厘米", ["3米"]), true);
  assert.equal(check("３（米）。", ["300 cm"]), true);
  assert.equal(check("0.4千米", ["400米"]), true);
  assert.equal(check("60分钟", ["1小时"]), true);
  assert.equal(check("1000克", ["1千克"]), true);
  assert.equal(check("500毫升", ["0.5升"]), true);
  assert.equal(check("5角", ["0.5元"]), true);
  assert.equal(check("90°", ["90度"]), true);
  assert.equal(check("3厘米", ["3米"]), false);
  assert.equal(check("3", ["3米"]), false);
  assert.equal(check("3米", ["3厘米"]), false);
  assert.equal(check("3人", ["3棵"]), false);
  assert.equal(check("3米", ["3"]), null);
  assert.equal(check("3", ["3米", "3"]), true);
});

test("square and cubic dimensions keep their respective unit factors", () => {
  assert.equal(check("10000平方厘米", ["1平方米"]), true);
  assert.equal(check("10000 cm²", ["1 m^2"]), true);
  assert.equal(check("10000cm2", ["1 m²"]), true);
  assert.equal(check("1公顷", ["10000平方米"]), true);
  assert.equal(check("1000立方厘米", ["1升"]), true);
  assert.equal(check("100平方厘米", ["1平方米"]), false);
  assert.equal(check("1米", ["1平方米"]), false);
  assert.equal(check("1平方米", ["1立方米"]), false);
});

test("rates retain numerator and denominator dimensions", () => {
  assert.equal(check("60米/分", ["1米/秒"]), true);
  assert.equal(check("3.6千米/时", ["1米/秒"]), true);
  assert.equal(check("0.005元/克", ["5元/千克"]), true);
  assert.equal(check("60米/秒", ["60米/分"]), false);
  assert.equal(check("60米", ["60米/分"]), false);
});

test("ratios are not mistaken for their values or silently simplified", () => {
  assert.equal(check("３∶４", ["3:4"]), true);
  assert.equal(check("3 / 4", ["3:4"]), false);
  assert.equal(check("0.75", ["3:4"]), false);
  assert.equal(check("6:8", ["3:4"]), false);
  assert.equal(check("3:4", ["0.75"]), false);
});

test("explicit short true/false keys support common marks", () => {
  assert.equal(check("√", ["正确"]), true);
  assert.equal(check("对", ["√"]), true);
  assert.equal(check("×", ["错误"]), true);
  assert.equal(check("×", ["正确"]), false);
  assert.equal(check("A。", ["a"]), true);
  assert.equal(check("b", ["a"]), false);
});

test("approximate keys accept formatting but not invented rounding precision", () => {
  assert.equal(check("约18.84米", ["18.84米"]), true);
  assert.equal(check("≈18.84 米", ["约18.84米"]), true);
  assert.equal(check("18.8米", ["约18.84米"]), false);
  assert.equal(check("18.84", ["约18.84米"]), false);
});

test("unsupported explanations, radicals, coordinates and multipart answers use self assessment", () => {
  assert.equal(check("3", ["√9"]), null);
  assert.equal(check("x=12", ["12"]), null);
  assert.equal(check("12", ["x=12"]), null);
  assert.equal(check("(3,4)", ["(4,3)"]), null);
  assert.equal(check("甲300元乙180元", ["甲300元，乙180元"]), null);
  assert.equal(check("东偏北65°", ["北偏东25°"]), null);
  assert.equal(check("应付5元", ["5元"]), null);
  assert.equal(check("1+2", ["3"]), null);
  assert.equal(check("北偏东25°", ["北偏东25°"]), true);
  assert.equal(check("正确，因为这两个比值相等", ["正确，因为这两个比值相等"]), true);
});

test("math cloud scopes are separate from English and fit the current API whitelist", () => {
  const scope = progress.getNationalDayMathProgressScope("math-2026");
  assert.equal(scope, "math:national-day:math-2026:v1");
  assert.notEqual(scope, "english:national-day:math-2026:v1");
  assert.ok(/^[a-z0-9][a-z0-9:_-]{0,127}$/i.test(scope));
  assert.throws(() => progress.getNationalDayMathProgressScope("../math"));
});

test("progress preserves drafts and ratings, repairs invalid values and deduplicates sections", () => {
  assert.deepEqual(progress.normalizeNationalDayMathProgress(null), { attempts: {}, completedSections: [], lastSection: "" });
  const normalized = progress.normalizeNationalDayMathProgress({
    attempts: {
      draft: { value: "我的草稿", checked: false, correct: true },
      rated: { value: "不同表达", checked: true, correct: false, selfRated: true },
      bad: { value: 123, checked: true, correct: true },
      pending: { value: "", checked: true, correct: null },
    },
    completedSections: ["u4", "u4", "u5", null, ""],
    lastSection: "u5",
  });
  assert.deepEqual(normalized.attempts.draft, { value: "我的草稿", checked: false, correct: null });
  assert.deepEqual(normalized.attempts.rated, { value: "不同表达", checked: true, correct: false, selfRated: true });
  assert.equal(normalized.attempts.bad, undefined);
  assert.deepEqual(normalized.completedSections, ["u4", "u5"]);
  assert.equal(normalized.lastSection, "u5");
  const first = progress.createEmptyNationalDayMathProgress();
  first.completedSections.push("u4");
  assert.deepEqual(progress.createEmptyNationalDayMathProgress().completedSections, []);
});

test("only submitted system checks retain the new grading marker", () => {
  const attempts = progress.normalizeNationalDayMathProgress({ attempts: {
    system: { value: '{"part1":"0.4"}', checked: true, correct: true, gradingVersion: 2 },
    self: { value: "0.4", checked: true, correct: true, selfRated: true, gradingVersion: 2 },
    draft: { value: '{"part1":"0.5"}', checked: false, correct: true, gradingVersion: 2 },
    legacy: { value: "0.4", checked: true, correct: true },
  } }).attempts;
  assert.equal(attempts.system.gradingVersion, 2);
  for (const id of ["self", "draft", "legacy"]) assert.equal(attempts[id].gradingVersion, undefined);
  assert.equal(attempts.self.selfRated, true);
  assert.equal(attempts.draft.correct, null);
});

test("large Chinese drafts bypass the 64 KiB keepalive limit", () => {
  const small = progress.createEmptyNationalDayMathProgress();
  assert.equal(progress.createNationalDayMathCloudRequest(small).keepalive, true);
  const large = {
    attempts: Object.fromEntries(Array.from({ length: 89 }, (_, index) => [
      `question-${index}`, { value: "数学草稿".repeat(300), checked: false, correct: null },
    ])),
    completedSections: ["u4"],
    lastSection: "u5",
  };
  const request = progress.createNationalDayMathCloudRequest(large);
  assert.ok(Buffer.byteLength(request.body, "utf8") > 64 * 1024);
  assert.ok(Buffer.byteLength(request.body, "utf8") < 2 * 1024 * 1024);
  assert.equal(request.keepalive, false);
  assert.deepEqual(JSON.parse(request.body).payload, large);
});

test("draft writes use the existing profile API and coalesce without losing the latest payload", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  try {
    const scope = progress.getNationalDayMathProgressScope("test-math");
    const initial = progress.createEmptyNationalDayMathProgress();
    const latest = { ...initial, attempts: { q1: { value: "3米", checked: false, correct: null } } };
    progress.saveNationalDayMathProgressState(scope, "test-storage", initial);
    progress.saveNationalDayMathProgressState(scope, "test-storage", latest);
    await progress.flushNationalDayMathProgress(scope);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, `/api/progress/${encodeURIComponent(scope)}`);
    assert.equal(requests[0].options.method, "PUT");
    assert.deepEqual(JSON.parse(requests[0].options.body).payload, latest);
  } finally { globalThis.fetch = originalFetch; }
});
