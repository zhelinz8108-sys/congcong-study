import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const origin = process.env.ENGLISH_SIX_QA_ORIGIN ?? "http://127.0.0.1:3015";
const online = origin === "https://congcong-study.cn";
assert.ok(online || ["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const runtime = process.argv.find(a => a.startsWith("--playwright="))?.slice(13);
const { chromium } = await import(runtime ? pathToFileURL(runtime).href : "playwright");
const layouts = JSON.parse(readFileSync(path.join(appRoot, "src/data/english-six-reader-layouts.public.json"), "utf8"));
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
const page = await context.newPage(), errors = [], colors = new Set();
page.on("pageerror", error => errors.push(error.message));
const base = `${origin}/subjects/8bd6f79b-99f5-4e68-a961-872d60d260b1/english/six`;
const output = path.join(appRoot, `tmp/english-reader-${online ? "online" : "local"}`);
mkdirSync(output, { recursive: true });
let tables = 0, topics = 0;
async function open(id, number = 1) {
  await page.goto(`${base}/resource/${id}?unit=1&page=${number}`);
  await page.getByRole("combobox", { name: "页码", exact: true }).waitFor();
  await page.locator("article").waitFor();
  assert.equal(await page.getByRole("combobox", { name: "页码", exact: true }).inputValue(), String(number));
}
async function checkViewport() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow: ${page.url()}`);
  assert.ok(await page.locator("article p, article h3, article h4, article td, article dd").evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).every(n => n.scrollWidth <= n.clientWidth + 2)), `Text overflow: ${page.url()}`);
}
try {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [id, layout] of Object.entries(layouts)) {
    await open(id);
    for (const topic of layout.outline) {
      await page.getByRole("button", { name: `知识点 ${topic.number}：${topic.title}`, exact: true }).click();
      const section = page.locator(`#six-topic-${id}-${topic.number}`);
      await section.locator("header").waitFor();
      await page.waitForFunction(({ id, topic }) => {
        const element = document.getElementById(`six-topic-${id}-${topic}`);
        if (!element) return false;
        const top = element.getBoundingClientRect().top;
        return top > 0 && top < 400;
      }, { id, topic: topic.number });
      assert.equal(await page.getByRole("combobox", { name: "页码", exact: true }).inputValue(), String(topic.destination));
      colors.add(await section.locator("h3").evaluate(n => getComputedStyle(n).color));
      assert.equal(await section.getByRole("table").count(), 1);
      const expected = Object.values(layout.pages).flatMap(p => p.tables).find(t => t.start >= 0 && layout.pages[String(topic.destination)]?.tables.includes(t));
      assert.ok(expected);
      const actual = await section.locator("table tr").evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent)));
      assert.deepEqual(actual, expected.rows);
      await checkViewport();
      tables++; topics++;
    }
  }
  assert.equal(colors.size, 3);
  await open("c577cdad00f2");
  assert.equal(await page.locator("article").getByText("crytried", { exact: true }).count(), 0);
  assert.equal(await page.locator('article p').filter({ has: page.getByText("错误", { exact: true }) }).count(), 3);
  await page.screenshot({ path: path.join(output, "unit1-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: /^知识点 2：/ }).click();
  await page.locator("#six-topic-c577cdad00f2-2 header").waitFor();
  await page.screenshot({ path: path.join(output, "unit1-topic2.png"), fullPage: false });
  await page.getByRole("button", { name: /^知识点 3：/ }).click();
  await page.locator("#six-topic-c577cdad00f2-3 header").waitFor();
  await page.screenshot({ path: path.join(output, "unit1-topic3.png"), fullPage: false });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [id, layout] of Object.entries(layouts)) {
      await open(id);
      await checkViewport();
      const first = layout.pages["1"].tables[0];
      assert.equal(await page.getByRole("table").count(), 0, "Desktop table hidden on phones");
      assert.equal(await page.locator("article dl").count(), first.rows.length - 1);
      if (id === "c577cdad00f2") {
        await page.screenshot({ path: path.join(output, `unit1-${width}.png`), fullPage: true });
        await page.locator("article dl").first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `unit1-rules-${width}.png`), fullPage: false });
      }
    }
    await open("cd846e3d3d6f");
    await page.getByText("L______ week, Bobby and Sam s______ a new p______ at school.", { exact: true }).waitFor();
    await checkViewport();
  }
  assert.equal(tables, 24);
  assert.equal(topics, 24);
  assert.deepEqual(errors, []);
  const report = { online, tables, topics, distinctTopicColors: colors.size, widths: [1440, 390, 320], rawResourcesChanged: false, realStudentWrites: false, errors };
  writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, output }));
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: false });
  console.log({ url: page.url(), errors });
  throw error;
} finally { await browser.close(); }
