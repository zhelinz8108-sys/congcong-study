import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";
import { readerPracticeFixture } from "./english-six-reader-practice-fixture.mjs";

const originalCwd = process.cwd();
const productionSources = process.argv.includes("--source");
const fixtureRoot = productionSources ? null : mkdtempSync(path.join(tmpdir(), "reader-practice-"));
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
      assert.equal(plan.unmatched, 0, `${id}: every keyed question must match its own answer`);
      assert.ok(plan.exercises.length > 0, `${id}: lecture exercises found`);
      assert.ok(plan.hidden.length > 0, `${id}: appended answers removed`);
      const hidden = new Set(plan.hidden.map(source => `${source.page}:${source.block}`));
      resource.pages.forEach((page, p) => page.blocks.forEach((block, b) => {
        if (block.kind === "text" && /^\s*【[^】]*答案[^】]*】/.test(block.text)) assert.ok(hidden.has(`${p + 1}:${b}`), `${id}: answer heading hidden on page ${p + 1}`);
      }));
      for (const question of plan.exercises) {
        const response = question.choice ?? (question.inputCount > 1 ? JSON.stringify(question.accepted.map(part => part[0] ?? "reference")) : question.accepted[0]?.[0] ?? "reference");
        assert.ok(service.englishSixReaderGrade(question.id, response), "source-derived answer can be submitted");
      }
      questions += plan.exercises.length;
      console.log(JSON.stringify({ resource: id, questions: plan.exercises.length, unmatched: plan.unmatched, answerBlocksHidden: plan.hidden.length }));
    }
    const first = service.englishSixReaderExercises("c577cdad00f2", 2);
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
    assert.equal(service.englishSixReaderGrade("sr-../../index-123456789abc", "B"), undefined);
    const mismatch = structuredClone(fixture);
    mismatch.pages[6].blocks.at(-1).text = "2. went";
    const rejected = service.buildSixReaderPractice(fixture.id, mismatch.pages);
    assert.equal(rejected.unmatched, 1, "mismatched key never assigned to another question");
    assert.equal(rejected.exercises.length, 11);
    const moved = structuredClone(fixture);
    moved.pages[6].blocks[1].text = "1. come → ______";
    assert.notEqual(service.buildSixReaderPractice(fixture.id, moved.pages).exercises.at(-1).id, plan.exercises.at(-1).id, "changed question cannot inherit an old locked answer");
    console.log(JSON.stringify({ status: "pass", questions: plan.exercises.length, answerIsolation: true, mismatchedKeysRejected: true, sourceMutation: false, studentWrites: 0 }));
  }
} finally {
  process.chdir(originalCwd);
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true });
}
