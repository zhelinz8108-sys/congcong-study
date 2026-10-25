import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const { assertEnglishSixKnowledgeBook, summarizeEnglishSixKnowledgeBook, summarizeEnglishSixKnowledgeUnit } = await loadHolidayTestModule("src/lib/english-six-knowledge.ts");
const fixture = {
  version: 1, title: "Synthetic knowledge", edition: "2026", sources: ["Synthetic source"],
  units: Array.from({ length: 8 }, (_, index) => ({ number: index + 1, title: `Topic ${index + 1}`,
    sections: Array.from({ length: 8 }, (_, section) => ({ id: `unit-${index + 1}-topic_${section + 1}`, title: `Section ${section + 1}`, blocks: [{ kind: "paragraph", runs: [{ text: "Line one\nLine two", bold: true }] }] })),
  })),
};
assertEnglishSixKnowledgeBook(fixture);
assert.deepEqual(summarizeEnglishSixKnowledgeUnit(fixture.units[0]), { number: 1, title: "Topic 1", sectionCount: 8, blockCount: 8 });
assert.equal(summarizeEnglishSixKnowledgeBook(fixture).units.length, 8);
let rejected = 0;
for (const change of [
  book => { book.version = 2; },
  book => { book.edition = "legacy"; },
  book => { book.units.pop(); },
  book => { book.units[0].number = 2; },
  book => { book.units[0].sections.pop(); },
  book => { book.units[0].sections[0].id = "unit-2-other"; },
  book => { book.units[0].sections[1].id = book.units[0].sections[0].id; },
  book => { book.html = "<script>synthetic</script>"; },
  book => { book.units[0].sections[0].blocks = [{ kind: "html", html: "<p>synthetic</p>" }]; },
  book => { book.units[0].sections[0].blocks[0].runs[0].ipa = "true"; },
  book => { book.units[0].sections[0].blocks[0].runs = [{ text: "\n" }]; },
  book => { book.units[0].sections[0].blocks[0].runs = [{ text: "text", onclick: "synthetic" }]; },
  book => { book.units[0].sections[0].blocks = [{ kind: "table", headers: [[{ text: "A" }]], rows: [[[], []]] }]; },
  book => { book.units[0].sections[0].blocks = [{ kind: "callout", paragraphs: [] }]; },
  book => { book.sources.push(book.sources[0]); },
]) {
  const invalid = structuredClone(fixture); change(invalid);
  assert.throws(() => assertEnglishSixKnowledgeBook(invalid)); rejected++;
}

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "six-knowledge-content-"));
try {
  const input = path.join(directory, "synthetic.html"), output = path.join(directory, "book.json");
  const sections = number => Array.from({ length: 8 }, (_, index) => `<section id="unit-${number}-topic_${index + 1}"><h2>${number}.${index + 1} Section ${index + 1}</h2><p>First <b>bold <em>both</em></b> <u>underlined</u> <span class="ipa">/a/</span><br>Next</p>${number === 1 && index === 0 ? '<h3>Third heading</h3><h4>Fourth heading</h4><p class="knowledge-note"><b>Label:</b> Note<br>continued</p><table><tbody><tr><td>First data row</td><td></td></tr><tr><td>Second</td><td>Line<br>two</td></tr></tbody></table><table><thead><tr><th>Column one</th><th>Column two</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody></table><div class="comparison"><p><b>Original:</b> before</p><p><b>Correct:</b> after</p><p><b>Explanation:</b> why</p></div><p>练</p><p>练习仍保留</p><p>Synthetic source</p><p>Synthetic source is mentioned in a normal sentence.</p>' : ""}</section>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Synthetic</title></head><body><section class="cover"><p>Excluded cover text</p></section>${Array.from({ length: 8 }, (_, index) => `<article class="unit other-class" id="unit-${index + 1}"><header><h1>Topic ${index + 1}</h1></header>${sections(index + 1)}</article>`).join("")}<section id="sources"><p>Excluded source explanation</p><p>• Synthetic source</p></section></body></html>`;
  await fs.writeFile(input, html);
  const converted = await promisify(execFile)("python3", ["scripts/prepare-english-six-knowledge.py", "--input", input, "--output", output], { encoding: "utf8" });
  const report = JSON.parse(converted.stdout);
  const book = JSON.parse(await fs.readFile(output, "utf8"));
  assertEnglishSixKnowledgeBook(book);
  assert.equal(report.unitCount, 8); assert.equal(report.sectionCount, 64); assert.equal(report.tableCount, 2);
  assert.equal(report.canonicalSha256, createHash("sha256").update(JSON.stringify(book)).digest("hex"));
  const blocks = book.units[0].sections[0].blocks;
  const runs = blocks[0].runs;
  assert(runs.some(run => run.text === "both" && run.bold && run.italic));
  assert(runs.some(run => run.text === "underlined" && run.underline));
  assert(runs.some(run => run.text === "/a/" && run.ipa));
  assert(runs.some(run => run.text.includes("\nNext")));
  const tables = blocks.filter(block => block.kind === "table");
  assert.equal(tables[0].headers, undefined, "A table without thead must retain its first data row");
  assert.equal(tables[0].rows[0][0][0].text, "First data row");
  assert.deepEqual(tables[0].rows[0][1], []);
  assert.equal(tables[0].rows[1][1][0].text, "Line\ntwo");
  assert.equal(tables[1].headers[0][0].text, "Column one");
  assert.equal(blocks.find(block => block.kind === "callout").paragraphs.length, 3);
  assert.equal(blocks.find(block => block.kind === "paragraph" && block.tone === "note").runs[0].bold, true);
  assert(!blocks.some(block => block.kind === "paragraph" && block.runs.map(run => run.text).join("") === "练"));
  assert(!blocks.some(block => block.kind === "paragraph" && block.runs.map(run => run.text).join("") === "Synthetic source"));
  assert(JSON.stringify(book).includes("练习仍保留"));
  assert(JSON.stringify(book).includes("Synthetic source is mentioned in a normal sentence."));
  assert(!JSON.stringify(book).includes("Excluded cover text"));
  assert(!JSON.stringify(book).includes("Excluded source explanation"));
  assert.deepEqual(book.sources, ["Synthetic source"]);
  const authoring = process.argv.find(argument => argument.startsWith("--authoring="))?.slice("--authoring=".length);
  if (authoring) {
    const actual = JSON.parse(await fs.readFile(authoring, "utf8"));
    assertEnglishSixKnowledgeBook(actual);
    const manifest = JSON.parse(await fs.readFile("content/english-six-knowledge/manifest.public.json", "utf8"));
    assert.equal(createHash("sha256").update(JSON.stringify(actual)).digest("hex"), manifest.canonicalSha256);
    assert.equal(summarizeEnglishSixKnowledgeBook(actual).units.length, manifest.unitCount);
  }
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ passed: true, invalidSchemasRejected: rejected, syntheticUnits: 8, syntheticSections: 64, inlineStylesAndBreaks: true, headerlessFirstRowPreserved: true, sourceCaptionsMetadataOnly: true, sourceTextLogged: false }));
