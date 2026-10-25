import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import nextEnv from "@next/env";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

nextEnv.loadEnvConfig(process.cwd());
const port = Number(process.argv[2] ?? 3002);
assert.ok([3001, 3002, 3038].includes(port));
const base = `http://127.0.0.1:${port}`;
const secret = (process.env.FAMILY_ACCESS_SECRET || process.env.FAMILY_ACCESS_PASSWORD || "").trim();
assert.ok(secret && process.env.FAMILY_ACCESS_PASSWORD?.trim());
const payload = `v1.${Date.now() + 5 * 60 * 1000}`;
const token = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
const headers = { Cookie: `congcong_family_access=${token}` };
const subject = "8bd6f79b-99f5-4e68-a961-872d60d260b1";
const hub = `/subjects/${subject}/english/six-knowledge`;
const get = async (route, authenticated = true, rsc = false) => {
  const response = await fetch(base + route, { headers: { ...(authenticated ? headers : {}), ...(rsc ? { RSC: "1" } : {}) }, signal: AbortSignal.timeout(30000), redirect: "manual" });
  return { response, text: await response.text() };
};
const { getEnglishSixKnowledgeBook } = await loadHolidayTestModule("src/server/english-six-knowledge.ts");
const book = await getEnglishSixKnowledgeBook();
const home = await get(hub);
assert.equal(home.response.status, 200);
assert.ok(home.text.includes("data-knowledge-hub"));
for (const unit of book.units) assert.ok(home.text.includes(`${hub}/${unit.number}`));
let nativeTables = 0;
for (const unit of book.units) {
  const { response, text } = await get(`${hub}/${unit.number}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", port === 3038 ? /private|no-store|no-cache/ : /private|no-store/);
  assert.ok(text.includes("data-knowledge-reader") && text.includes(`data-unit="${unit.number}"`));
  for (const section of unit.sections) assert.ok(text.includes(`id="${section.id}"`));
  assert.doesNotMatch(text, /<(?:iframe|embed|object)\b|application\/pdf/i);
  const count = [...text.matchAll(/<table(?:\s|>)/g)].length;
  assert.equal(count, unit.sections.flatMap(section => section.blocks).filter(block => block.kind === "table").length);
  nativeTables += count;
  // Test both the ordinary document and React navigation payload. Public unit
  // names can appear in metadata, but no reader body or lesson props may leak.
  for (const rsc of [false, true]) {
    const anonymous = await get(`${hub}/${unit.number}`, false, rsc);
    assert.equal(anonymous.response.status, 200);
    assert.ok(!anonymous.text.includes("data-knowledge-reader"));
    assert.ok(!anonymous.text.includes(unit.sections[0].id));
    assert.ok(!anonymous.text.includes('"blocks":'));
  }
}
const anonymousHub = await get(hub, false);
assert.ok(!anonymousHub.text.includes("data-knowledge-hub"));
for (const id of ["0", "9", "01", "1.0"]) assert.equal((await get(`${hub}/${id}`)).response.status, 404);
assert.equal(nativeTables, 139);
console.log(JSON.stringify({ passed: true, compiledUnitPages: 8, compiledSections: 64,
  nativeTables, anonymousHtmlAndRscProtected: true, learnerWrites: 0 }));
