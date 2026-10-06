import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { englishBrowserHarness } from "./english-practice-browser-utils.mjs";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const qa = await englishBrowserHarness();
const { origin, send, evaluate, waitFor, delay, screenshot, viewport, cloud, controls, report } = qa;
const subject = "8bd6f79b-99f5-4e68-a961-872d60d260b1";
const url = `${origin}/subjects/${subject}/national-day-english-practice`;
const { listEnglishPracticeBlocks: list } = await loadHolidayTestModule("src/server/national-day-english-practice/public-bank.ts");
const { englishPracticePrivateAnswer: key } = await loadHolidayTestModule("src/server/national-day-english-practice/private-bank.ts");
const scope = `/api/progress/${encodeURIComponent(`english:holiday2400:${subject}:v1`)}`;
async function page(number) {
  await evaluate(`(()=>{ const e=document.querySelector('select[aria-label="选择题目页码"]'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(e,${JSON.stringify(String(number))}); e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const first = list({ chapter: "CH01", page: number }).blocks[0].id;
  await waitFor(`!!document.querySelector('[data-block="${first}"]')&&!document.querySelector('[aria-busy="true"]')`, `page ${number}`);
}
async function fill(block, wrong = 0) {
  const selected = {};
  for (const [index, question] of block.questions.entries()) {
    const correct = key(question.id).correctOption;
    selected[question.id] = index < wrong ? "ABCD"[("ABCD".indexOf(correct) + 1) % 4] : correct;
    await evaluate(`document.querySelector('[data-question="${question.id}"] input[value="${selected[question.id]}"]').click()`);
  }
  return selected;
}
async function submit(block, score) {
  const previous = report.submissions;
  await evaluate(`document.querySelector('[data-block="${block.id}"] button[type="submit"]').click()`);
  await waitFor(`document.querySelectorAll('[data-block="${block.id}"] [data-feedback]').length===${block.questions.length}`, `${block.id} feedback`);
  assert.equal(report.submissions, previous + 1);
  const results = await evaluate(`Array.from(document.querySelectorAll('[data-block="${block.id}"] [data-feedback]')).map(e=>e.textContent)`);
  for (const [index, question] of block.questions.entries()) assert.ok(results[index].includes(key(question.id).explanation));
  await waitFor(`!!localStorage.getItem('study-plan-english:holiday2400:${subject}:v1')`, "local progress save");
  const state = await evaluate(`JSON.parse(localStorage.getItem('study-plan-english:holiday2400:${subject}:v1'))`);
  assert.equal(block.questions.filter((question) => state.attempts[question.id]?.correct).length, score);
}
function cloudState() { return cloud.get(scope); }
try {
  await viewport(1440, 1000);
  await send("Page.navigate", { url });
  await waitFor(`document.querySelectorAll('[data-chapter]').length===24&&!document.body.textContent.includes('正在读取')`, "overview ready");
  assert.equal(await evaluate(`document.querySelectorAll('[data-question]').length`), 0);
  assert.equal(report.requests.length, 0);
  assert.ok(await evaluate(`document.querySelector('[data-chapter="CH01"]').textContent.includes('正确率')`));
  await screenshot("desktop-chapters.png");
  report.checks.push("24 chapter entrances; no questions fetched before opening a chapter");
  await evaluate(`document.querySelector('[data-chapter="CH01"]').click()`);
  await waitFor(`document.querySelectorAll('[data-question]').length===10&&!document.querySelector('[aria-busy="true"]')`, "chapter ready");
  assert.ok(report.requests.every((query) => query.includes("chapter=CH01")));
  assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0);
  assert.equal(await evaluate(`document.querySelectorAll('input:checked').length`), 0);
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-question]')).map(e=>e.dataset.question)`), list({ chapter: "CH01", page: 1 }).blocks.flatMap((block) => block.questions.map((question) => question.id)));
  await screenshot("desktop-questions.png");
  report.checks.push("PDF numbering/order preserved; initial answers and selections hidden");
  const first = list({ chapter: "CH01", page: 1 }).blocks[0];
  await evaluate(`document.querySelector('[data-block="${first.id}"] button[type="submit"]').click()`);
  await delay(300); assert.equal(report.submissions, 0);
  assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0);
  await fill(first, 1); await submit(first, 0);
  await fill(first, 0);
  assert.equal(await evaluate(`document.querySelector('[data-feedback="CH01-Q001"]')!==null`), false);
  await submit(first, 1);
  await delay(600);
  assert.equal(Object.keys(cloudState().attempts).length, 1);
  assert.equal(cloudState().attempts["CH01-Q001"].submissions, 2);
  report.checks.push("empty input blocked; wrong/correct retries grade automatically without inflating answered count");
  await page(3);
  const cloze = list({ chapter: "CH01", page: 3 }).blocks.at(-1);
  assert.equal(cloze.kind, "cloze");
  assert.equal(await evaluate(`document.querySelector('[data-block="${cloze.id}"]').textContent.includes('{1}')`), false);
  await evaluate(`document.querySelector('[data-question="${cloze.questions[0].id}"] input[value="A"]').click()`);
  const before = report.submissions;
  await evaluate(`document.querySelector('[data-block="${cloze.id}"] button[type="submit"]').click()`);
  await delay(250); assert.equal(report.submissions, before);
  assert.equal(await evaluate(`document.querySelectorAll('[data-block="${cloze.id}"] [data-feedback]').length`), 0);
  await fill(cloze, 2); await submit(cloze, 3);
  await delay(600);
  assert.equal(Object.keys(cloudState().attempts).length, 6);
  assert.equal(Object.values(cloudState().attempts).filter((attempt) => attempt.correct).length, 4);
  await screenshot("desktop-cloze-feedback.png");
  report.checks.push("complete cloze passage with five numbered blanks; incomplete submission blocked; per-blank grading and explanations");
  controls.failCheck = true;
  await fill(cloze, 0);
  await evaluate(`document.querySelector('[data-block="${cloze.id}"] button[type="submit"]').click()`);
  await waitFor(`document.querySelector('[data-block="${cloze.id}"]').textContent.includes('QA grading unavailable')`, "grading failure");
  assert.equal(await evaluate(`document.querySelectorAll('[data-block="${cloze.id}"] [data-feedback]').length`), 0);
  assert.equal(Object.values(cloudState().attempts).filter((attempt) => attempt.correct).length, 4);
  controls.failCheck = false;
  controls.failCloud = true;
  await submit(cloze, 5);
  await delay(750);
  assert.equal(Object.values(cloudState().attempts).filter((attempt) => attempt.correct).length, 4);
  await send("Page.reload", {});
  await waitFor(`document.querySelector('[data-question="CH01-Q026"]')&&!document.querySelector('[aria-busy="true"]')`, "offline local restore");
  assert.equal(await evaluate(`document.querySelectorAll('[data-feedback]').length`), 0);
  assert.equal(await evaluate(`document.querySelectorAll('[data-block="${cloze.id}"] input:checked').length`), 5);
  controls.failCloud = false;
  await evaluate(`window.dispatchEvent(new Event('online'))`);
  const end = Date.now() + 8000;
  while (Date.now() < end && Object.values(cloudState()?.attempts ?? {}).filter((attempt) => attempt.correct).length !== 6) await delay(200);
  assert.equal(Object.values(cloudState().attempts).filter((attempt) => attempt.correct).length, 6);
  assert.doesNotMatch(JSON.stringify(cloudState()), /"(?:correctOption|correctText|explanation)":/);
  report.checks.push("failed grading changes no statistics; offline drafts/attempts restored and resynced; solutions never persisted");
  await viewport(390, 844, true);
  await evaluate(`window.scrollTo(0,document.querySelector('[data-block="${cloze.id}"]').offsetTop-25)`);
  await screenshot("mobile-cloze.png");
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+1`));
  await evaluate(`document.documentElement.style.fontSize='20px'`);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+1`));
  report.checks.push("mobile and enlarged text remain single-column with no horizontal overflow");
  await send("Page.navigate", { url: `${url}/CH24` });
  await waitFor(`document.querySelector('[data-question="CH24-Q001"]')&&!document.querySelector('[aria-busy="true"]')`, "last chapter");
  await evaluate(`(()=>{ const e=document.querySelector('select[aria-label="选择题目页码"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'10');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`!!document.querySelector('[data-question="CH24-Q100"]')`, "last page final item");
  assert.equal(await evaluate(`document.querySelectorAll('[data-question]').length`), 10);
  await send("Page.navigate", { url });
  await waitFor(`document.querySelectorAll('[data-chapter]').length===24&&!document.body.textContent.includes('正在读取')`, "completed overview");
  assert.ok(await evaluate(`document.querySelector('[data-chapter="CH01"]').textContent.includes('100%')`));
  assert.ok(await evaluate(`document.querySelector('[data-chapter="CH02"]').textContent.includes('已答 0')`));
  await screenshot("mobile-progress.png");
  assert.equal(report.runtimeErrors.length, 0);
  assert.equal(report.realProgressWrites, 0);
  report.checks.push("chapter and total accuracy/answered progress persist; last PDF item CH24-Q100 reachable in fixed order");
  const output = new URL("../../tmp/english2400-qa/", import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL("browser-report.json", output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await qa.close(); }
