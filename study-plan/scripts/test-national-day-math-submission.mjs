import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) => JSON.parse(readFileSync(path.join(appRoot, relative), "utf8"));
const sourceBook = readJson("src/data/national-day-math.json");
const gradingDays = [1, 2, 3].map((day) => readJson(`src/data/national-day-math-grading-day${day}.json`));
const rubrics = Object.assign({}, ...gradingDays);
const questions = sourceBook.sections.flatMap((section) => section.blocks.filter((block) => block.type === "quiz"));
const examples = sourceBook.sections.flatMap((section) => section.blocks.filter((block) => block.type === "example"));

// Load the actual TypeScript implementation without introducing a test runner or
// importing Next.js server-only markers into Node. Local aliases and JSON remain
// the real checked-in dependencies, embedded as native ES module data URLs.
const moduleUrls = new Map();
async function moduleUrl(filename) {
  const absolute = path.resolve(filename);
  if (moduleUrls.has(absolute)) return moduleUrls.get(absolute);
  if (absolute.endsWith(".json")) {
    const json = JSON.parse(readFileSync(absolute, "utf8"));
    const url = `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(json)};`)}`;
    moduleUrls.set(absolute, url);
    return url;
  }
  let source = readFileSync(absolute, "utf8").replace(/^\s*import\s+["']server-only["'];?\s*$/gm, "");
  source = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g)];
  for (const match of imports) {
    const specifier = match[1];
    if (!specifier.startsWith("@/") && !specifier.startsWith(".")) continue;
    let dependency = specifier.startsWith("@/")
      ? path.join(appRoot, "src", specifier.slice(2))
      : path.resolve(path.dirname(absolute), specifier);
    if (!path.extname(dependency)) dependency += ".ts";
    const url = await moduleUrl(dependency);
    source = source.replaceAll(`"${specifier}"`, `"${url}"`).replaceAll(`'${specifier}'`, `"${url}"`);
  }
  const url = `data:text/javascript,${encodeURIComponent(source)}`;
  moduleUrls.set(absolute, url);
  return url;
}

const { gradeNationalDayMathFields: grade, toPublicNationalDayMathSections: toPublic } = await import(await moduleUrl(path.join(appRoot, "src/lib/national-day-math-grader.ts")));
const { getPublicNationalDayMathSections: getPublic, submitNationalDayMath: submit } = await import(await moduleUrl(path.join(appRoot, "src/lib/national-day-math-submission.ts")));
const correctValues = (questionId) => Object.fromEntries(rubrics[questionId].fields.map((field) => [field.id, field.accepted[0]]));

function forbiddenKeys(value, forbidden, where = "payload") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => forbiddenKeys(child, forbidden, `${where}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!forbidden.has(key), `private answer key ${where}.${key}`);
    forbiddenKeys(child, forbidden, `${where}.${key}`);
  }
}

test("all 89 quizzes have one private rubric, with no extra or duplicate quiz ids", () => {
  assert.equal(questions.length, 89);
  assert.equal(examples.length, 117);
  const keys = gradingDays.flatMap((day) => Object.keys(day));
  assert.equal(keys.length, new Set(keys).size);
  assert.deepEqual([...Object.keys(rubrics)].sort(), questions.map((question) => question.id).sort());
  for (const question of questions) {
    assert.ok(rubrics[question.id].fields.length > 0, question.id);
    assert.equal(new Set(rubrics[question.id].fields.map((field) => field.id)).size, rubrics[question.id].fields.length, question.id);
  }
});

test("rubrics are explicit short answers or three-option choices, never self assessment", () => {
  for (const question of questions) {
    for (const field of rubrics[question.id].fields) {
      const label = `${question.id}.${field.id}`;
      assert.ok(["answer", "choice"].includes(field.kind), label);
      assert.equal(typeof field.label, "string", label);
      assert.ok(field.label.trim(), label);
      assert.ok(Array.isArray(field.accepted) && field.accepted.length > 0, label);
      assert.ok(field.accepted.every((answer) => typeof answer === "string" && answer.trim()), label);
      if (field.format) assert.ok(["two-decimal", "three-decimal", "reduced-fraction", "digits"].includes(field.format), label);
      if (field.kind !== "choice") continue;
      assert.equal(field.options.length, 3, label);
      assert.equal(new Set(field.options).size, 3, label);
      assert.equal(field.options.filter((option) => field.accepted.includes(option)).length, 1, label);
      for (const key of ["selected", "selectedOption", "defaultValue", "value", "checked", "correct"]) assert.equal(field[key], undefined, `${label}.${key}`);
    }
  }
});

