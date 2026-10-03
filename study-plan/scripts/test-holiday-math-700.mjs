import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";
import nextEnv from "@next/env";
import katex from "katex";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
nextEnv.loadEnvConfig(root, false);
const urls = new Map();
async function loadUrl(filename) {
  const absolute = path.resolve(filename);
  if (urls.has(absolute)) return urls.get(absolute);
  let source;
  if (absolute.endsWith(".json"))
    source = `export default ${readFileSync(absolute, "utf8")};`;
  else {
    source = ts.transpileModule(
      readFileSync(absolute, "utf8").replace(
        /^\s*import\s+['"]server-only['"];?\s*$/gm,
        "",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;
    for (const [, specifier] of [
      ...source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g),
    ]) {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
      let dependency = specifier.startsWith("@/")
        ? path.join(root, "src", specifier.slice(2))
        : path.resolve(path.dirname(absolute), specifier);
      if (!path.extname(dependency)) dependency += ".ts";
      const url = await loadUrl(dependency);
      source = source
        .replaceAll(`'${specifier}'`, JSON.stringify(url))
        .replaceAll(`"${specifier}"`, JSON.stringify(url));
    }
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  urls.set(absolute, url);
  return url;
}
const load = async (file) => import(await loadUrl(path.join(root, file)));
const { gradeHolidayQuestion: grade, parseHolidayNumber: parse } = await load(
  "src/lib/holiday-math-700-grader.ts",
);
const { emptyHolidayAnswer: empty, completeHolidayAnswer: complete } =
  await load("src/lib/holiday-math-700-input.ts");
const { HOLIDAY_CHAPTERS: chapters, listHolidayQuestions: list } = await load(
  "src/server/holiday-math-700/public-bank.ts",
);
const { holidayPrivateAnswer: privateAnswer } = await load(
  "src/server/holiday-math-700/private-bank.ts",
);
const questions = JSON.parse(
  readFileSync(
    path.join(root, "src/server/holiday-math-700/questions.public.json"),
    "utf8",
  ),
);
const answerOf = (key) =>
  key.kind === "parts"
    ? Object.fromEntries(
        Object.entries(key.value).map(([id, part]) => [id, answerOf(part)]),
      )
    : structuredClone(key.value);
function forbidden(value) {
  if (Array.isArray(value)) return value.forEach(forbidden);
  if (value && typeof value === "object")
    for (const [key, v] of Object.entries(value)) {
      assert.ok(
        ![
          "answer",
          "accepted_answers",
          "hints",
          "solution",
          "choice_rationales",
          "common_mistakes",
          "difficulty_reason",
        ].includes(key),
        `private field ${key}`,
      );
      forbidden(v);
    }
}
function mutate(node, key, value) {
  if (key.kind === "parts") {
    const id = node.parts[0].part_id;
    return { ...value, [id]: mutate(node.parts[0], key.value[id], value[id]) };
  }
  if (key.kind === "blanks")
    return value.map((v, i) => (i ? " " + v : "999999999"));
  if (key.kind === "mapping") {
    const id = Object.keys(value)[0],
      right = node.interaction.right ?? node.interaction.categories;
    return { ...value, [id]: right.find((item) => item.id !== value[id]).id };
  }
  if (key.kind === "sequence") return [...value.slice(1), value[0]];
  if (key.kind === "choices") {
    const option = node.choices[0].id;
    return value.includes(option)
      ? value.filter((id) => id !== option)
      : [...value, option];
  }
  if (key.kind === "choice")
    return node.choices.find((item) => item.id !== value).id;
  return "999999999";
}
function allStrings(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, result));
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => allStrings(v, result));
  return result;
}

