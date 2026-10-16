import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const app = process.cwd();
const { loadHolidayTestModule } = await import(pathToFileURL(path.join(app, "scripts/holiday-math-test-utils.mjs")));
const service = await loadHolidayTestModule("src/server/english-six-bank.ts");
const family = await loadHolidayTestModule("src/lib/family-access.ts");
const origin = `http://127.0.0.1:${Number(process.argv[2] ?? 3001)}`;
const headers = { Cookie: `${family.FAMILY_ACCESS_COOKIE}=${family.createFamilyAccessToken()}` };
const index = service.englishSixBankIndex();
assert.equal(index.questionCount, 2575);
assert.equal(index.papers.length, 287);
assert.equal(index.complete, false);
let questions = 0;
for (const p of index.papers) {
  const paper = service.englishSixBankPrivatePaper(p.id);
  assert.equal(p.questionCount, paper.questions.length);
  for (const q of paper.questions) {
    assert.ok(q.answer && q.explanation);
    assert.equal(service.englishSixBankGrade(q.id, ""), undefined);
    questions++;
  }
}
assert.equal(questions, index.questionCount);
const directory = await fetch(`${origin}/api/english/six/bank`, { headers });
assert.equal(directory.status, 200);
assert.equal((await directory.json()).questionCount, 2575);
for (const source of ["981bb9fd35b0", "760b08816efb", "0467910b917e"]) {
  const p = index.papers.find(p => p.sourceId === source && p.title.includes("单项选择"));
  const response = await fetch(`${origin}/api/english/six/bank/${p.id}`, { headers });
  assert.equal(response.status, 200);
  const text = await response.text();
  for (const key of ["answer", "accepted", "explanation", "keySource"]) assert.ok(!text.includes(`"${key}":`));
  const paper = service.englishSixBankPrivatePaper(p.id), q = paper.questions[0];
  assert.equal(service.englishSixBankGrade(q.id, q.answer).correct, true);
  assert.equal((await fetch(`${origin}/subjects/8bd6f79b-99f5-4e68-a961-872d60d260b1/english/six/bank/${p.id}`, { headers })).status, 200);
}
assert.equal((await fetch(`${origin}/api/english/six/bank`)).status, 401);
const lookup = JSON.parse(readFileSync(path.join(app, "content/english-six/bank/lookup.private.json"), "utf8"));
assert.equal(Object.keys(lookup).length, 2575);
console.log(JSON.stringify({ bankQuestions: questions, papers: index.papers.length, complete: false, realStudentWrites: false, checks: "passed" }));