test("every authored reference answer passes all fields of all 89 quizzes", () => {
  for (const question of questions) {
    const result = grade(rubrics[question.id].fields, correctValues(question.id));
    assert.equal(result.correct, true, question.id);
    assert.equal(result.fields.length, rubrics[question.id].fields.length, question.id);
    assert.ok(result.fields.every((field) => field.correct === true), question.id);
  }
});

test("all explicitly accepted unit, fraction and text alternatives also pass", () => {
  for (const question of questions) {
    for (const field of rubrics[question.id].fields) {
      for (const answer of field.accepted) {
        const values = { ...correctValues(question.id), [field.id]: answer };
        assert.equal(grade(rubrics[question.id].fields, values).correct, true, `${question.id}.${field.id} ${answer}`);
      }
    }
  }
});

test("changing each individual field to a wrong answer marks that field and the quiz wrong", () => {
  for (const question of questions) {
    for (const field of rubrics[question.id].fields) {
      const values = correctValues(question.id);
      values[field.id] = field.kind === "choice"
        ? field.options.find((option) => !field.accepted.includes(option))
        : "999999999999";
      const result = grade(rubrics[question.id].fields, values);
      assert.equal(result.correct, false, `${question.id}.${field.id}`);
      for (const feedback of result.fields) assert.equal(feedback.correct, feedback.id !== field.id, `${question.id}.${field.id} affected ${feedback.id}`);
    }
  }
});

test("missing and blank answers throw before returning solutions or correctness", () => {
  for (const question of questions) {
    for (const field of rubrics[question.id].fields) {
      for (const blank of [undefined, "", "  \n\t "]) {
        const values = correctValues(question.id);
        if (blank === undefined) delete values[field.id];
        else values[field.id] = blank;
        assert.throws(() => grade(rubrics[question.id].fields, values), `${question.id}.${field.id}`);
        assert.throws(() => submit(question.id, values), (error) => {
          assert.equal(typeof error.message, "string");
          assert.ok(!error.message.includes(question.answer), `solution leaked in ${question.id} error`);
          return true;
        });
      }
    }
  }
});

test("explicit unit alternatives allow numeric input but do not accept wrong dimensions", () => {
  const examplesToCheck = [
    ["unit-008", "part1", "176.0台", true],
    ["unit-031", "part1", "0.09千克", true],
    ["unit-031", "part1", "90米", false],
    ["unit-039", "part2", "314平方厘米", true],
    ["unit-039", "part2", "314厘米", false],
    ["unit-039", "part2", "314平方米", false],
    ["unit-048", "area", "15厘米", false],
    ["unit-051", "distance", "0.15米", true],
    ["unit-051", "distance", "15米", false],
  ];
  for (const [questionId, fieldId, value, expected] of examplesToCheck) {
    const values = { ...correctValues(questionId), [fieldId]: value };
    assert.equal(grade(rubrics[questionId].fields, values).fields.find((field) => field.id === fieldId).correct, expected, `${questionId}.${fieldId} ${value}`);
  }
});

test("required rounding, reduced fractions and binary strings are not silently reformatted", () => {
  const formats = [
    ["comprehensive-001", "rounded", "1.70", true],
    ["comprehensive-001", "rounded", "1.7", false],
    ["comprehensive-001", "rounded", "1.700", false],
    ["unit-034", "part1", "0.618", true],
    ["unit-034", "part1", "0.6180", false],
    ["unit-034", "part1", "309/500", false],
    ["comprehensive-009", "fraction", "13/25", true],
    ["comprehensive-009", "fraction", "26/50", false],
    ["comprehensive-009", "fraction", "0.52", false],
    ["comprehensive-020", "binary", "1101", true],
    ["comprehensive-020", "binary", "1101.0", false],
    ["comprehensive-020", "binary", "1.101e3", false],
  ];
  for (const [questionId, fieldId, value, expected] of formats) {
    const values = { ...correctValues(questionId), [fieldId]: value };
    assert.equal(grade(rubrics[questionId].fields, values).fields.find((field) => field.id === fieldId).correct, expected, `${questionId}.${fieldId} ${value}`);
  }
});

