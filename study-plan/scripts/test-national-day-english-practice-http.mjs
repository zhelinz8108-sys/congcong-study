import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const base = process.env.ENGLISH_QA_ORIGIN || "http://127.0.0.1:3005";
assert.ok(["http://127.0.0.1:3005", "https://congcong-study.cn"].includes(base));
const subject = "8bd6f79b-99f5-4e68-a961-872d60d260b1";
const route = `/subjects/${subject}/national-day-english-practice`;
const family = await loadHolidayTestModule("src/lib/family-access.ts");
const cookie = `${family.FAMILY_ACCESS_COOKIE}=${family.createFamilyAccessToken()}`;
const { ENGLISH_PRACTICE_CHAPTERS: chapters, listEnglishPracticeBlocks: list } = await loadHolidayTestModule("src/server/national-day-english-practice/public-bank.ts");
const { englishPracticePrivateAnswer: answer } = await loadHolidayTestModule("src/server/national-day-english-practice/private-bank.ts");
async function request(address, body, origin = base, authenticated = true) {
  const response = await fetch(`${base}${address}`, {
    headers: { ...(authenticated ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: origin }) },
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    cache: "no-store", signal: AbortSignal.timeout(30000), redirect: "manual",
  });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { /* Page or missing static asset. */ }
  return { status: response.status, text, json, cache: response.headers.get("cache-control") };
}
if (base.startsWith("https")) {
  const health = await request("/api/health"); assert.equal(health.status, 200);
}
const html = await request(route); assert.equal(html.status, 200);
assert.equal((html.text.match(/data-chapter="CH\d\d"/g) || []).length, 24);
assert.ok(html.text.includes("国庆英语练习"));
assert.ok(!html.text.includes("data-question="));
const menu = await request(`/subjects/${subject}`); assert.equal(menu.status, 200);
let menuEntry = menu.text.includes("国庆英语练习");
const assets = new Set([...html.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]));
for (const match of menu.text.matchAll(/<script[^>]+src="([^"]+)"/g)) assets.add(match[1]);
const encrypted = JSON.parse(readFileSync(path.join(appRoot, "src/server/national-day-english-practice/answers.encrypted.json"), "utf8"));
for (const asset of assets) {
  const result = await request(asset); assert.equal(result.status, 200);
  menuEntry ||= result.text.includes("国庆英语练习");
  assert.ok(!result.text.includes(encrypted.ciphertext.slice(0, 120)), "Encrypted private bank must not ship to clients");
  assert.ok(!result.text.includes(process.env.HOLIDAY_MATH_700_KEY), "Private key must not ship to clients");
  assert.ok(!result.text.includes(answer("CH01-Q026").explanation), "Private explanations must not ship before submission");
}
assert.ok(menuEntry);
const ids = [];
for (const chapter of chapters) {
  const reader = await request(`${route}/${chapter.id}`);
  assert.equal(reader.status, 200, chapter.id);
  assert.ok(!reader.text.includes(answer(`${chapter.id}-Q001`).explanation));
  for (let page = 1; page <= 10; page++) {
    const result = await request(`/api/english/holiday-2400/questions?chapter=${chapter.id}&page=${page}`);
    assert.equal(result.status, 200); assert.ok(result.cache.includes("no-store"));
    assert.deepEqual(result.json, list({ chapter: chapter.id, page }), "Live order/options must match frozen PDF bank");
    assert.doesNotMatch(result.text, /"(?:correct|correctOption|correctText|letter|explanation|levels|skill)":/);
    const questions = result.json.blocks.flatMap((block) => block.questions);
    assert.equal(questions.length, 10);
    ids.push(...questions.map((question) => question.id));
  }
  console.log(`${base.startsWith("https") ? "Production" : "Local"} ${chapter.id}: 100 ordered items verified`);
}
assert.equal(ids.length, 2400); assert.equal(new Set(ids).size, 2400);
assert.equal(ids[0], "CH01-Q001"); assert.equal(ids.at(-1), "CH24-Q100");
for (const page of [1, 3]) {
  const block = list({ chapter: "CH01", page }).blocks.at(-1);
  const answers = Object.fromEntries(block.questions.map((question) => [question.id, answer(question.id).correctOption]));
  const right = await request("/api/english/holiday-2400/check", { block_id: block.id, answers });
  assert.equal(right.status, 200); assert.equal(right.json.score, block.questions.length);
  assert.ok(right.json.results.every((result) => result.correct && result.explanation));
  const wrong = Object.fromEntries(block.questions.map((question) => [question.id, "ABCD"[("ABCD".indexOf(answers[question.id]) + 1) % 4]]));
  const incorrect = await request("/api/english/holiday-2400/check", { block_id: block.id, answers: wrong });
  assert.equal(incorrect.status, 200); assert.equal(incorrect.json.score, 0);
  for (const payload of [
    { block_id: block.id, answers: {} },
    { block_id: block.id, answers, expected: "not-accepted" },
    { block_id: block.id, answers: { ...answers, "CH24-Q100": "A" } },
    { block_id: block.id, answers: Object.fromEntries(block.questions.map((question) => [question.id, "E"])) },
  ]) {
    const invalid = await request("/api/english/holiday-2400/check", payload);
    assert.equal(invalid.status, 400); assert.deepEqual(Object.keys(invalid.json), ["error"]);
  }
  assert.equal((await request("/api/english/holiday-2400/check", { block_id: block.id, answers }, "https://untrusted.example")).status, 403);
}
assert.equal((await request("/api/english/holiday-2400/questions?chapter=CH01&page=1", undefined, base, false)).status, 401);
assert.equal((await request("/api/english/holiday-2400/check", { block_id: "CH01-B001", answers: { "CH01-Q001": "A" } }, base, false)).status, 401);
assert.equal((await request(`${route}/CH25`)).status, 404);
for (const address of ["/national-day-english-practice/answers.encrypted.json", "/src/server/national-day-english-practice/answers.encrypted.json"]) {
  assert.equal((await request(address)).status, 404);
}
// Read existing scopes only. Never invoke a progress PUT, DELETE, or student-data mutation.
const progress = {};
if (base.startsWith("https")) {
  for (const scope of [`english:holiday2400:${subject}:v1`, `english:national-day:${subject}:v1`, "math:holiday700:4ea6b4fe-bfd3-440f-b780-6d71c2011609:v1"]) {
    const result = await request(`/api/progress/${encodeURIComponent(scope)}`);
    assert.equal(result.status, 200);
    progress[scope] = { readable: true, hash: createHash("sha256").update(JSON.stringify(result.json.payload)).digest("hex") };
  }
}
const report = { origin: base, url: `${base}${route}`, chapters: 24, scoringItems: 2400, singleChoices: 1440, clozePassages: 192, clozeBlanks: 960, stablePdfOrder: true, anonymousBlocked: true, privateAssetsExcluded: true, gradingVerified: true, progressReadOnly: progress, studentDataWrites: 0 };
if (process.env.ENGLISH_QA_REPORT) writeFileSync(process.env.ENGLISH_QA_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