test("700 questions, seven chapters, thirteen types and all private IDs are preserved", () => {
  assert.equal(questions.length, 700);
  assert.equal(new Set(questions.map((q) => q.id)).size, 700);
  assert.equal(chapters.length, 7);
  assert.ok(chapters.every((c) => c.count === 100));
  assert.equal(new Set(questions.map((q) => q.type)).size, 13);
  for (const q of questions) {
    forbidden(q);
    assert.equal(privateAnswer(q.id).question_id, q.id);
    assert.equal(complete(q, empty(q)), false, q.id);
    assert.ok(complete(q, answerOf(privateAnswer(q.id).answer)), q.id);
  }
});
test("all 700 authored canonical answer structures pass the real grader", () => {
  const failures = [];
  for (const q of questions) {
    const key = privateAnswer(q.id).answer;
    const result = grade(q, key, answerOf(key));
    if (!result.correct)
      failures.push(
        `${q.id}: ${result.items
          .filter((v) => !v.correct)
          .map((v) => v.path)
          .join(",")}`,
      );
  }
  assert.deepEqual(failures, []);
});
test("every question detects a wrong value or wrong selection", () => {
  const failures = [];
  for (const q of questions) {
    const key = privateAnswer(q.id).answer,
      reference = answerOf(key),
      wrong = mutate(q, key, reference);
    try {
      if (grade(q, key, wrong).correct) failures.push(q.id);
    } catch {
      if (!(Array.isArray(wrong) && wrong.length === 0))
        throw new Error(`Unexpected reject ${q.id}`);
    }
  }
  assert.deepEqual(failures, []);
});
test("incomplete answers for all 700 questions reject before revealing any result", () => {
  for (const q of questions) {
    const key = privateAnswer(q.id).answer;
    assert.throws(() => grade(q, key, empty(q)), q.id);
  }
});
test("multi-blank and multi-part score each individual answer instead of one concatenated string", () => {
  const q = questions.find((q) => q.type === "multi_blank"),
    key = privateAnswer(q.id).answer,
    values = answerOf(key);
  values[0] = "wrong";
  const result = grade(q, key, values);
  assert.equal(result.score, values.length - 1);
  assert.equal(result.items[0].correct, false);
  const p = questions.find((q) => q.type === "multi_part"),
    pk = privateAnswer(p.id).answer;
  const correct = grade(p, pk, answerOf(pk)),
    incorrect = grade(p, pk, mutate(p, pk, answerOf(pk)));
  assert.equal(incorrect.score, correct.score - 1);
});
test("invalid shapes, extra keys, duplicate ordering and unknown choice IDs reject", () => {
  for (const q of questions) {
    const key = privateAnswer(q.id).answer;
    for (const value of [undefined, null, true, 23, {}])
      assert.throws(() => grade(q, key, value), q.id);
  }
  for (const type of ["matching", "classification", "multi_part"]) {
    const q = questions.find((q) => q.type === type),
      key = privateAnswer(q.id).answer;
    assert.throws(() => grade(q, key, { ...answerOf(key), unexpected: "A" }));
  }
  const order = questions.find((q) => q.type === "ordering"),
    ok = privateAnswer(order.id).answer;
  assert.throws(() =>
    grade(
      order,
      ok,
      answerOf(ok).map(() => ok.value[0]),
    ),
  );
  const choice = questions.find((q) => q.type === "single_choice");
  assert.throws(() =>
    grade(choice, privateAnswer(choice.id).answer, "UNKNOWN"),
  );
  const multi = questions.find((q) => q.type === "multi_choice");
  assert.throws(() => grade(multi, privateAnswer(multi.id).answer, ["A", "A"]));
});
test("pagination, all thirteen type filters and wrong-book subset never expose private fields", () => {
  for (const chapter of chapters) {
    let count = 0;
    for (let page = 1; page <= 10; page++) {
      const result = list({ chapter: chapter.chapter_id, page });
      assert.equal(result.questions.length, 10);
      assert.equal(result.total, 100);
      forbidden(result);
      count += result.questions.length;
    }
    assert.equal(count, 100);
  }
  for (const type of new Set(questions.map((q) => q.type))) {
    const result = list({ type });
    assert.ok(result.questions.length > 0);
    assert.ok(result.questions.every((q) => q.type === type));
    forbidden(result);
  }
  assert.equal(list({ ids: [] }).total, 0);
  assert.equal(list({ ids: questions.slice(0, 2).map((q) => q.id) }).total, 2);
  assert.throws(() => list({ ids: ["unknown"] }));
});
test("exact rational arithmetic, mixed numbers and unsafe arithmetic are handled without eval", () => {
  for (const [expression, n, d] of [
    ["0.1+0.2", 3, 10],
    ["1 1/6", 7, 6],
    ["-1又1/6", -7, 6],
    ["(2+3)×4÷5", 4, 1],
    ["2^-3", 1, 8],
  ])
    assert.deepEqual(parse(expression), { n: BigInt(n), d: BigInt(d) });
  for (const value of [
    "1/0",
    "globalThis",
    "(()=>1)()",
    "2^999",
    "1e3",
    "1;process.exit()",
    "(".repeat(25) + "1" + ")".repeat(25),
  ])
    assert.throws(() => parse(value));
});
test("all source LaTeX formulas render, including parts, labels, tables, hints and solutions", () => {
  const failures = [];
  let count = 0;
  for (const q of questions) {
    for (const text of allStrings([q, privateAnswer(q.id)])) {
      for (const [piece] of text.matchAll(
        /\$\$[\s\S]+?\$\$|\$[^$]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g,
      )) {
        const size = piece.startsWith("$$") || piece.startsWith("\\") ? 2 : 1;
        try {
          katex.renderToString(piece.slice(size, -size), {
            throwOnError: true,
            trust: false,
            strict: "ignore",
            minRuleThickness: 0.06,
            maxExpand: 1000,
            maxSize: 8,
          });
          count++;
        } catch {
          failures.push(q.id);
        }
      }
    }
  }
  assert.ok(count > 100);
  assert.deepEqual([...new Set(failures)], []);
});
test("all 82 original SVG diagrams exist and contain no executable or remote resources", () => {
  const directory = path.join(root, "public/holiday-math-700/assets/svg"),
    files = readdirSync(directory);
  assert.equal(files.length, 82);
  for (const q of questions.filter((q) => q.diagram)) {
    assert.ok(q.diagram.alt.trim());
    const source = readFileSync(
      path.join(root, "public/holiday-math-700", q.diagram.src),
      "utf8",
    );
    assert.match(source, /<svg/);
    assert.match(source, /viewBox=/);
    assert.doesNotMatch(
      source,
      /<script|<foreignObject|onload\s*=|onerror\s*=|(?:href|src)\s*=\s*['"]https?:/i,
      q.id,
    );
  }
});
test("equivalent forms, required formats, units and tolerance obey the question requirements", () => {
  function check(
    stem,
    kind,
    expected,
    actual,
    unit = null,
    tolerance = null,
    aliases = [],
  ) {
    const q = {
      ...questions[0],
      type: "fill_numeric",
      choices: null,
      stem,
      input: { blanks: [{ label: "答案", unit }] },
    };
    return grade(
      q,
      {
        kind,
        value: expected,
        accepted_answers: aliases,
        unit,
        unit_required: false,
        tolerance,
      },
      actual,
    ).correct;
  }
  assert.equal(check("计算", "fraction", "3/4", "0.75"), true);
  assert.equal(check("填最简分数", "fraction", "3/4", "0.75"), false);
  assert.equal(check("填最简分数", "fraction", "3/4", "6/8"), false);
  assert.equal(check("填最简分数", "fraction", "3/4", "３/４"), true);
  assert.equal(check("化成最简整数比", "expression", "3:4", "6:8"), false);
  assert.equal(
    check("化成最简整数比", "expression", "3:4", "0.75", null, null, ["0.75"]),
    false,
  );
  assert.equal(check("化成最简整数比", "expression", "3:4", "３∶４"), true);
  assert.equal(check("保留两位小数", "number", "1.70", "1.7"), false);
  assert.equal(check("保留两位小数", "number", "1.70", "1.70"), true);
  assert.equal(check("二进制记数", "number", "10111", "10111.0"), false);
  assert.equal(check("数对", "expression", "(5,3)", "（５，３）"), true);
  assert.equal(check("数对", "expression", "(5,3)", "(3,5)"), false);
  assert.equal(check("长度", "number", "100", "1米", "厘米"), true);
  assert.equal(check("长度", "number", "100", "100平方米", "厘米"), false);
  assert.equal(check("面积", "number", "10000", "1平方米", "平方厘米"), true);
  assert.equal(
    check("面积", "number", "10000", "10000厘米", "平方厘米"),
    false,
  );
  assert.equal(check("重量", "number", "1000", "1千克", "克"), true);
  assert.equal(check("体积", "number", "1", "1000毫升", "升"), true);
  assert.equal(check("近似数", "number", "1", "1.01", null, "0.01"), true);
  assert.equal(check("精确数", "number", "1", "1.01"), false);
  const slots = questions.find((q) => q.id === "M6A_CH01_Q057"),
    key = privateAnswer(slots.id).answer;
  assert.equal(grade(slots, key, ["45", "2.3450", "12"]).correct, false);
  assert.equal(grade(slots, key, ["45", "2.345", "12"]).correct, true);
  const word = questions.find((q) => q.id === "M6A_CH05_Q007");
  assert.equal(
    grade(word, privateAnswer(word.id).answer, ["3", "圆周率", "pi"]).correct,
    true,
  );
  const travel = questions.find((q) => q.id === "M6A_CH03_Q056");
  assert.equal(
    grade(travel, privateAnswer(travel.id).answer, [
      "72千米",
      "4小时",
      "0.96小时",
      "3/5",
    ]).correct,
    true,
  );
});
