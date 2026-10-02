import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Only the explicitly isolated local preview is allowed. No production URL,
// credentials, package installation or browser belonging to the user is used.
const PAGE_URL = "http://127.0.0.1:3005/subjects/4ea6b4fe-bfd3-440f-b780-6d71c2011609/national-day-math";
const CDP_URL = process.argv[2] ?? "http://127.0.0.1:9227";
const cdpAddress = new URL(CDP_URL);
assert.equal(cdpAddress.hostname, "127.0.0.1", "CDP must be loopback-only");
assert.equal(cdpAddress.protocol, "http:");
assert.equal(cdpAddress.port, "9227", "Use only the dedicated QA browser port");
const output = new URL("../../tmp/math-web-qa/", import.meta.url);
const storageKey = "study-plan-math:national-day:4ea6b4fe-bfd3-440f-b780-6d71c2011609:v1";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const findings = { url: PAGE_URL, checks: [], screenshots: [], expectedCloudErrors: 0, blockedRemoteRequests: [], runtimeExceptions: [] };
let browser;

class CDP {
  sequence = 0;
  pending = new Map();
  listeners = new Set();

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result);
      } else for (const listener of this.listeners) listener(message);
    });
  }

  send(method, params = {}, sessionId, timeout = 30000) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("QA browser connection closed"));
    }
    this.pending.clear();
    this.socket.close();
  }
}

