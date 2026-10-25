import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const origin = argument("origin") ?? process.env.ENGLISH_SIX_KNOWLEDGE_QA_ORIGIN ?? "http://127.0.0.1:3038";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "Knowledge browser checks only target a local isolated app");
const bookFile = argument("book") ?? process.env.ENGLISH_SIX_KNOWLEDGE_QA_BOOK;
assert.ok(bookFile, "Pass --book=/path/to/the/local-reviewed-or-synthetic-book.json used by the isolated server");
const book = JSON.parse(await readFile(bookFile, "utf8"));
const { assertEnglishSixKnowledgeBook } = await loadHolidayTestModule("src/lib/english-six-knowledge.ts");
assertEnglishSixKnowledgeBook(book);
const family = await loadHolidayTestModule("src/lib/family-access.ts");
assert.ok(family.isFamilyAccessConfigured(), "Set the disposable local FAMILY_ACCESS_PASSWORD and FAMILY_ACCESS_SECRET before testing auth");
const runtime = argument("playwright");
const { chromium } = await import(runtime ? pathToFileURL(runtime).href : "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const output = argument("output") ?? path.join(appRoot, "tmp/english-six-knowledge-browser");
await mkdir(output, { recursive: true });
const subject = "qa-english-knowledge", home = `${origin}/subjects/${subject}`, base = `${home}/english/six-knowledge`;
const errors = [], writes = [], pdfRequests = [], checks = [];
const normalize = value => value.replace(/\s+/gu, " ").trim();
const inlineText = runs => runs.map(run => run.text).join("");
const paragraphText = block => block.kind === "paragraph" ? [inlineText(block.runs)] : block.kind === "callout" ? block.paragraphs.map(inlineText) : [];
const ipaRuns = unit => unit.sections.flatMap(section => section.blocks.flatMap(block => block.kind === "paragraph" ? block.runs : block.kind === "callout" ? block.paragraphs.flat() : block.kind === "table" ? [...(block.headers ?? []), ...block.rows.flat()].flat() : [])).filter(run => run.ipa).map(run => run.text);
const expectedTotals = book.units.reduce((total, unit) => ({
  sections: total.sections + unit.sections.length,
  blocks: total.blocks + unit.sections.reduce((n, section) => n + section.blocks.length, 0),
  tables: total.tables + unit.sections.reduce((n, section) => n + section.blocks.filter(block => block.kind === "table").length, 0),
  ipa: total.ipa + ipaRuns(unit).length,
}), { sections: 0, blocks: 0, tables: 0, ipa: 0 });

function attachReadOnlyGuards(context) {
  return context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) { writes.push({ method: request.method(), pathname: url.pathname }); return route.abort(); }
    if (/\.(?:pdf|docx?)(?:$|[?#])/i.test(url.href)) pdfRequests.push(url.pathname);
    if (url.origin === new URL(origin).origin && url.pathname === `/api/subjects/${subject}`) return route.fulfill({ json: { id: subject, name: "英语", color: "#16a34a", units: [], totalWords: 0, dueCount: 0 } });
    if (url.origin === new URL(origin).origin && url.pathname.startsWith("/api/progress/")) return route.fulfill({ json: { payload: null } });
    return route.continue();
  });
}
async function noOverflow(page, label) {
  const result = await page.evaluate(() => {
    const scope = document.querySelector("[data-knowledge-reader], [data-knowledge-hub]");
    const bad = scope ? [...scope.querySelectorAll("p,h1,h2,h3,h4,th,td,dt,dd")].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2;
    }).map(element => ({ tag: element.tagName, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })) : [];
    return { document: document.documentElement.scrollWidth <= innerWidth + 1, bad };
  });
  assert.ok(result.document, `${label}: document has horizontal overflow`);
  assert.deepEqual(result.bad, [], `${label}: native text/table cell has horizontal overflow`);
}
async function singleColumn(locator, label) {
  const boxes = await locator.evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, bottom: r.bottom }; }));
  assert.ok(boxes.length > 1, `${label}: entries missing`);
  boxes.forEach((box, index) => {
    assert.ok(Math.abs(box.x - boxes[0].x) <= 1 && Math.abs(box.width - boxes[0].width) <= 1, `${label}: content must use one full column`);
    if (index) assert.ok(box.y >= boxes[index - 1].bottom - 1, `${label}: entries must not sit side by side`);
  });
}
async function assertNativeContent(page, unit) {
  const article = page.getByRole("article", { name: `Unit ${unit.number} 知识点正文`, exact: true });
  await article.waitFor();
  assert.equal(await article.locator("iframe,embed,object,canvas,img").count(), 0, "Knowledge must use native text and tables");
  const actual = await article.locator("[data-knowledge-section]").evaluateAll(sections => sections.map(section => ({
    id: section.id, text: section.innerText, headings: [...section.querySelectorAll("h2,h3,h4")].map(node => node.textContent),
    tables: [...section.querySelectorAll("table")].map(table => [...table.rows].map(row => [...row.cells].map(cell => (cell.querySelector("[data-knowledge-cell]") ?? cell).textContent))),
  })));
  assert.equal(actual.length, unit.sections.length, `Unit ${unit.number}: every section is rendered`);
  for (const [index, expected] of unit.sections.entries()) {
    const shown = actual[index];
    assert.equal(shown.id, expected.id, `Unit ${unit.number}: section order/id`);
    assert.ok(shown.headings.map(normalize).includes(normalize(expected.title)), `${expected.id}: section title missing`);
    for (const block of expected.blocks) {
      if (block.kind === "heading") assert.ok(shown.headings.map(normalize).includes(normalize(block.text)), `${expected.id}: native heading missing`);
      for (const text of paragraphText(block)) assert.ok(normalize(shown.text).includes(normalize(text)), `${expected.id}: paragraph or example was omitted/truncated`);
    }
    const expectedTables = expected.blocks.filter(block => block.kind === "table").map(block => [...(block.headers ? [block.headers] : []), ...block.rows].map(row => row.map(cell => normalize(inlineText(cell)))));
    assert.ok(JSON.stringify(shown.tables.map(table => table.map(row => row.map(normalize)))) === JSON.stringify(expectedTables), `${expected.id}: native table cells must preserve full source text`);
  }
  const shownIpa = (await article.locator("[data-ipa]").allTextContents()).map(normalize);
  for (const ipa of ipaRuns(unit)) assert.ok(shownIpa.includes(normalize(ipa)), `Unit ${unit.number}: IPA must remain native marked text`);
  assert.ok(!(await article.innerText()).includes("\ufffd"), `Unit ${unit.number}: replacement glyph in rendered text`);
  await singleColumn(article.locator("[data-knowledge-section]"), `Unit ${unit.number} sections`);
}
function uniqueNeedle(unit) {
  const texts = unit.sections.flatMap(section => section.blocks.flatMap(paragraphText));
  const longest = texts.flatMap(text => text.match(/[\p{L}\p{M}\p{N} ，。:;／/()ˈˌː]+/gu) ?? []).sort((a, b) => b.length - a.length)[0];
  assert.ok(longest?.length >= 20, `Unit ${unit.number}: fixture needs a meaningful paragraph for auth leakage check`);
  return longest.slice(0, Math.min(48, longest.length));
}
async function authChecks() {
  const anonymous = await browser.newContext();
  try {
    for (const suffix of ["", ...book.units.map(unit => `/${unit.number}`)]) {
      const response = await anonymous.request.get(base + suffix);
      assert.equal(response.status(), 200, "Anonymous pages are handled by the root login gate");
      const html = await response.text();
      assert.match(html, /访问密码|Family Access/, "Anonymous page must show login");
      for (const unit of book.units) assert.ok(!html.includes(uniqueNeedle(unit)), `Anonymous HTML leaked Unit ${unit.number} source text`);
      const rsc = await anonymous.request.get(base + suffix, { headers: { RSC: "1", "Next-Router-Prefetch": "1" } });
      assert.equal(rsc.status(), 200);
      const payload = await rsc.text();
      for (const unit of book.units) assert.ok(!payload.includes(uniqueNeedle(unit)), `Anonymous RSC leaked Unit ${unit.number} source text`);
    }
    const invalid = await browser.newContext();
    try {
      await invalid.addCookies([{ name: family.FAMILY_ACCESS_COOKIE, value: "v1.9999999999999.invalid", url: origin }]);
      const denied = await invalid.request.get(`${base}/1`);
      assert.match(await denied.text(), /访问密码|Family Access/);
    } finally { await invalid.close(); }
    checks.push("All 9 routes protect anonymous HTML/RSC; invalid auth token rejected");
  } finally { await anonymous.close(); }
}
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await attachReadOnlyGuards(context);
await context.addCookies([{ name: family.FAMILY_ACCESS_COOKIE, value: family.createFamilyAccessToken(), url: origin }]);
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
try {
  await authChecks();
  await page.goto(home);
  const entry = page.getByRole("link", { name: /^六上知识点/ });
  await entry.waitFor();
  assert.equal(await entry.getAttribute("href"), `/subjects/${subject}/english/six-knowledge`);
  const order = await page.evaluate(({ knowledge, grammar, six }) => {
    const fresh = document.querySelector(`a[href="${knowledge}"]`), previous = document.querySelector(`a[href="${grammar}"]`), old = document.querySelector(`a[href="${six}"]`);
    return !!fresh && !!previous && !!old && !!previous.parentElement?.nextElementSibling?.contains(fresh);
  }, { knowledge: `/subjects/${subject}/english/six-knowledge`, grammar: `/subjects/${subject}/grammar-guide`, six: `/subjects/${subject}/english/six` });
  assert.ok(order, "New knowledge entry must follow Grammar Guide immediately, retaining the existing Six entry");
  await entry.click();
  await page.locator("[data-knowledge-hub]").waitFor();
  checks.push("English homepage knowledge entry immediately follows Grammar Guide; existing Six retained");
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1000 : 844 });
    await page.goto(base);
    const directory = page.getByRole("navigation", { name: "六上知识点单元目录", exact: true });
    await directory.waitFor();
    const cards = directory.locator("a[data-unit]");
    assert.equal(await cards.count(), 8);
    for (const [index, unit] of book.units.entries()) {
      assert.equal(await cards.nth(index).getAttribute("data-unit"), String(unit.number));
      assert.equal(await cards.nth(index).getAttribute("href"), `/subjects/${subject}/english/six-knowledge/${unit.number}`);
      assert.ok((await cards.nth(index).innerText()).includes(unit.title));
    }
    await singleColumn(cards, `${width}px unit directory`);
    await noOverflow(page, `${width}px directory`);
    await page.screenshot({ path: path.join(output, `directory-${width}.png`), fullPage: false });
    for (const unit of book.units) {
      await page.goto(`${base}/${unit.number}`);
      await page.locator(`[data-knowledge-reader][data-unit="${unit.number}"]`).waitFor();
      const selection = page.getByRole("navigation", { name: "选择单元", exact: true });
      assert.equal(await selection.getByRole("link").count(), 8);
      assert.equal(await selection.locator('[aria-current="page"]').getAttribute("href"), `/subjects/${subject}/english/six-knowledge/${unit.number}`);
      await assertNativeContent(page, unit);
      const chapters = page.getByRole("navigation", { name: "本单元章节", exact: true });
      const navigationBox = await chapters.boundingBox(), articleBox = await page.getByRole("article", { name: `Unit ${unit.number} 知识点正文`, exact: true }).boundingBox();
      assert.ok(navigationBox && articleBox && articleBox.y >= navigationBox.y + navigationBox.height - 1, "Chapter navigation must be above the native content");
      assert.equal(await chapters.getByRole("link").count(), unit.sections.length);
      for (const section of [unit.sections[0], unit.sections.at(-1)]) {
        await chapters.locator(`a[href="#${section.id}"]`).click();
        await page.waitForFunction(id => {
          const target = document.getElementById(id);
          if (!target) return false;
          const box = target.getBoundingClientRect();
          return box.top >= 0 && box.top < innerHeight * .8;
        }, section.id);
        assert.equal(decodeURIComponent(new URL(page.url()).hash), `#${section.id}`);
      }
      const adjacent = page.getByRole("navigation", { name: "前后单元", exact: true });
      const previous = adjacent.locator('a[rel="prev"]'), next = adjacent.locator('a[rel="next"]');
      assert.equal(await previous.count(), unit.number > 1 ? 1 : 0);
      assert.equal(await next.count(), unit.number < 8 ? 1 : 0);
      if (unit.number > 1) assert.equal(await previous.getAttribute("href"), `/subjects/${subject}/english/six-knowledge/${unit.number - 1}`);
      if (unit.number < 8) assert.equal(await next.getAttribute("href"), `/subjects/${subject}/english/six-knowledge/${unit.number + 1}`);
      await noOverflow(page, `${width}px Unit ${unit.number}`);
      if (unit.number === 1) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, `unit-1-${width}.png`), fullPage: false });
        const table = page.locator("[data-knowledge-reader] table").first();
        if (await table.count()) { await table.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, `table-1-${width}.png`), fullPage: false }); }
      }
    }
    checks.push(`${width}px: 8 complete native units, semantic tables/IPA, section anchors, previous/next, no horizontal overflow`);
  }
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1000 : 844 });
    await page.goto(`${base}/1`);
    const paragraph = page.getByRole("article", { name: "Unit 1 知识点正文", exact: true }).locator("p").first();
    await paragraph.waitFor();
    const initial = await paragraph.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    const larger = page.getByRole("button", { name: "增大字号", exact: true });
    for (let step = 0; step < 5; step++) await larger.click();
    assert.equal(await page.getByLabel("当前字号", { exact: true }).innerText(), "150%");
    assert.equal(await larger.isDisabled(), true);
    const enlarged = await paragraph.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    assert.ok(Math.abs(enlarged / initial - 1.5) < .02, "Native paragraphs must actually scale to 150%");
    await noOverflow(page, `${width}px Unit 1 at 150% text size`);
    await page.screenshot({ path: path.join(output, `large-text-${width}.png`), fullPage: false });
  }
  checks.push("150% native font scaling preserves desktop and 390/320 layout");
  await page.goto(`${base}/1`);
  const next = page.getByRole("navigation", { name: "前后单元", exact: true }).locator('a[rel="next"]');
  await next.click(); await page.locator('[data-knowledge-reader][data-unit="2"]').waitFor();
  await page.getByRole("navigation", { name: "前后单元", exact: true }).locator('a[rel="prev"]').click();
  await page.locator('[data-knowledge-reader][data-unit="1"]').waitFor();
  checks.push("Previous/next links navigate to the correct unit");
  for (const invalid of ["0", "9", "01", "not-a-unit"]) {
    const response = await context.request.get(`${base}/${invalid}`);
    assert.equal(response.status(), 404, "Invalid unit routes must not select a fallback lesson");
  }
  checks.push("Invalid unit routes return 404");
  assert.equal(await page.locator("iframe,embed,object").count(), 0);
  assert.deepEqual(writes, [], "Reading must not send student-record mutations");
  assert.deepEqual(pdfRequests, [], "Native reading must not depend on PDF/Office assets");
  assert.deepEqual(errors, [], "Browser errors");
  const report = { status: "pass", units: 8, ...expectedTotals, viewportChecks: 24, widths: [1280, 390, 320], checks, errors, blockedMutations: writes, pdfRequests, studentRecordWrites: 0 };
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, output }));
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: false }).catch(() => {});
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ url: page.url(), errors, writes, pdfRequests }, null, 2));
  throw error;
} finally { await browser.close(); }
