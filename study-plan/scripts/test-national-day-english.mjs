import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/national-day-english-answer.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { checkNationalDayAnswer: check, normalizeNationalDayAnswer: normalize } = await import(`data:text/javascript,${encodeURIComponent(javascript)}`);
const data = JSON.parse(readFileSync(new URL("../src/data/national-day-english.json", import.meta.url), "utf8"));
const questions = data.sections.flatMap((section) => section.questions);

test("all 105 source pages are represented, with 70 lessons and all 318 original questions", () => {
  assert.equal(data.sections.length, 90);
  assert.equal(data.sections.filter((section) => section.category === "lesson").length, 70);
  assert.equal(questions.length, 318);
  assert.equal(new Set(questions.map((question) => question.id)).size, 318);
  const pages = [...data.sections, ...data.answerPages].map((section) => section.page).sort((a, b) => a - b);
  assert.deepEqual(pages, Array.from({ length: 105 }, (_, index) => index + 1));
  for (const question of questions) {
    assert.ok(question.prompt.trim(), question.id);
    assert.ok(question.reference.trim(), question.id);
    if (question.options) {
      assert.ok(question.options.every((option) => option.length > 0), question.id);
      assert.equal(new Set(question.options).size, question.options.length, question.id);
      assert.ok(question.options.some((option) => check([option], question.accepted)), question.id);
    }
  }
});

test("all 312 automatic questions accept each reference variant and reject wrong or missing fields", () => {
  const automatic = questions.filter((question) => question.mode === "auto");
  assert.equal(automatic.length, 312);
  for (const question of automatic) {
    const baseline = question.accepted.map((alternatives) => alternatives[0]);
    assert.ok(check(baseline, question.accepted), question.id);
    assert.ok(!check(baseline.map(() => "__wrong__"), question.accepted), question.id);
    assert.ok(!check([], question.accepted), question.id);
    for (let field = 0; field < question.accepted.length; field++) {
      for (const variant of question.accepted[field]) {
        const values = [...baseline];
        values[field] = variant;
        assert.ok(check(values, question.accepted), `${question.id}: ${variant}`);
      }
      const values = [...baseline];
      values[field] = "";
      assert.ok(!check(values, question.accepted), `${question.id}: missing ${field}`);
    }
  }
});

test("case, harmless punctuation, curly apostrophes and common contractions are equivalent", () => {
  assert.equal(normalize(" She DOESN’T have a bike. "), normalize("she does not have a bike"));
  assert.equal(normalize("He isn't tired!"), normalize("He is not tired"));
  assert.equal(normalize("I'll answer it."), normalize("I will answer it"));
  assert.equal(normalize("I cannot swim."), normalize("I can't swim"));
  assert.ok(check(["MY FATHER", "cooks."], [["My father"], ["cooks"]]));
  assert.ok(check(["She does not have a bike."], [["She doesn't have a bike"]]));
  assert.ok(check(["/"], [["/", "不填"]]));
});

test("meaningful grammar distinctions and word order are not silently forgiven", () => {
  assert.ok(!check(["teachers"], [["teachers'"]]));
  assert.ok(!check(["I very like reading"], [["I like reading very much"]]));
  assert.ok(!check(["does not has"], [["doesn't have"]]));
  assert.ok(!check(["are"], [["is"]]));
  assert.ok(!check(["on", "in"], [["in"], ["on"]]));
});

test("tables remain intact; open-ended exercises, oral answers and writing use self assessment", () => {
  const phraseRows = data.sections.filter((section) => section.page >= 71 && section.page <= 76)
    .flatMap((section) => section.blocks.filter((block) => block.type === "table").flatMap((block) => block.rows));
  assert.equal(phraseRows.length, 120);
  for (const section of data.sections) {
    for (const block of section.blocks.filter((item) => item.type === "table")) {
      for (const row of block.rows) {
        assert.equal(row.length, block.headers.length, section.id);
        assert.ok(row.every((cell) => cell.trim()), section.id);
      }
    }
  }
  assert.equal(questions.filter((question) => question.mode === "self").length, 6);
  const listening = data.sections.find((section) => section.id === "listening");
  assert.equal(listening.oralQuestions.length, 5);
  assert.ok(listening.oralQuestions.every((question) => question.mode === "self"));
  assert.ok(listening.audioText.endsWith("visit their grandparents."));
  assert.ok(data.sections.find((section) => section.id === "review-c").writing.referenceBlocks.length);
  assert.ok(data.sections.find((section) => section.id === "resource-86").writing);
});
