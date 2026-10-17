import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";
import { readerPracticeComprehensiveFixture } from "./english-six-reader-practice-fixture.mjs";

const origin = process.env.ENGLISH_SIX_QA_ORIGIN ?? "http://127.0.0.1:3016";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "synthetic browser checks run locally");
const runtime = process.argv.find(arg => arg.startsWith("--playwright="))?.slice(13);
const { chromium } = await import(runtime ? pathToFileURL(runtime).href : "playwright");
const fixtureRoot = mkdtempSync(path.join(tmpdir(), "reader-browser-"));
const originalCwd = process.cwd();
const output = path.join(appRoot, "tmp/english-six-reader-practice");
mkdirSync(output, { recursive: true });
const fixture = readerPracticeComprehensiveFixture();
const root = path.join(fixtureRoot, "content/english-six");
mkdirSync(path.join(root, "resources"), { recursive: true });
writeFileSync(path.join(root, "index.json"), JSON.stringify({ resources: [fixture.meta] }));
writeFileSync(path.join(root, "resources", `${fixture.id}.json`), JSON.stringify(fixture));
process.chdir(fixtureRoot);
const service = await loadHolidayTestModule("src/server/english-six-reader-practice.ts");
const records = {}, errors = [];
let submissions = 0, failNext = false;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/api/**", route => ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort());
  await context.route(/\/api\/english\/six\/resource\/c577cdad00f2(?:\?|$)/, route => {
    const page = Number(new URL(route.request().url()).searchParams.get("page") ?? 1);
    return route.fulfill({ json: { meta: fixture.meta, content: service.englishSixReaderContent(fixture.id, page, fixture.pages[page - 1]),
      asset: null, reference: false, practiceCount: 0, readerExercises: service.englishSixReaderExercises(fixture.id, page) } });
  });
  await context.route("**/api/english/locked?**", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { records } });
    submissions++;
    if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: "模拟保存失败，请重试" } }); }
    const { id, response } = route.request().postDataJSON();
    const feedback = service.englishSixReaderGrade(id, response);
    assert.ok(feedback);
    records[id] ??= { id, response, feedback, submittedAt: new Date().toISOString() };
    return route.fulfill({ json: { record: records[id] } });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const base = `${origin}/subjects/qa-english/english/six/resource/${fixture.id}`;
  const exercise = index => page.locator("[data-reader-exercise]").nth(index);
  const visibleAnswerCount = () => page.locator('[data-reader-exercise] [aria-live="polite"]').count();
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.goto(`${base}?page=2&unit=1`);
  await page.locator("[data-reader-exercise] input:enabled").first().waitFor();
  assert.equal(await page.locator("[data-reader-exercise]").count(), 8);
  assert.equal(await visibleAnswerCount(), 0);
  assert.ok(!(await page.locator("main").innerText()).includes("【答案】"));
  assert.equal(await exercise(0).getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  await exercise(0).getByRole("textbox").fill("wanted");
  await exercise(0).getByRole("button", { name: "提交答案", exact: true }).click();
  await exercise(0).getByText("回答正确 · 已保存", { exact: true }).waitFor();
  assert.equal(await visibleAnswerCount(), 1);
  assert.equal(await exercise(0).getByRole("textbox").isDisabled(), true);
  assert.ok(!(await exercise(1).innerText()).includes("asked"), "next answer stays hidden");
  await exercise(1).getByRole("textbox").fill("ask");
  await exercise(1).getByRole("textbox").press("Enter");
  await exercise(1).getByText("回答错误 · 已保存", { exact: true }).waitFor();
  assert.ok((await exercise(1).innerText()).includes("答案：asked"));
  failNext = true;
  await exercise(2).getByRole("textbox").fill("remembered");
  await exercise(2).getByRole("button", { name: "提交答案", exact: true }).click();
  await page.locator("main [role=alert]").waitFor();
  assert.equal(await visibleAnswerCount(), 2, "failed save does not reveal answer");
  await exercise(2).getByRole("button", { name: "提交答案", exact: true }).click();
  await exercise(2).getByText("回答正确 · 已保存", { exact: true }).waitFor();
  await page.reload();
  await exercise(0).getByText("回答正确 · 已保存", { exact: true }).waitFor();
  assert.equal(await visibleAnswerCount(), 3, "refresh restores only submitted answers");
  await page.getByRole("combobox", { name: "页码", exact: true }).selectOption("6");
  await page.locator("[data-reader-exercise] textarea:enabled").waitFor();
  assert.equal(await visibleAnswerCount(), 0, "previous page answers do not appear on this page");
  assert.ok(!(await page.locator("main").innerText()).includes("She didn't want to play Mulan."));
  await exercise(0).getByRole("textbox").fill("She did not want to play Mulan.");
  await exercise(0).getByRole("button", { name: "提交答案", exact: true }).click();
  await exercise(0).getByText("已提交 · 待评价", { exact: true }).waitFor();
  assert.ok((await exercise(0).innerText()).includes("She didn't want to play Mulan."));
  await exercise(1).getByRole("textbox", { name: "第 1 空", exact: true }).fill("did not");
  assert.equal(await exercise(1).getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  await exercise(1).getByRole("textbox", { name: "第 2 空", exact: true }).fill("want");
  await exercise(1).getByRole("button", { name: "提交答案", exact: true }).click();
  await exercise(1).getByText("回答正确 · 已保存", { exact: true }).waitFor();
  await exercise(2).getByRole("button", { name: "B sang", exact: true }).click();
  assert.equal(await exercise(2).locator('[aria-live="polite"]').count(), 0, "selecting is not submitting");
  await exercise(2).getByRole("button", { name: "提交答案", exact: true }).click();
  await exercise(2).getByText("回答正确 · 已保存", { exact: true }).waitFor();
  assert.equal(await exercise(2).getByRole("button", { name: "B sang", exact: true }).getAttribute("data-result"), "correct", "correct option uses correct styling");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await noOverflow();
    await page.screenshot({ path: path.join(output, `submitted-${width}.png`), fullPage: true });
  }
  await page.goto(`${base}?page=2&unit=1&mode=source`);
  await exercise(0).getByText("回答正确 · 已保存", { exact: true }).waitFor();
  assert.equal(await visibleAnswerCount(), 3, "source mode cannot expose unsubmitted keys");
  assert.ok(!(await exercise(3).innerText()).includes("答案：used"));
  await page.goto(`${base}?page=7&unit=1`);
  await page.locator("[data-reader-exercise] input:enabled").first().waitFor();
  assert.equal(await page.locator("[data-reader-exercise]").count(), 6, "both dialogue blanks from one paragraph have independent controls");
  assert.ok((await page.locator("main").innerText()).includes("Joe: 1."), "original dialogue context remains visible");
  assert.equal(await visibleAnswerCount(), 0);
  await exercise(4).getByRole("button", { name: "A How are you?", exact: true }).click();
  await exercise(4).getByRole("button", { name: "提交答案", exact: true }).click();
  await exercise(4).getByText("回答正确 · 已保存", { exact: true }).waitFor();
  assert.equal(await visibleAnswerCount(), 1, "one dialogue submission reveals only that blank's key");
  assert.ok(!(await exercise(5).innerText()).includes("答案："));
  assert.ok(!(await page.locator("main").innerText()).includes("first A, second B"));
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 1000 }); await noOverflow(); }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: "pass", submissions, studentWrites: 0, screenshots: output,
    checks: ["answers hidden until successful submit", "per-question reveal", "wrong answer feedback", "save failure and retry", "cloud record restore", "sentence reference", "all blanks required", "choice submit", "source mode privacy", "desktop and mobile layout"] }));
} catch (error) {
  const pages = browser.contexts().flatMap(context => context.pages());
  if (pages[0]) await pages[0].screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  await browser.close(); process.chdir(originalCwd); rmSync(fixtureRoot, { recursive: true });
}
