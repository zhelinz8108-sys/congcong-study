import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const { buildMathAudioLessons, speakMathText, splitMathSpeech } = await loadHolidayTestModule("src/lib/national-day-math-audio.ts");
const { MathLessonSpeaker } = await loadHolidayTestModule("src/lib/math-lesson-speaker.ts");
const book = JSON.parse(readFileSync(new URL("../src/data/national-day-math.json", import.meta.url), "utf8"));

test("all 21 sections, 117 examples and 89 practice prompts have speech without quiz solutions", () => {
  const sections = structuredClone(book.sections);
  for (const section of sections) for (const block of section.blocks) if (block.type === "quiz") {
    block.answer = "PRIVATE_ANSWER_SENTINEL";
    block.steps = ["PRIVATE_STEP_SENTINEL"];
    block.pitfall = "PRIVATE_PITFALL_SENTINEL";
    block.accepted = ["PRIVATE_ACCEPTED_SENTINEL"];
  }
  const lessons = buildMathAudioLessons(sections);
  assert.equal(new Set(lessons.map(lesson => lesson.sectionId)).size, 21);
  assert.equal(lessons.filter(lesson => lesson.kind === "example").length, 117);
  assert.equal(lessons.filter(lesson => lesson.kind === "practice").length, 89);
  assert.equal(new Set(lessons.map(lesson => lesson.id)).size, lessons.length);
  assert.doesNotMatch(JSON.stringify(lessons), /PRIVATE_.*SENTINEL/);
  for (const section of sections) for (const block of section.blocks) if (block.type === "example") {
    const lesson = lessons.find(lesson => lesson.id === block.id);
    for (const step of block.steps) assert.ok(lesson.text.includes(speakMathText(step)), block.id);
    assert.ok(lesson.text.includes(speakMathText(block.answer)), block.id);
  }
  for (const lesson of lessons) assert.ok(splitMathSpeech(lesson.text).every(chunk => chunk.length > 0 && chunk.length <= 45));
  console.log(JSON.stringify({ sections: 21, examples: 117, practicePrompts: 89, tracks: lessons.length }));
});

test("Chinese speech preserves fractions, percentages, ratios, powers and binary place values", () => {
  assert.equal(speakMathText("2又1/3"), "2又3分之1");
  assert.equal(speakMathText("3/8 + 5/8 = 1"), "8分之3 加 8分之5 等于 1");
  assert.equal(speakMathText("12.5%"), "百分之12.5");
  assert.equal(speakMathText("1∶500"), "1比500");
  assert.equal(speakMathText("πr²≈3.14×4"), "圆周率 乘 半径的平方约等于3.14乘4");
  assert.equal(speakMathText("2πr"), "2 乘 圆周率 乘 r");
  assert.equal(speakMathText("3.14m"), "3.14米");
  assert.equal(speakMathText("3cm²"), "3平方厘米");
  assert.equal(speakMathText("101₂"), "二进制数 1 0 1");
  assert.ok(splitMathSpeech("3.14乘2等于6.28。继续计算。", 90)[0].includes("3.14"));
});

function fixture() {
  const spoken = [], states = [];
  let pauses = 0, resumes = 0, cancels = 0;
  const engine = {
    speak: line => spoken.push(line), cancel: () => { cancels++; },
    pause: () => { pauses++; }, resume: () => { resumes++; },
  };
  const lessons = [
    { id: "lesson", text: "先理解。再计算。", kind: "lesson" },
    { id: "quiz", text: "独立完成。", kind: "practice" },
    { id: "next", text: "继续上课。", kind: "lesson" },
  ];
  const player = new MathLessonSpeaker(engine, text => ({ text }), lessons, state => states.push(state));
  return { player, spoken, states, counts: () => ({ pauses, resumes, cancels }) };
}

test("speech starts only on request, pauses and resumes, advances lessons and stops after practice", () => {
  const h = fixture();
  assert.equal(h.spoken.length, 0);
  h.player.play();
  assert.equal(h.spoken[0].lang, "zh-CN");
  h.player.pause(); assert.equal(h.player.state.status, "paused");
  h.player.play(); assert.equal(h.counts().resumes, 1); assert.equal(h.spoken.length, 1);
  h.spoken.at(-1).onend(); assert.equal(h.spoken.at(-1).text, "再计算。");
  h.spoken.at(-1).onend(); assert.equal(h.player.state.lesson, 1);
  h.spoken.at(-1).onend();
  assert.equal(h.player.state.status, "finished"); assert.equal(h.player.state.lesson, 1);
  assert.equal(h.spoken.length, 3, "a practice prompt must never play the following lesson automatically");
});

test("cancel callbacks cannot restart old audio when skipping, changing speed, stopping or leaving", () => {
  const h = fixture(); h.player.play();
  const old = h.spoken.at(-1);
  h.player.select(2, true); old.onend(); old.onerror({ error: "interrupted" });
  assert.equal(h.player.state.lesson, 2); assert.equal(h.player.state.status, "playing");
  const beforeRate = h.spoken.at(-1);
  h.player.configure(1.25, { voiceURI: "zh-test" }, true);
  assert.equal(h.spoken.at(-1).rate, 1.25);
  const afterRate = h.spoken.length; beforeRate.onend(); assert.equal(h.spoken.length, afterRate);
  const beforeStop = h.spoken.at(-1); h.player.stop(); beforeStop.onend();
  assert.equal(h.player.state.status, "idle"); assert.equal(h.spoken.length, afterRate);
  h.player.play(); const beforeLeave = h.spoken.at(-1); h.player.dispose();
  const before = h.spoken.length; beforeLeave.onend(); h.player.play(); assert.equal(h.spoken.length, before);
});

test("single-segment mode, transcript seeking and retry after synthesis failure", () => {
  const h = fixture(); h.player.configure(0.75, null, false); h.player.select(0, true, 1);
  assert.equal(h.spoken.at(-1).text, "再计算。");
  h.spoken.at(-1).onend(); assert.equal(h.player.state.status, "finished"); assert.equal(h.player.state.lesson, 0);
  h.player.play(); assert.equal(h.spoken.at(-1).text, "先理解。");
  h.spoken.at(-1).onerror({ error: "synthesis-unavailable" }); assert.equal(h.player.state.status, "error");
  h.player.play(); assert.equal(h.player.state.status, "playing");
  h.player.select(-1, true); assert.equal(h.player.state.lesson, 0);
});
