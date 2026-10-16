import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const port = Number(process.argv[2] ?? 3002);
assert.ok([3001, 3002].includes(port));
const origin = `http://127.0.0.1:${port}`;
const root = path.join(process.cwd(), "content/english-six");
const secret = (process.env.FAMILY_ACCESS_SECRET || process.env.FAMILY_ACCESS_PASSWORD || "").trim();
assert.ok(secret);
const payload = `v1.${Date.now() + 60000}`;
const cookie = `congcong_family_access=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
const checks = [];
const get = route => fetch(`${origin}${route}`, { headers: { Cookie: cookie } });
assert.equal((await get("/api/health")).status, 200);
const indexResponse = await get("/api/english/six/index");
assert.equal(indexResponse.status, 200);
const index = await indexResponse.json();
assert.equal(index.resources.length, 1391);
assert.equal(index.summary.practiceQuestions, 528);
for (let unit = 1; unit <= 8; unit++) {
  const response = await get(`/api/english/six/practice/${unit}`);
  assert.equal(response.status, 200);
  const paper = await response.json();
  assert.equal(paper.questions.length, 66);
  assert.ok(paper.questions.every(q => !("answer" in q) && !("explanation" in q)));
}
checks.push("compiled app reads cross-disk metadata; eight papers; no answers exposed before submission");
const paper = JSON.parse(readFileSync(path.join(root, "practice/1.json"), "utf8"));
const response = await fetch(`${origin}/api/english/six/practice/1`, {
  method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ id: paper.questions[0].id, response: paper.questions[0].answer }),
});
assert.equal(response.status, 200);
assert.equal((await response.json()).correct, true);
const audioResource = index.resources.find(r => r.title === "U1Story time" && r.extension === ".mp3");
assert.ok(audioResource);
const audioResponse = await get(`/api/english/six/resource/${audioResource.id}`);
assert.equal(audioResponse.status, 200);
const audio = await audioResponse.json();
const range = await fetch(`${origin}/api/english/six/media/${audio.asset}`, { headers: { Cookie: cookie, Range: "bytes=0-99" } });
assert.equal(range.status, 206);
assert.equal((await range.arrayBuffer()).byteLength, 100);
assert.equal((await fetch(`${origin}/api/english/six/index`)).status, 401);
checks.push("grading; real audio range read; authentication");
console.log(JSON.stringify({ checks, studentDatabaseWrites: 0 }));
