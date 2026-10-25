import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const origin = option("origin") ?? "http://127.0.0.1:3038";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "Audio browser QA only targets an isolated local app");
const bookPath = option("book");
assert.ok(bookPath, "Pass the isolated server's local reviewed book with --book=");
const book = JSON.parse(await readFile(bookPath, "utf8"));
const family = await loadHolidayTestModule("src/lib/family-access.ts");
const { speechForRuns, chunkEnglishSpeech } = await loadHolidayTestModule("src/lib/english-six-knowledge-speech.ts");
assert.ok(family.isFamilyAccessConfigured(), "Use the disposable local access configuration");
const runtime = option("playwright");
const { chromium } = await import(runtime ? pathToFileURL(runtime).href : "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const output = option("output") ?? path.join(appRoot, "tmp/english-six-knowledge-audio-browser");
await mkdir(output, { recursive: true });
const base = `${origin}/subjects/qa-english-knowledge/english/six-knowledge`, errors = [], writes = [], checks = [];

// Nothing reaches an OS audio device. Native completion/error events are driven
// explicitly so the queue is tested independently of installed browser voices.
function installFakeSpeech({ mode = "english" } = {}) {
  const allVoices = [
    { voiceURI: "qa-zh", name: "Chinese default", lang: "zh-CN", default: true, localService: true },
    { voiceURI: "qa-en-us", name: "English US", lang: "en-US", default: false, localService: true },
    { voiceURI: "qa-en-gb", name: "English UK", lang: "en-GB", default: false, localService: true },
  ];
  const listeners = new Set(), utterances = [], calls = [];
  let voices = mode === "no-english" ? allVoices.slice(0, 1) : allVoices, active = null, paused = false;
  const fake = {
    getVoices: () => voices,
    get speaking() { return active !== null; },
    get pending() { return false; },
    speak(utterance) {
      active = utterance; paused = false; utterances.push(utterance);
      calls.push({ kind: "speak", index: utterances.length - 1 });
      queueMicrotask(() => utterance.onstart?.({ type: "start", utterance }));
    },
    cancel() {
      const old = active; active = null; paused = false; calls.push({ kind: "cancel" });
      // Some real engines emit end synchronously from cancel().
      old?.onend?.({ type: "end", utterance: old });
    },
    pause() { paused = true; calls.push({ kind: "pause" }); },
    resume() { paused = false; calls.push({ kind: "resume" }); },
    addEventListener(type, listener) { if (type === "voiceschanged") listeners.add(listener); },
    removeEventListener(type, listener) { if (type === "voiceschanged") listeners.delete(listener); },
  };
  class FakeUtterance { constructor(text) { this.text = text; this.lang = ""; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; } }
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: mode === "unsupported" ? undefined : fake });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: mode === "unsupported" ? undefined : FakeUtterance });
  window.__knowledgeAudioQA = {
    snapshot: () => ({ records: utterances.map(utterance => ({ text: utterance.text, lang: utterance.lang, voiceURI: utterance.voice?.voiceURI, rate: utterance.rate })), calls: [...calls], paused, active: active !== null }),
    end(index = utterances.length - 1) { const utterance = utterances[index]; if (active === utterance) active = null; utterance?.onend?.({ type: "end", utterance }); },
    error(index, error = "interrupted") { const utterance = utterances[index]; if (active === utterance) active = null; utterance?.onerror?.({ error, utterance }); },
    englishVoices() { voices = allVoices; for (const listener of listeners) listener({ type: "voiceschanged" }); },
  };
}
async function newContext(mode = "english", width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: width > 700 ? 1000 : 844 } });
  await context.addInitScript(installFakeSpeech, { mode });
  await context.addCookies([{ name: family.FAMILY_ACCESS_COOKIE, value: family.createFamilyAccessToken(), url: origin }]);
  await context.route("**/*", route => {
    if (!["GET", "HEAD"].includes(route.request().method())) { writes.push(route.request().method()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  return { context, page };
}
const panel = page => page.getByRole("region", { name: "英文朗读设置", exact: true });
const dock = page => page.locator('aside[aria-label="当前英文朗读"]');
const snapshot = page => page.evaluate(() => window.__knowledgeAudioQA.snapshot());
const finish = (page, index) => page.evaluate(index => window.__knowledgeAudioQA.end(index), index);
const stateText = page => panel(page).getByRole("status");
async function open(page, unit = 1) {
  await page.goto(`${base}/${unit}`); await panel(page).waitFor();
  if (await page.getByRole("combobox", { name: "英语发音", exact: true }).isEnabled()) {
    await page.waitForFunction(() => document.querySelector('select[aria-label="英语发音"]')?.options.length >= 1);
  }
}
async function stop(page) { await panel(page).getByRole("button", { name: "停止", exact: true }).click(); await dock(page).waitFor({ state: "detached" }); }
function itemsForBlock(block, id) {
  const item = (id, runs) => { const text = speechForRuns(runs).join("\n"); return text ? [{ id, text, chunks: chunkEnglishSpeech(text) }] : []; };
  if (block.kind === "heading") return [];
  if (block.kind === "paragraph") return item(`${id}-p`, block.runs);
  if (block.kind === "callout") return block.paragraphs.flatMap((runs, index) => item(`${id}-note-${index}`, runs));
  return [...(block.headers ?? []).flatMap((runs, index) => item(`${id}-h-${index}`, runs)), ...block.rows.flatMap((row, r) => row.flatMap((runs, c) => item(`${id}-r${r}-c${c}`, runs)))];
}
const unit = book.units[0], quick = unit.sections[0];
const sectionItems = quick.blocks.flatMap((block, index) => itemsForBlock(block, `${quick.id}-b${index}`));
const allItems = unit.sections.flatMap(section => section.blocks.flatMap((block, index) => itemsForBlock(block, `${section.id}-b${index}`)));
const groupEnd = quick.blocks.findIndex((block, index) => index > 0 && block.kind === "heading");
const groupItems = quick.blocks.slice(1, groupEnd).flatMap((block, index) => itemsForBlock(block, `${quick.id}-b${index + 1}`));
const wordId = sectionItems.find(item => item.text === "act")?.id;
assert.ok(wordId, "Reviewed fixture must contain the independently checked act example");
const wordButton = page => page.locator(`[data-speech-item="${wordId}"]`);
const groupButton = page => page.locator(`#${quick.id} [data-knowledge-group]`).first().getByRole("button", { name: "整组播放", exact: true });
async function expectRecordCount(page, count) { await page.waitForFunction(count => window.__knowledgeAudioQA.snapshot().records.length === count, count); }
function assertEnglish(record) {
  assert.match(record.lang, /^en(?:-|_|$)/i); assert.match(record.voiceURI, /^qa-en-/);
  assert.ok(!/[\u3400-\u9fff\u0250-\u02afːˈˌ]/u.test(record.text), "Chinese/IPA must not be spoken");
  assert.ok(!/\b(?:adj|adv|prep|pron|conj|num|n|v)\.(?:\s|$)/i.test(record.text), "POS labels must not be spoken");
}
const primary = await newContext(), page = primary.page;
try {
  await open(page);
  await page.waitForFunction(() => document.querySelector('select[aria-label="英语发音"]')?.options.length === 3);
  assert.equal((await snapshot(page)).records.length, 0, "No autoplay after mounting or loading voices");
  const voices = await page.getByRole("combobox", { name: "英语发音", exact: true }).locator("option").allTextContents();
  assert.ok(voices.every(text => !text.includes("Chinese")), "No Chinese voice is offered as an English fallback");
  await wordButton(page).click(); await expectRecordCount(page, 1); await stateText(page).filter({ hasText: "英文朗读中" }).waitFor();
  let record = (await snapshot(page)).records[0]; assert.equal(record.text, "act"); assert.equal(record.voiceURI, "qa-en-gb"); assertEnglish(record);
  await finish(page); await dock(page).waitFor({ state: "detached" });
  checks.push("No autoplay; word playback strips IPA, POS and Chinese; English UK voice selected over Chinese default");
  for (const expected of ["try one's best", "Please look at the blackboard.", "We try our best to help old people."]) {
    const item = allItems.find(item => item.text === expected);
    assert.ok(item, "Reviewed fixture needs an independently checked phrase and complete example");
    const count = (await snapshot(page)).records.length;
    await page.locator(`[data-speech-item="${item.id}"]`).click(); await expectRecordCount(page, count + 1);
    const spoken = (await snapshot(page)).records.at(-1); assert.equal(spoken.text, expected); assertEnglish(spoken);
    await stop(page);
  }
  checks.push("Direct phrase and complete English example buttons preserve their text without the Chinese explanation");

  const detail = unit.sections.find(section => section.id.endsWith("-detail"));
  const tableIndex = detail.blocks.findIndex(block => block.kind === "table");
  const tableStem = `${detail.id}-b${tableIndex}-r0-c`;
  assert.equal(await page.locator(`[data-speech-item="${tableStem}0"]`).count(), 1);
  for (const column of [1, 2, 3]) assert.equal(await page.locator(`[data-speech-item="${tableStem}${column}"]`).count(), 0, "POS, IPA-only and Chinese-only cells have no playback button");
  const tableBefore = (await snapshot(page)).records.length;
  await page.locator(`[data-speech-item="${tableStem}0"]`).click(); await expectRecordCount(page, tableBefore + 1);
  assert.equal((await snapshot(page)).records.at(-1).text, "act"); await stop(page);
  checks.push("Native table cells only expose meaningful English playback");

  let before = (await snapshot(page)).records.length;
  await groupButton(page).click(); await expectRecordCount(page, before + 1);
  assert.equal((await snapshot(page)).records.at(-1).text, "act");
  await finish(page); await expectRecordCount(page, before + 2);
  assert.equal((await snapshot(page)).records.at(-1).text, "poster");
  await panel(page).getByRole("button", { name: "暂停", exact: true }).click(); await stateText(page).filter({ hasText: "已暂停" }).waitFor();
  assert.equal((await snapshot(page)).paused, true);
  await finish(page); assert.equal((await snapshot(page)).records.length, before + 2, "An end event while paused must not start the next item");
  await panel(page).getByRole("button", { name: "继续", exact: true }).click(); await expectRecordCount(page, before + 3);
  assert.equal((await snapshot(page)).records.at(-1).text, "Mulan");
  await stop(page); before = (await snapshot(page)).records.length;
  await page.evaluate(() => window.__knowledgeAudioQA.end()); assert.equal((await snapshot(page)).records.length, before);
  checks.push("Group queue speaks one item at a time; pause/end/resume/stop preserve serial order");

  await page.locator(`#${quick.id}`).getByRole("button", { name: "整节播放", exact: true }).click();
  const start = (await snapshot(page)).records.length - 1;
  const chunks = sectionItems.flatMap(item => item.chunks);
  const boundary = groupItems.flatMap(item => item.chunks).length;
  for (let i = 0; i <= boundary; i++) {
    const current = (await snapshot(page)).records[start + i]; assert.ok(current.text === chunks[i], "Section queue must cross the group boundary in original source order"); assertEnglish(current);
    if (i < boundary) await finish(page);
  }
  await stop(page); checks.push("Whole-section playback advances across groups in source order without speaking explanations");

  await groupButton(page).click(); const oldIndex = (await snapshot(page)).records.length - 1;
  const another = sectionItems.find(item => item.id !== wordId && item.text === "poster");
  await page.locator(`[data-speech-item="${another.id}"]`).click();
  before = (await snapshot(page)).records.length;
  await page.evaluate(index => { window.__knowledgeAudioQA.end(index); window.__knowledgeAudioQA.error(index); }, oldIndex);
  assert.equal((await snapshot(page)).records.length, before, "Old end/error must not advance a newer queue");
  await stateText(page).filter({ hasText: "英文朗读中" }).waitFor();
  await page.getByRole("combobox", { name: "英文朗读语速", exact: true }).selectOption("0.75"); await expectRecordCount(page, before + 1);
  record = (await snapshot(page)).records.at(-1); assert.equal(record.rate, .75); assert.equal(record.text, "poster");
  await panel(page).getByRole("button", { name: "暂停", exact: true }).click(); before = (await snapshot(page)).records.length;
  await page.getByRole("combobox", { name: "英语发音", exact: true }).selectOption("qa-en-us");
  assert.equal((await snapshot(page)).records.length, before, "Changing voice while paused must not autoplay");
  await panel(page).getByRole("button", { name: "继续", exact: true }).click(); await expectRecordCount(page, before + 1);
  record = (await snapshot(page)).records.at(-1); assert.equal(record.voiceURI, "qa-en-us"); assert.equal(record.rate, .75);
  const staleIndex = (await snapshot(page)).records.length - 1, cancels = (await snapshot(page)).calls.filter(call => call.kind === "cancel").length;
  await page.getByRole("navigation", { name: "选择单元", exact: true }).getByRole("link", { name: /^Unit 2 / }).click();
  await page.locator('[data-knowledge-reader][data-unit="2"]').waitFor(); await dock(page).waitFor({ state: "detached" });
  assert.ok((await snapshot(page)).calls.filter(call => call.kind === "cancel").length > cancels, "Unit navigation must cancel speech");
  before = (await snapshot(page)).records.length; await finish(page, staleIndex); assert.equal((await snapshot(page)).records.length, before);
  checks.push("Rate/voice changes, paused preference changes, stale-event isolation and unit navigation cancellation");

  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1000 : 844 }); await open(page);
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "增大字号", exact: true }).click();
    assert.equal(await page.getByLabel("当前字号", { exact: true }).innerText(), "150%");
    await wordButton(page).click(); await dock(page).waitFor();
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 1000); });
    const top = page.getByRole("button", { name: "回到顶部", exact: true }); await top.waitFor();
    const a = await dock(page).boundingBox(), b = await top.boundingBox();
    const overlap = a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    assert.equal(!!overlap, false, `${width}px dock must not cover global back-to-top`);
    const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth > innerWidth + 1,
      content: [...document.querySelectorAll('[data-knowledge-reader] p,[data-knowledge-reader] td,[data-knowledge-reader] th')].filter(element => element.clientWidth > 0 && element.getBoundingClientRect().height > 0 && element.scrollWidth > element.clientWidth + 2).length }));
    assert.deepEqual(overflow, { page: false, content: 0 }, `${width}px audio controls and 150% text must not overflow`);
    await page.screenshot({ path: path.join(output, `active-audio-${width}.png`), fullPage: false });
    await page.locator(`[data-speech-item="${tableStem}0"]`).click();
    await page.screenshot({ path: path.join(output, `table-audio-${width}.png`), fullPage: false });
    await top.click(); await page.waitForFunction(() => scrollY < 10);
    await stop(page);
  }
  checks.push("1280/768/390/320 at 150%: paragraph/table buttons fit; active dock and global back-to-top remain usable");

  const unsupported = await newContext("unsupported");
  try {
    await open(unsupported.page); await stateText(unsupported.page).filter({ hasText: "不支持英文朗读" }).waitFor();
    assert.equal(await wordButton(unsupported.page).isDisabled(), true); assert.equal((await snapshot(unsupported.page)).records.length, 0);
  } finally { await unsupported.context.close(); }
  const missing = await newContext("no-english");
  try {
    await open(missing.page); await wordButton(missing.page).click();
    await stateText(missing.page).filter({ hasText: "英文语音尚未就绪" }).waitFor({ timeout: 6000 });
    assert.equal((await snapshot(missing.page)).records.length, 0, "Chinese voice must never substitute for unavailable English voice");
    await missing.page.evaluate(() => window.__knowledgeAudioQA.englishVoices());
    assert.equal((await snapshot(missing.page)).records.length, 0, "Late voices after an error need an explicit retry");
    await panel(missing.page).getByRole("button", { name: "重试", exact: true }).click(); await expectRecordCount(missing.page, 1);
    assertEnglish((await snapshot(missing.page)).records[0]);
  } finally { await missing.context.close(); }
  checks.push("Unsupported and missing-English-voice states explain the problem; late voices require explicit retry");
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  const report = { status: "pass", checks, errors, studentRecordWrites: 0, osAudioPlayed: false };
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, output }));
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: false }).catch(() => {});
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ url: page.url(), errors, writes, state: await snapshot(page).catch(() => null) }, null, 2));
  throw error;
} finally { await browser.close(); }
