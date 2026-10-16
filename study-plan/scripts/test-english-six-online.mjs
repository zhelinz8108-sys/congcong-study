import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkEnglishSixOrganization } from "./english-six-organization-browser-checks.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "https://congcong-study.cn";
const subject = "8bd6f79b-99f5-4e68-a961-872d60d260b1";
const base = `${origin}/subjects/${subject}/english/six`;
const output = path.join(app, "tmp/english-six-online-qa");
const runtime = process.argv.find(a => a.startsWith("--playwright="))?.slice(13);
const { chromium } = runtime ? await import(pathToFileURL(runtime).href) : await import("playwright");
const localIndex = JSON.parse(await readFile(path.join(app, "content/english-six/index.json"), "utf8"));
const localPaper = JSON.parse(await readFile(path.join(app, "content/english-six/practice/1.json"), "utf8"));

// Generate a short-lived QA cookie remotely. Secrets and the cookie stay in memory.
const tokenCode = `const {createHmac}=require('node:crypto');const s=(process.env.FAMILY_ACCESS_SECRET||process.env.FAMILY_ACCESS_PASSWORD||'').trim();if(!s)process.exit(1);const p='v1.'+(Date.now()+900000);process.stdout.write(p+'.'+createHmac('sha256',s).update(p).digest('base64url'));`;
const remote = `set -e; cd /www/study-plan; set -a; . /etc/study-plan.env; set +a; node --env-file=.env.local -e "eval(Buffer.from('${Buffer.from(tokenCode).toString("base64")}', 'base64').toString())"`;
const token = execFileSync("ssh", ["-i", path.join(path.dirname(app), ".deploy-keys/english-six-20261011"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "ubuntu@124.223.31.175", remote], { encoding: "utf8", timeout: 30000 }).trim();
assert.match(token, /^v1\.\d+\.[\w-]+$/);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: "congcong_family_access", value: token, url: origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
const errors = [], checks = [], blockedWrites = [];
await context.route("**/api/**", async route => {
  const request = route.request(), pathname = new URL(request.url()).pathname;
  if (pathname.startsWith("/api/progress/")) return route.fulfill({ json: { payload: null } });
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !pathname.startsWith("/api/english/six/")) {
    blockedWrites.push(`${request.method()} ${pathname}`);
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", e => errors.push(e.message));
await mkdir(output, { recursive: true });
async function screenshot(name) { await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false }); }
async function noOverflow() { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow"); }
try {
  const health = await context.request.get(`${origin}/api/health`);
  assert.equal(health.status(), 200);
  const indexResponse = await context.request.get(`${origin}/api/english/six/index`);
  assert.equal(indexResponse.status(), 200);
  const index = await indexResponse.json();
  assert.deepEqual(index.summary, localIndex.summary);
  assert.equal(index.resources.length, 1391);
  assert.deepEqual(index.units.map(u => u.number), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (let unit = 1; unit <= 8; unit++) {
    const response = await context.request.get(`${origin}/api/english/six/practice/${unit}`);
    assert.equal(response.status(), 200);
    const paper = await response.json();
    assert.equal(paper.questions.length, 66);
    assert.ok(paper.questions.every(q => !("answer" in q) && !("explanation" in q)));
  }
  checks.push("HTTPS health; full index; eight 66-question papers; no pre-submit answer leakage");
  const q = localPaper.questions[0];
  const grade = await context.request.post(`${origin}/api/english/six/practice/1`, { data: { id: q.id, response: q.answer } });
  assert.equal(grade.status(), 200);
  assert.equal((await grade.json()).correct, true);
  const empty = await context.request.post(`${origin}/api/english/six/practice/1`, { data: { id: q.id, response: "" } });
  assert.equal(empty.status(), 400);
  const audioResource = index.resources.find(r => r.title === "U1Story time" && r.extension === ".mp3");
  assert.ok(audioResource);
  const audioResponse = await context.request.get(`${origin}/api/english/six/resource/${audioResource.id}?page=1`);
  assert.equal(audioResponse.status(), 200);
  const audio = await audioResponse.json();
  const range = await context.request.get(`${origin}/api/english/six/media/${audio.asset}`, { headers: { Range: "bytes=0-99" } });
  assert.equal(range.status(), 206);
  assert.equal((await range.body()).length, 100);
  const invalidRange = await context.request.get(`${origin}/api/english/six/media/${audio.asset}`, { headers: { Range: "bytes=999999999999-" } });
  assert.equal(invalidRange.status(), 416);
  const anonymous = await browser.newContext();
  for (const route of ["index", `media/${audio.asset}`, "practice/1"]) {
    assert.equal((await anonymous.request.get(`${origin}/api/english/six/${route}`)).status(), 401);
  }
  await anonymous.close();
  checks.push("server-side grading; empty submission rejected; authenticated audio 206/416; anonymous 401");

  await page.goto(`${origin}/subjects/${subject}`);
  await page.getByRole("link", { name: /^六上/ }).waitFor();
  await screenshot("subject-desktop");
  await page.getByRole("link", { name: /^六上/ }).click();
  await page.getByRole("heading", { name: "六上", exact: true }).waitFor();
  await page.getByRole("button", { name: "Unit 8 Then and now", exact: true }).waitFor();
  await noOverflow(); await screenshot("hub-desktop");
  checks.push(...await checkEnglishSixOrganization(page, base, output));
  await page.getByRole("button", { name: /单元测评/ }).click();
  await page.getByRole("link", { name: /开始练习/ }).click();
  await page.getByRole("heading", { name: /What did you do last Friday/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: "提交答案", exact: true }).isDisabled(), true);
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await screenshot("practice-desktop");
  await page.getByRole("button", { name: "B took", exact: true }).click();
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByText("回答正确", { exact: true }).waitFor();
  await screenshot("feedback-desktop");
  await page.reload();
  await page.getByText("回答正确", { exact: true }).waitFor();
  await page.getByRole("button", { name: "下一题 →", exact: true }).click();
  await page.getByRole("heading", { name: /My sister practises/ }).waitFor();
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  checks.push("real English entry; single-question practice; post-submit feedback; next question; isolated progress reload");

  await page.goto(`${base}/resource/${audioResource.id}?unit=1&edition=new&stage=listen`);
  const player = page.locator("audio");
  await player.waitFor();
  await page.waitForFunction(() => { const a = document.querySelector("audio"); return a && Number.isFinite(a.duration) && a.duration > 0; });
  await page.getByRole("combobox", { name: "播放速度" }).selectOption("0.75");
  await player.evaluate(a => a.play());
  await page.waitForFunction(() => document.querySelector("audio")?.currentTime > 0.2);
  assert.equal(await player.evaluate(a => a.playbackRate), 0.75);
  await player.evaluate(a => a.pause());
  await screenshot("audio-desktop");
  const reading = index.resources.find(r => r.extension === ".pdf" && Object.keys(r.unitStarts ?? {}).length > 1 && r.status === "ready");
  assert.ok(reading);
  const unit = Object.keys(reading.unitStarts).find(u => reading.unitStarts[u] > 1);
  assert.ok(unit);
  await page.goto(`${base}/resource/${reading.id}?unit=${unit}&edition=new&stage=all`);
  const pagination = page.getByRole("combobox", { name: "页码" });
  await pagination.waitFor();
  await page.waitForFunction(expected => [...document.querySelectorAll('nav[aria-label="资料分页"] select')].at(-1)?.value === expected, String(reading.unitStarts[unit]));
  assert.equal(await pagination.inputValue(), String(reading.unitStarts[unit]));
  await noOverflow(); await screenshot("reader-desktop");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base);
    await page.getByRole("button", { name: "Unit 8 Then and now", exact: true }).waitFor();
    await noOverflow(); await screenshot(`hub-mobile-${width}`);
    await page.goto(`${base}/practice/8`);
    await page.getByRole("button", { name: "提交答案", exact: true }).waitFor();
    await noOverflow(); await screenshot(`practice-mobile-${width}`);
    await page.goto(`${base}/resource/${reading.id}?unit=${unit}&edition=new&stage=all`);
    await page.getByRole("combobox", { name: "页码" }).waitFor();
    await noOverflow(); await screenshot(`reader-mobile-${width}`);
  }
  checks.push("real audio duration/playback/speed; native chapter mapping; 390px/320px mobile layout");
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedWrites, []);
  const result = { checks, errors, blockedWrites, studentDatabaseWrites: 0 };
  await writeFile(path.join(output, "report.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser.close();
}
