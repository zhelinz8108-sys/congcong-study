import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const { sixDocumentPlan, readerLayout } = await loadHolidayTestModule("src/lib/english-six-document.ts");
const index = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/index.json"), "utf8"));
let pages = 0, tables = 0, topics = 0, blocks = 0;
for (const meta of index.resources) {
  const raw = readFileSync(path.join(appRoot, "content/english-six/resources", `${meta.id}.json`));
  const resource = JSON.parse(raw);
  const before = JSON.stringify(resource);
  const layout = readerLayout(meta.id);
  if (layout) {
    assert.equal(layout.sourceSha256, createHash("sha256").update(raw).digest("hex"), "Rebuild layout metadata when the source changes");
    assert.equal(layout.outline.length, 3); topics += 3;
  }
  for (const [p, page] of resource.pages.entries()) {
    const plan = sixDocumentPlan(meta.id, p + 1, page);
    const used = plan.sections.flatMap(s => [...s.headingSources, ...s.nodes.flatMap(n => n.sources)]).sort((a, b) => a - b);
    assert.deepEqual(used, page.blocks.map((_, i) => i), `${meta.id} page ${p + 1}: no lost or duplicated source blocks`);
    if (layout) tables += plan.sections.flatMap(s => s.nodes).filter(n => n.kind === "table").length;
    blocks += used.length; pages++;
  }
  assert.equal(JSON.stringify(resource), before, "Presentation never rewrites source anchors or answer data");
}
assert.equal(topics, 24); assert.equal(tables, 24);
const source = id => JSON.parse(readFileSync(path.join(appRoot, "content/english-six/resources", `${id}.json`), "utf8"));
const first = sixDocumentPlan("c577cdad00f2", 1, source("c577cdad00f2").pages[0]);
const rule = first.sections.find(s => s.topic?.number === 1);
assert.deepEqual(rule.nodes.find(n => n.kind === "table").rows[3], ["以“辅音字母 + y”结尾，变 y 为 i 加 -ed", "去掉 y 加 ied", "try, study, cry", "tried, studied, cried"]);
assert.equal(rule.nodes.filter(n => n.kind === "mistake").length, 3);
assert.ok(rule.nodes.find(n => n.kind === "core").text.endsWith("过去式一般在词尾加 -ed。"));
assert.ok(!rule.nodes.some(n => n.text.includes("crytried")));
const changed = structuredClone(source("c577cdad00f2").pages[0]);
const firstTable = readerLayout("c577cdad00f2").pages["1"].tables[0];
changed.blocks[firstTable.start].text += " source changed";
const fallback = sixDocumentPlan("c577cdad00f2", 1, changed);
assert.ok(!fallback.sections.flatMap(s => s.nodes).some(n => n.kind === "table"), "Never replace changed source text with stale table metadata");
assert.ok(fallback.sections.flatMap(s => s.nodes).some(n => n.text.includes("source changed")), "Mismatched table text remains readable");
const continuation = sixDocumentPlan("c577cdad00f2", 3, source("c577cdad00f2").pages[2]);
assert.equal(continuation.sections[0].topic.number, 2);
const cartoon = sixDocumentPlan("cd846e3d3d6f", 1, source("cd846e3d3d6f").pages[0]);
assert.ok(cartoon.sections.flatMap(s => s.nodes).some(n => n.text === "L______ week, Bobby and Sam s______ a new p______ at school."));
console.log(JSON.stringify({ resources: index.resources.length, pages, sourceBlocks: blocks, restoredTables: tables, topicHeadings: topics, sourceMutation: false, checks: "passed" }));
