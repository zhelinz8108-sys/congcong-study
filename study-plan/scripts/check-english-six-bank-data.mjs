import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [release, contentCwd, oldBank, port] = process.argv.slice(2);
assert.ok(release && contentCwd && oldBank);
const app = "/www/study-plan";
const { loadHolidayTestModule } = await import(pathToFileURL(path.join(app, "scripts/holiday-math-test-utils.mjs")));
const manifest = JSON.parse(readFileSync(path.join(release, "release.json"), "utf8"));
process.chdir(contentCwd);
const service = await loadHolidayTestModule("src/server/english-six-bank.ts");
const lib = await loadHolidayTestModule("src/lib/english-six-bank.ts");
const index = service.englishSixBankIndex();
assert.equal(index.questionCount, manifest.questions);
assert.equal(index.papers.length, manifest.papers);
assert.equal(index.complete, false);
const sourceRoot = path.join(contentCwd, "content/english-six/resources");
const sources = new Map();
const source = id => {
  if (!sources.has(id)) sources.set(id, JSON.parse(readFileSync(path.join(sourceRoot, `${id}.json`), "utf8")));
  return sources.get(id);
};
const newQuestions = new Map();
let count = 0;
for (const entry of index.papers) {
  const paper = service.englishSixBankPrivatePaper(entry.id), pub = service.englishSixBankPublicPaper(entry.id);
  assert.equal(entry.questionCount, paper.questions.length);
  assert.equal(pub.questions.length, paper.questions.length);
  const wire = JSON.stringify(pub);
  for (const key of ["answer", "accepted", "explanation", "keySource", "referenceOnly", "acceptedOverride"])
    assert.ok(!wire.includes(`"${key}":`), `${entry.id}: private ${key}`);
  for (const [i, q] of paper.questions.entries()) {
    assert.ok(!newQuestions.has(q.id)); newQuestions.set(q.id, q);
    assert.ok(q.answer.trim() && q.explanation.trim());
    assert.ok(source(entry.sourceId).pages[q.sourcePage - 1]?.blocks[q.sourceBlock]);
    assert.ok(source(q.keySource.resourceId).pages[q.keySource.page - 1]?.blocks[q.keySource.block]);
    assert.equal(service.englishSixBankGrade(q.id, ""), undefined);
    const response = q.options.length ? q.answer : q.grading === "reference" ? "Reviewed open response" : lib.sixBankResponse(pub.questions[i], q.accepted.map(a => a[0]));
    assert.equal(service.englishSixBankGrade(q.id, response).correct, q.grading === "reference" ? null : true, q.id);
    count++;
  }
}
assert.equal(count, index.questionCount);
const lookup = JSON.parse(readFileSync(path.join(contentCwd, "content/english-six/bank/lookup.private.json"), "utf8"));
assert.equal(Object.keys(lookup).length, count);
const old = JSON.parse(readFileSync(path.join(oldBank, "index.json"), "utf8"));
let retained = 0;
for (const entry of old.papers) {
  const before = JSON.parse(readFileSync(path.join(oldBank, "papers", `${entry.id}.json`), "utf8"));
  assert.ok(index.papers.some(p => p.id === entry.id));
  for (const q of before.questions) {
    const next = newQuestions.get(q.id);
    assert.ok(next, `${q.id}: retain submitted IDs`);
    assert.equal(next.prompt, q.prompt, `${q.id}: retain old prompt`);
    assert.deepEqual(next.options, q.options, `${q.id}: retain old options`);
    assert.equal(next.sourcePage, q.sourcePage); assert.equal(next.sourceBlock, q.sourceBlock);
    assert.equal(next.answer, q.answer, `${q.id}: no unreviewed key rewrite`);
    retained++;
  }
}
assert.equal(retained, old.questionCount);
for (const id of manifest.resourceIds ?? []) {
  const resource = source(id);
  const papers = index.papers.filter(p => p.sourceId === id);
  const units = [...new Set(papers.map(p => p.unit))].sort((a, b) => a - b);
  assert.ok(units.length && units.every(n => n >= 1 && n <= 8));
  assert.deepEqual(resource.meta.units, units);
  for (const unit of units) assert.equal(resource.meta.unitStarts[unit], 1);
  assert.ok(papers.length);
  for (const page of resource.pages) for (const block of page.blocks)
    if (block.kind === "text") assert.ok(!/ {2,}|themorning|theafternoon|Itwas|Firsthe/.test(block.text), "No lost PDF alignment");
  const directory = JSON.parse(readFileSync(path.join(contentCwd, "content/english-six/index.json"), "utf8"));
  assert.deepEqual(directory.resources.find(r => r.id === id), resource.meta);
}
if (port) {
  const family = await loadHolidayTestModule("src/lib/family-access.ts");
  const origin = `http://127.0.0.1:${Number(port)}`;
  const headers = { Cookie: `${family.FAMILY_ACCESS_COOKIE}=${family.createFamilyAccessToken()}` };
  const directory = await fetch(`${origin}/api/english/six/bank`, { headers });
  assert.equal(directory.status, 200);
  assert.equal((await directory.json()).questionCount, count);
  for (const id of manifest.resourceIds ?? []) {
    const expected = source(id);
    for (let page = 1; page <= expected.pages.length; page++) {
      const response = await fetch(`${origin}/api/english/six/resource/${id}?page=${page}`, { headers });
      assert.equal(response.status, 200);
      const actual = await response.json();
      assert.deepEqual(actual.content, expected.pages[page - 1]);
      assert.equal(actual.practiceCount, index.papers.filter(p => p.sourceId === id).reduce((n, p) => n + p.questionCount, 0));
    }
  }
  for (const sourceId of ["8092f44e7f99", "8d95a291a5eb", "e647931251a3", "195b26ca27ec", "df0149b2b0f8", "3f35c6b5da2b", "8955f12c65d2", "e2e3e3fcdc4f", "09ce5f89090a", "d3479e9e9b33", "e90808a8dd22", "b48de03c5d6c", "a930d1f25ab7"]) {
    const entry = index.papers.find(p => p.sourceId === sourceId);
    const response = await fetch(`${origin}/api/english/six/bank/${entry.id}`, { headers });
    assert.equal(response.status, 200);
    const wire = await response.text();
    for (const key of ["answer", "accepted", "explanation", "keySource"]) assert.ok(!wire.includes(`"${key}":`));
    assert.equal((await fetch(`${origin}/subjects/8bd6f79b-99f5-4e68-a961-872d60d260b1/english/six/bank/${entry.id}`, { headers })).status, 200);
  }
  assert.equal((await fetch(`${origin}/api/english/six/bank`)).status, 401);
}
console.log(JSON.stringify({ questions: count, papers: index.papers.length, existingIdsRetained: retained, newQuestions: count - retained, complete: false, realStudentWrites: false, checks: "passed" }));
