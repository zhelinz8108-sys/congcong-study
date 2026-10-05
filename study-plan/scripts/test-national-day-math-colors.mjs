import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/lib/national-day-math-colors.ts");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const colors = await import(`data:text/javascript,${encodeURIComponent(javascript)}`);
const palettes = Object.values(colors.NATIONAL_DAY_MATH_PALETTES);
const getPalette = colors.getNationalDayMathPalette;
const book = JSON.parse(read("../src/data/national-day-math.json"));

function rgb(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `Use explicit opaque six-digit colors: ${hex}`);
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

test("chapter themes are diverse, fixed, and cover every section", () => {
  assert.equal(book.sections.length, 21);
  assert.ok(palettes.length >= 5);
  assert.equal(new Set(palettes.map((palette) => palette.id)).size, palettes.length);
  const known = new Set(palettes.map((palette) => palette.id));
  assert.deepEqual(Object.keys(colors.NATIONAL_DAY_MATH_SECTION_COLORS).sort(), book.sections.map((section) => section.id).sort(), "Every source section must have an explicit theme, rather than silently use the fallback");
  for (const section of book.sections) {
    const first = getPalette(section.id);
    assert.ok(first && known.has(first.id), section.id);
    assert.deepEqual(getPalette(section.id), first, `${section.id} must not change on reread`);
  }
  const chapterThemes = book.sections.filter((section) => section.kind === "chapter").map((section) => getPalette(section.id).id);
  assert.ok(new Set(chapterThemes).size >= 5, "The long chapter sequence must use at least five themes");
  assert.deepEqual(getPalette("a-future-unknown-section"), colors.NATIONAL_DAY_MATH_PALETTES.blue);
});

test("reading surfaces stay pale and accent text meets WCAG AA", () => {
  for (const palette of palettes) {
    assert.ok(palette.accent, palette.id);
    const surfaces = Object.entries(palette).filter(([key]) => /soft|tint|surface|background/i.test(key));
    assert.ok(surfaces.length >= 2, `${palette.id} needs varied light surfaces`);
    for (const [key, surface] of [...surfaces, ["white", "#ffffff"]]) {
      assert.ok(luminance(surface) >= 0.8, `${palette.id}.${key} must be a light reading surface`);
      const ratio = contrast(palette.accent, surface);
      assert.ok(ratio >= 4.5, `${palette.id} accent on ${key}: ${ratio.toFixed(2)}:1 < 4.5:1`);
    }
    for (const surface of [palette.practiceSoft, "#ffffff"]) {
      const ratio = contrast(palette.practiceAccent, surface);
      assert.ok(ratio >= 4.5, `${palette.id} practice text on ${surface}: ${ratio.toFixed(2)}:1 < 4.5:1`);
    }
  }
});

test("rich chapter colors preserve vertical reading and complete source content", () => {
  const ui = read("../src/components/national-day-math-book.tsx");
  const css = read("../src/components/national-day-math-book.module.css");
  assert.match(ui, /getNationalDayMathPalette/);
  assert.match(ui, /sections\.map/);
  assert.match(ui, /section\.blocks\.map/);
  assert.match(ui, /data-math-question/);
  assert.match(ui, /data-math-answer/);
  assert.match(ui, /data-math-section/);
  assert.match(ui, /data-math-theme/);
  assert.match(ui, /data-card-tone/);
  assert.match(ui, /solution && <div data-math-answer/);
  assert.match(ui, /useState\(false\)/);
  assert.match(ui, /bg-white/);
  assert.ok(!/<(?:iframe|embed|object|details)\b/.test(ui));
  assert.ok(!/grid-cols-[2-9]|bg-(?:black|slate-900|stone-900)/.test(ui));
  assert.ok(!/grid-template-columns|flex-direction:\s*row|column-count:\s*[2-9]/.test(css));
  assert.match(css, /\.example\[data-card-tone="white"\]/);
  for (const selector of ["sectionLabel", "heading", "example", "quiz", "answer", "formula", "diagram", "completeButton"]) assert.match(css, new RegExp(`\\.${selector}\\s*\\{[^}]*var\\(--math-`, "s"));
  assert.match(ui, /border-teal-200 text-teal-800/);
  assert.match(ui, /border-amber-200 text-amber-800/);
  const questions = book.sections.flatMap((section) => section.blocks).filter((block) => block.type === "example" || block.type === "quiz");
  assert.equal(questions.length, 206);
  assert.ok(questions.every((question) => question.answer && question.steps.length));
});
