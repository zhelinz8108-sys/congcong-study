import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import nextEnv from "@next/env";

// Production is read-only except authentication. No grading/draft/progress
// mutation is permitted. Credentials and cookies never leave process memory.
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const base = "https://congcong-study.cn";
const subject = "4ea6b4fe-bfd3-440f-b780-6d71c2011609";
const dir = `/subjects/${subject}/math/problem-bank`;
const root = "content/grade6-bank";
const baselinePath = path.resolve("../tmp/grade6-bank-native/production-baseline.json");
const password = process.env.FAMILY_ACCESS_PASSWORD?.trim();
assert(password, "Existing family access configuration required");
const login = await fetch(base + "/api/access/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(45000), redirect: "manual" });
assert.equal(login.status, 200, "Family authentication");
const cookie = login.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
assert(cookie);
async function get(route, expected = 200) {
  assert(route.startsWith("/") && !route.startsWith("//"));
  const r = await fetch(base + route, { headers: { Cookie: cookie }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(45000) });
  assert.equal(r.status, expected, route);
  return r;
}
assert.equal((await (await get("/api/access/profile")).json()).profile.id, "congcong");
const sha = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const progressRoute = `/api/math/grade6-bank/progress?subject_id=${subject}`;
async function snapshot() {
  const progress = await (await get(progressRoute)).json();
  assert(progress.responses && typeof progress.responses === "object");
  const records = Object.fromEntries(Object.entries(progress.responses).map(([id, value]) => [id, { digest: sha(value), revision: value.revision, submissions: value.submissions, submitted: value.submitted }]));
  const holiday = await (await get(`/api/progress/${encodeURIComponent(`math:national-day:${subject}:v1`)}`)).json();
  return { records, holidayDigest: sha(holiday), at: new Date().toISOString() };
}
if (process.argv.includes("--baseline")) {
  const before = await snapshot();
  await fs.mkdir(path.dirname(baselinePath), { recursive: true });
  await fs.writeFile(baselinePath, JSON.stringify(before));
  console.log(JSON.stringify({ readOnly: true, baselineRecords: Object.keys(before.records).length, studentWrites: 0 }));
} else {
  const before = JSON.parse(await fs.readFile(baselinePath, "utf8"));
  const manifest = JSON.parse(await fs.readFile(root + "/manifest.json", "utf8"));
  const original = JSON.parse(await fs.readFile(root + "/questions.public.json", "utf8"));
  const release = JSON.parse(await fs.readFile(root + "/questions.native.public.json", "utf8"));
  const native = new Map(release.questions.map((q) => [q.id, q]));
  assert.equal(native.size, 2394);
  const html = await (await get(dir)).text();
  assert(html.includes("章节专项训练") && html.includes("综合练习"));
  for (const c of manifest.collections) {
    assert(html.includes(`href="${dir}/${c.id}"`));
    const page = await (await get(dir + "/" + c.id)).text();
    assert(page.includes(c.title) && page.includes("跳转到题号"));
    assert(!/<(?:iframe|embed|object)\b/i.test(page));
  }
  const forbidden = new Set(["answerText", "answerImages", "rules", "expected", "reviewRequired", "answerStatus", "ciphertext", "feedback"]);
  function publicOnly(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert(!forbidden.has(key), "Private data was exposed before submission");
      if (typeof child === "object") publicOnly(child);
    }
  }
  let cursor = 0, checked = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < original.length) {
      const q = original[cursor++], r = await get(`/api/math/grade6-bank/questions/${q.id}`);
      assert(r.headers.get("cache-control")?.includes("no-store"));
      const data = await r.json(); publicOnly(data);
      assert.deepEqual(data.native, native.get(q.id).native, q.id);
      assert.deepEqual(data.inputs, native.get(q.id).inputs, q.id);
      assert.deepEqual(data.questionImages, [], q.id);
      for (const field of ["id", "collectionId", "number", "originalNumber", "difficulty", "chapter"]) assert.deepEqual(data[field], q[field]);
      checked++;
    }
  }));
  for (const route of ["/content/grade6-bank/sealed/native-answers.encrypted.json", "/content/grade6-bank/private/native-review-ledger.json", "/api/math/grade6-bank/answers"]) await get(route, 404);
  const after = await snapshot();
  let unchanged = 0, advanced = 0;
  for (const [id, prior] of Object.entries(before.records)) {
    const current = after.records[id]; assert(current, "An original progress record disappeared");
    assert(current.revision >= prior.revision && current.submissions >= prior.submissions, "An original progress record regressed");
    if (current.revision === prior.revision) { assert.equal(current.digest, prior.digest, "Unchanged revision must preserve its complete original record"); unchanged++; }
    else advanced++;
  }
  console.log(JSON.stringify({ deployed: true, nativeQuestions: checked, collections: manifest.collections.length, previousRecordsPreserved: unchanged, concurrentlyAdvanced: advanced, holidayProgressUnchanged: before.holidayDigest === after.holidayDigest, privateAnswersNotPublic: true, studentWrites: 0 }));
}
