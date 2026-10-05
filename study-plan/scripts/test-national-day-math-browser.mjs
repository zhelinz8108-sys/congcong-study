import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

// Only the explicitly isolated local preview is allowed. No production URL,
// credentials, package installation or browser belonging to the user is used.
const PAGE_URL =
  "http://127.0.0.1:3005/subjects/4ea6b4fe-bfd3-440f-b780-6d71c2011609/national-day-math";
const CDP_URL = process.argv[2] ?? "http://127.0.0.1:9227";
const cdpAddress = new URL(CDP_URL);
assert.equal(cdpAddress.hostname, "127.0.0.1", "CDP must be loopback-only");
assert.equal(cdpAddress.protocol, "http:");
assert.equal(cdpAddress.port, "9227", "Use only the dedicated QA browser port");
const output = new URL("../../tmp/math-web-qa/", import.meta.url);
const storageKey =
  "study-plan-math:national-day:4ea6b4fe-bfd3-440f-b780-6d71c2011609:v1";
const day3Rubrics = JSON.parse(
  await readFile(
    new URL("../src/data/national-day-math-grading-day3.json", import.meta.url),
    "utf8",
  ),
);
const sourceBook = JSON.parse(
  await readFile(
    new URL("../src/data/national-day-math.json", import.meta.url),
    "utf8",
  ),
);
const { NATIONAL_DAY_MATH_CHAPTERS: catalog } = await loadHolidayTestModule(
  "src/lib/national-day-math-chapters.ts",
);
let expectedExampleCount = 0;
let cloudPayload = null;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const findings = {
  url: PAGE_URL,
  checks: [],
  screenshots: [],
  submitRequests: 0,
  cloudMock: true,
  blockedRemoteRequests: [],
  runtimeExceptions: [],
};
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
        if (message.error)
          pending.reject(
            new Error(`${pending.method}: ${message.error.message}`),
          );
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
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
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
      if (response.ok) {
        version = await response.json();
        break;
      }
    } catch {
      /* The independent browser may still be starting. */
    }
    await delay(200);
  }
  assert.ok(
    version?.webSocketDebuggerUrl,
    "Dedicated headless browser must be running",
  );
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
  const { targetId } = await browser.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await browser.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const send = (method, params) => browser.send(method, params, sessionId);
  browser.listeners.add((event) => {
    if (event.sessionId !== sessionId) return;
    if (event.method === "Fetch.requestPaused") {
      const request = event.params.request;
      let local = false;
      try {
        const url = new URL(request.url);
        local = url.hostname === "127.0.0.1" && url.port === "3005";
      } catch {
        /* Reject unexpected destinations. */
      }
      if (local) {
        if (new URL(request.url).pathname.startsWith("/api/progress/")) {
          // Delayed writes exercise the save-before-load barrier during chapter navigation.
          void (async () => {
            if (request.method === "PUT") {
              await delay(200);
              cloudPayload = JSON.parse(request.postData).payload;
            }
            const body =
              request.method === "GET"
                ? { payload: cloudPayload }
                : { ok: true };
            await send("Fetch.fulfillRequest", {
              requestId: event.params.requestId,
              responseCode: 200,
              responseHeaders: [
                { name: "Content-Type", value: "application/json" },
              ],
              body: Buffer.from(JSON.stringify(body)).toString("base64"),
            });
          })();
          return;
        }
        if (
          request.method === "POST" &&
          new URL(request.url).pathname === "/api/math/national-day/submit"
        )
          findings.submitRequests++;
        void send("Fetch.continueRequest", {
          requestId: event.params.requestId,
        });
      } else {
        findings.blockedRemoteRequests.push(request.url);
        void send("Fetch.failRequest", {
          requestId: event.params.requestId,
          errorReason: "BlockedByClient",
        });
      }
    }
    if (event.method === "Runtime.exceptionThrown") {
      const details = event.params.exceptionDetails;
      findings.runtimeExceptions.push({
        text: details.text,
        description: details.exception?.description,
        url: details.url,
        lineNumber: details.lineNumber,
        stackTrace: details.stackTrace,
      });
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
    if (location.origin !== 'http://127.0.0.1:3005') return;
    const marker = 'math-submit-qa-initialized';
    if (!sessionStorage.getItem(marker)) {
      localStorage.removeItem(${JSON.stringify(storageKey)});
      sessionStorage.setItem(marker, 'true');
    }
  })()`,
  });

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
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
    const image = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(new URL(name, output), Buffer.from(image.data, "base64"));
    findings.screenshots.push(name);
  }
  async function scrollTo(selector, block = "start") {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:${JSON.stringify(block)}})`,
    );
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
  async function fill(questionId, fieldId, value) {
    const selector = `#question-${questionId} [data-math-input][data-field-id="${fieldId}"]`;
    const changed = await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input || input.disabled) return false;
      input.focus();
      const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype
        : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.dispatchEvent(new Event('change', {bubbles:true}));
      return true;
    })()`);
    assert.ok(changed, `Draft input ready: ${questionId}.${fieldId}`);
    await waitFor(
      `document.querySelector(${JSON.stringify(selector)}).value === ${JSON.stringify(value)}`,
      `controlled draft ${questionId}.${fieldId}`,
    );
  }
  async function submitQuestion(questionId, correct) {
    await clickButton(`#question-${questionId}`, "提交答案");
    await waitFor(
      `(() => {
      const feedback = document.querySelector(${JSON.stringify(`[data-math-feedback="${questionId}"]`)});
      return !!feedback && feedback.textContent.includes(${JSON.stringify(correct ? "回答正确" : "需要订正")});
    })()`,
      `server ${correct ? "correct" : "incorrect"} feedback ${questionId}`,
    );
    assert.equal(
      await evaluate(
        `!!document.querySelector(${JSON.stringify(`[data-math-answer="${questionId}"]`)})`,
      ),
      true,
      `submitted solution ${questionId}`,
    );
    const attempt = await evaluate(
      `JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})).attempts[${JSON.stringify(questionId)}]`,
    );
    assert.equal(attempt.checked, true, questionId);
    assert.equal(attempt.correct, correct, questionId);
    assert.equal(attempt.gradingVersion, 2, questionId);
    assert.equal(attempt.selfRated, undefined, questionId);
    return attempt;
  }
  async function assertQuizSolutionsHidden(label) {
    const visible = await evaluate(`({
      answers: document.querySelectorAll('[data-math-answer]').length,
      quizzes: [...document.querySelectorAll('[data-math-question]:not([data-question-category="example"])')]
        .filter(card => card.querySelector('[data-math-answer],[data-math-field-result],[data-math-feedback]')).map(card => card.id)
    })`);
    assert.deepEqual(
      visible,
      { answers: expectedExampleCount, quizzes: [] },
      label,
    );
    findings.checks.push({ check: label, ...visible });
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
    assert.ok(
      Math.max(metrics.body, metrics.document) <= metrics.viewport + 1,
      `${label}: horizontal overflow ${JSON.stringify(metrics)}`,
    );
    findings.checks.push({
      check: `${label} no horizontal overflow`,
      ...metrics,
    });
  }
  async function directory() {
    if (
      await evaluate(
        "!!document.querySelector('[data-national-day-math-book]')",
      )
    ) {
      await evaluate(
        "[...document.querySelectorAll('a')].find(a=>a.textContent.includes('返回章节目录')).click()",
      );
    }
    await waitFor(
      "!!document.querySelector('[data-national-day-math-directory]')&&!document.querySelector('[data-math-directory-stats]').textContent.includes('读取中')",
      "chapter directory ready",
    );
  }
  async function visitChapter(id) {
    if (
      !(await evaluate(
        `document.querySelector('[data-math-chapter]')?.dataset.mathChapter===${JSON.stringify(id)}`,
      ))
    ) {
      await directory();
      await evaluate(
        `document.querySelector('[data-math-chapter-link="${id}"]').click()`,
      );
    }
    await waitFor(
      `document.querySelector('[data-math-chapter]')?.dataset.mathChapter===${JSON.stringify(id)}&&!document.querySelector('[aria-label="国庆数学学习进度"]').textContent.includes('读取中')`,
      `chapter ${id} ready`,
    );
    const chapter = catalog.find((c) => c.id === id);
    expectedExampleCount = sourceBook.sections
      .filter((s) => chapter.sectionIds.includes(s.id))
      .flatMap((s) => s.blocks)
      .filter((b) => b.type === "example").length;
  }
  async function showQuestion(id) {
    const section = sourceBook.sections.find((s) =>
      s.blocks.some((b) => b.id === id),
    );
    await visitChapter(
      catalog.find((c) => c.sectionIds.includes(section.id)).id,
    );
    await waitFor(
      `!!document.querySelector('#question-${id} [data-math-input]')&&!document.querySelector('#question-${id} [data-math-input]').disabled`,
      `question ${id} ready`,
    );
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: PAGE_URL });
  await directory();
  assert.equal(
    await evaluate(
      "document.querySelectorAll('[data-math-chapter-link]').length",
    ),
    9,
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('[data-math-question],[data-math-section],[data-math-input]').length",
    ),
    0,
  );
  await layout("desktop directory 1440");
  await screenshot("desktop-directory.png");
  findings.checks.push({
    check:
      "overview only shows seven chapters plus preparation and review; no knowledge or question cards",
    success: true,
  });
  const visited = { questionIds: [], sections: [], diagrams: 0 };
  const chapterColors = [];
  for (const chapter of catalog) {
    await visitChapter(chapter.id);
    const result = await evaluate(
      `({questions:[...document.querySelectorAll('[data-math-question]')].map(e=>e.dataset.mathQuestion),sections:[...document.querySelectorAll('[data-math-section]')].map(e=>e.dataset.mathSection),diagrams:document.querySelectorAll('[data-national-day-math-book] svg').length,embedded:document.querySelectorAll('iframe,embed,object,details').length})`,
    );
    assert.deepEqual(result.sections, chapter.sectionIds);
    assert.equal(result.embedded, 0);
    visited.questionIds.push(...result.questions);
    visited.sections.push(...result.sections);
    visited.diagrams += result.diagrams;
    await assertQuizSolutionsHidden(
      `chapter ${chapter.id}: quiz solutions hidden; all teaching examples visible`,
    );
    await layout(`desktop ${chapter.id}`);
    if (["u1", "u2", "u4", "u6"].includes(chapter.id)) {
      const color = await evaluate(
        `(()=>{const s=document.querySelector('#math-section-${chapter.id}'),e=s.querySelectorAll('[data-question-category="example"]');return {id:${JSON.stringify(chapter.id)},first:getComputedStyle(e[0]).backgroundColor,second:getComputedStyle(e[1]).backgroundColor,background:getComputedStyle(document.querySelector('main')).backgroundColor};})()`,
      );
      chapterColors.push(color);
      await scrollTo(`#math-section-${chapter.id}`);
      await screenshot(`desktop-chapter-${chapter.id}.png`);
    }
  }
  assert.equal(visited.questionIds.length, 206);
  assert.equal(new Set(visited.questionIds).size, 206);
  assert.deepEqual(
    visited.sections,
    sourceBook.sections.map((s) => s.id),
  );
  assert.equal(visited.diagrams, 7);
  assert.equal(new Set(chapterColors.map((c) => c.first)).size, 4);
  for (const c of chapterColors) {
    assert.equal(c.background, "rgb(255, 255, 255)");
    assert.equal(c.second, "rgb(255, 255, 255)");
    assert.notEqual(c.first, c.second);
  }
  findings.checks.push({
    check:
      "all 21 original sections and 206 questions are reachable once across chapters, with seven diagrams and varied pale colors",
    ...visited,
    chapterColors,
  });
  await send("Page.navigate", { url: `${PAGE_URL}#math-section-u5` });
  await waitFor(
    "location.pathname.endsWith('/u5')&&!!document.querySelector('#math-section-u5')",
    "legacy section bookmark redirects to chapter five",
  );
  findings.checks.push({
    check:
      "old long-page bookmarks still open the original section in its chapter",
    success: true,
  });
  await visitChapter("preparation");
  const initialControls = await evaluate(`({
    choiceDefaults: [...document.querySelectorAll('[data-math-input]')].filter(input => input.tagName === 'SELECT' && input.value !== '').length,
    selfOrRevealButtons: [...document.querySelectorAll('[data-national-day-math-book] button')]
      .filter(button => /我已独立做对|还需要巩固，再练|核对答案与步骤|展开全部自测解答|遮住自测答案/.test(button.textContent)).length
  })`);
  assert.deepEqual(initialControls, {
    choiceDefaults: 0,
    selfOrRevealButtons: 0,
  });
  findings.checks.push({
    check: "choices start blank; no self-assessment or reveal-all controls",
    ...initialControls,
  });
  await layout("desktop 1440");
  await screenshot("desktop-header.png");

  await scrollTo("#question-diagnostic-001", "center");
  await screenshot("desktop-before-submit.png");
  const requestsBeforeBlank = findings.submitRequests;
  await clickButton("#question-diagnostic-001", "提交答案");
  await waitFor(
    "document.querySelector('#question-diagnostic-001 [role=alert]')?.textContent.includes('请先完成')",
    "blank submission input notice",
  );
  await assertQuizSolutionsHidden("blank submission does not reveal answers");
  assert.equal(
    findings.submitRequests,
    requestsBeforeBlank,
    "blank form must not send a grading request",
  );

  await fill("diagnostic-001", "part1", "0.4");
  const automatic = await submitQuestion("diagnostic-001", true);
  assert.deepEqual(JSON.parse(automatic.value), { part1: "0.4" });
  assert.equal(
    await evaluate("document.querySelectorAll('[data-math-answer]').length"),
    expectedExampleCount + 1,
    "only the submitted quiz is revealed",
  );
  await screenshot("desktop-after-submit.png");
  findings.checks.push({
    check: "diagnostic 1 correct server submission reveals only its solution",
    ...automatic,
  });

  await fill("diagnostic-001", "part1", "0.5");
  await waitFor(
    "!document.querySelector('[data-math-answer=\"diagnostic-001\"]') && !document.querySelector('[data-math-feedback=\"diagnostic-001\"]')",
    "editing hides previous solution and feedback",
  );
  await assertQuizSolutionsHidden(
    "editing diagnostic 1 hides its solution again",
  );
  const wrongAttempt = await submitQuestion("diagnostic-001", false);
  assert.deepEqual(JSON.parse(wrongAttempt.value), { part1: "0.5" });
  assert.ok(
    await evaluate(
      "document.querySelector('#question-diagnostic-001 [data-math-field-result]').textContent.includes('0.4')",
    ),
    "wrong submission receives the correct answer",
  );
  await screenshot("desktop-incorrect-submit.png");
  await fill("diagnostic-001", "part1", "0.4");
  await waitFor(
    "!document.querySelector('[data-math-answer=\"diagnostic-001\"]')",
    "corrected draft does not reveal answer until submitted",
  );
  await submitQuestion("diagnostic-001", true);
  findings.checks.push({
    check:
      "editing hides solutions; incorrect submission is marked wrong; correction is marked right",
    success: true,
  });

  await scrollTo("#question-diagnostic-010", "center");
  await fill("diagnostic-010", "part1", "200");
  const areaAttempt = await submitQuestion("diagnostic-010", true);
  assert.deepEqual(JSON.parse(areaAttempt.value), { part1: "200" });
  findings.checks.push({
    check:
      "diagnostic 10 automatically grades square-unit conversion without self assessment",
    ...areaAttempt,
  });

  await showQuestion("unit-048");
  await scrollTo("#question-unit-048", "center");
  const multipartFields = day3Rubrics["unit-048"].fields;
  await fill("unit-048", multipartFields[0].id, multipartFields[0].accepted[0]);
  const requestsBeforeIncomplete = findings.submitRequests;
  await clickButton("#question-unit-048", "提交答案");
  await waitFor(
    "document.querySelector('#question-unit-048 [role=alert]')?.textContent.includes('请先完成')",
    "multipart missing-field notice",
  );
  assert.equal(
    await evaluate(
      "!!document.querySelector('[data-math-answer=\"unit-048\"]')",
    ),
    false,
  );
  assert.equal(
    findings.submitRequests,
    requestsBeforeIncomplete,
    "incomplete multipart form must not send a grading request",
  );
  for (const field of multipartFields)
    await fill("unit-048", field.id, field.accepted[0]);
  const multipartAttempt = await submitQuestion("unit-048", true);
  assert.deepEqual(
    JSON.parse(multipartAttempt.value),
    Object.fromEntries(
      multipartFields.map((field) => [field.id, field.accepted[0]]),
    ),
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('#question-unit-048 [data-math-field-result]').length",
    ),
    4,
  );
  await screenshot("desktop-multipart-after-submit.png");
  findings.checks.push({
    check:
      "multipart incomplete answer stays hidden; all four completed fields are server graded",
    ...multipartAttempt,
  });

  await showQuestion("unit-052");
  await scrollTo("#question-unit-052", "center");
  for (const field of day3Rubrics["unit-052"].fields)
    await fill("unit-052", field.id, field.accepted[0]);
  await submitQuestion("unit-052", true);
  findings.checks.push({
    check:
      "text inputs and choice select both use field-id controlled drafts and server grading",
    success: true,
  });

  const invalidApiCases = [
    { label: "malformed JSON", method: "POST", body: "{", status: 400 },
    {
      label: "missing fields",
      method: "POST",
      body: JSON.stringify({ questionId: "diagnostic-001", answers: {} }),
      status: 400,
    },
    {
      label: "non-string answer",
      method: "POST",
      body: JSON.stringify({
        questionId: "diagnostic-001",
        answers: { part1: 0.4 },
      }),
      status: 400,
    },
    {
      label: "unknown question",
      method: "POST",
      body: JSON.stringify({ questionId: "unknown-question", answers: {} }),
      status: 404,
    },
    { label: "GET is not a submission", method: "GET", status: 405 },
  ];
  for (const apiCase of invalidApiCases) {
    const apiResult = await evaluate(`(async () => {
      const response = await fetch('/api/math/national-day/submit', {
        method: ${JSON.stringify(apiCase.method)}, cache: 'no-store',
        ${apiCase.body === undefined ? "" : `headers: {'Content-Type':'application/json'}, body: ${JSON.stringify(apiCase.body)},`}
      });
      const text = await response.text();
      let body; try { body = JSON.parse(text); } catch { body = text; }
      return { status: response.status, cacheControl: response.headers.get('cache-control'), body };
    })()`);
    assert.equal(apiResult.status, apiCase.status, apiCase.label);
    if (apiResult.body && typeof apiResult.body === "object") {
      for (const key of [
        "answer",
        "steps",
        "pitfall",
        "fields",
        "correct",
        "accepted",
      ])
        assert.equal(
          Object.hasOwn(apiResult.body, key),
          false,
          `${apiCase.label} leaked ${key}`,
        );
    } else
      assert.ok(
        !/"(?:answer|steps|accepted)"\s*:/.test(apiResult.body),
        `${apiCase.label} leaked answer text`,
      );
    findings.checks.push({
      check: `invalid local API: ${apiCase.label}`,
      ...apiResult,
    });
  }

  await visitChapter("u1");
  await clickButton("#math-section-u1", "读完");
  const saved = await evaluate(
    `JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}))`,
  );
  for (const questionId of [
    "diagnostic-001",
    "diagnostic-010",
    "unit-048",
    "unit-052",
  ]) {
    assert.equal(saved.attempts[questionId].correct, true, questionId);
    assert.equal(saved.attempts[questionId].gradingVersion, 2, questionId);
    assert.equal(saved.attempts[questionId].selfRated, undefined, questionId);
    assert.ok(JSON.parse(saved.attempts[questionId].value), questionId);
  }
  assert.ok(saved.completedSections.includes("u1"));
  assert.equal(saved.lastSection, "u1");
  findings.checks.push({
    check:
      "JSON drafts, version 2 server results, completion and last section saved locally",
    attempt: saved.attempts["diagnostic-010"],
  });
  // Navigate immediately, before the delayed cloud PUT finishes.
  await directory();
  assert.ok(
    await evaluate(
      "document.querySelector('[data-math-directory-stats]').textContent.includes('已答 4 / 89')",
    ),
  );
  assert.ok(
    await evaluate(
      "document.querySelector('[data-math-chapter-link=preparation]').textContent.includes('已答 2 题')",
    ),
  );
  assert.ok(
    await evaluate(
      "document.querySelector('[data-math-chapter-link=u6]').textContent.includes('已答 2 题')",
    ),
  );
  assert.ok(
    await evaluate(
      "document.querySelector('[data-math-chapter-link=u7]').textContent.includes('尚未作答')",
    ),
  );
  assert.ok(
    await evaluate(
      "document.querySelector('[data-math-chapter-link=u1]').textContent.includes('已读完 1/1')",
    ),
  );
  assert.deepEqual(cloudPayload.attempts, saved.attempts);
  findings.checks.push({
    check:
      "immediate return waits for pending cloud saves, preserving all cross-chapter answers and completion",
    success: true,
  });
  await send("Page.reload", { ignoreCache: true });
  await waitFor(
    "document.querySelector('[data-math-directory-stats]')?.textContent.includes('已答 4 / 89')",
    "directory reload retains submitted results",
  );
  await showQuestion("diagnostic-010");
  assert.equal(
    await evaluate("document.getElementById('draft-diagnostic-010').value"),
    "200",
  );
  assert.equal(
    await evaluate("document.getElementById('draft-diagnostic-001').value"),
    "0.4",
  );
  await assertQuizSolutionsHidden(
    "preparation reload restores drafts but keeps solutions hidden",
  );
  await showQuestion("unit-048");
  for (const field of multipartFields)
    assert.equal(
      await evaluate(
        `document.querySelector(${JSON.stringify(`#question-unit-048 [data-field-id="${field.id}"]`)}).value`,
      ),
      field.accepted[0],
    );
  await assertQuizSolutionsHidden(
    "chapter six restores multi-item drafts but keeps solutions hidden",
  );
  await showQuestion("unit-052");
  assert.equal(
    await evaluate(
      "document.querySelector('#question-unit-052 select[data-field-id=longer]').value",
    ),
    day3Rubrics["unit-052"].fields.find((field) => field.id === "longer")
      .accepted[0],
  );
  const reloaded = await evaluate(
    `JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}))`,
  );
  for (const questionId of [
    "diagnostic-001",
    "diagnostic-010",
    "unit-048",
    "unit-052",
  ]) {
    assert.deepEqual(
      reloaded.attempts[questionId],
      saved.attempts[questionId],
      questionId,
    );
  }
  assert.ok(reloaded.completedSections.includes("u1"));
  assert.equal(reloaded.lastSection, "u1");
  await assertQuizSolutionsHidden(
    "reload restores drafts and grading history but hides every quiz solution again",
  );
  findings.checks.push({
    check:
      "reload retains local JSON drafts, server results, select choices and completed section without solutions",
    success: true,
  });

  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await directory();
  await evaluate("window.scrollTo(0,0)");
  await layout("mobile 390");
  await screenshot("mobile-header.png");
  await showQuestion("diagnostic-001");
  await scrollTo("#question-diagnostic-001", "center");
  await screenshot("mobile-before-submit.png");
  await submitQuestion("diagnostic-001", true);
  await screenshot("mobile-after-submit.png");
  await layout("mobile 390 after submission");
  await visitChapter("u5");
  await scrollTo("#math-section-u5 svg", "center");
  await screenshot("mobile-circle-diagram.png");
  await visitChapter("u6");
  await scrollTo('#math-section-u6 [data-question-category="example"]');
  await screenshot("mobile-rose-example.png");
  await scrollTo("#national-day-math-end", "end");
  const footer = await evaluate(`(() => {
    const end = document.querySelector('#national-day-math-end');
    const rect = end.getBoundingClientRect();
    return { text: end.textContent, top: rect.top, bottom: rect.bottom, height: innerHeight, scroll: scrollY, total: document.documentElement.scrollHeight };
  })()`);
  assert.ok(footer.text.includes("这一部分读完了"));
  assert.ok(
    footer.top >= 0 && footer.bottom <= footer.height + 1,
    "complete footer visible at the long page end",
  );
  await screenshot("mobile-end.png");
  findings.checks.push({
    check: "chapter footer and next-chapter navigation readable",
    ...footer,
  });
  assert.equal(
    findings.blockedRemoteRequests.length,
    0,
    "page attempted no external destinations",
  );
  assert.equal(
    findings.runtimeExceptions.length,
    0,
    "no uncaught browser runtime exceptions",
  );
  assert.equal(
    findings.cloudMock,
    true,
    "progress tests never touch the production database",
  );
  findings.passed = true;
  console.log(JSON.stringify(findings, null, 2));
} catch (error) {
  findings.passed = false;
  findings.error = error.stack ?? String(error);
  console.error(findings.error);
  process.exitCode = 1;
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(
    new URL("browser-report.json", output),
    JSON.stringify(findings, null, 2),
  );
  // This CDP endpoint belongs only to the independently launched QA profile.
  if (browser) {
    try {
      await browser.send("Browser.close", {}, undefined, 5000);
    } catch {
      /* Browser may close before sending its reply. */
    }
    browser.close();
  }
}
