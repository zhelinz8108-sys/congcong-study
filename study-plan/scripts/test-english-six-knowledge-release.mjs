import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

// Authenticated source validation only; never opens a learner database or sends
// any request. The production release runs this before compiling or activating.
const { getEnglishSixKnowledgeBook } = await loadHolidayTestModule("src/server/english-six-knowledge.ts");
const { assertEnglishSixKnowledgeBook } = await loadHolidayTestModule("src/lib/english-six-knowledge.ts");
const { speechForBlock } = await loadHolidayTestModule("src/lib/english-six-knowledge-speech.ts");
const book = await getEnglishSixKnowledgeBook();
assertEnglishSixKnowledgeBook(book);
const manifest = JSON.parse(await fs.readFile("content/english-six-knowledge/manifest.public.json", "utf8"));
assert.equal(crypto.createHash("sha256").update(JSON.stringify(book)).digest("hex"), manifest.canonicalSha256);
assert.deepEqual(book.units.map(unit => unit.number), [1, 2, 3, 4, 5, 6, 7, 8]);
const counts = book.units.map(unit => ({ number: unit.number, title: unit.title, sectionCount: unit.sections.length,
  blockCount: unit.sections.reduce((count, section) => count + section.blocks.length, 0),
  tableCount: unit.sections.reduce((count, section) => count + section.blocks.filter(block => block.kind === "table").length, 0) }));
assert.deepEqual(counts, manifest.units);
assert.equal(counts.length, manifest.unitCount);
for (const key of ["sectionCount", "blockCount", "tableCount"]) assert.equal(counts.reduce((total, unit) => total + unit[key], 0), manifest[key]);
assert.equal(manifest.sectionCount, 64);
assert.equal(manifest.blockCount, 2388);
assert.equal(manifest.tableCount, 139);
let englishItems = 0;
for (const unit of book.units) for (const section of unit.sections) {
  const items = section.blocks.filter(block => block.kind !== "heading").flatMap(speechForBlock);
  assert.ok(items.length, "Every knowledge section must contain playable English");
  for (const item of items) {
    assert.ok(item.chunks.length && item.chunks.every(text => text.length <= 150));
    assert.doesNotMatch(item.text, /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u);
  }
  englishItems += items.length;
}
console.log(JSON.stringify({ passed: true, units: counts.length, sections: manifest.sectionCount,
  nativeBlocks: manifest.blockCount, tables: manifest.tableCount, englishItems, authenticatedContent: true, learnerWrites: 0 }));
