import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const book = JSON.parse(read("../src/data/national-day-math.json"));
const blocks = book.sections.flatMap((section) => section.blocks);
const questions = blocks.filter((block) => block.type === "example" || block.type === "quiz");

test("the complete three-day book keeps all 206 worked answers", () => {
  assert.deepEqual(book.stats, { examples: 117, diagnostic: 12, unitQuiz: 57, comprehensive: 20, answers: 206 });
  assert.equal(questions.length, 206);
  assert.equal(questions.filter((question) => question.type === "example").length, 117);
  for (const [category, count] of Object.entries({ diagnostic: 12, unit: 57, comprehensive: 20 })) {
    assert.equal(questions.filter((question) => question.category === category).length, count);
  }
  assert.equal(new Set(questions.map((question) => question.id)).size, 206);
  for (const question of questions) {
    assert.ok(question.question.trim(), question.id);
    assert.ok(question.answer.trim(), question.id);
    assert.ok(question.steps.length > 0 && question.steps.every((step) => step.trim()), question.id);
    assert.ok(question.pdfPage >= 1 && question.pdfPage <= 106, question.id);
  }
});

test("all seven units and four textbook activities remain in the reading order", () => {
  const chapterIds = book.sections.filter((section) => section.kind === "chapter").map((section) => section.id);
  assert.deepEqual(chapterIds, ["u1", "u2", "segmented", "u3", "binary", "u4", "golden", "u5", "sports", "u6", "u7"]);
  for (const id of ["plan", "prerequisite", "diagnostic", "day1", "day2", "day3", "comprehensive", "review", "checklist"]) assert.ok(book.sections.some((section) => section.id === id), id);
  assert.equal(new Set(book.sections.map((section) => section.id)).size, book.sections.length);
  assert.equal(blocks.filter((block) => block.type === "formula").length, 22);
});

test("all seven original diagrams have native SVG equivalents and binary notation is preserved", () => {
  const diagrams = blocks.filter((block) => block.type === "diagram").map((block) => block.id);
  assert.deepEqual(diagrams, ["decimals", "whole", "ratio", "circle", "scale", "coordinates", "bearing"]);
  const binary = JSON.stringify(book.sections.find((section) => section.id === "binary"));
  assert.match(binary, /[₀₁₂₃₄₅₆₇₈₉]/);
  const svg = read("../src/components/national-day-math-diagram.tsx");
  assert.match(svg, /<svg/);
  for (const id of diagrams) assert.ok(svg.includes(id), id);
});

test("the website uses one light vertical book, not PDF embeds or chapter gates", () => {
  const ui = read("../src/components/national-day-math-book.tsx");
  const route = read("../src/app/subjects/[id]/national-day-math/page.tsx");
  const subject = read("../src/app/subjects/[id]/page.tsx");
  assert.match(subject, /href=\{`\/subjects\/\$\{id\}\/national-day-math`\}/);
  assert.match(subject, /国庆数学/);
  assert.match(route, /NATIONAL_DAY_MATH_SECTIONS/);
  assert.match(ui, /sections\.map/);
  assert.match(ui, /bg-white/);
  assert.match(ui, /useState\(false\)/);
  assert.match(ui, /data-math-answer/);
  assert.match(ui, /hideQuizAnswers/);
  assert.ok(!/<(?:iframe|embed|object|details)\b/.test(ui));
  assert.ok(!/grid-cols-[2-9]|bg-(?:black|slate-900|stone-900)/.test(ui));
});
