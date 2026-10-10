import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readTestBankAnswers, readTestBankImage } from "./grade6-bank-test-utils.mjs";

// Mutations are forbidden outside this isolated local development port.
const base = "http://localhost:3026";
const subject = "00000000-0000-4000-8000-000000000626";
const payload = `v1.${Date.now() + 3600000}`;
const token = `${payload}.${createHmac("sha256", "grade6-local-qa-secret").update(payload).digest("base64url")}`;
const cookie = `congcong_family_access=${token}`;
const root = "content/grade6-bank";
const manifest = JSON.parse(await fs.readFile(root + "/manifest.json", "utf8"));
const questions = JSON.parse(await fs.readFile(root + "/questions.public.json", "utf8"));
const answers = await readTestBankAnswers();
const amap = new Map(answers.map((a) => [a.id, a]));
const revisions = new Map();
async function request(address, body, method = "GET", origin = base, authenticated = true) {
  const r = await fetch(base + address, { method, headers: { ...(authenticated ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json", Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(60000) });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { /* HTML/image */ }
  return { status: r.status, text, json, cache: r.headers.get("cache-control"), type: r.headers.get("content-type") };
}
const rootRoute = `/subjects/${subject}/math/problem-bank`;
const initialProgress = await request(`/api/math/grade6-bank/progress?subject_id=${subject}`);
assert.equal(initialProgress.status, 200);
for (const [id, response] of Object.entries(initialProgress.json.responses)) revisions.set(id, response.revision);
const html = await request(rootRoute); assert.equal(html.status, 200); assert(html.text.includes("章节专项训练")); assert(html.text.includes("综合练习"));
assert(!html.text.includes("answers.private")); assert(!html.text.includes("sourceKeyImages"));
const assets = [...html.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map((x) => x[1]);
for (const asset of assets) { const r = await request(asset); assert.equal(r.status, 200); assert(!r.text.includes("source_matched_structured")); assert(!r.text.includes("answers.private.json")); }
for (const c of manifest.collections) { assert.equal((await request(rootRoute + "/" + c.id)).status, 200, c.id); }
assert.equal((await request(rootRoute + "/unknown")).status, 404);
for (const old of ["equations", "factors", "fractions", "solids"]) assert.equal((await request(rootRoute + "/" + old)).status, 307);
const selected = process.argv.includes("--all") ? questions : questions.filter((q, i) => i % 40 === 0 || q.inputs.length > 3).slice(0, 100);
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < selected.length) {
    const q = selected[next++], r = await request(`/api/math/grade6-bank/questions/${q.id}`);
    assert.equal(r.status, 200, q.id); assert(r.cache?.includes("no-store")); assert.equal(r.json.id, q.id);
    assert(!/"(?:answerText|answerImages|rules|grading|expected|sourceKeyImages)":/.test(r.text));
    assert.deepEqual(r.json.inputs, q.inputs);
    for (const address of r.json.questionImages) { const image = await request(address); assert.equal(image.status, 200, address); assert(image.type?.startsWith("image/")); }
  }
}));
assert.equal((await request(`/api/math/grade6-bank/questions/${questions[0].id}`, null, "GET", base, false)).status, 401);
assert.equal((await request(`/api/math/grade6-bank/questions/${questions[0].id}/images/0`, null, "GET", base, false)).status, 401);
for (const privatePath of ["/content/grade6-bank/answers.private.json", "/content/grade6-bank/private/enrichment/answers/file.webp", "/api/math/grade6-bank/answers", "/api/math/grade6-bank/questions/unknown/images/0"]) assert.equal((await request(privatePath)).status, 404);
const auto = ["SYNC-", "G6E-", "G6-T"].flatMap((prefix) => {
  const pool = questions.filter((q) => q.id.startsWith(prefix) && !amap.get(q.id).reviewRequired);
  return pool.filter((q, i) => i % Math.max(1, Math.floor(pool.length / 4)) === 0).slice(0, 4);
});
const review = questions.find((q) => { const a = amap.get(q.id); return a.reviewRequired && !["missing", "mismatch"].includes(a.answerStatus); });
const missing = questions.find((q) => ["missing", "mismatch"].includes(amap.get(q.id).answerStatus));
for (const q of [...auto, ...[review, missing].filter(Boolean)]) {
  const a = amap.get(q.id);
  const myAnswers = a.rules.length ? Object.fromEntries(a.rules.map((r) => [r.id, r.expected[0]])) : Object.fromEntries(q.inputs.map((i) => [i.id, i.kind === "choice" ? i.choices[0] : "本地验收作答"]));
  const body = { subject_id: subject, question_id: q.id, answers: myAnswers, base_revision: revisions.get(q.id) ?? 0 };
  assert.equal((await request("/api/math/grade6-bank/submit", { ...body, answers: {} }, "POST")).status, 400);
  assert.equal((await request("/api/math/grade6-bank/submit", { ...body, expected: "forged" }, "POST")).status, 400);
  assert.equal((await request("/api/math/grade6-bank/submit", body, "POST", "https://untrusted.example")).status, 403);
  const r = await request("/api/math/grade6-bank/submit", body, "POST"); assert.equal(r.status, 200, q.id);
  assert.equal(r.json.response.revision, body.base_revision + 1);
  revisions.set(q.id, r.json.response.revision);
  assert.equal(r.json.feedback.outcome, !a.reviewRequired ? "correct" : ["missing", "mismatch"].includes(a.answerStatus) ? "missing" : "review");
  assert.equal(r.json.feedback.answerImages.length, a.answerImages.length);
  assert(r.json.feedback.answerImages.every((i) => i.startsWith("data:image/")));
  for (let i = 0; i < a.answerImages.length; i++) assert(Buffer.from(r.json.feedback.answerImages[i].split(",")[1], "base64").equals(await readTestBankImage(a.answerImages[i])), q.id + " incorrect private image association");
  assert(!r.text.includes("sourceKeyImages")); assert(!r.text.includes('"rules":')); assert(!r.text.includes('"expected":'));
  // An old device's draft must not erase the newly graded submission.
  const stale = await request("/api/math/grade6-bank/draft", body, "PUT");
  assert.equal(stale.status, 409); assert.equal(stale.json.response.submitted, true);
  assert.equal(stale.json.response.revision, revisions.get(q.id));
  assert(!stale.text.includes("answerImages")); assert(!stale.text.includes("feedback"));
  if (!a.reviewRequired) {
    const wrong = Object.fromEntries(q.inputs.map((i) => [i.id, i.kind === "choice" ? i.choices.find((x) => !a.rules.find((k) => k.id === i.id).expected.includes(x)) : "故意错误"]));
    if (Object.values(wrong).every(Boolean)) {
      const r = await request("/api/math/grade6-bank/submit", { ...body, base_revision: revisions.get(q.id), answers: wrong }, "POST");
      assert.equal(r.status, 200); assert.equal(r.json.feedback.outcome, "incorrect"); revisions.set(q.id, r.json.response.revision);
    }
  }
  const draft = await request("/api/math/grade6-bank/draft", { ...body, base_revision: revisions.get(q.id) }, "PUT"); assert.equal(draft.status, 200); assert.equal(draft.json.submitted, false); revisions.set(q.id, draft.json.revision);
}
const concurrentQuestion = questions.find((q) => !revisions.has(q.id));
const concurrentBody = { subject_id: subject, question_id: concurrentQuestion.id, answers: Object.fromEntries(concurrentQuestion.inputs.map((i) => [i.id, i.kind === "choice" ? i.choices[0] : "并发草稿测试"])), base_revision: 0 };
const concurrent = await Promise.all([request("/api/math/grade6-bank/draft", concurrentBody, "PUT"), request("/api/math/grade6-bank/draft", concurrentBody, "PUT")]);
assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
assert.equal(concurrent.find((r) => r.status === 200).json.revision, 1);
assert.equal((await request("/api/math/grade6-bank/draft", { ...concurrentBody, base_revision: -1 }, "PUT")).status, 400);
const progress = await request(`/api/math/grade6-bank/progress?subject_id=${subject}`); assert.equal(progress.status, 200);
assert(!/"(?:answerText|answerImages|rules|expected|sourceKeyImages)":/.test(progress.text));
console.log(JSON.stringify({ passed: true, publicQuestionsVerified: selected.length, collections: manifest.collections.length, autoSubmissionChecks: auto.length, reviewCheck: !!review, missingCheck: !!missing, isolatedTestMemory: true }));
