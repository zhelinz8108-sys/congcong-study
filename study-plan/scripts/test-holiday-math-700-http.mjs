import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  appRoot,
  loadHolidayTestModule,
  canonicalHolidayAnswer as canonical,
} from "./holiday-math-test-utils.mjs";
const origin = "http://127.0.0.1:3005";
const practicePath =
  "/subjects/4ea6b4fe-bfd3-440f-b780-6d71c2011609/national-day-math-practice";
const overview = await fetch(`${origin}${practicePath}`);
assert.equal(overview.status, 200);
const overviewHtml = await overview.text();
assert.equal((overviewHtml.match(/data-chapter="CH0[1-7]"/g) ?? []).length, 7);
assert.ok(overviewHtml.includes("正确率"));
assert.ok(!overviewHtml.includes('id="holiday-questions"'));
for (let chapter = 1; chapter <= 7; chapter++) {
  const response = await fetch(`${origin}${practicePath}/CH0${chapter}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("返回章节目录"));
  assert.ok(html.includes("本章练习进度"));
  assert.ok(html.includes('id="holiday-questions"'));
  assert.ok(!html.includes("data-chapter="));
}
const missingChapter = await fetch(`${origin}${practicePath}/CH99`);
assert.equal(missingChapter.status, 404);
const { holidayPrivateAnswer: privateAnswer } = await loadHolidayTestModule(
  "src/server/holiday-math-700/private-bank.ts",
);
const questions = JSON.parse(
  readFileSync(
    path.join(appRoot, "src/server/holiday-math-700/questions.public.json"),
    "utf8",
  ),
);
async function request(route, body, requestOrigin = origin) {
  const response = await fetch(`${origin}/api/math/holiday-700/${route}`, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: requestOrigin,
          },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(30000),
  });
  return {
    status: response.status,
    cache: response.headers.get("cache-control"),
    body: await response.json(),
  };
}
const ids = [];
for (let chapter = 1; chapter <= 7; chapter++)
  for (let page = 1; page <= 10; page++) {
    const result = await request(
      `questions?chapter=CH0${chapter}&page=${page}`,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.total, 100);
    assert.equal(result.body.questions.length, 10);
    ids.push(...result.body.questions.map((q) => q.id));
    assert.ok(result.cache.includes("no-store"));
    assert.doesNotMatch(
      JSON.stringify(result.body),
      /"(?:answer|accepted_answers|hints|solution|choice_rationales|common_mistakes)":/,
    );
  }
assert.equal(new Set(ids).size, 700);
for (const type of new Set(questions.map((q) => q.type))) {
  const q = questions.find((q) => q.type === type),
    answer = privateAnswer(q.id).answer;
  const correct = await request("check", {
    question_id: q.id,
    student_answer: canonical(answer),
  });
  assert.equal(correct.status, 200, q.id);
  assert.equal(correct.body.correct, true, q.id);
  assert.equal(correct.body.question_id, q.id);
  assert.ok(correct.body.solution.steps.length);
  assert.equal(correct.body.answer, undefined);
  assert.equal(correct.body.accepted_answers, undefined);
  const incomplete = await request("check", {
    question_id: q.id,
    student_answer: null,
  });
  assert.equal(incomplete.status, 400, q.id);
  assert.deepEqual(Object.keys(incomplete.body), ["error"]);
  const hint = await request("hint", { question_id: q.id, level: 1 });
  assert.equal(hint.status, 200);
  assert.deepEqual(Object.keys(hint.body).sort(), [
    "hint",
    "level",
    "question_id",
  ]);
  assert.equal(hint.body.hint, privateAnswer(q.id).hints[0]);
  const secondHint = await request("hint", { question_id: q.id, level: 2 });
  assert.equal(secondHint.status, 200);
  assert.deepEqual(Object.keys(secondHint.body).sort(), [
    "hint",
    "level",
    "question_id",
  ]);
  assert.equal(secondHint.body.hint, privateAnswer(q.id).hints[1]);
}
const q = questions[0],
  student = canonical(privateAnswer(q.id).answer);
assert.equal(
  (
    await request(
      "check",
      { question_id: q.id, student_answer: student },
      "https://untrusted.example",
    )
  ).status,
  403,
);
for (const body of [
  { question_id: q.id, student_answer: student, correct: true },
  { question_id: "__proto__", student_answer: "A" },
  { question_id: q.id, student_answer: "A".repeat(10000) },
]) {
  const result = await request("check", body);
  assert.ok(result.status >= 400);
  assert.deepEqual(Object.keys(result.body), ["error"]);
}
for (const q of questions.filter((q) => q.diagram)) {
  const response = await fetch(`${origin}/holiday-math-700/${q.diagram.src}`);
  assert.equal(response.status, 200, q.id);
  assert.match(await response.text(), /<svg/);
}
for (const route of [
  "/holiday-math-700/answers_private.json",
  "/holiday-math-700/answers.encrypted.json",
  "/src/server/holiday-math-700/answers.encrypted.json",
])
  assert.equal((await fetch(origin + route)).status, 404);

const source = process.argv[2];
if (source) {
  const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
  assert.equal(
    hash(
      readFileSync(
        path.join(appRoot, "src/server/holiday-math-700/questions.public.json"),
      ),
    ),
    hash(readFileSync(path.join(source, "dist/questions_public.json"))),
  );
  assert.equal(
    hash(readFileSync(path.join(source, "dist/question_bank_full.jsonl"))),
    "13b8282a5d964a277c605db132689f11914694b5b033c12283cbd56db57b1608",
  );
  const originalAnswers = JSON.parse(
    readFileSync(path.join(source, "dist/answers_private.json"), "utf8"),
  );
  for (const record of originalAnswers)
    assert.deepEqual(privateAnswer(record.question_id), record);
  for (const file of readdirSync(path.join(source, "assets/svg")))
    assert.equal(
      hash(readFileSync(path.join(source, "assets/svg", file))),
      hash(
        readFileSync(
          path.join(appRoot, "public/holiday-math-700/assets/svg", file),
        ),
      ),
    );
}
console.log(
  JSON.stringify(
    {
      browsableQuestions: 700,
      chapterPages: 70,
      typesChecked: 13,
      diagramsReachable: 82,
      correctSubmissions: true,
      incompleteRevealsNothing: true,
      hintsSeparate: true,
      crossOriginRejected: true,
      privateFilesNotPublic: true,
      originalSourcePreserved: !!source,
    },
    null,
    2,
  ),
);
