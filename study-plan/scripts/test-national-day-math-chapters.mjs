import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const book = JSON.parse(
  readFileSync(
    new URL("../src/data/national-day-math.json", import.meta.url),
    "utf8",
  ),
);
const {
  NATIONAL_DAY_MATH_CHAPTERS: catalog,
  getNationalDayMathChapterSections: select,
  getNationalDayMathChapterSummaries: summaries,
  nationalDayMathChapterStats: stats,
  nationalDayMathSectionHref: href,
} = await loadHolidayTestModule("src/lib/national-day-math-chapters.ts");
const { getPublicNationalDayMathSections: getPublic } =
  await loadHolidayTestModule("src/lib/national-day-math-submission.ts");
const sections = getPublic();

test("seven chapters plus preparation and review cover every original section exactly once", () => {
  assert.equal(catalog.filter((c) => c.kind === "chapter").length, 7);
  assert.equal(catalog.length, 9);
  const grouped = catalog.flatMap((c) => select(sections, c));
  assert.deepEqual(grouped, sections);
  assert.equal(new Set(grouped.map((s) => s.id)).size, 21);
  assert.deepEqual(
    catalog.flatMap((c) => c.sectionIds),
    book.sections.map((s) => s.id),
  );
});
test("all original text, diagrams, formulas, 117 examples and 89 quizzes remain unchanged", () => {
  const grouped = catalog.flatMap((c) => select(sections, c));
  assert.deepEqual(
    grouped.flatMap((s) => s.blocks),
    sections.flatMap((s) => s.blocks),
  );
  const metadata = summaries(sections);
  assert.equal(
    metadata.reduce((n, c) => n + c.examples, 0),
    117,
  );
  assert.equal(
    metadata.reduce((n, c) => n + c.quizIds.length, 0),
    89,
  );
  assert.equal(
    metadata.reduce((n, c) => n + c.completionSectionIds.length, 0),
    11,
  );
  assert.equal(new Set(metadata.flatMap((c) => c.quizIds)).size, 89);
});
test("four activities belong to the matching textbook chapter", () => {
  for (const [activity, id] of [
    ["segmented", "u2"],
    ["binary", "u3"],
    ["golden", "u4"],
    ["sports", "u5"],
  ]) {
    assert.equal(catalog.find((c) => c.sectionIds.includes(activity)).id, id);
  }
});
test("directory metadata does not contain content or private solutions", () => {
  const metadata = summaries(sections);
  assert.doesNotMatch(
    JSON.stringify(metadata),
    /"(?:blocks|answer|steps|accepted|expected|fields|question)":/,
  );
  for (const chapter of catalog) {
    for (const quiz of select(sections, chapter)
      .flatMap((s) => s.blocks)
      .filter((b) => b.type === "quiz")) {
      for (const key of ["answer", "steps", "accepted", "pitfall"])
        assert.equal(Object.hasOwn(quiz, key), false, quiz.id);
    }
  }
});
test("chapter accuracy counts only system-graded submissions, not drafts, old self-rating or other chapters", () => {
  const ids = ["a", "b", "c", "d"];
  const records = {
    a: { value: "1", checked: true, correct: true, gradingVersion: 2 },
    b: { value: "2", checked: true, correct: false, gradingVersion: 2 },
    c: { value: "3", checked: false, correct: null },
    d: { value: "4", checked: true, correct: true, selfRated: true },
    elsewhere: { value: "5", checked: true, correct: true, gradingVersion: 2 },
  };
  assert.deepEqual(stats(ids, records), {
    total: 4,
    answered: 2,
    correct: 1,
    wrong: 1,
    accuracy: 50,
  });
  records.b.correct = true;
  assert.equal(stats(ids, records).accuracy, 100);
  assert.equal(stats(ids, {}).accuracy, null);
});
test("existing bookmarks and reading locations resolve to the corresponding chapter", () => {
  for (const section of sections) {
    const chapter = catalog.find((c) => c.sectionIds.includes(section.id));
    assert.equal(
      href("subject", section.id),
      `/subjects/subject/national-day-math/${chapter.id}#math-section-${section.id}`,
    );
  }
  assert.equal(href("subject", "javascript:alert(1)"), null);
  assert.equal(href("subject", ""), null);
});