test("coordinates retain ordered pairs, and simplest ratios cannot be replaced by their values", () => {
  const formats = [
    ["unit-053", "original", "（５，３）", true],
    ["unit-053", "original", "(3,5)", false],
    ["unit-053", "original", "5,3", true],
    ["unit-028", "part1", "４∶３", true],
    ["unit-028", "part1", "8:6", false],
    ["unit-028", "part1", "4/3", false],
    ["unit-028", "part2", "4/3", true],
    ["unit-028", "part2", "4:3", false],
  ];
  for (const [questionId, fieldId, value, expected] of formats) {
    const values = { ...correctValues(questionId), [fieldId]: value };
    assert.equal(grade(rubrics[questionId].fields, values).fields.find((field) => field.id === fieldId).correct, expected, `${questionId}.${fieldId} ${value}`);
  }
});

test("public payload removes every quiz solution and grading key without changing source content", () => {
  const original = JSON.stringify(sourceBook.sections);
  const sections = toPublic(sourceBook.sections, rubrics);
  assert.equal(JSON.stringify(sourceBook.sections), original, "public conversion mutated the source");
  assert.deepEqual(sections.map((section) => section.id), sourceBook.sections.map((section) => section.id));
  const publicQuizzes = sections.flatMap((section) => section.blocks.filter((block) => block.type === "quiz"));
  assert.equal(publicQuizzes.length, 89);
  for (const question of publicQuizzes) {
    assert.ok(Array.isArray(question.fields) && question.fields.length > 0, question.id);
    forbiddenKeys(question, new Set(["answer", "steps", "pitfall", "accepted", "expected", "correct", "selected", "defaultValue", "selfRated"]), question.id);
    for (const field of question.fields) assert.ok(["answer", "choice"].includes(field.kind));
  }
  const publicExamples = sections.flatMap((section) => section.blocks.filter((block) => block.type === "example"));
  assert.equal(publicExamples.length, 117);
  for (const example of publicExamples) {
    const source = examples.find((question) => question.id === example.id);
    assert.equal(example.answer, source.answer, example.id);
    assert.deepEqual(example.steps, source.steps, example.id);
  }
});

test("server public getter also sends no hidden quiz solutions or private rubrics", () => {
  const sections = getPublic();
  assert.ok(Array.isArray(sections));
  const publicQuizzes = sections.flatMap((section) => section.blocks.filter((block) => block.type === "quiz"));
  assert.equal(publicQuizzes.length, 89);
  for (const question of publicQuizzes) forbiddenKeys(question, new Set(["answer", "steps", "pitfall", "accepted", "expected", "correct", "selfRated"]), question.id);
});

test("submission returns the original answer and steps only after complete input is submitted", () => {
  for (const question of questions) {
    const result = submit(question.id, correctValues(question.id));
    assert.equal(result.questionId, question.id);
    assert.equal(result.correct, true, question.id);
    assert.equal(result.answer, question.answer, question.id);
    assert.deepEqual(result.steps, question.steps, question.id);
    assert.ok(result.fields.every((field) => typeof field.correct === "boolean"), question.id);
    if (question.pitfall) assert.equal(result.pitfall, question.pitfall);
  }
});

test("invalid submissions reject unknown ids and non-string answers without returning an answer", () => {
  assert.throws(() => submit("example-001", {}));
  assert.throws(() => submit("unknown-question", {}));
  assert.throws(() => submit("__proto__", {}));
  assert.throws(() => submit("constructor", {}));
  for (const value of [null, undefined, [], "0.4", 0.4]) assert.throws(() => submit("diagnostic-001", value));
  for (const value of [null, 0.4, true, {}, []]) assert.throws(() => submit("diagnostic-001", { part1: value }));
  assert.throws(() => submit("diagnostic-001", { part1: "0.4", unexpected: "correct" }));
  assert.throws(() => submit("diagnostic-001", { part1: "0.4".repeat(100) }));
  assert.throws(() => submit("diagnostic-001", Object.create({ part1: "0.4" })));
});
