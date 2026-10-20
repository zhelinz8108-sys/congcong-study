import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

// Exercise mixed archived content without reading or changing production data.
const cwd = process.cwd(), mode = process.env.NODE_ENV;
const fixture = mkdtempSync(path.join(tmpdir(), "six-new-only-"));
const root = path.join(fixture, "content/english-six");
const json = (file, value) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), JSON.stringify(value));
};
const meta = (id, edition) => ({ id, edition, title: `Unit 1 ${edition === "new" ? "Try your best" : "The king's new clothes"}`,
  units: [1], stage: "practice", extension: ".pdf", size: 10, pageCount: 1, paths: [`Unit 1 ${edition}.pdf`], status: "ready" });
const current = meta("111111111111", "new"), retired = meta("222222222222", "legacy");
const assetIds = ["a", "b", "c", "d"].map(value => value.repeat(32));
const resource = (meta, asset, image) => ({ id: meta.id, meta, asset, reference: false,
  pages: [{ title: "第 1 页", blocks: [{ kind: "image", asset: image }] }] });
const question = (source) => ({ id: `sx-${source}-333333333333`, topic: "Past tense", kind: "fill", prompt: "He ______ (want) to act.",
  context: "", options: [], sourcePage: 1, sourceBlock: 0, accepted: [["wanted"]], answer: "wanted", explanation: "Use the past tense.", grading: "exact" });
const entry = (source, edition, suffix) => ({ id: `${source}-${suffix}`, sourceId: source, edition, unit: 1,
  stage: "practice", title: "Past tense", sourceTitle: "Unit 1 practice", page: 1, questionCount: 1 });
const activePaper = entry(current.id, "new", "aaaaaaaa"), retiredPaper = entry(retired.id, "legacy", "bbbbbbbb");
const mismatchedPaper = entry(retired.id, "new", "cccccccc");
json("index.json", { version: 1, units: Array.from({ length: 8 }, (_, i) => ({ number: i + 1, title: i ? `New unit ${i + 1}` : "Try your best", legacyTitle: "Old unit" })),
  resources: [current, retired], summary: { sourceFiles: 2, includedFiles: 2, uniqueResources: 2, practiceQuestions: 528, statuses: { ready: 2 }, assetBytes: 40 } });
json(`resources/${current.id}.json`, resource(current, assetIds[0], assetIds[1]));
json(`resources/${retired.id}.json`, { ...resource(retired, assetIds[2], assetIds[3]),
  pages: [{ blocks: [{ kind: "image", asset: assetIds[3] }, { kind: "image", asset: assetIds[1] }] }] });
json("assets.private.json", Object.fromEntries(assetIds.map(id => [id, { file: `assets/${id}.png`, extension: ".png", size: 10 }])));
json("bank/index.json", { version: 1, complete: false, auditedQuestionLowerBound: 3, existingQuestionCount: 528,
  questionCount: 3, papers: [activePaper, retiredPaper, mismatchedPaper] });
for (const paper of [activePaper, retiredPaper, mismatchedPaper]) json(`bank/papers/${paper.id}.json`, { ...paper, questions: [question(paper.sourceId)] });
json("bank/lookup.private.json", { [question(current.id).id]: activePaper.id, [question(retired.id).id]: retiredPaper.id });
for (let unit = 1; unit <= 8; unit++) json(`practice/${unit}.json`, { unit, sourceId: current.id, title: "New unit assessment", questions: [] });

