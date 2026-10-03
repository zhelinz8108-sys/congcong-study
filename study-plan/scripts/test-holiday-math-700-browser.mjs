import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import {
  loadHolidayTestModule,
  canonicalHolidayAnswer as canonical,
  appRoot,
} from "./holiday-math-test-utils.mjs";
import path from "node:path";

const origin = "http://127.0.0.1:3005",
  subject = "4ea6b4fe-bfd3-440f-b780-6d71c2011609";
const url = `${origin}/subjects/${subject}/national-day-math-practice`,
  cdp = "http://127.0.0.1:9227";
const output = new URL("../../tmp/holiday700-qa/", import.meta.url);
const questions = JSON.parse(
  readFileSync(
    path.join(appRoot, "src/server/holiday-math-700/questions.public.json"),
    "utf8",
  ),
);
const { holidayPrivateAnswer: privateAnswer } = await loadHolidayTestModule(
  "src/server/holiday-math-700/private-bank.ts",
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failCloudSave = false;
const report = {
    checks: [],
    types: [],
    runtimeErrors: [],
    screenshots: [],
    cloudMock: true,
    submitted: 0,
  },
  cloud = new Map();
class CDP {
  id = 0;
  pending = new Map();
  listeners = [];
  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const item = this.pending.get(message.id);
        if (item) {
          clearTimeout(item.timer);
          this.pending.delete(message.id);
          if (message.error) item.reject(new Error(message.error.message));
          else item.resolve(message.result);
        }
      } else this.listeners.forEach((fn) => fn(message));
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
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
}
const version = await (await fetch(`${cdp}/json/version`)).json();
assert.equal(new URL(version.webSocketDebuggerUrl).hostname, "127.0.0.1");
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
const browser = new CDP(socket),
  { browserContextId } = await browser.send("Target.createBrowserContext"),
  { targetId } = await browser.send("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  }),
  { sessionId } = await browser.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
const send = (method, params) => browser.send(method, params, sessionId);
browser.listeners.push((event) => {
  if (event.sessionId !== sessionId) return;
  if (event.method === "Runtime.exceptionThrown")
    report.runtimeErrors.push(
      event.params.exceptionDetails.exception?.description ??
        event.params.exceptionDetails.text,
    );
  if (event.method === "Fetch.requestPaused") {
    const { request, requestId } = event.params,
      address = new URL(request.url);
    if (address.origin !== origin) {
      void send("Fetch.failRequest", {
        requestId,
        errorReason: "BlockedByClient",
      });
      return;
    }
    if (address.pathname.startsWith("/api/progress/")) {
      if (request.method === "PUT" && failCloudSave) {
        void send("Fetch.fulfillRequest", {
          requestId,
          responseCode: 503,
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
          ],
          body: Buffer.from("{}").toString("base64"),
        });
        return;
      }
      if (request.method === "PUT")
        cloud.set(address.pathname, JSON.parse(request.postData).payload);
      const body =
        request.method === "GET"
          ? { payload: cloud.get(address.pathname) ?? null }
          : { ok: true };
      void send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify(body)).toString("base64"),
      });
    } else {
      if (address.pathname.endsWith("/check")) report.submitted++;
      void send("Fetch.continueRequest", { requestId });
    }
  }
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
    await delay(150);
  }
  throw new Error(`Timed out: ${label}`);
}
async function select(index, value) {
  await evaluate(
    `(()=>{const e=document.querySelectorAll('select')[${index}];const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await delay(100);
}
async function show(question) {
  await evaluate(
    `document.querySelectorAll('[aria-pressed]')[${Number(question.chapter_id.slice(-2)) - 1}].click()`,
  );
  await delay(100);
  await select(1, question.type);
  await waitFor(
    `!!document.querySelector('[data-question="${question.id}"]')&&!document.querySelector('[aria-busy="true"]')`,
    question.id,
  );
}
function operations(node, value, name) {
  if (node.parts?.length)
    return node.parts.flatMap((part) =>
      operations(part, value[part.part_id], `${name}.${part.part_id}`),
    );
  if (node.choices?.length)
    return node.choices.map((choice) => ({
      kind: "choice",
      name,
      id: choice.id,
      checked:
        node.type === "multi_choice"
          ? value.includes(choice.id)
          : value === choice.id,
    }));
  if (node.type === "matching" || node.type === "classification")
    return Object.entries(value).map(([id, v]) => ({
      kind: "choice",
      name: `${name}.${id}`,
      id: v,
      checked: true,
    }));
  if (node.type === "ordering")
    return value.map((id) => ({ kind: "order", id }));
  if (Array.isArray(value))
    return value.map((v, i) => ({
      kind: "text",
      name: `${name}.${i}`,
      value: v,
    }));
  return [{ kind: "text", name, value }];
}
async function fill(question, values) {
  for (const operation of operations(question, values, question.id)) {
    await evaluate(`(()=>{const root=document.querySelector('[data-question="${question.id}"]'),op=${JSON.stringify(operation)};
    if(op.kind==='order'){const e=root.querySelector('[data-order-item="'+op.id+'"]');if(!e)throw new Error('Missing ordering item');e.click();return;}
    const e=[...root.querySelectorAll('input')].find(e=>e.name===op.name&&(op.kind==='text'||e.value===op.id));if(!e)throw new Error('Missing answer control '+op.name);
    if(op.kind==='choice'){if(e.checked!==op.checked&&(e.type==='checkbox'||op.checked))e.click();}
    else{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,op.value);e.dispatchEvent(new Event('input',{bubbles:true}));}
  })()`);
    await delay(35);
  }
}
async function submit(question, correct) {
  await evaluate(
    `document.querySelector('[data-question="${question.id}"] button[type="submit"]').click()`,
  );
  await waitFor(
    `document.querySelector('[data-feedback="${question.id}"]')?.dataset.correct===${JSON.stringify(String(correct))}`,
    `grade ${question.id}`,
  );
}
async function reset(question) {
  await evaluate(
    `[...document.querySelector('[data-question="${question.id}"]').querySelectorAll('button')].find(e=>e.textContent.includes('收起答案')).click()`,
  );
  await delay(60);
  assert.equal(
    await evaluate(
      `!!document.querySelector('[data-feedback="${question.id}"]')`,
    ),
    false,
  );
}
async function screenshot(name, selector) {
  if (selector)
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`,
    );
  await delay(250);
  const image = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(new URL(name, output), Buffer.from(image.data, "base64"));
  report.screenshots.push(name);
}
function wrong(node, key, value) {
  if (key.kind === "parts") {
    const p = node.parts[0];
    return {
      ...value,
      [p.part_id]: wrong(p, key.value[p.part_id], value[p.part_id]),
    };
  }
  if (key.kind === "blanks") return value.map((v, i) => (i ? v : "9999999"));
  if (key.kind === "mapping") {
    const id = Object.keys(value)[0];
    return {
      ...value,
      [id]: (node.interaction.right ?? node.interaction.categories).find(
        (i) => i.id !== value[id],
      ).id,
    };
  }
  if (key.kind === "sequence") return [...value.slice(1), value[0]];
  if (key.kind === "choices") {
    const other = node.choices.find((i) => !value.includes(i.id));
    return other ? [...value, other.id] : value.slice(1);
  }
  if (key.kind === "choice") return node.choices.find((i) => i.id !== value).id;
  return "9999999";
}
try {
  await mkdir(output, { recursive: true });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  await waitFor(
    `document.querySelectorAll('[data-question]').length===10`,
    "initial ten questions",
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('[data-feedback]').length`),
    0,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('input:checked').length`),
    0,
  );
  await screenshot("desktop-top.png");
  report.checks.push(
    "initial answers hidden, no defaults, seven chapter colors",
  );
  const first = questions[0];
  await evaluate(
    `document.querySelector('[data-question="${first.id}"] button[type="submit"]').click()`,
  );
  await waitFor(
    `document.querySelector('[data-question="${first.id}"] [role="alert"]')?.textContent.includes('请先完成')`,
    "empty input validation",
  );
  assert.equal(report.submitted, 0);
  report.checks.push("empty submission reveals no answer");
  await evaluate(
    `[...document.querySelector('[data-question="${first.id}"]').querySelectorAll('button')].find(e=>e.textContent.includes('第一个提示')).click()`,
  );
  await waitFor(
    `document.querySelector('[data-question="${first.id}"]').textContent.includes('提示 1')`,
    "first hint",
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('[data-feedback]').length`),
    0,
  );
  report.checks.push("explicit hint is separate from solutions");
  await evaluate(
    `[...document.querySelector('[data-question="${first.id}"]').querySelectorAll('button')].find(e=>e.textContent.includes('再看一个提示')).click()`,
  );
  await waitFor(
    `document.querySelector('[data-question="${first.id}"]').textContent.includes('提示 2')`,
    "second explicit hint",
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('[data-feedback]').length`),
    0,
  );
  report.checks.push("second hint still does not send the solution object");
  for (const type of new Set(questions.map((q) => q.type))) {
    const q = questions.find((q) => q.type === type),
      key = privateAnswer(q.id).answer,
      reference = canonical(key);
    await show(q);
    await fill(q, wrong(q, key, reference));
    await submit(q, false);
    await reset(q);
    await fill(q, reference);
    await submit(q, true);
    report.types.push(type);
    console.log(`UI ${type}: wrong and correct submissions passed`);
    if (
      type === "multi_blank" ||
      type === "table_fill" ||
      type === "matching" ||
      type === "multi_part" ||
      type === "ordering"
    )
      await screenshot(`desktop-${type}.png`, `[data-question="${q.id}"]`);
  }
  assert.equal(report.types.length, 13);
  const numeric = questions.find((q) => q.type === "fill_numeric");
  await show(numeric);
  await fill(numeric, canonical(privateAnswer(numeric.id).answer));
  await submit(numeric, true);
  await fill(numeric, "123");
  assert.equal(
    await evaluate(
      `!!document.querySelector('[data-feedback="${numeric.id}"]')`,
    ),
    false,
  );
  report.checks.push("editing answers hides previous solutions");
  await delay(1000);
  await send("Page.reload");
  await waitFor(
    `!!document.querySelector('[data-question="${numeric.id}"]')`,
    "reload preserves filter",
  );
  assert.equal(
    await evaluate(`document.querySelector('[name="${numeric.id}"]').value`),
    "123",
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('[data-feedback]').length`),
    0,
  );
  report.checks.push(
    "cloud draft, location and scores survive reload; solutions not stored",
  );
  failCloudSave = true;
  await fill(numeric, "321");
  await waitFor(
    `document.body.textContent.includes('云端暂未连接')`,
    "offline draft saved locally",
  );
  failCloudSave = false;
  await send("Page.reload");
  await waitFor(
    `document.querySelector('[name="${numeric.id}"]')?.value==='321'`,
    "newer local draft beats stale cloud copy",
  );
  await waitFor(
    `document.body.textContent.includes('已同步云端')`,
    "offline draft resynced",
  );
  assert.equal([...cloud.values()][0].drafts[numeric.id], "321");
  report.checks.push(
    "offline edits survive reload and resync without stale-cloud loss",
  );
  await select(0, "wrong");
  await waitFor(
    `document.querySelectorAll('[data-question]').length>0&&!document.querySelector('[aria-busy="true"]')`,
    "wrong question list",
  );
  report.checks.push("wrong book loads original question controls");
  await select(0, "chapter");
  await select(1, "");
  await waitFor(
    `document.querySelectorAll('[data-question]').length===10`,
    "unfiltered chapter",
  );
  await select(3, "2");
  await waitFor(
    `!!document.querySelector('[data-question="M6A_CH01_Q011"]')`,
    "page two",
  );
  report.checks.push("pagination reaches remaining chapter questions");
  const diagram = questions.find((q) => q.diagram);
  await show(diagram);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await screenshot("mobile-diagram.png", `[data-question="${diagram.id}"]`);
  const width = await evaluate(
    `({document:document.documentElement.scrollWidth,viewport:innerWidth,image:document.querySelector('[data-question="${diagram.id}"] img')?.getBoundingClientRect().width})`,
  );
  assert.ok(width.document <= width.viewport + 1);
  assert.ok(width.image <= width.viewport);
  report.checks.push("mobile SVG and page fit viewport");
  await show(first);
  await fill(first, canonical(privateAnswer(first.id).answer));
  await submit(first, true);
  await screenshot(
    "mobile-formula-feedback.png",
    `[data-feedback="${first.id}"]`,
  );
  assert.ok(await evaluate(`document.querySelectorAll('.katex').length>0`));
  assert.equal(
    await evaluate(`document.body.textContent.includes('公式无法显示')`),
    false,
  );
  report.checks.push(
    "fraction formulas render in prompts, options and feedback",
  );
  await evaluate(`document.documentElement.style.fontSize='24px'`);
  assert.ok(
    await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),
  );
  await screenshot("mobile-large-text.png", `[data-question="${first.id}"]`);
  report.checks.push("enlarged text retains single-column layout");
  assert.deepEqual(report.runtimeErrors, []);
  report.passed = true;
  await writeFile(
    new URL("report.json", output),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await screenshot("failure.png").catch(() => {});
  await writeFile(
    new URL("report.json", output),
    JSON.stringify({ ...report, error: error.message }, null, 2),
  );
  throw error;
} finally {
  await browser.send("Target.disposeBrowserContext", { browserContextId });
  socket.close();
}
