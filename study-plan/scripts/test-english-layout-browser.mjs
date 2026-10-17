import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";
import { checkEnglishSixOrganization } from "./english-six-organization-browser-checks.mjs";

const origin = process.env.ENGLISH_SIX_QA_ORIGIN ?? "http://127.0.0.1:3015";
const online = origin === "https://congcong-study.cn";
assert.ok(online || ["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const baseline = process.argv.includes("--baseline");
const runtime = process.argv.find(a => a.startsWith("--playwright="))?.slice(13);
const { chromium } = await import(runtime ? pathToFileURL(runtime).href : "playwright");
const bank = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/bank/index.json"), "utf8"));
const choice = bank.papers.find(p => p.sourceId === "981bb9fd35b0" && p.title.includes("第一课时") && p.title.includes("单项选择"));
const family = await loadHolidayTestModule("src/lib/family-access.ts");
let token = family.createFamilyAccessToken();
if (online) {
  const code = "const{createHmac}=require('node:crypto');const s=(process.env.FAMILY_ACCESS_SECRET||process.env.FAMILY_ACCESS_PASSWORD||'').trim();if(!s)process.exit(1);const p='v1.'+(Date.now()+900000);process.stdout.write(p+'.'+createHmac('sha256',s).update(p).digest('base64url'));";
  const command = `set -e; cd /www/study-plan; set -a; . /etc/study-plan.env; set +a; node --env-file=.env.local -e "eval(Buffer.from('${Buffer.from(code).toString("base64")}', 'base64').toString())"`;
  token = execFileSync("ssh", ["-i", path.join(path.dirname(appRoot), ".deploy-keys/english-six-20261011"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "ubuntu@124.223.31.175", command], { encoding: "utf8", timeout: 30000 }).trim();
  assert.match(token, /^v1\.\d+\.[\w-]+$/);
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
await context.addCookies([{ name: family.FAMILY_ACCESS_COOKIE, value: token, url: origin }]);
await context.route("**/api/**", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort());
const subjectId = "8bd6f79b-99f5-4e68-a961-872d60d260b1";
if (!online) {
  await context.route(`**/api/subjects/${subjectId}?meta=1`, route => route.fulfill({ json: { id: subjectId, name: "英语", color: "#17b963" } }));
}
await context.route("**/api/english/locked?**", route => route.request().method() === "GET" ? route.fulfill({ json: { records: {} } }) : route.abort());
const page = await context.newPage(), errors = [], checks = [];
page.on("pageerror", e => errors.push(e.message));
const home = `${origin}/subjects/${subjectId}`, base = `${home}/english/six`;
const output = path.join(appRoot, `tmp/english-layout-${online ? "online" : "local"}-${baseline ? "before" : "six-only-after"}`);
mkdirSync(output, { recursive: true });
async function screenshot(name) {
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 0); });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
  if (!baseline && (await page.viewportSize()).width <= 700)
    assert.equal(await page.locator("body>div.fixed.top-4.right-4").evaluate(n => getComputedStyle(n).position), page.url().includes("/english/six") ? "absolute" : "fixed", "Only Six changes the mobile profile bar behavior");
  await page.screenshot({ path: path.join(output, name), fullPage: false });
}
try {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1000 : 844 });
    await page.goto(home);
    await page.getByRole("heading", { name: "英语", exact: true }).waitFor();
    if (!baseline) {
      await page.getByRole("heading", { name: "六上", exact: true }).waitFor();
      for (const name of ["课本同步", "听说读写", "词汇与表达", "语法学习", "专题复习"])
        assert.equal(await page.getByRole("heading", { name, exact: true }).count(), 0, "No redesign outside Six");
      for (const route of ["english/six", "vocab", "phrases", "sentences", "sentence-structure", "grammar", "grammar-guide", "final-review", "national-day-english", "national-day-english-practice", "reading"])
        assert.equal(await page.locator(`a[href="/subjects/${subjectId}/${route}"]`).count(), 1, `Retain ${route}`);
      const reading = await page.locator(`a[href="/subjects/${subjectId}/reading"]`).boundingBox();
      const listening = await page.getByRole("button", { name: /听力.*Listening/ }).boundingBox();
      assert.ok(Math.abs(reading.y - listening.y) < 1 && listening.x > reading.x, "Original skill-card arrangement restored");
    }
    await screenshot(`home-${width}.png`);
    await page.goto(`${base}?unit=3&stage=all`);
    await page.getByRole("heading", { name: "Unit 3 · Great people", exact: true }).waitFor();
    if (!baseline) {
      await page.getByRole("region", { name: "目录导航", exact: true }).waitFor();
      await page.getByRole("region", { name: "学习资料", exact: true }).waitFor();
      const stages = await page.getByRole("navigation", { name: "学习顺序" }).getByRole("button").evaluateAll(nodes => nodes.map(n => [n.clientWidth, n.scrollWidth]));
      assert.ok(stages.every(([w, s]) => s <= w + 1), "Stage labels fit");
    }
    await screenshot(`hub-${width}.png`);
    if (!baseline) {
      await page.getByRole("region", { name: "学习资料", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `hub-resources-${width}.png`), fullPage: false });
    }
    await page.goto(`${base}/bank?unit=1`);
    await page.getByRole("heading", { name: "互动练习", exact: true }).waitFor();
    await page.locator('main a[href*="/bank/"]').first().waitFor();
    if (!baseline) {
      const groups = page.locator("main details");
      assert.ok(await groups.count() > 1, "Papers grouped by source");
      assert.equal(await groups.nth(1).getAttribute("open"), null);
      await groups.nth(1).locator("summary").click();
      await groups.nth(1).getByRole("link").first().waitFor();
    }
    await screenshot(`bank-${width}.png`);
    await page.goto(`${base}/bank/${choice.id}?unit=1`);
    await page.getByRole("group", { name: "选择答案", exact: true }).waitFor();
    assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
    if (!baseline) {
      const rects = await page.getByRole("group", { name: "选择答案" }).getByRole("button").evaluateAll(nodes => nodes.map(n => ({ x: n.getBoundingClientRect().x, y: n.getBoundingClientRect().y, bottom: n.getBoundingClientRect().bottom })));
      assert.ok(rects.every((r, i) => Math.abs(r.x - rects[0].x) < 1 && (!i || r.y >= rects[i - 1].bottom)), "One vertical column of options");
    }
    await screenshot(`practice-${width}.png`);
    await page.goto(`${base}/resource/cd846e3d3d6f?unit=1`);
    await page.getByRole("combobox", { name: "页码", exact: true }).waitFor();
    await page.getByText("L______ week, Bobby and Sam s______ a new p______ at school.", { exact: true }).waitFor();
    await screenshot(`reader-${width}.png`);
  }
  if (!baseline) {
    checks.push(...await checkEnglishSixOrganization(page, base, output));
    await page.goto(home);
    await page.getByRole("button", { name: /听力.*Listening/ }).click();
    await page.getByRole("heading", { name: "听力", exact: true }).waitFor();
    checks.push("Original homepage layout/destinations restored; listening action works; only Six retains optimized grouping and one-column study layout; hidden pre-submit feedback");
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  writeFileSync(path.join(output, "report.json"), JSON.stringify({ online, baseline, checks, errors, realStudentWrites: false }, null, 2));
  console.log(JSON.stringify({ output, checks, errors, realStudentWrites: false }));
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: false });
  console.log({ url: page.url(), errors });
  throw error;
} finally { await browser.close(); }