async function connect() {
  let version;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${CDP_URL}/json/version`);
      if (response.ok) { version = await response.json(); break; }
    } catch { /* The independent browser may still be starting. */ }
    await delay(200);
  }
  assert.ok(version?.webSocketDebuggerUrl, "Dedicated headless browser must be running");
  const address = new URL(version.webSocketDebuggerUrl);
  assert.equal(address.hostname, "127.0.0.1");
  assert.equal(address.port, "9227");
  const socket = new WebSocket(address);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new CDP(socket);
}

try {
  await mkdir(output, { recursive: true });
  browser = await connect();
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  browser.listeners.add((event) => {
    if (event.sessionId !== sessionId) return;
    if (event.method === "Fetch.requestPaused") {
      const request = event.params.request;
      let local = false;
      try {
        const url = new URL(request.url);
        local = url.hostname === "127.0.0.1" && url.port === "3005";
      } catch { /* Reject unexpected destinations. */ }
      if (local) void send("Fetch.continueRequest", { requestId: event.params.requestId });
      else {
        findings.blockedRemoteRequests.push(request.url);
        void send("Fetch.failRequest", { requestId: event.params.requestId, errorReason: "BlockedByClient" });
      }
    }
    if (event.method === "Network.responseReceived" && event.params.response.url.includes("/api/progress/") && event.params.response.status === 500) findings.expectedCloudErrors++;
    if (event.method === "Runtime.exceptionThrown") {
      const details = event.params.exceptionDetails;
      findings.runtimeExceptions.push({ text: details.text, description: details.exception?.description, url: details.url, lineNumber: details.lineNumber, stackTrace: details.stackTrace });
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression, label, timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await delay(200);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
  async function screenshot(name) {
    await delay(200);
    const image = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    await writeFile(new URL(name, output), Buffer.from(image.data, "base64"));
    findings.screenshots.push(name);
  }
  async function scrollTo(selector, block = "start") {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:${JSON.stringify(block)}})`);
  }
  async function clickButton(selector, text) {
    const clicked = await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      const button = [...root.querySelectorAll('button')].find(item => item.textContent.includes(${JSON.stringify(text)}));
      if (!button || button.disabled) return false;
      button.click(); return true;
    })()`);
    assert.ok(clicked, `Button available: ${text}`);
  }
  async function fill(id, value) {
    const changed = await evaluate(`(() => {
      const input = document.getElementById(${JSON.stringify(`draft-${id}`)});
      if (!input || input.disabled) return false;
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.dispatchEvent(new Event('change', {bubbles:true}));
      return true;
    })()`);
    assert.ok(changed, `Draft input ready: ${id}`);
    await waitFor(`document.getElementById(${JSON.stringify(`draft-${id}`)}).value === ${JSON.stringify(value)}`, `controlled draft ${id}`);
  }
  async function layout(label) {
    const metrics = await evaluate(`(() => ({
      viewport: innerWidth,
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      offending: [...document.querySelectorAll('main *')].filter(item => {
        const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.right > innerWidth + 1;
      }).slice(0, 5).map(item => ({tag:item.tagName,text:item.textContent.slice(0,100)}))
    }))()`);
    assert.ok(Math.max(metrics.body, metrics.document) <= metrics.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(metrics)}`);
    findings.checks.push({ check: `${label} no horizontal overflow`, ...metrics });
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: PAGE_URL });
  await waitFor("document.querySelectorAll('[data-math-question]').length === 206 && !!document.querySelector('[data-national-day-math-book]')", "the complete native mathematics page");
  await waitFor("!!document.querySelector('#draft-diagnostic-001') && !document.querySelector('#draft-diagnostic-001').disabled", "local-fallback progress hydration");
  const initial = await evaluate(`({
    questions: document.querySelectorAll('[data-math-question]').length,
    examples: document.querySelectorAll('[data-question-category="example"]').length,
    quizzes: document.querySelectorAll('[data-math-question]:not([data-question-category="example"])').length,
    answers: document.querySelectorAll('[data-math-answer]').length,
    diagrams: document.querySelectorAll('[data-national-day-math-book] svg').length,
    embedded: document.querySelectorAll('iframe,embed,object,details').length,
    address: location.href
  })`);
  assert.deepEqual(initial, { questions: 206, examples: 117, quizzes: 89, answers: 206, diagrams: 7, embedded: 0, address: PAGE_URL });
  findings.checks.push({ check: "complete native content and default answers", ...initial });
  const colors = await evaluate(`(() => {
    const sections = [...document.querySelectorAll('[data-math-theme]')];
    return {
      themes: [...new Set(sections.map(section => section.dataset.mathTheme))],
      pageBackground: getComputedStyle(document.querySelector('main')).backgroundColor,
      chapterColors: ['u1', 'u2', 'u4', 'u6'].map(id => {
        const section = document.querySelector('#math-section-' + id);
        const examples = [...section.querySelectorAll('[data-question-category="example"]')];
        return { id, theme: section.dataset.mathTheme,
          first: getComputedStyle(examples[0]).backgroundColor,
          second: getComputedStyle(examples[1]).backgroundColor,
          title: getComputedStyle(section.querySelector('h3')).color };
      })
    };
  })()`);
  assert.equal(colors.themes.length, 6, 'all six chapter color families are rendered');
  assert.equal(colors.pageBackground, 'rgb(255, 255, 255)', 'page background remains white');
  assert.equal(new Set(colors.chapterColors.map(chapter => chapter.first)).size, 4, 'blue, violet, apricot and rose examples have visibly different backgrounds');
  for (const chapter of colors.chapterColors) {
    assert.notEqual(chapter.first, chapter.second, `${chapter.id}: examples alternate soft and white surfaces`);
    assert.equal(chapter.second, 'rgb(255, 255, 255)');
  }
  findings.checks.push({ check: 'six light chapter themes and alternating example colors', ...colors });
  await layout("desktop 1440");
  await screenshot("desktop-header.png");
  await scrollTo("#math-section-u1");
  await screenshot("desktop-calculation.png");
  await scrollTo("#math-section-u5 svg", "center");
  await screenshot("desktop-circle-diagram.png");
  await scrollTo('#math-section-u2 [data-question-category="example"]');
  await screenshot('desktop-violet-examples.png');
  await scrollTo('#math-section-u4 [data-question-category="example"]');
  await screenshot('desktop-apricot-examples.png');
  await scrollTo('#math-section-u6 [data-question-category="example"]');
  await screenshot('desktop-rose-examples.png');

  await scrollTo("#question-diagnostic-001", "center");
  await fill("diagnostic-001", "0.4");
  await clickButton("#question-diagnostic-001", "核对答案与步骤");
  await waitFor("document.querySelector('#question-diagnostic-001').textContent.includes('核对正确')", "automatic correct feedback");
  const automatic = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})).attempts['diagnostic-001']`);
  assert.equal(automatic.value, "0.4");
  assert.equal(automatic.checked, true);
  assert.equal(automatic.correct, true);
  findings.checks.push({ check: "diagnostic 1 automatic check", ...automatic });

  await clickButton('section[aria-label="国庆数学学习进度"]', "遮住自测答案");
  await waitFor("document.querySelectorAll('[data-math-answer]').length === 117", "global quiz-answer hiding, including previously checked quiz");
  assert.equal(await evaluate("!!document.querySelector('[data-math-answer=\"diagnostic-001\"]')"), false);
  findings.checks.push({ check: "all 89 quiz answers hidden; 117 example answers remain", answers: 117 });
  await clickButton('section[aria-label="国庆数学学习进度"]', "展开全部自测解答");
  await waitFor("document.querySelectorAll('[data-math-answer]').length === 206", "restoring all answers");

  const draft = "2×100=200平方分米；面积单位换算的进率是100。";
  await scrollTo("#question-diagnostic-010", "center");
  await fill("diagnostic-010", draft);
  await clickButton("#question-diagnostic-010", "核对答案与步骤");
  await waitFor("document.querySelector('#question-diagnostic-010').textContent.includes('请逐项对照参考解答')", "complex-answer self assessment");
  await clickButton("#question-diagnostic-010", "我已独立做对，并能解释");
  await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})).attempts['diagnostic-010'].selfRated === true`, "self-rated mastery persistence");
  await clickButton("#math-section-u1", "读完");
  const saved = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}))`);
  assert.equal(saved.attempts["diagnostic-010"].value, draft);
  assert.equal(saved.attempts["diagnostic-010"].correct, true);
  assert.equal(saved.attempts["diagnostic-010"].selfRated, true);
  assert.ok(saved.completedSections.includes("u1"));
  assert.equal(saved.lastSection, "u1");
  findings.checks.push({ check: "complex draft, self rating, completion and last section saved locally", attempt: saved.attempts["diagnostic-010"] });
  await delay(800);
  await send("Page.reload", { ignoreCache: true });
  await waitFor("!!document.querySelector('#draft-diagnostic-010') && !document.querySelector('#draft-diagnostic-010').disabled", "reload hydration");
  assert.equal(await evaluate("document.getElementById('draft-diagnostic-010').value"), draft);
  const reloaded = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}))`);
  assert.equal(reloaded.attempts["diagnostic-010"].correct, true);
  assert.equal(reloaded.attempts["diagnostic-010"].selfRated, true);
  assert.ok(reloaded.completedSections.includes("u1"));
  findings.checks.push({ check: "reload retains local draft, mastery and completed section", success: true });

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("window.scrollTo(0,0)");
  await layout("mobile 390");
  await screenshot("mobile-header.png");
  await scrollTo("#math-section-u5 svg", "center");
  await screenshot("mobile-circle-diagram.png");
  await scrollTo('#math-section-u6 [data-question-category="example"]');
  await screenshot('mobile-rose-example.png');
  await scrollTo("#national-day-math-end", "end");
  const footer = await evaluate(`(() => {
    const end = document.querySelector('#national-day-math-end');
    const rect = end.getBoundingClientRect();
    return { text: end.textContent, top: rect.top, bottom: rect.bottom, height: innerHeight, scroll: scrollY, total: document.documentElement.scrollHeight };
  })()`);
  assert.ok(footer.text.includes("已经读到全书最后了"));
  assert.ok(footer.top >= 0 && footer.bottom <= footer.height + 1, "complete footer visible at the long page end");
  assert.ok(footer.scroll > 10000, "the native long page has been traversed");
  await screenshot("mobile-end.png");
  findings.checks.push({ check: "long-page footer readable", ...footer });
  assert.equal(findings.blockedRemoteRequests.length, 0, "page attempted no external destinations");
  assert.equal(findings.runtimeExceptions.length, 0, "no uncaught browser runtime exceptions");
  assert.ok(findings.expectedCloudErrors > 0, "isolated unavailable preview database stays unavailable");
  findings.passed = true;
  console.log(JSON.stringify(findings, null, 2));
} catch (error) {
  findings.passed = false;
  findings.error = error.stack ?? String(error);
  console.error(findings.error);
  process.exitCode = 1;
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(new URL("browser-report.json", output), JSON.stringify(findings, null, 2));
  // This CDP endpoint belongs only to the independently launched QA profile.
  if (browser) {
    try { await browser.send("Browser.close", {}, undefined, 5000); } catch { /* Browser may close before sending its reply. */ }
    browser.close();
  }
}
