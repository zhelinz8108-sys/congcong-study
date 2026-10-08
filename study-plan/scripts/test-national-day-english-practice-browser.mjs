import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { englishBrowserHarness } from "./english-practice-browser-utils.mjs";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

// Local disposable browser. ALL student progress traffic is intercepted by the harness.
async function run() {
  const qa = await englishBrowserHarness();
  const { origin, send, evaluate, waitFor, delay, screenshot, viewport, cloud, controls, report } = qa;
  const subject = "8bd6f79b-99f5-4e68-a961-872d60d260b1";
  const url = `${origin}/subjects/${subject}/national-day-english-practice`;
  const { listEnglishPracticeBlocks: list } = await loadHolidayTestModule("src/server/national-day-english-practice/public-bank.ts");
  const { englishPracticePrivateAnswer: key } = await loadHolidayTestModule("src/server/national-day-english-practice/private-bank.ts");
  const scope = `/api/progress/${encodeURIComponent(`english:holiday2400:${subject}:v1`)}`;
  const qid = (n, chapter = "CH01") => `${chapter}-Q${String(n).padStart(3, "0")}`;
  const active = () => evaluate(`document.querySelector('[data-active-question]')?.dataset.activeQuestion`);
  const cloudState = () => cloud.get(scope);
  async function ready(id) {
    await waitFor(`document.querySelector('[data-question="${id}"]')&&document.querySelector('[data-active-question="${id}"]')&&!document.querySelector('[aria-busy="true"]')`, `question ${id}`);
    assert.equal(await active(), id);
    assert.equal(await evaluate(`document.querySelectorAll('[data-question]').length`), 1, "Only one question may be rendered");
  }
  async function reloadQuestion(id) {
    await evaluate(`window.__englishQaReloadMarker=true`);
    await send("Page.reload", {});
    await waitFor(`window.__englishQaReloadMarker!==true`, "new document after reload");
    await ready(id);
  }
  async function jump(number, chapter = "CH01") {
    await evaluate(`(()=>{const e=document.querySelector('select[aria-label="选择题号"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'${number}');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await ready(qid(number, chapter));
    assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0);
  }
  async function choose(id, correct = true) {
    const answer = key(id).correctOption;
    const selected = correct ? answer : "ABCD"[("ABCD".indexOf(answer) + 1) % 4];
    await evaluate(`document.querySelector('[data-question="${id}"] input[value="${selected}"]').click()`);
    assert.equal(await active(), id, "Selecting must not advance");
  }
  async function submit(id, correct) {
    const previous = report.submissions;
    await evaluate(`document.querySelector('button[type="submit"]').click()`);
    await waitFor(`!!document.querySelector('[data-feedback="${id}"]')`, `feedback ${id}`);
    assert.equal(report.submissions, previous + 1);
    assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 1, "Other blank answers must remain hidden");
    assert.ok(await evaluate(`document.querySelector('[data-feedback="${id}"]').textContent.includes(${JSON.stringify(key(id).explanation)})`));
    await delay(650);
    assert.equal(await active(), id, "Submitting must not advance after a timer");
    const saved = await evaluate(`JSON.parse(localStorage.getItem('study-plan-english:holiday2400:${subject}:v1'))`);
    assert.equal(saved.attempts[id].correct, correct);
    assert.doesNotMatch(JSON.stringify(saved), /"(?:correctOption|correctText|explanation)":/);
  }
  async function next(number, chapter = "CH01") {
    assert.equal(await evaluate(`document.querySelector('[data-nav="next"]').disabled`), false);
    await evaluate(`document.querySelector('[data-nav="next"]').click()`);
    await ready(qid(number, chapter));
    assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0);
  }
  async function layout(label) {
    const m = await evaluate(`(()=>{const a=document.querySelector('[data-active-question]'),n=document.querySelector('[data-nav="next"]');return {w:innerWidth,h:innerHeight,dw:document.documentElement.scrollWidth,dh:document.documentElement.scrollHeight,nb:n?.getBoundingClientRect().bottom,ab:a?.getBoundingClientRect().bottom,scroll:!!document.querySelector('[data-question-scroll]')};})()`);
    assert.ok(m.dw <= m.w + 1, `${label}: no horizontal overflow`);
    assert.ok(m.nb <= m.h + 1, `${label}: manual next stays visible`);
    assert.ok(m.ab <= m.h + 1, `${label}: workspace fits viewport`);
    assert.ok(m.scroll, `${label}: own content scroll region`);
    assert.ok(m.dh <= m.h + 2, `${label}: no long page`);
  }
  try {
    await viewport(1440, 900); await send("Page.navigate", { url });
    await waitFor(`document.querySelectorAll('[data-chapter]').length===24&&!document.body.textContent.includes('正在读取')`, "overview");
    assert.equal(await evaluate(`document.querySelectorAll('[data-question]').length`), 0); assert.equal(report.requests.length, 0);
    await evaluate(`document.querySelector('[data-chapter="CH01"]').click()`); await ready(qid(1));
    assert.equal(await evaluate(`document.querySelectorAll('input:checked').length`), 0);
    assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0);
    assert.equal(await evaluate(`document.querySelector('[data-nav="next"]').disabled`), true);
    await layout("desktop initial"); await screenshot("desktop-one-question.png");
    assert.ok(await evaluate(`(()=>{const p=document.querySelector('[data-question-scroll]');return p.scrollHeight<=p.clientHeight+1;})()`), "Normal short question shows all options without scrolling");
    await evaluate(`document.querySelector('button[type="submit"]').click()`); await delay(250); assert.equal(report.submissions, 0);
    await evaluate(`document.querySelector('[data-question] input').focus()`);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
    assert.equal(await evaluate(`document.querySelector('[data-question] input:checked')?.value`), "B", "Native keyboard selection remains available");
    assert.equal(await active(), qid(1));
    assert.equal(await evaluate(`document.querySelectorAll('[data-result="correct"], [data-result="incorrect"]').length`), 0, "Selection must not imply correctness");
    await choose(qid(1), false); await submit(qid(1), false);
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 800, y: 450, deltaX: 0, deltaY: 500 });
    await delay(300); assert.equal(await active(), qid(1)); await layout("wrong feedback"); await screenshot("desktop-one-question-feedback.png");
    await choose(qid(1)); assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0);
    assert.equal(await evaluate(`document.querySelector('[data-nav="next"]').disabled`), true);
    await submit(qid(1), true); assert.equal(Object.keys(cloudState().attempts).length, 1); assert.equal(cloudState().attempts[qid(1)].submissions, 2);
    await next(2); await evaluate(`document.querySelector('[data-nav="previous"]').click()`); await ready(qid(1));
    assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0); await next(2);
    report.checks.push("One item; selection, submission, timers and wheel never advance; manual navigation; empty blocked");
    await jump(10); await choose(qid(10)); await submit(qid(10), true); await next(11);
    const original = list({ chapter: "CH01", page: 2 }).blocks[0].questions[0];
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-option-text]')).map(e=>e.textContent)`), original.options);
    await jump(26); const cloze = list({ chapter: "CH01", page: 3 }).blocks.at(-1); assert.equal(cloze.kind, "cloze");
    assert.ok(await evaluate(`document.querySelector('[data-active-question]').textContent.includes(${JSON.stringify(cloze.text.split("{1}")[0].trim())})`));
    assert.ok(await evaluate(`!document.querySelector('[data-active-question]').textContent.includes('{1}')`));
    await choose(qid(26), false); await submit(qid(26), false); assert.equal(Object.keys(cloudState().attempts).length, 3);
    await layout("cloze feedback"); await screenshot("desktop-one-blank-cloze.png"); await next(27);
    assert.ok(await evaluate(`document.querySelector('[data-block="${cloze.id}"]')!==null`));
    assert.equal(await evaluate(`document.querySelectorAll('input:checked').length`), 0);
    await choose(qid(27)); await submit(qid(27), true); assert.equal(Object.keys(cloudState().attempts).length, 4);
    report.checks.push("Fixed PDF order across pages; full cloze passage; one active blank and one feedback only");
    await jump(28); await choose(qid(28)); controls.failCheck = true;
    await evaluate(`document.querySelector('button[type="submit"]').click()`);
    await waitFor(`document.body.textContent.includes('QA grading unavailable')`, "grading failure");
    assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0); assert.equal(Object.keys(cloudState().attempts).length, 4);
    controls.failCheck = false; controls.failCloud = true; await submit(qid(28), true);
    await reloadQuestion(qid(28));
    assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0); assert.equal(await evaluate(`document.querySelectorAll('input:checked').length`), 1);
    controls.failCloud = false; await evaluate(`window.dispatchEvent(new Event('online'))`);
    const deadline = Date.now() + 10000; while (Date.now() < deadline && !cloudState()?.attempts[qid(28)]) await delay(150);
    assert.equal(Object.keys(cloudState().attempts).length, 5);
    assert.equal(await evaluate(`document.querySelector('[data-stat="answered"]').textContent`), "5");
    assert.equal(await evaluate(`document.querySelector('[data-stat="correct"]').textContent`), "4");
    assert.equal(await evaluate(`document.querySelector('[data-stat="accuracy"]').textContent`), "80%");
    report.checks.push("Exact question/draft resumes; offline resync; unique count and accuracy retained; no solutions persisted");
    controls.holdCheck = true; await jump(29); await choose(qid(29)); await evaluate(`document.querySelector('button[type="submit"]').click()`);
    const heldDeadline = Date.now() + 5000; while (!controls.heldCheck && Date.now() < heldDeadline) await delay(50); assert.ok(controls.heldCheck);
    await reloadQuestion(qid(29)); controls.holdCheck = false;
    assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0); assert.ok(!cloudState().attempts[qid(29)]);
    report.checks.push("Cancelled grading cannot leak stale answers or change attempts");
    for (const [width, height, mobile] of [[1920, 1080, false], [3840, 1866, false], [1366, 768, false], [390, 844, true]]) {
      await viewport(width, height, mobile); await delay(100); await layout(`${width}x${height}`); await screenshot(`${width}x${height}-one-question.png`);
    }
    await evaluate(`document.documentElement.style.fontSize='20px'`); await layout("enlarged mobile"); await evaluate(`document.documentElement.style.fontSize=''`);
    report.checks.push("Laptop/mobile/enlarged text: no horizontal overflow, bounded content, visible manual controls");
    await send("Page.navigate", { url: `${url}/CH24` }); await ready(qid(1, "CH24"));
    await jump(100, "CH24"); await choose(qid(100, "CH24")); await submit(qid(100, "CH24"), true);
    assert.equal(await active(), qid(100, "CH24")); report.checks.push("Last PDF question stays in place after submitting");
    for (const [chapter, number] of [["CH09", 96], ["CH14", 81], ["CH11", 90], ["CH16", 88], ["CH22", 91]]) {
      await viewport(1440, 900);
      await send("Page.navigate", { url: `${url}/${chapter}` }); await ready(qid(1, chapter));
      await jump(number, chapter); await choose(qid(number, chapter)); await submit(qid(number, chapter), true);
      await layout(`long-content ${chapter} desktop`);
      await screenshot(`desktop-extreme-${chapter}.png`);
      await viewport(390, 844, true); await delay(100); await layout(`long-content ${chapter} mobile`);
      const feedbackVisible = `(()=>{const p=document.querySelector('[data-question-scroll]').getBoundingClientRect(),f=document.querySelector('[data-feedback]').getBoundingClientRect();return f.top>=p.top-1&&f.top<p.bottom-16;})()`;
      assert.ok(await evaluate(feedbackVisible), "Feedback title stays visible after resizing");
      await choose(qid(number, chapter), false); await submit(qid(number, chapter), false);
      assert.ok(await evaluate(feedbackVisible), "Direct mobile submission reveals feedback title");
      await screenshot(`mobile-extreme-${chapter}.png`);
    }
    report.checks.push("Longest passage, stem, options and explanation checked at desktop/mobile sizes");
    assert.doesNotMatch(JSON.stringify(cloudState()), /"(?:correctOption|correctText|explanation)":/);
    assert.equal(report.runtimeErrors.length, 0); assert.equal(report.realProgressWrites, 0);
    const output = new URL("../../tmp/english2400-qa/", import.meta.url); await mkdir(output, { recursive: true });
    await writeFile(new URL("browser-report.json", output), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally { await qa.close(); }
}
run().catch((error) => { console.error(error instanceof Error && error.message.length < 250 ? error.message : "Browser QA failed; inspect local assertion."); process.exitCode = 1; });
