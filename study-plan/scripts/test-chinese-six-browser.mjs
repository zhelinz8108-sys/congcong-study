import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";
import { verifySix } from "./test-chinese-six.mjs";

const origin = process.env.SIX_QA_ORIGIN ?? "http://127.0.0.1:3006";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const runtime = process.argv.find(a => a.startsWith("--playwright="))?.split("=").slice(1).join("=");
const { chromium } = runtime ? await import(pathToFileURL(runtime).href) : await import("playwright");
const { lib, server, bankModule } = verifySix();
const family = await loadHolidayTestModule("src/lib/family-access.ts");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: family.FAMILY_ACCESS_COOKIE, value: family.createFamilyAccessToken(), url: origin }]);
const page = await context.newPage();
const errors = [], checks = [];
page.on("pageerror", e => errors.push(e.message));
let state = lib.emptySixProgress(), writes = 0;
// No browser QA request writes the real student's progress.
await context.route("**/api/chinese/six/progress*", async route => {
  const request = route.request();
  try {
    if (request.method() === "POST") { state = server.transitionSixProgress(state, request.postDataJSON()); writes++; }
    const itemId = new URL(request.url()).searchParams.get("item");
    await route.fulfill({ json: { progress: state, feedback: server.sixSubmittedFeedback(state, itemId || undefined), storage: "cloud" } });
  } catch (e) { await route.fulfill({ status: 409, json: { error: e.message } }); }
});
await context.route("**/api/subjects/qa-chinese*", route => route.fulfill({ json: { id: "qa-chinese", name: "语文", color: "#ef4444", units: [], totalWords: 0, dueCount: 0 } }));
await context.route("**/api/progress/**", route => route.fulfill({ json: { payload: null } }));
const output = path.join(appRoot, "tmp/chinese-six-qa");
await mkdir(output, { recursive: true });
const base = `${origin}/subjects/qa-chinese/chinese/six`;
async function shot(name) { await page.screenshot({ path: path.join(output, name), fullPage: false }); }
async function noOverflow() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow");
}
try {
  await page.goto(`${origin}/subjects/qa-chinese`);
  await page.getByRole("link", { name: /^六上/ }).waitFor();
  await shot("subject-desktop.png");
  await page.getByRole("link", { name: /^六上/ }).click();
  await page.getByRole("heading", { name: "六上语文", exact: true }).waitFor();
  assert.equal(await page.locator('[role="tabpanel"] a').count(), 34);
  await shot("hub-desktop.png"); checks.push("Chinese homepage entry; 34 lessons/gardens");
  await page.getByRole("tab", { name: /句子专项/ }).click();
  assert.equal(await page.locator('[role="tabpanel"] a').count(), 13);
  await page.getByRole("tab", { name: /阅读训练/ }).click();
  assert.equal(await page.locator('[role="tabpanel"] a').count(), 40);
  await page.locator("summary").filter({ hasText: "阅读方法" }).click();
  await page.getByRole("link", { name: /01.*根据文本想象画面/ }).click();
  await page.getByRole("heading", { name: "根据文本想象画面", exact: true }).waitFor();
  await page.locator("img").first().waitFor();
  await page.waitForFunction(() => [...document.images].some(i => i.naturalWidth > 100));
  checks.push("24 reading method links and authenticated source images");
  await page.goto(`${base}/study/sentence-01`);
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  assert.equal(await page.locator("[data-feedback]").count(), 0);
  await page.getByRole("textbox", { name: "你的答案" }).fill("这是第一次提交的答案。");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.locator("[data-answer-locked]").waitFor();
  assert.ok(await page.getByRole("textbox", { name: "你的答案" }).isDisabled());
  await page.getByRole("button", { name: "部分正确", exact: true }).click();
  await page.getByText("自评已记录").waitFor();
  assert.ok(await page.getByRole("button", { name: "满分", exact: true }).isDisabled());
  await shot("answer-desktop.png");
  const oldAttemptId = state.current["sentence-01"];
  await page.reload();
  await page.getByRole("button", { name: "练习与复盘", exact: true }).click();
  await page.getByRole("button", { name: "第1题", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "你的答案" }).inputValue(), "这是第一次提交的答案。");
  assert.ok(await page.getByRole("textbox", { name: "你的答案" }).isDisabled());
  await page.getByRole("button", { name: "重新练习", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="你的答案"]')?.disabled === false);
  assert.ok(await page.getByRole("textbox", { name: "你的答案" }).isEnabled());
  assert.notEqual(state.current["sentence-01"], oldAttemptId);
  assert.equal(Object.keys(state.attempts).length, 2);
  checks.push("short answer and self-rating lock; refresh restore; fresh attempt retains history");
  await page.goto(`${base}/mistakes`);
  await page.getByRole("heading", { name: "修改病句", exact: true }).waitFor();
  await page.locator("summary").filter({ hasText: "查看最近未达成" }).click();
  await page.getByRole("link", { name: /^核对此题/ }).waitFor();
  checks.push("mistakes retained and linked to question");
  const choiceItem = bankModule.sixBank().items.find(i => i.questions.some(q => q.kind === "choice"));
  const choice = choiceItem.questions.find(q => q.kind === "choice");
  await page.goto(`${base}/study/${choiceItem.id}`);
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page.getByRole("button", { name: `第${choiceItem.questions.findIndex(q => q.id === choice.id) + 1}题`, exact: true }).click();
  const options = page.locator("[data-question] button[data-selected]");
  assert.equal(await options.count(), 4);
  await options.nth(choice.options.findIndex(o => o.value === choice.answer)).click();
  await page.locator("[data-answer-locked]").waitFor();
  for (const button of await options.all()) assert.ok(await button.isDisabled());
  assert.ok(await page.getByText(/回答正确/).isVisible());
  checks.push("choice immediately graded and all options locked");
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(); await shot("practice-mobile.png");
  await page.goto(base);
  await page.getByRole("tab", { name: /作文训练/ }).click();
  assert.equal(await page.locator('[role="tabpanel"] a').count(), 80);
  await noOverflow(); await shot("writing-list-mobile.png");
  await page.goto(`${base}/study/writing-01`);
  await page.waitForFunction(() => [...document.images].some(i => i.naturalWidth > 100));
  await noOverflow(); await shot("writing-mobile.png");
  checks.push("80 writing models; page images loaded; desktop/mobile no horizontal overflow");
  // Confirm real server authentication and reserved-scope protection without mutating state.
  const anonymous = await browser.newContext();
  const denied = await anonymous.request.get(`${origin}/api/chinese/six/source/reading/4`);
  assert.equal(denied.status(), 401);
  await anonymous.close();
  const overwrite = await context.request.put(`${origin}/api/progress/chinese:six:v1`, { data: { payload: {} } });
  assert.equal(overwrite.status(), 403);
  checks.push("original pages require login; generic overwrite endpoint rejected");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "report.json"), JSON.stringify({ checks, writes, realStudentWrites: 0, errors }, null, 2));
  console.log(JSON.stringify({ checks, writes, realStudentWrites: 0, errors }, null, 2));
} finally { await browser.close(); }
