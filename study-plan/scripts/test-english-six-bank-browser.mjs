import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";
import { verifySixBank } from "./test-english-six-bank.mjs";

const origin = process.env.ENGLISH_SIX_QA_ORIGIN ?? "http://127.0.0.1:3008";
const online = process.env.ENGLISH_SIX_QA_ONLINE === "1";
assert.ok(online ? origin === "https://congcong-study.cn" : ["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const runtime = process.argv.find(a => a.startsWith("--playwright="))?.slice(13);
const { chromium } = await import(runtime ? pathToFileURL(runtime).href : "playwright");
const { service, index } = await verifySixBank();
const family = await loadHolidayTestModule("src/lib/family-access.ts");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
let token = family.createFamilyAccessToken();
if (online) {
  const code = "const{createHmac}=require('node:crypto');const s=(process.env.FAMILY_ACCESS_SECRET||process.env.FAMILY_ACCESS_PASSWORD||'').trim();if(!s)process.exit(1);const p='v1.'+(Date.now()+900000);process.stdout.write(p+'.'+createHmac('sha256',s).update(p).digest('base64url'));";
  const command = `set -e; cd /www/study-plan; set -a; . /etc/study-plan.env; set +a; node --env-file=.env.local -e "eval(Buffer.from('${Buffer.from(code).toString("base64")}', 'base64').toString())"`;
  token = execFileSync("ssh", ["-i", path.join(path.dirname(appRoot), ".deploy-keys/english-six-20261011"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "ubuntu@124.223.31.175", command], { encoding: "utf8", timeout: 30000 }).trim();
  assert.match(token, /^v1\.\d+\.[\w-]+$/);
}
await context.addCookies([{ name: family.FAMILY_ACCESS_COOKIE, value: token, url: origin }]);
await context.route("**/api/**", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort());
const records = {}, errors = [], checks = [];
await context.route("**/api/english/locked?**", async route => {
  assert.equal(new URL(route.request().url()).searchParams.get("module"), "six");
  if (route.request().method() === "GET") return route.fulfill({ json: { records } });
  const { id, response } = route.request().postDataJSON();
  const feedback = service.englishSixBankGrade(id, response);
  assert.ok(feedback, "server grading accepts the submitted format");
  records[id] ??= { id, response, feedback: { correct: feedback.correct, answer: feedback.answer, explanation: feedback.explanation }, submittedAt: new Date().toISOString() };
  return route.fulfill({ json: { record: records[id] } });
});
const page = await context.newPage();
page.on("pageerror", e => errors.push(e.message));
const base = `${origin}/subjects/${online ? "8bd6f79b-99f5-4e68-a961-872d60d260b1" : "qa-english"}/english/six`;
const out = path.join(appRoot, `tmp/english-six-bank-${online ? "online-" : ""}qa`);
await mkdir(out, { recursive: true });
async function shot(name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal overflow");
  await page.screenshot({ path: path.join(out, name), fullPage: false });
}
try {
  const choiceEntry = index.papers.find(p => p.sourceId === "981bb9fd35b0" && p.title.includes("第一课时") && p.title.includes("单项选择"));
  const choice = service.englishSixBankPrivatePaper(choiceEntry.id);
  const response = await context.request.get(`${origin}/api/english/six/bank/${choiceEntry.id}`);
  assert.equal(response.status(), 200);
  for (const name of ["answer", "accepted", "explanation", "keySource"])
    assert.ok(!(await response.text()).includes(`"${name}":`), name);
  await page.goto(`${base}/bank/${choiceEntry.id}?unit=1`);
  await page.getByRole("heading", { name: choice.questions[0].prompt, exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await shot("choice-desktop.png");
  const wrong = choice.questions[0].options.find(o => o.id !== choice.questions[0].answer);
  await page.getByRole("button", { name: `${wrong.id} ${wrong.text}`, exact: true }).click();
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答错误 · 已锁定", { exact: true }).waitFor();
  await page.getByText(choice.questions[0].explanation, { exact: true }).waitFor();
  await page.reload(); await page.getByText("回答错误 · 已锁定", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: `${wrong.id} ${wrong.text}`, exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "下一题 →", exact: true }).click();
  await page.getByRole("heading", { name: choice.questions[1].prompt, exact: true }).waitFor();
  const right = choice.questions[1].options.find(o => o.id === choice.questions[1].answer);
  await page.getByRole("button", { name: `${right.id} ${right.text}`, exact: true }).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("50%", { exact: true }).waitFor();
  await shot("feedback-desktop.png");
  checks.push("one question at a time; feedback only after submit; next; correct/wrong; first response persists; accuracy");

  const fillEntry = index.papers.find(p => p.sourceId === "981bb9fd35b0" && p.title.includes("第一课时") && p.title.includes("中文提示"));
  const fill = service.englishSixBankPrivatePaper(fillEntry.id);
  await page.goto(`${base}/bank/${fillEntry.id}?unit=1`);
  await page.locator(`[data-question-prompt="${fill.questions[0].id}"]`).waitFor();
  await page.getByRole("combobox", { name: "跳转题目" }).selectOption({ value: "1" });
  await page.getByRole("textbox", { name: "第 3 空", exact: true }).waitFor();
  const fields = page.getByRole("textbox");
  assert.equal(await fields.count(), 3);
  await fields.nth(0).fill("why"); await fields.nth(1).fill("take");
  assert.equal(await page.getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  await fields.nth(2).fill("part");
  await page.reload(); await page.getByRole("textbox", { name: "第 3 空" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "第 3 空" }).inputValue(), "part");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
  await page.getByText(fill.questions[1].explanation, { exact: true }).waitFor();
  await shot("multi-fill-desktop.png");
  await page.getByRole("link", { name: "查看原题 · 第 2 页", exact: true }).click();
  await page.getByRole("combobox", { name: "页码", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('nav[aria-label="资料分页"] label:last-of-type select')?.value === "2");
  checks.push("all blanks required; drafts restored; multi-blank grading; source-page link");

  const refEntry = index.papers.find(p => p.sourceId === "981bb9fd35b0" && p.title.includes("连词成句"));
  await page.goto(`${base}/bank/${refEntry.id}?unit=1`);
  await page.getByRole("textbox", { name: "你的答案" }).fill("An alternative sentence.");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("已提交 · 参考答案 · 已锁定", { exact: true }).waitFor();
  await page.getByText("--", { exact: true }).waitFor();
  assert.equal(await page.getByText("回答错误 · 已锁定", { exact: true }).count(), 0);
  checks.push("open expressions use reference feedback, not false exact grading");

  const ambiguousEntry = index.papers.find(p => p.sourceId === "0467910b917e" && p.unit === 6 && p.title.includes("单项选择"));
  await page.goto(`${base}/bank/${ambiguousEntry.id}?unit=6`);
  await page.getByRole("combobox", { name: "跳转题目" }).selectOption({ value: "17" });
  await page.getByRole("button", { name: "B How", exact: true }).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("已提交 · 参考答案 · 已锁定", { exact: true }).waitFor();
  assert.equal(await page.locator('button[data-result="wrong"]').count(), 0);
  await page.getByText("--", { exact: true }).waitFor();
  checks.push("ambiguous source choices are explained and do not produce false wrong marks");

  const newFillEntry = index.papers.find(p => p.sourceId === "8092f44e7f99" && p.unit === 1 && p.title.includes("短文填空"));
  const newFill = service.englishSixBankPrivatePaper(newFillEntry.id).questions[0];
  await page.goto(`${base}/bank/${newFillEntry.id}?unit=1`);
  await page.getByRole("textbox", { name: "第 3 空", exact: true }).waitFor();
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  for (let i = 0; i < newFill.accepted.length; i++)
    await page.getByRole("textbox", { name: `第 ${i + 1} 空`, exact: true }).fill(newFill.accepted[i][0]);
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
  await page.getByText(newFill.explanation, { exact: true }).waitFor();
  await shot("reviewed-cloze-desktop.png");
  checks.push("new protected source cloze: all fields; corrected to practise; answer after submit");

  const writingEntry = index.papers.find(p => p.sourceId === "e647931251a3" && p.unit === 1);
  const writing = service.englishSixBankPrivatePaper(writingEntry.id).questions[0];
  await page.goto(`${base}/bank/${writingEntry.id}?unit=1`);
  await page.getByRole("textbox", { name: "你的答案" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "你的答案" }).getAttribute("rows"), "8");
  assert.equal(await page.getByText(writing.answer, { exact: true }).count(), 0);
  await page.getByRole("textbox", { name: "你的答案" }).fill("Last week I learned to swim. I practised with my father and did not give up.");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("已提交 · 参考答案 · 已锁定", { exact: true }).waitFor();
  await page.getByText(writing.explanation, { exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await shot(`writing-${width}.png`);
    await page.locator('[aria-live="polite"]').scrollIntoViewIfNeeded();
    await shot(`writing-feedback-${width}.png`);
    await page.evaluate(() => scrollTo(0, 0));
  }
  checks.push("writing uses large textarea; model/translation only after submit; reference excluded from accuracy; responsive feedback");

  const checklistEntry = index.papers.find(p => p.sourceId === "195b26ca27ec" && p.unit === 7 && p.title.includes("单项选择"));
  await page.goto(`${base}/bank/${checklistEntry.id}?unit=7`);
  await page.getByRole("combobox", { name: "跳转题目" }).selectOption({ value: "2" });
  await page.getByRole("button", { name: "B What", exact: true }).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
  await shot("reviewed-checklist-mobile.png");
  checks.push("corrected source double-a exclamation grades What correctly");

  const legacyChoiceEntry = index.papers.find(p => p.sourceId === "e90808a8dd22" && p.title.includes("单项选择"));
  const legacyChoice = service.englishSixBankPrivatePaper(legacyChoiceEntry.id).questions[5];
  await page.goto(`${base}/bank/${legacyChoiceEntry.id}?unit=6`);
  await page.getByRole("combobox", { name: "跳转题目" }).selectOption({ value: "5" });
  await page.getByRole("button", { name: "A pick it up; is good", exact: true }).click();
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await shot("legacy-choice-before-submit-320.png");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
  await page.getByText(legacyChoice.explanation, { exact: true }).waitFor();
  await page.locator('[aria-live="polite"]').scrollIntoViewIfNeeded();
  await shot("legacy-choice-feedback-320.png");
  const legacyFillEntry = index.papers.find(p => p.sourceId === "e90808a8dd22" && p.title.includes("句型转换"));
  const legacyFill = service.englishSixBankPrivatePaper(legacyFillEntry.id).questions[0];
  await page.goto(`${base}/bank/${legacyFillEntry.id}?unit=6`);
  await page.getByRole("textbox", { name: "第 4 空", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox").count(), 4);
  for (let i = 0; i < 3; i++)
    await page.getByRole("textbox", { name: `第 ${i + 1} 空`, exact: true }).fill(legacyFill.accepted[i][0]);
  assert.equal(await page.getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  await page.getByRole("textbox", { name: "第 4 空", exact: true }).fill("did not");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
  await page.getByText(legacyFill.explanation, { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[aria-live="polite"]').scrollIntoViewIfNeeded();
  await shot("legacy-four-blanks-feedback-390.png");
  checks.push("legacy edition corrected key/options; four original blanks; did not variant; no pre-submit answer; mobile feedback");

  const cartoonEntry = index.papers.find(p => p.sourceId === "cd846e3d3d6f");
  const cartoon = service.englishSixBankPrivatePaper(cartoonEntry.id);
  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto(`${base}/resource/cd846e3d3d6f?mode=source&unit=1`);
    await page.getByText(cartoon.questions[0].prompt, { exact: true }).waitFor();
    await page.getByText("原资料 · 已匹配互动题 15 题", { exact: true }).waitFor();
    const paragraphs = await page.locator("article p").allTextContents();
    assert.ok(paragraphs.every(p => !/ {2,}|themorning|theafternoon/.test(p)), "PDF coordinates are not mobile spacing");
    await page.waitForFunction(() => [...document.querySelectorAll("article img")].every(i => i.complete && i.naturalWidth > 0));
    await page.getByRole("navigation", { name: "资料分页" }).scrollIntoViewIfNeeded();
    await shot(`dictation-reader-${width}.png`);
    await page.getByRole("combobox", { name: "页码", exact: true }).selectOption("2");
    await page.getByText(cartoon.questions[9].prompt, { exact: true }).waitFor();
    await page.getByText(cartoon.questions[10].prompt, { exact: true }).waitFor();
    assert.ok((await page.locator("article img").first().getAttribute("src")).includes("3b59f3a9cd48f240081fe3bd9a753fef"), "Evening scene illustration");
    await page.getByText(cartoon.questions[9].prompt, { exact: true }).scrollIntoViewIfNeeded();
    await shot(`dictation-separated-dialogue-${width}.png`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/resource/cd846e3d3d6f?mode=source&unit=1`);
  await page.getByRole("link", { name: "开始练习 →", exact: true }).click();
  await page.getByRole("textbox", { name: "第 3 空", exact: true }).waitFor();
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await page.getByRole("textbox", { name: "第 1 空", exact: true }).fill("ast");
  await page.getByRole("textbox", { name: "第 2 空", exact: true }).fill("aw");
  assert.equal(await page.getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  await page.getByRole("textbox", { name: "第 3 空", exact: true }).fill("oster");
  await shot("dictation-input-390.png");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
  await page.getByText(cartoon.questions[0].explanation, { exact: true }).waitFor();
  await page.locator('[aria-live="polite"]').scrollIntoViewIfNeeded();
  await shot("dictation-feedback-390.png");
  await page.getByRole("button", { name: "下一题 →", exact: true }).click();
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await page.getByRole("textbox", { name: "第 4 空", exact: true }).waitFor();
  for (const [i, word] of ["why", "do not", "take", "part"].entries())
    await page.getByRole("textbox", { name: `第 ${i + 1} 空`, exact: true }).fill(word);
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
  await page.getByRole("combobox", { name: "跳转题目" }).selectOption({ value: "5" });
  await page.getByRole("textbox", { name: "你的答案", exact: true }).fill("sleeping");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答错误 · 已锁定", { exact: true }).waitFor();
  await page.getByText("答案：singing", { exact: true }).waitFor();
  await page.getByText("67%", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("回答错误 · 已锁定", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "你的答案", exact: true }).isDisabled(), true);
  const storyEntry = index.papers.find(p => p.sourceId === "370dbef9fd22");
  await page.goto(`${base}/resource/370dbef9fd22?mode=source&unit=1`);
  await page.getByText("原资料 · 已匹配互动题 13 题", { exact: true }).waitFor();
  await shot("dictation-story-reader-390.png");
  await page.goto(`${base}/bank/${storyEntry.id}?unit=1`);
  await page.getByRole("textbox", { name: "第 3 空", exact: true }).waitFor();
  for (const [i, word] of ["ago", "play", "play"].entries())
    await page.getByRole("textbox", { name: `第 ${i + 1} 空`, exact: true }).fill(word);
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
  checks.push("Unit 1 dictation: restored blanks, separate comic dialogue, retained pictures, reader entry, complete/suffix variants, no answer before submit, next, accuracy, persisted first response, Story time");

  for (const [sourceId, unit, total] of [["330c16070797", 2, 14], ["13e01fe16f01", 2, 13],
    ["e8877e808c6b", 3, 14], ["3ea65d6362c6", 3, 18], ["8b1aeaaae914", 4, 15], ["b2dd515ff21d", 4, 19]]) {
    const entry = index.papers.find(p => p.sourceId === sourceId), paper = service.englishSixBankPrivatePaper(entry.id);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${base}/resource/${sourceId}?mode=source&unit=${unit}`);
      await page.getByText(`原资料 · 已匹配互动题 ${total} 题`, { exact: true }).waitFor();
      await page.getByText(paper.questions[0].prompt, { exact: true }).waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll("article img")].every(i => i.complete && i.naturalWidth > 0));
      await page.getByRole("navigation", { name: "资料分页" }).scrollIntoViewIfNeeded();
      await shot(`dictation-${sourceId}-reader-${width}.png`);
    }
    await page.goto(`${base}/bank/${entry.id}?unit=${unit}`);
    const first = paper.questions[0];
    await page.locator(`[data-question-prompt="${first.id}"]`).waitFor();
    assert.equal(await page.getByRole("textbox").count(), first.accepted.length);
    assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
    for (let i = 0; i < first.accepted.length; i++) await page.getByRole("textbox").nth(i).fill(first.accepted[i][0]);
    await page.getByRole("button", { name: "提交答案", exact: true }).click();
    await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
    await page.getByText(first.explanation, { exact: true }).waitFor();
  }
  const mixedEntry = index.papers.find(p => p.sourceId === "8b1aeaaae914");
  const mixed = service.englishSixBankPrivatePaper(mixedEntry.id);
  await page.goto(`${base}/bank/${mixedEntry.id}?unit=4`);
  await page.getByRole("combobox", { name: "跳转题目" }).selectOption({ value: "14" });
  await page.getByRole("textbox", { name: "第 4 空", exact: true }).waitFor();
  for (const [i, word] of ["irthday", "ext", "cannot"].entries())
    await page.getByRole("textbox", { name: `第 ${i + 1} 空`, exact: true }).fill(word);
  assert.equal(await page.getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  await page.getByRole("textbox", { name: "第 4 空", exact: true }).fill("wait");
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await shot("dictation-mixed-blanks-320.png");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
  await page.getByText(mixed.questions[14].explanation, { exact: true }).waitFor();
  await page.locator('[aria-live="polite"]').scrollIntoViewIfNeeded();
  await shot("dictation-mixed-blanks-feedback-320.png");
  checks.push("Unit 2-4: six repaired source readers at 390/320; all first questions graded; mixed initial/no-initial blanks; cannot variant; no pre-submit answer; complete fields required");

  const readingEntry = index.papers.find(p => p.sourceId === "981bb9fd35b0" && p.title.includes("阅读理解"));
  const reading = service.englishSixBankPrivatePaper(readingEntry.id);
  await page.goto(`${base}/bank/${readingEntry.id}?unit=1`);
  await page.getByText(reading.questions[0].context, { exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await shot(`reading-${width}.png`);
    await page.goto(`${base}/bank?unit=all&source=981bb9fd35b0`);
    await page.getByRole("heading", { name: "互动练习", exact: true }).waitFor();
    await page.getByText("118", { exact: true }).waitFor();
    await shot(`directory-${width}.png`);
    await page.goto(`${base}/bank/${choiceEntry.id}?unit=1`);
    await page.getByText("回答正确 · 已锁定", { exact: true }).waitFor();
    await shot(`practice-${width}.png`);
    await page.goto(`${base}/bank/${readingEntry.id}?unit=1`);
    await page.getByText(reading.questions[0].context, { exact: true }).waitFor();
  }
  checks.push("passages retained; desktop/390/320 screenshots; no overflow");
  const anonymous = await browser.newContext();
  assert.equal((await anonymous.request.get(`${origin}/api/english/six/bank`)).status(), 401);
  assert.equal((await anonymous.request.get(`${origin}/api/english/six/bank/${choiceEntry.id}`)).status(), 401);
  await anonymous.close();
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(path.join(out, "report.json"), JSON.stringify({ bankQuestions: index.questionCount, existingQuestions: index.existingQuestionCount, papers: index.papers.length, checks, errors, realStudentWrites: false, completeSourceConversion: false }, null, 2));
  console.log(JSON.stringify({ checks, errors, realStudentWrites: false }));
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: false });
  console.log(await page.evaluate(() => ({ url: location.href, headings: [...document.querySelectorAll("h2")].map(e => e.textContent), fields: [...document.querySelectorAll("label")].map(e => e.textContent), selects: [...document.querySelectorAll("select")].map(e => e.value) })));
  console.log({errors});
  throw error;
} finally { await browser.close(); }
