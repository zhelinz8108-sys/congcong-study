import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";
import { readerPracticeFixture, readerPracticeComprehensiveFixture } from "./english-six-reader-practice-fixture.mjs";

const originalCwd = process.cwd();
const productionSources = process.argv.includes("--source");
const fixtureRoot = productionSources ? null : mkdtempSync(path.join(tmpdir(), "reader-practice-"));
if (!productionSources) process.env.NODE_ENV = "test";
let diagnostic = { stage: "load-source" };
try {
  process.chdir(fixtureRoot ?? appRoot);
  const fixture = readerPracticeFixture();
  if (fixtureRoot) {
    const root = path.join(fixtureRoot, "content/english-six");
    mkdirSync(path.join(root, "resources"), { recursive: true });
    writeFileSync(path.join(root, "index.json"), JSON.stringify({ resources: [fixture.meta] }));
    writeFileSync(path.join(root, "resources", `${fixture.id}.json`), JSON.stringify(fixture));
  }
  const service = await loadHolidayTestModule("src/server/english-six-reader-practice.ts");
  const layouts = JSON.parse(readFileSync(path.join(appRoot, "src/data/english-six-reader-layouts.public.json"), "utf8"));
  if (productionSources) {
    let questions = 0;
    for (const id of Object.keys(layouts)) {
      const resource = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/resources", `${id}.json`), "utf8"));
      const plan = service.buildSixReaderPractice(id, resource.pages);
      diagnostic = { resource: id, questions: plan.exercises.length, unmatched: plan.unmatched, groups: plan.groups };
      assert.equal(plan.unmatched, 0, `${id}: every keyed question must match its own answer`);
      assert.ok(plan.exercises.length > 0, `${id}: lecture exercises found`);
      assert.ok(plan.hidden.length > 0, `${id}: appended answers removed`);
      const hidden = new Set(plan.hidden.map(source => `${source.page}:${source.block}`));
      resource.pages.forEach((page, p) => page.blocks.forEach((block, b) => {
        if (block.kind === "text" && /^\s*【[^】]*答案[^】]*】/.test(block.text)) assert.ok(hidden.has(`${p + 1}:${b}`), `${id}: answer heading hidden on page ${p + 1}`);
      }));
      for (const question of plan.exercises) {
        diagnostic = { resource: id, stage: "submit-source-answer", page: question.sourcePage, block: question.sourceBlock, kind: question.kind, grading: question.grading, inputCount: question.inputCount, answerParts: question.accepted.length };
        const values = question.grading === "reference" ? Array(question.inputCount).fill("reference") : question.accepted.map(part => part[0]);
        const response = question.choice ?? (question.inputCount > 1 ? JSON.stringify(values) : values[0]);
        assert.ok(service.englishSixReaderGrade(question.id, response), "source-derived answer can be submitted");
      }
      questions += plan.exercises.length;
      console.log(JSON.stringify({ resource: id, questions: plan.exercises.length, unmatched: plan.unmatched, answerBlocksHidden: plan.hidden.length }));
    }
    const first = service.englishSixReaderExercises("c577cdad00f2", 2);
    diagnostic = { stage: "verify-screenshot-exercises" };
    assert.ok(first.some(q => /want\s*→/.test(q.prompt)), "screenshot verb fill is interactive");
    const last = service.englishSixReaderExercises("c577cdad00f2", 6);
    assert.ok(last.some(q => q.options.some(option => option.text === "sang")), "screenshot choice is interactive");
    console.log(JSON.stringify({ status: "pass", lectureResources: Object.keys(layouts).length, questions, noStudentWrites: true }));
  } else {
    const before = JSON.stringify(fixture);
    const plan = service.buildSixReaderPractice(fixture.id, fixture.pages);
    assert.equal(plan.unmatched, 0);
    assert.equal(plan.exercises.length, 12);
    assert.equal(new Set(plan.exercises.map(q => q.id)).size, 12);
    assert.equal(plan.exercises.filter(q => q.sourcePage === 2).length, 8);
    const publicQuestions = fixture.pages.flatMap((_, i) => service.englishSixReaderExercises(fixture.id, i + 1));
    for (const field of ["answer", "explanation", "accepted", "choice", "sources"]) assert.ok(!JSON.stringify(publicQuestions).includes(`"${field}":`), `public questions contain no ${field}`);
    const first = publicQuestions[0];
    assert.equal(service.englishSixReaderGrade(first.id, "wanted").correct, true);
    assert.equal(service.englishSixReaderGrade(first.id, " WANTED. ").correct, true);
    assert.equal(service.englishSixReaderGrade(first.id, "want").correct, false);
    assert.equal(service.englishSixReaderGrade(first.id, " "), undefined);
    const choice = publicQuestions.find(q => q.options.length);
    assert.equal(service.englishSixReaderGrade(choice.id, "B").correct, true);
    assert.equal(service.englishSixReaderGrade(choice.id, "A").correct, false);
    assert.equal(service.englishSixReaderGrade(choice.id, "X"), undefined);
    assert.match(service.englishSixReaderGrade(choice.id, "B").explanation, /sang/);
    const multiple = publicQuestions.find(q => q.inputCount === 2);
    assert.equal(service.englishSixReaderGrade(multiple.id, '["did not", ""]'), undefined);
    assert.equal(service.englishSixReaderGrade(multiple.id, '["did not", "want"]').correct, true);
    const fullSentenceKey = structuredClone(fixture);
    fullSentenceKey.pages[5].blocks.find(block => block.text === "2. did not, want").text = "2. He did not want to act.";
    writeFileSync(path.join(fixtureRoot, "content/english-six/resources", `${fixture.id}.json`), JSON.stringify(fullSentenceKey));
    assert.equal(service.englishSixReaderGrade(multiple.id, '["did not", "want"]').correct, null, "whole-sentence reference key supports every input field");
    assert.equal(service.englishSixReaderGrade(multiple.id, '["He did not want to act."]'), undefined, "source validation must submit the actual form shape");
    writeFileSync(path.join(fixtureRoot, "content/english-six/resources", `${fixture.id}.json`), JSON.stringify(fixture));
    const sentence = publicQuestions.find(q => q.kind === "sentence");
    assert.equal(service.englishSixReaderGrade(sentence.id, "She did not want to play Mulan.").correct, null);
    for (let p = 0; p < fixture.pages.length; p++) {
      const visible = service.englishSixReaderContent(fixture.id, p + 1, fixture.pages[p]);
      const wire = JSON.stringify(visible);
      assert.ok(!wire.includes("【答案】"));
      for (const hidden of plan.hidden.filter(s => s.page === p + 1)) assert.equal(visible.blocks[hidden.block].text, "");
    }
    assert.equal(service.englishSixReaderContent(fixture.id, 2, fixture.pages[1]).blocks[0].text, fixture.pages[1].blocks[0].text, "exercise heading retained");
    assert.equal(JSON.stringify(fixture), before, "source documents unchanged");
    const inlineOptions = structuredClone(fixture);
    inlineOptions.pages[5].blocks.find(block => block.text.startsWith("( ) 3.")).text += " A. sing B. sang C. sings";
    inlineOptions.pages[5].blocks = inlineOptions.pages[5].blocks.filter(block => !/^[ABC]\. /.test(block.text));
    const inlineChoice = service.buildSixReaderPractice(fixture.id, inlineOptions.pages).exercises.find(q => q.options.length);
    assert.equal(inlineChoice.options.length, 3, "choices extracted from the same source line remain selectable");
    assert.ok(!inlineChoice.prompt.includes("A. sing"));
    assert.equal(service.englishSixReaderGrade("sr-../../index-123456789abc", "B"), undefined);
    const mismatch = structuredClone(fixture);
    mismatch.pages[6].blocks.at(-1).text = "2. went";
    const rejected = service.buildSixReaderPractice(fixture.id, mismatch.pages);
    assert.equal(rejected.unmatched, 1, "mismatched key never assigned to another question");
    assert.equal(rejected.exercises.length, 11);
    const moved = structuredClone(fixture);
    moved.pages[6].blocks[1].text = "1. come → ______";
    assert.notEqual(service.buildSixReaderPractice(fixture.id, moved.pages).exercises.at(-1).id, plan.exercises.at(-1).id, "changed question cannot inherit an old locked answer");
    const withReferenceImage = { ...fixture.pages[1], blocks: [...fixture.pages[1].blocks, { kind: "image", asset: "a".repeat(32), reference: true }] };
    assert.ok(!JSON.stringify(service.englishSixReaderContent(fixture.id, 2, withReferenceImage)).includes("a".repeat(32)), "original page image cannot reveal the appended answer key");
    const comprehensive = readerPracticeComprehensiveFixture();
    const expanded = service.buildSixReaderPractice(fixture.id, comprehensive.pages);
    assert.equal(expanded.unmatched, 0, "inline key headings, wrapped keys and embedded dialogue blanks all match in order");
    const items = expanded.exercises.filter(q => q.sourcePage === 7);
    assert.equal(items.length, 6);
    assert.deepEqual(items.map(q => q.answer), ["saw", "went; came", "B", "She did not act.", "A", "B"]);
    assert.match(items[1].explanation, /Use went and came/);
    assert.match(items[2].explanation, /Use sang/);
    assert.equal(items[3].kind, "sentence", "sentence transformation uses a reference response despite the printed answer line");
    assert.equal(items[3].inputCount, 1);
    assert.equal(items[4].sourceBlock, items[5].sourceBlock, "multiple dialogue questions can share one printed paragraph");
    assert.ok(items.slice(-2).every(q => !q.explanation.includes("first A, second B")), "shared answer summaries cannot reveal another question's key");
    writeFileSync(path.join(fixtureRoot, "content/english-six/resources", `${fixture.id}.json`), JSON.stringify(comprehensive));
    assert.equal(service.englishSixReaderGrade(items[1].id, '["went","came"]').correct, true);
    assert.equal(service.englishSixReaderGrade(items[4].id, "A").correct, true);
    assert.equal(service.englishSixReaderGrade(items[5].id, "B").correct, true);
    console.log(JSON.stringify({ status: "pass", questions: plan.exercises.length, answerIsolation: true, mismatchedKeysRejected: true, sourceMutation: false, studentWrites: 0 }));
  }
} catch (error) {
  // Public CI annotations contain only counters and source positions, never
  // teaching content, answers, student records, environment values or secrets.
  if (productionSources) console.log(`::error title=Grammar lecture verification::${JSON.stringify(diagnostic)}`);
  throw error;
} finally {
  process.chdir(originalCwd);
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true });
}
