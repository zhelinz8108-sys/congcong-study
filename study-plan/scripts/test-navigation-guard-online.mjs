import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = process.argv.find(a => a.startsWith("--playwright="))?.slice(13);
const { chromium } = runtime ? await import(pathToFileURL(runtime).href) : await import("playwright");
const origin = "https://congcong-study.cn";
const math = "/subjects/4ea6b4fe-bfd3-440f-b780-6d71c2011609";
const gradeSix = `${math}/math/grade-6`;
const before = process.argv.includes("--before");
const output = path.join(app, "tmp/navigation-guard-qa");
await mkdir(output, { recursive: true });
const code = "const{createHmac}=require('node:crypto');const s=(process.env.FAMILY_ACCESS_SECRET||process.env.FAMILY_ACCESS_PASSWORD||'').trim();if(!s)process.exit(1);const p='v1.'+(Date.now()+900000);process.stdout.write(p+'.'+createHmac('sha256',s).update(p).digest('base64url'));";
const remote = `set -e; cd /www/study-plan; set -a; . /etc/study-plan.env; set +a; node --env-file=.env.local -e "eval(Buffer.from('${Buffer.from(code).toString("base64")}', 'base64').toString())"`;
const token = execFileSync("ssh", ["-i", path.join(path.dirname(app), ".deploy-keys/english-six-20261011"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "ubuntu@124.223.31.175", remote], { encoding: "utf8", timeout: 30000 }).trim();
assert.match(token, /^v1\.\d+\.[\w-]+$/);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
await context.addCookies([{ name: "congcong_family_access", value: token, url: origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
await context.route("**/api/**", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort());
const errors = [], checks = [];
const page = await context.newPage();
page.on("pageerror", e => errors.push(e.message));
const downloads = [];
page.on("download", download => downloads.push(download.suggestedFilename()));
try {
  const ordinary = await context.request.get(`${origin}${gradeSix}`);
  assert.equal(ordinary.status(), 200);
  assert.match(ordinary.headers()["content-type"], /^text\/html/);
  const malformed = await context.request.get(`${origin}${gradeSix}?navigation-check=${Date.now()}`, { headers: { RSC: "1", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document", Accept: "text/html" } });
  assert.equal(malformed.status(), 200);
  assert.match(malformed.headers()["content-type"], before ? /^text\/x-component/ : /^text\/html/);
  const prefetch = await context.request.get(`${origin}${gradeSix}?_rsc=navigation-check`, { headers: { RSC: "1", "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_tree", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" } });
  assert.equal(prefetch.status(), 200);
  assert.match(prefetch.headers()["content-type"], /^text\/x-component/);
  if (!before) {
    for (const navigationHeaders of [
      { "Sec-Fetch-Mode": "navigate" },
      { "Sec-Fetch-Dest": "document" },
      { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document", "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_tree", "Next-Router-State-Tree": "invalid-restored-state" },
    ]) {
      const response = await context.request.get(`${origin}${gradeSix}?_rsc=restored-navigation`, { headers: { RSC: "1", ...navigationHeaders } });
      assert.equal(response.status(), 200);
      assert.match(response.headers()["content-type"], /^text\/html/);
      assert.match(await response.text(), /六年级数学/);
    }
    checks.push("Restored navigation markers and stale _rsc URL cannot replace HTML with internal data");
  }
  checks.push("Document request returns HTML; legitimate RSC prefetch stays text/x-component");
  await page.setExtraHTTPHeaders({ RSC: "1" });
  if (before) {
    const response = await page.goto(`${origin}${gradeSix}?navigation-check=${Date.now()}`);
    assert.match(response.headers()["content-type"], /^text\/x-component/);
    assert.equal(await page.locator("h1").count(), 0);
    checks.push("Navigation carrying RSC marker receives internal text instead of the grade-six webpage");
  } else {
    const response = await page.goto(`${origin}${gradeSix}?navigation-check=${Date.now()}`, { waitUntil: "domcontentloaded" });
    assert.match(response.headers()["content-type"], /^text\/html/);
    await page.getByRole("heading", { name: "六年级数学", exact: true }).waitFor();
    assert.deepEqual(downloads, []);
    await page.screenshot({ path: path.join(output, "grade-six-mobile.png") });
    await page.setExtraHTTPHeaders({});
    await page.goto(`${origin}${math}`);
    await page.getByRole("link", { name: /^六年级/ }).click();
    await page.getByRole("heading", { name: "六年级数学", exact: true }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: "六年级数学", exact: true }).waitFor();
    await page.goBack();
    await page.getByRole("link", { name: /^六年级/ }).waitFor();
    await page.goto(`${origin}/?navigation-check=${Date.now()}`);
    await page.getByRole("link", { name: /英语/ }).waitFor();
    await page.screenshot({ path: path.join(output, "home-mobile.png") });
    assert.deepEqual(downloads, []);
    checks.push("No unwanted downloads; direct grade-six navigation; SPA links; refresh; back; home");
    const anonymous = await browser.newContext();
    const locked = await anonymous.request.get(`${origin}/api/subjects`, { headers: { RSC: "1", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" } });
    assert.equal(locked.status(), 401);
    const login = await anonymous.newPage();
    await login.setExtraHTTPHeaders({ RSC: "1" });
    const loginResponse = await login.goto(`${origin}/?navigation-check=${Date.now()}`);
    assert.match(loginResponse.headers()["content-type"], /^text\/html/);
    await login.getByRole("heading", { name: "聪聪学习计划", exact: true }).waitFor();
    await login.getByText("访问密码", { exact: true }).waitFor();
    await login.screenshot({ path: path.join(output, "new-device-login.png") });
    await anonymous.close();
    checks.push("New device shows password form; login protection unchanged");
    assert.deepEqual(errors, []);
  }
  const report = { stage: before ? "before" : "after", checks, errors, downloads, studentDatabaseWrites: 0 };
  await writeFile(path.join(output, `${report.stage}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); await browser.close(); }