try {
  process.chdir(fixture);
  process.env.NODE_ENV = "production";
  const server = await loadHolidayTestModule("src/server/english-six.ts");
  const bank = await loadHolidayTestModule("src/server/english-six-bank.ts");
  const practice = await loadHolidayTestModule("src/server/english-six-practice.ts");
  const index = server.englishSixIndex();
  assert.deepEqual(index.resources.map(r => r.id), [current.id]);
  assert.equal(index.summary.uniqueResources, 1);
  assert.equal(index.summary.includedFiles, 1);
  assert.deepEqual(index.summary.statuses, { ready: 1 });
  assert.equal(server.englishSixResourcePage(retired.id, 1), undefined);
  assert.equal(server.englishSixResource(current.id).meta.edition, "new");
  assert.ok(server.englishSixAsset(assetIds[0]), "new original remains available");
  assert.ok(server.englishSixAsset(assetIds[1]), "media shared by both editions remains available");
  for (const id of assetIds.slice(2)) assert.equal(server.englishSixAsset(id), undefined, "retired-only media is unavailable");
  assert.equal(server.englishSixAsset("../index.json"), undefined);
  const bankIndex = bank.englishSixBankIndex();
  assert.deepEqual(bankIndex.papers, [activePaper]);
  assert.equal(bankIndex.questionCount, 1);
  for (const paper of [retiredPaper, mismatchedPaper]) assert.equal(bank.englishSixBankPublicPaper(paper.id), undefined);
  assert.equal(bank.englishSixBankGrade(question(retired.id).id, "wanted"), undefined);
  assert.equal(bank.englishSixBankGrade(question(current.id).id, "wanted").correct, true);
  assert.equal(bank.englishSixBankGrade(question(current.id).id, "want").correct, false);
  const publicPaper = bank.englishSixBankPublicPaper(activePaper.id);
  for (const key of ["answer", "accepted", "explanation"]) assert.ok(!JSON.stringify(publicPaper).includes(`"${key}":`));
  assert.equal(practice.englishSixResourcePractice(retired.id), undefined);
  assert.ok(practice.englishSixInteractiveIndex().resources.every(r => r.edition === "new"));
  assert.equal(JSON.parse(readFileSync(path.join(root, `resources/${retired.id}.json`))).meta.edition, "legacy", "archived media and learning history are not deleted");

  const origin = process.env.ENGLISH_SIX_QA_ORIGIN;
  if (origin) {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
    const runtime = process.argv.find(arg => arg.startsWith("--playwright="))?.slice(13);
    const { chromium } = await import(runtime ? pathToFileURL(runtime).href : "playwright");
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    try {
      const context = await browser.newContext();
      const family = await loadHolidayTestModule("src/lib/family-access.ts");
      await context.addCookies([{ name: family.FAMILY_ACCESS_COOKIE, value: family.createFamilyAccessToken(), url: origin }]);
      const errors = [], writes = [];
      await context.route("**/api/**", route => {
        const request = route.request(), url = new URL(request.url());
        if (!["GET", "HEAD"].includes(request.method())) { writes.push(url.pathname); return route.abort(); }
        if (url.pathname === "/api/english/six/index") return route.fulfill({ json: index });
        if (url.pathname === "/api/english/six/bank") return route.fulfill({ json: bankIndex });
        if (url.pathname === `/api/english/six/bank/${activePaper.id}`) return route.fulfill({ json: publicPaper });
        if (url.pathname.startsWith("/api/english/six/")) return route.fulfill({ status: 404, body: "Not found" });
        if (url.pathname === "/api/english/locked") return route.fulfill({ json: { records: {} } });
        return route.fulfill({ json: { payload: null } });
      });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      const base = `${origin}/subjects/qa-english/english/six`;
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}?edition=legacy&unit=1&stage=all`);
        await page.getByRole("heading", { name: "Unit 1 · Try your best", exact: true }).waitFor();
        await page.waitForURL(url => url.searchParams.get("edition") === "new");
        assert.equal(await page.getByRole("button", { name: "旧版参考" }).count(), 0);
        assert.ok(!(await page.locator("main").innerText()).includes("The king's new clothes"));
        assert.equal(await page.getByRole("navigation", { name: "单元", exact: true }).getByRole("button").count(), 8);
        if (width === 1440) await page.screenshot({ path: path.join(tmpdir(), "english-six-new-only-desktop.png"), fullPage: true });
        await page.getByRole("button", { name: /^整册与综合/ }).click();
        await page.getByRole("heading", { name: "整册与跨单元资料" }).waitFor();
        await page.getByRole("button", { name: /^期中期末/ }).click();
        await page.getByRole("heading", { name: "期中期末复习与测评" }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.goto(`${base}/bank?edition=legacy&unit=1`);
        await page.getByRole("link", { name: /Past tense/ }).waitFor();
        await page.getByRole("link", { name: /Past tense/ }).click();
        await page.locator(`[data-question-prompt="${question(current.id).id}"]`).waitFor();
        assert.equal(await page.getByRole("textbox", { name: "你的答案", exact: true }).isEnabled(), true);
      }
      await page.goto(`${base}/resource/${retired.id}`);
      await page.locator("main [role=alert]").waitFor();
      await page.goto(`${base}/bank/${retiredPaper.id}`);
      await page.locator("main [role=alert]").waitFor();
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, []);
      console.log("PASS: desktop/390/320px; legacy bookmark opens new units; collection navigation; new bank practice; retired links show unavailable; no student writes");
    } finally { await browser.close(); }
  }
  console.log("PASS: new-only catalog/counts/bank; retired readers/grading/media blocked; shared assets retained; new grading and answer privacy; production caches; archived files untouched");
} finally {
  process.chdir(cwd);
  if (mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = mode;
  rmSync(fixture, { recursive: true, force: true });
}
