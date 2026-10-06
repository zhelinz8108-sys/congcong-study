import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

// Local, disposable browser context. All student progress traffic is mocked.
export async function englishBrowserHarness() {
  const origin = process.env.ENGLISH_QA_ORIGIN || "http://127.0.0.1:3005";
  const cdp = process.env.ENGLISH_QA_CDP || "http://127.0.0.1:9227";
  for (const address of [origin, cdp]) {
    assert.ok(["127.0.0.1", "localhost"].includes(new URL(address).hostname));
  }
  const report = { checks: [], runtimeErrors: [], screenshots: [], submissions: 0, requests: [], progressWrites: 0, realProgressWrites: 0 };
  const cloud = new Map();
  const controls = { failCloud: false, failCheck: false, holdCheck: false, heldCheck: null };
  class CDP {
    id = 0; pending = new Map(); listeners = [];
    constructor(socket) {
      this.socket = socket;
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id) {
          const item = this.pending.get(message.id);
          if (!item) return;
          clearTimeout(item.timer); this.pending.delete(message.id);
          if (message.error) item.reject(new Error(message.error.message));
          else item.resolve(message.result);
        } else this.listeners.forEach((fn) => fn(message));
      });
    }
    send(method, params = {}, sessionId) {
      const id = ++this.id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 30000);
        this.pending.set(id, { resolve, reject, timer });
        this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    }
  }
  const version = await (await fetch(`${cdp}/json/version`)).json();
  assert.equal(new URL(version.webSocketDebuggerUrl).hostname, "127.0.0.1");
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const browser = new CDP(socket);
  const { browserContextId } = await browser.send("Target.createBrowserContext");
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  const intercepted = (promise) => { void promise.catch((error) => {
    // Navigation/React Strict Mode may cancel a paused request before its mock completes.
    if (!/Invalid InterceptionId|Session with given id not found/.test(error.message)) report.runtimeErrors.push(`Interception: ${error.message}`);
  }); };
  async function fulfill(requestId, status, body) {
    await send("Fetch.fulfillRequest", { requestId, responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64") });
  }
  browser.listeners.push((event) => {
    if (event.sessionId !== sessionId) return;
    if (event.method === "Runtime.exceptionThrown") report.runtimeErrors.push(event.params.exceptionDetails.text);
    if (event.method !== "Fetch.requestPaused") return;
    const { request, requestId } = event.params, address = new URL(request.url);
    if (address.origin !== origin) {
      intercepted(send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" })); return;
    }
    if (address.pathname.startsWith("/api/progress/")) {
      if (request.method === "PUT") {
        report.progressWrites++;
        if (controls.failCloud) { intercepted(fulfill(requestId, 503, { error: "QA offline simulation" })); return; }
        cloud.set(address.pathname, JSON.parse(request.postData).payload);
      }
      intercepted(fulfill(requestId, 200, request.method === "GET" ? { payload: cloud.get(address.pathname) ?? null } : { ok: true }));
      return;
    }
    if (address.pathname === "/api/english/holiday-2400/check") {
      report.submissions++;
      if (controls.failCheck) { intercepted(fulfill(requestId, 503, { error: "QA grading unavailable" })); return; }
      if (controls.holdCheck) { controls.heldCheck = requestId; return; }
    }
    if (address.pathname === "/api/english/holiday-2400/questions") report.requests.push(address.search);
    intercepted(send("Fetch.continueRequest", { requestId }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  const family = await loadHolidayTestModule("src/lib/family-access.ts");
  assert.ok(family.isFamilyAccessConfigured(), "QA requires existing family configuration");
  await send("Network.setCookie", { name: family.FAMILY_ACCESS_COOKIE, value: family.createFamilyAccessToken(), url: origin, httpOnly: true, sameSite: "Lax" });
  async function evaluate(expression) {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(expression, label, timeout = 30000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timed out: ${label}`);
  }
  async function screenshot(name) {
    const output = new URL("../../tmp/english2400-qa/", import.meta.url);
    await mkdir(output, { recursive: true });
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(new URL(name, output), Buffer.from(data, "base64"));
    report.screenshots.push(name);
  }
  async function viewport(width, height, mobile = false) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  }
  async function close() {
    await browser.send("Target.disposeBrowserContext", { browserContextId }); socket.close();
  }
  return { origin, send, evaluate, waitFor, delay, screenshot, viewport, close, report, cloud, controls, fulfill };
}
