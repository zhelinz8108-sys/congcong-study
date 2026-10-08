import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { englishBrowserHarness } from "./english-practice-browser-utils.mjs";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

// Every real rendered question is checked. Progress traffic is intercepted; no real writes.
const qa = await englishBrowserHarness();
const { listEnglishPracticeBlocks: list } = await loadHolidayTestModule("src/server/national-day-english-practice/public-bank.ts");
const base = `${qa.origin}/subjects/8bd6f79b-99f5-4e68-a961-872d60d260b1/national-day-english-practice`;
const measurements = [];
const id = (chapter, number) => `${chapter}-Q${String(number).padStart(3, "0")}`;

async function inspect(chapter, numbers, label) {
  const expected = Object.fromEntries(numbers.map(number => {
    const block = list({ chapter, page: Math.ceil(number / 10) }).blocks.find(b => b.questions.some(q => q.number === number));
    const question = block.questions.find(q => q.number === number);
    return [number, { options: question.options, kind: block.kind, text: block.text,
      short: block.kind === "choice" && block.stem.length < 150 && Math.max(...question.options.map(o => o.length)) < 70 }];
  }));
  const result = await qa.evaluate(`(async()=>{
    const expected=${JSON.stringify(expected)}, numbers=${JSON.stringify(numbers)}, chapter=${JSON.stringify(chapter)};
    const failures=[]; let maxEmptyGap=0, minPane=Infinity, shortChecked=0;
    for (const number of numbers) {
      const qid=chapter+'-Q'+String(number).padStart(3,'0');
      const select=document.querySelector('select[aria-label="选择题号"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,String(number));
      select.dispatchEvent(new Event('change',{bubbles:true}));
      const until=Date.now()+15000;
      while (!document.querySelector('[data-active-question="'+qid+'"]') && Date.now()<until) await new Promise(r=>setTimeout(r,15));
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const card=document.querySelector('[data-active-question="'+qid+'"]');
      if(!card){failures.push(qid+': missing');continue;}
      const pane=card.querySelector('[data-question-scroll]'), footer=card.querySelector('footer');
      const options=[...card.querySelectorAll('[data-option-text]')].map(e=>e.textContent);
      if(JSON.stringify(options)!==JSON.stringify(expected[number].options)) failures.push(qid+': option content/order');
      if(document.querySelectorAll('[data-question]').length!==1 || document.querySelector('[data-feedback]')) failures.push(qid+': not one unrevealed item');
      if(card.getBoundingClientRect().bottom>innerHeight+1 || document.documentElement.scrollHeight>innerHeight+2) failures.push(qid+': vertical overflow');
      if(document.documentElement.scrollWidth>innerWidth+1 || pane.scrollWidth>pane.clientWidth+1) failures.push(qid+': horizontal overflow');
      if(footer.getBoundingClientRect().bottom>innerHeight+1 || footer.getBoundingClientRect().top<0) failures.push(qid+': footer not visible');
      if(pane.clientHeight<80) failures.push(qid+': reading pane too small');
      minPane=Math.min(minPane,pane.clientHeight);
      const labels=[...card.querySelectorAll('[data-question] label')];
      if(labels.length!==4 || labels.some(e=>e.getBoundingClientRect().height<44)) failures.push(qid+': touch target');
      if(labels.some(e=>getComputedStyle(e.querySelector('[data-option-text]')).textOverflow==='ellipsis')) failures.push(qid+': truncated option');
      if(expected[number].kind==='cloze') {
        const blanks=[...card.querySelectorAll('[class*="passageBlank"]')];
        if(blanks.length!==5 || blanks.filter(e=>e.dataset.active==='true').length!==1) failures.push(qid+': cloze blanks');
        if(card.textContent.includes('{1}')) failures.push(qid+': raw placeholder');
      }
      if(expected[number].short && pane.scrollHeight<=pane.clientHeight+1) {
        shortChecked++;
        const gap=footer.getBoundingClientRect().top-labels.at(-1).getBoundingClientRect().bottom;
        maxEmptyGap=Math.max(maxEmptyGap,gap);
        if(gap>55) failures.push(qid+': excessive blank gap '+Math.round(gap));
      }
    }
    return {count:numbers.length,failures,maxEmptyGap:Math.round(maxEmptyGap),minPane,shortChecked};
  })()`);
  assert.deepEqual(result.failures, [], `${label}: rendered layout failures`);
  measurements.push({ label, ...result });
}

try {
  for (const [width, height, mobile] of [[1920, 1080, false], [390, 844, true]]) {
   await qa.viewport(width, height, mobile);
   for (let c = 1; c <= 24; c++) {
    const chapter = `CH${String(c).padStart(2, "0")}`;
    await qa.send("Page.navigate", { url: `${base}/${chapter}` });
    await qa.waitFor(`!!document.querySelector('[data-active-question="${id(chapter, 1)}"]')`, chapter);
    // Small batches fit the CDP command deadline even when a data page needs compiling.
    for (let first = 1; first <= 100; first += 20)
      await inspect(chapter, Array.from({ length: 20 }, (_, i) => first + i), `${chapter}-${first} ${width}x${height}`);
    if (c <= 6 && !mobile) {
      await inspect(chapter, [1], `${chapter} pastel palette`);
      await qa.screenshot(`visual-palette-${chapter}.png`);
    }
    console.log(JSON.stringify({ scannedChapter: chapter, questions: 100, viewport: `${width}x${height}` }));
   }
  }
  for (const [width, height, mobile] of [[3840, 1866, false], [1366, 768, false], [1093, 614, false], [390, 844, true], [360, 640, true], [320, 568, true]]) {
    await qa.viewport(width, height, mobile);
    for (const [chapter, number] of [["CH01", 1], ["CH09", 96], ["CH11", 90], ["CH14", 81], ["CH16", 88], ["CH22", 91]]) {
      await qa.send("Page.navigate", { url: `${base}/${chapter}` });
      await qa.waitFor(`!!document.querySelector('[data-active-question]')`, `${chapter} responsive`);
      await inspect(chapter, [number], `${chapter} ${width}x${height}`);
      if (chapter === "CH01") await qa.screenshot(`visual-${width}x${height}.png`);
    }
  }
  assert.equal(qa.report.runtimeErrors.length, 0);
  assert.equal(qa.report.realProgressWrites, 0);
  assert.ok(measurements.reduce((sum,m)=>sum+m.shortChecked,0)>1000, "Blank-gap check must exercise real short questions");
  const report = { uniqueQuestions: 2400, renderedQuestionViews: 4800, responsiveCases: 36, failures: 0,
    largestShortQuestionBlankGap: Math.max(...measurements.map(m => m.maxEmptyGap)),
    studentDataWrites: 0, measurements };
  const output = new URL("../../tmp/english2400-qa/", import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL("layout-report.json", output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, measurements: `${measurements.length} measurement batches saved` }));
} finally { await qa.close(); }
