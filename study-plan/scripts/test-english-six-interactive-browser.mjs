import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const origin = process.env.ENGLISH_SIX_QA_ORIGIN ?? "http://127.0.0.1:3011";
const online = origin === "https://congcong-study.cn";
assert.ok(online || ["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const runtime = process.argv.find(a => a.startsWith("--playwright="))?.slice(13);
const { chromium } = await import(runtime ? pathToFileURL(runtime).href : "playwright");
process.env.NODE_ENV = "production";
const service = await loadHolidayTestModule("src/server/english-six-bank.ts");
const sources = await loadHolidayTestModule("src/server/english-six-practice.ts");
const original = await loadHolidayTestModule("src/server/english-six.ts");
const family = await loadHolidayTestModule("src/lib/family-access.ts");
const subject = online ? "8bd6f79b-99f5-4e68-a961-872d60d260b1" : "qa-english";
const base = `${origin}/subjects/${subject}/english/six`;
const out = path.join(appRoot, `tmp/english-six-interactive-${online ? "online" : "local"}`);
await mkdir(out, { recursive: true });
let token = family.createFamilyAccessToken();
if (online) {
  const code = "const{createHmac}=require('node:crypto');const s=(process.env.FAMILY_ACCESS_SECRET||process.env.FAMILY_ACCESS_PASSWORD||'').trim();if(!s)process.exit(1);const p='v1.'+(Date.now()+900000);process.stdout.write(p+'.'+createHmac('sha256',s).update(p).digest('base64url'));";
  const command = `set -e; cd /www/study-plan; set -a; . /etc/study-plan.env; set +a; node --env-file=.env.local -e "eval(Buffer.from('${Buffer.from(code).toString("base64")}', 'base64').toString())"`;
  token = execFileSync("ssh", ["-i", path.join(path.dirname(appRoot), ".deploy-keys/english-six-20261011"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "ubuntu@124.223.31.175", command], { encoding: "utf8", timeout: 30000 }).trim();
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: family.FAMILY_ACCESS_COOKIE, value: token, url: origin }]);
const records = {}, errors = [], checks = [];
let writes = 0;
await context.route("**/api/**", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort());
await context.route("**/api/english/locked?**", async route => {
  if (route.request().method() === "GET") return route.fulfill({ json: { records } });
  const { id, response } = route.request().postDataJSON();
  const match = /^u([1-8])-/.exec(id);
  const feedback = match ? original.englishSixGrade(Number(match[1]), id, response) : service.englishSixBankGrade(id, response);
  assert.ok(feedback);
  records[id] ??= { id, response, feedback, submittedAt: new Date().toISOString() };
  writes++;
  return route.fulfill({ json: { record: records[id] } });
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
page.on("pageerror", error => errors.push(error.message));
async function shot(name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal overflow");
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false });
}
async function feedback() { await page.locator('[aria-live="polite"]').waitFor(); }
async function jump(index) { await page.getByRole("combobox", { name: "跳转题目" }).selectOption({ value: String(index) }); }
try {
  const paper = sources.englishSixResourcePractice("981bb9fd35b0");
  const livePaper = await (await context.request.get(`${origin}/api/english/six/resource/981bb9fd35b0/practice`)).json();
  assert.deepEqual(livePaper.questions.map(q => q.id), paper.questions.map(q => q.id), "browser receives the same ordered worksheet");
  await page.goto(`${base}/resource/981bb9fd35b0?unit=1&stage=practice`);
  await page.getByRole("textbox", { name: "你的答案", exact: true }).waitFor();
  assert.equal(await page.getByRole("combobox", { name: "页码" }).count(), 0, "worksheet defaults to interaction, not reader pagination");
  assert.equal(await page.locator("h2 input").count(), 1, "blank input is inside its sentence");
  assert.equal(await page.getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await shot("worksheet-first-before");
  await page.getByRole("textbox", { name: "你的答案", exact: true }).fill("poster");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await feedback();
  await page.getByText("已提交 · 参考答案 · 已锁定", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "你的答案", exact: true }).isDisabled(), true);
  const first = records[paper.questions[0].id];
  assert.equal(first.response, "poster");
  await page.reload(); await feedback();
  assert.equal(await page.getByRole("textbox", { name: "你的答案", exact: true }).inputValue(), "poster");
  assert.equal(await page.getByRole("textbox", { name: "你的答案", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "下一题 →", exact: true }).click();
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await page.getByRole("button", { name: "← 上一题", exact: true }).click(); await feedback();
  assert.equal(await page.getByRole("textbox", { name: "你的答案", exact: true }).isDisabled(), true);
  checks.push("original worksheet URL opens first question; inline input; submit-only reveal; reload/back immutable");

  const choiceIndex = paper.questions.findIndex(q => q.options.length && q.grading === "exact");
  await jump(choiceIndex);
  const choice = paper.questions[choiceIndex];
  await page.locator(`[data-question-prompt="${choice.id}"]`).waitFor();
  const privateChoice = service.englishSixBankPrivatePaper(service.englishSixBankIndex().papers.find(p => service.englishSixBankPrivatePaper(p.id).questions.some(q => q.id === choice.id)).id).questions.find(q => q.id === choice.id);
  const wrong = choice.options.find(o => o.id !== privateChoice.answer);
  await page.getByRole("button", { name: `${wrong.id} ${wrong.text}`, exact: true }).click();
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await page.getByRole("button", { name: "提交答案", exact: true }).click(); await feedback();
  await page.getByText("回答错误 · 已锁定", { exact: true }).waitFor();
  assert.equal(await page.locator('button[data-result="correct"]').count(), 1);
  assert.equal(await page.getByRole("button", { name: `${wrong.id} ${wrong.text}`, exact: true }).isDisabled(), true);
  await shot("choice-locked-desktop");
  const submitted = writes;
  const section = service.englishSixBankIndex().papers.find(p => service.englishSixBankPrivatePaper(p.id).questions.some(q => q.id === choice.id));
  await page.goto(`${base}/bank/${section.id}?unit=1`); await feedback();
  assert.equal(writes, submitted, "same original question does not create another attempt through a section URL");
  assert.equal(await page.getByRole("button", { name: `${wrong.id} ${wrong.text}`, exact: true }).isDisabled(), true);
  checks.push("clickable letters; immediate answer/explanation; incorrect choice locked; canonical question shared across worksheet/section URLs");

  await page.goto(`${base}/resource/981bb9fd35b0?unit=1`);
  await page.getByRole("combobox", { name: "跳转题目" }).waitFor();
  const multiIndex = paper.questions.findIndex(q => q.inputCount === 3 && q.grading === "exact");
  await jump(multiIndex);
  const q = paper.questions[multiIndex];
  assert.equal(await page.locator("h2 input").count(), 3);
  const key = service.englishSixBankPrivatePaper(service.englishSixBankIndex().papers.find(p => service.englishSixBankPrivatePaper(p.id).questions.some(item => item.id === q.id)).id).questions.find(item => item.id === q.id);
  for (let i = 0; i < 2; i++) await page.getByRole("textbox", { name: `第 ${i + 1} 空`, exact: true }).fill(key.accepted[i][0]);
  assert.equal(await page.getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  await page.getByRole("textbox", { name: "第 3 空", exact: true }).fill(key.accepted[2][0]);
  await page.getByRole("textbox", { name: "第 3 空", exact: true }).press("Enter"); await feedback();
  await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await shot(`inline-feedback-${width}`);
  }
  checks.push("multi-blank inputs in sentence; all required; Enter submit; responsive single-column feedback");

  const before = paper.questions.findIndex(q => !q.options.length && q.inputCount > 1 && q.grading === "reference");
  if (before >= 0) {
    await jump(before);
    const n = paper.questions[before].inputCount;
    assert.equal(await page.getByRole("textbox").count(), n);
    for (let i = 0; i < n; i++) await page.getByRole("textbox", { name: `第 ${i + 1} 空`, exact: true }).fill("my answer");
    await page.getByRole("button", { name: "提交答案", exact: true }).click(); await feedback();
    await page.getByText("已提交 · 参考答案 · 已锁定", { exact: true }).waitFor();
  }
  await page.getByRole("link", { name: /查看原题/ }).click();
  await page.getByRole("combobox", { name: "页码", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("mode"), "source");
  checks.push("explicit source view remains available and does not loop back into practice");

  const assessment = original.englishSixPaper(1);
  await page.goto(`${base}/resource/${assessment.sourceId}?unit=1`);
  await page.getByRole("combobox", { name: "跳转题目" }).waitFor();
  assert.equal(await page.getByRole("combobox", { name: "跳转题目" }).locator("option").count(), 66);
  const firstOption = assessment.questions[0].options.find(o => o.id !== assessment.questions[0].answer);
  await page.getByRole("button", { name: `${firstOption.id} ${firstOption.text}`, exact: true }).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click(); await feedback();
  await page.reload(); await feedback();
  assert.equal(await page.getByRole("button", { name: `${firstOption.id} ${firstOption.text}`, exact: true }).isDisabled(), true);
  const multiPaper = original.englishSixPublicPaper(6);
  const multiAssessment = multiPaper.questions.findIndex(q => !q.options.length && q.inputCount > 1);
  assert.ok(multiAssessment >= 0, "Unit 6 includes a multi-blank assessment item");
  await page.goto(`${base}/resource/${original.englishSixPaper(6).sourceId}?unit=6`);
  await page.getByRole("combobox", { name: "跳转题目" }).waitFor();
  await jump(multiAssessment);
  await page.locator(`[data-question-prompt="${multiPaper.questions[multiAssessment].id}"]`).waitFor();
  const originalFields = page.getByRole("textbox");
  const originalCount = await originalFields.count();
  for (let i = 0; i < originalCount - 1; i++) await originalFields.nth(i).fill("my answer");
  assert.equal(await page.getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  await originalFields.last().fill("my answer");
  await page.getByRole("button", { name: "提交答案", exact: true }).click(); await feedback();
  for (let i = 0; i < originalCount; i++) assert.equal(await originalFields.nth(i).isDisabled(), true);
  checks.push("original 66-question assessments: source defaults to practice, choice locks across reload, Unit 6 requires and locks every blank after submit");

  const refEntry = service.englishSixBankIndex().papers.find(entry => service.englishSixBankPublicPaper(entry.id).questions.some(q => q.grading === "reference" && !q.options.length && q.inputCount > 1 && q.inputCount <= 4));
  const refPaper = service.englishSixBankPublicPaper(refEntry.id);
  const refIndex = refPaper.questions.findIndex(q => q.grading === "reference" && !q.options.length && q.inputCount > 1 && q.inputCount <= 4);
  await page.goto(`${base}/bank/${refEntry.id}`);
  await page.getByRole("combobox", { name: "跳转题目" }).waitFor();
  await jump(refIndex);
  const refCount = refPaper.questions[refIndex].inputCount;
  assert.equal(await page.getByRole("textbox").count(), refCount);
  for (let i = 0; i < refCount; i++) await page.getByRole("textbox").nth(i).fill("my expression");
  await page.getByRole("button", { name: "提交答案", exact: true }).click(); await feedback();
  await page.getByText("已提交 · 参考答案 · 已锁定", { exact: true }).waitFor();
  checks.push("reference-only multi-blank questions have separate required controls, reveal model after submit and never claim a false automatic mark");
  if (process.env.ENGLISH_SIX_QA_QUALITY === "1") {
    for (const suffix of ["4fcedbdeb803", "4c3a1196ba77", "49e4dcdbc20d"]) {
      const entry = service.englishSixBankIndex().papers.find(entry => service.englishSixBankPrivatePaper(entry.id).questions.some(q => q.id.endsWith(suffix)));
      const current = service.englishSixBankPrivatePaper(entry.id);
      const index = current.questions.findIndex(q => q.id.endsWith(suffix)), question = current.questions[index];
      await page.goto(`${base}/bank/${entry.id}`);
      await page.getByRole("combobox", { name: "跳转题目" }).waitFor(); await jump(index);
      await page.locator(`[data-question-prompt="${question.id}"]`).waitFor();
      assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
      const correct = question.options.find(o => o.id === question.answer);
      await page.getByRole("button", { name: `${correct.id} ${correct.text}`, exact: true }).click();
      await page.getByRole("button", { name: "提交答案", exact: true }).click(); await feedback();
      assert.equal(records[question.id].feedback.correct, true);
      assert.ok((await page.locator('[aria-live="polite"]').innerText()).includes(question.explanation));
      assert.equal(await page.getByRole("button", { name: `${correct.id} ${correct.text}`, exact: true }).isDisabled(), true);
    }
    checks.push("corrected article/cloze keys and British-floor wording render, submit and lock correctly");
    const entry = service.englishSixBankIndex().papers.find(entry => service.englishSixBankPrivatePaper(entry.id).questions.some(q => q.id.endsWith("7cab70b96626")));
    const current = service.englishSixBankPrivatePaper(entry.id), index = current.questions.findIndex(q => q.id.endsWith("7cab70b96626"));
    await page.goto(`${base}/bank/${entry.id}`);
    await page.getByRole("combobox", { name: "跳转题目" }).waitFor(); await jump(index);
    const underline = page.locator(`[data-question-prompt="${current.questions[index].id}"] u`);
    assert.equal(await underline.innerText(), "on the ninth day of the ninth lunar month");
    await shot("quality-restored-underline-mobile");
    const ambiguous = original.englishSixPaper(4);
    await page.goto(`${base}/resource/${ambiguous.sourceId}?unit=4`);
    await page.getByRole("combobox", { name: "跳转题目" }).waitFor(); await jump(8);
    const alternative = ambiguous.questions[8].options.find(o => o.id === "A");
    await page.getByRole("button", { name: `A ${alternative.text}`, exact: true }).click();
    await page.getByRole("button", { name: "提交答案", exact: true }).click(); await feedback();
    assert.equal(records["u4-q9"].feedback.correct, null);
    await page.getByText("已提交 · 待评价", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: `A ${alternative.text}`, exact: true }).isDisabled(), true);
    await shot("quality-ambiguous-reference-mobile");
    checks.push("restored underline visible; valid alternative in original assessment is reference-only, not falsely wrong");
  }
  await page.goto(`${base}/resource/c577cdad00f2?unit=1`);
  await page.getByRole("combobox", { name: "页码", exact: true }).waitFor();
  checks.push("knowledge lecture stays a reader; other English modules untouched");
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, "report.json"), JSON.stringify({ status: "pass", checks, errors, mockedSubmissions: writes, realStudentWrites: 0 }, null, 2));
  console.log(JSON.stringify({ status: "pass", checks: checks.length, errors: errors.length, realStudentWrites: 0, screenshots: out }));
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true });
  await writeFile(path.join(out, "failure.txt"), await page.locator("main").innerText());
  throw error;
} finally { await browser.close(); }
