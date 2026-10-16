import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { loadHolidayTestModule } = await import(pathToFileURL(path.join(process.cwd(), "scripts/holiday-math-test-utils.mjs")));
const family = await loadHolidayTestModule("src/lib/family-access.ts");
const origin = `http://127.0.0.1:${Number(process.argv[2] ?? 3001)}`;
const headers = { Cookie: `${family.FAMILY_ACCESS_COOKIE}=${family.createFamilyAccessToken()}` };
const root = "/subjects/8bd6f79b-99f5-4e68-a961-872d60d260b1";
const disk = JSON.parse(readFileSync("content/english-six/bank/index.json", "utf8"));
const response = await fetch(`${origin}/api/english/six/bank`, { headers });
assert.equal(response.status, 200);
const bank = await response.json();
assert.equal(bank.questionCount, disk.questionCount);
assert.equal(bank.papers.length, disk.papers.length);
for (const route of [root, `${root}/english/six`, `${root}/english/six/bank?unit=1`, `${root}/english/six/bank/${bank.papers[0].id}`, `${root}/english/six/resource/cd846e3d3d6f`, `${root}/english/six/resource/c577cdad00f2`])
  assert.equal((await fetch(`${origin}${route}`, { headers })).status, 200, route);
const paper = await fetch(`${origin}/api/english/six/bank/${bank.papers[0].id}`, { headers });
assert.equal(paper.status, 200);
const wire = await paper.text();
for (const field of ["answer", "accepted", "explanation", "keySource"]) assert.ok(!wire.includes(`"${field}":`));
assert.equal((await fetch(`${origin}/api/english/six/bank`)).status, 401);
if (existsSync("src/server/english-six-practice.ts")) {
  const worksheet = await fetch(`${origin}/api/english/six/resource/981bb9fd35b0/practice`, { headers });
  assert.equal(worksheet.status, 200);
  const sheet = await worksheet.json();
  assert.equal(sheet.questions.length, 118);
  assert.equal(sheet.questions[0].inputCount, 1);
  for (const field of ["answer", "accepted", "explanation", "keySource"]) assert.ok(!JSON.stringify(sheet).includes(`"${field}":`));
  const catalog = await (await fetch(`${origin}/api/english/six/index`, { headers })).json();
  assert.equal(catalog.resources.find(r => r.id === "981bb9fd35b0").practice.questionCount, 118);
  assert.equal((await fetch(`${origin}/api/english/six/resource/981bb9fd35b0/practice`)).status, 401);
}
let qualityChecks = 0;
if (existsSync("content/english-six/quality-review.private.json")) {
  const review = JSON.parse(readFileSync("content/english-six/quality-review.private.json", "utf8"));
  const quality = await loadHolidayTestModule("src/server/english-six-quality.ts");
  const six = await loadHolidayTestModule("src/server/english-six.ts");
  const grading = await loadHolidayTestModule("src/server/english-six-bank.ts");
  for (const change of review.changes) {
    const current = JSON.parse(readFileSync(`content/english-six/${change.file}`, "utf8")).questions.find(q => q.id === change.id);
    for (const [field, expected] of Object.entries(change.after)) assert.deepEqual(current[field] ?? null, expected, `${change.id}: ${field}`);
    assert.equal(quality.englishSixQualityRevision(change.id), review.revision);
    if (current.options.length) {
      const unit = /^u([1-8])-/.exec(current.id);
      const feedback = unit ? six.englishSixGrade(Number(unit[1]), current.id, current.answer) : grading.englishSixBankGrade(current.id, current.answer);
      assert.equal(feedback.correct, current.grading === "reference" ? null : true, current.id);
    }
    qualityChecks++;
  }
  const sample = review.changes.find(c => c.id.endsWith("49e4dcdbc20d"));
  const publicPaper = await (await fetch(`${origin}/api/english/six/bank/${path.basename(sample.file, ".json")}`, { headers })).json();
  assert.equal(publicPaper.questions.find(q => q.id === sample.id).prompt, sample.after.prompt);
}
console.log(JSON.stringify({ questions: bank.questionCount, papers: bank.papers.length, qualityChecks, privateAnswersHidden: true, realStudentWrites: false, checks: "passed" }));
