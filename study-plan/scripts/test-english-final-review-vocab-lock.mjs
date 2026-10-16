import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map();
const canonicalWordId = "c34340cc-39ae-4a83-a96a-31caa8593d60";
const words = new Map([
  ["word-test", { id: "word-test", word: "School", meaning: "n. 学校；学派" }],
  [canonicalWordId, { id: canonicalWordId, word: "Book", meaning: "n. 书" }],
]);
let selects = 0;
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  if (filename.endsWith(".json")) return JSON.parse(readFileSync(filename, "utf8"));
  const loaded = { exports: {} }; cache.set(filename, loaded.exports);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const helpers = filename.endsWith("final-review-viewer.tsx")
    ? ";exports.testHelpers={sectionEntries,buildRenderBlocks,cleanMarkerNumber,TextWithFillInputs};" : "";
  function dependency(specifier) {
    if (specifier === "server-only" || specifier === "@/lib/use-english-locked") return {};
    if (specifier === "@/lib/db") return { pool: { query: async (sql, params) => {
      assert.match(sql, /^SELECT id, word, meaning FROM study_words WHERE id=\$1$/);
      selects++;
      // PostgreSQL UUID lookup accepts unhyphenated aliases; the grader must reject them.
      const lookupId = params[0] === canonicalWordId.replaceAll("-", "") ? canonicalWordId : params[0];
      return { rows: words.has(lookupId) ? [words.get(lookupId)] : [] };
    } } };
    if (specifier.startsWith("@/")) return load(`src/${specifier.slice(2)}${path.extname(specifier) ? "" : ".ts"}`);
    return require(specifier);
  }
  new Function("require", "module", "exports", compiled + helpers)(dependency, loaded, loaded.exports);
  return loaded.exports;
}

const bank = load("src/data/english-final-review-answers.json");
const content = load("src/data/english-final-review-content.json");
const final = load("src/server/english-final-review-lock.ts");
const vocab = load("src/server/english-vocab-lock.ts");
const viewer = load("src/app/subjects/[id]/final-review/final-review-viewer.tsx").testHelpers;
const ids = new Set(final.finalReviewQuestionIds()), counts = final.finalReviewFieldCounts();
let choices = 0, fills = 0, fields = 0;
for (const [kind, documents] of Object.entries(bank)) for (const [documentId, questions] of Object.entries(documents)) {
  const document = content.documents.find(value => value.id === documentId);
  for (const [key, raw] of Object.entries(questions)) {
    const [sectionIndex, number] = key.split(":"), section = document.sections[Number(sectionIndex)];
    const blocks = viewer.buildRenderBlocks(viewer.sectionEntries(section, documentId, Number(sectionIndex), ids));
    const block = blocks.find(value => viewer.cleanMarkerNumber(value.type === "question" ? value.question.marker : value.entry.marker) === number);
    assert.ok(block, `Question ${documentId}:${key} is rendered with its original stable number`);
    const id = `${kind === "choices" ? "choice" : "fill"}:${documentId}:${key}`;
    assert.ok(ids.has(id));
    const expected = Array.isArray(raw) ? raw : [raw];
    if (kind === "choices") {
      choices++; assert.equal(block.type, "question");
      assert.equal(final.gradeFinalReviewLocked(id, expected[0]).correct, true);
      assert.equal(final.gradeFinalReviewLocked(id, expected[0] === "A" ? "B" : "A").correct, false);
      assert.throws(() => final.gradeFinalReviewLocked(id, "Z"));
    } else {
      fills++; fields += expected.length;
      assert.equal(counts[id], expected.length);
      assert.equal(final.gradeFinalReviewLocked(id, expected).correct, true);
      assert.equal(final.gradeFinalReviewLocked(id, expected.map(() => "wrong-answer")).correct, false);
      assert.throws(() => final.gradeFinalReviewLocked(id, []));
      assert.throws(() => final.gradeFinalReviewLocked(id, expected.map(() => "")));
      // Even when OCR omitted underscores, every private answer position has an input.
      const React = require("react"), renderer = require("react-dom/server");
      const html = renderer.renderToStaticMarkup(React.createElement(viewer.TextWithFillInputs, {
        text: block.entry.raw, fieldCount: counts[id], values: [], disabled: false, onChange: () => {},
      }));
      assert.equal((html.match(/<input /g) ?? []).length, expected.length, `${id} input count`);
      const lockedHtml = renderer.renderToStaticMarkup(React.createElement(viewer.TextWithFillInputs, {
        text: block.entry.raw, fieldCount: counts[id], values: expected, disabled: true, onChange: () => {},
      }));
      assert.equal((lockedHtml.match(/disabled=""/g) ?? []).length, expected.length, `${id} read-only inputs`);
    }
  }
}
assert.throws(() => final.gradeFinalReviewLocked("fill:invented:0:1", ["value"]));
assert.throws(() => final.gradeFinalReviewLocked("choice:专项一-选择:00:1", "A"));
assert.equal((await vocab.gradeVocabLocked("en-zh:word-test", vocab.cleanVocabMeaning(words.get("word-test").meaning))).correct, true);
assert.equal((await vocab.gradeVocabLocked("en-zh:word-test", "汽车")).correct, false);
assert.equal((await vocab.gradeVocabLocked("zh-en:word-test", "school")).correct, true);
assert.equal((await vocab.gradeVocabLocked("zh-en:word-test", "car")).correct, false);
await assert.rejects(vocab.gradeVocabLocked("EN-ZH:word-test", "学校"));
await assert.rejects(vocab.gradeVocabLocked("en-zh:invented", "学校"));
await assert.rejects(vocab.gradeVocabLocked("en-zh:word-test", ""));
assert.equal((await vocab.gradeVocabLocked(`zh-en:${canonicalWordId}`, "book")).correct, true);
await assert.rejects(vocab.gradeVocabLocked(`zh-en:${canonicalWordId.replaceAll("-", "")}`, "book"));
const client = readFileSync(path.join(root, "src/app/subjects/[id]/final-review/final-review-viewer.tsx"), "utf8");
assert.doesNotMatch(client, /import.+english-final-review-answers|const ANSWERS/);
const active = readFileSync(path.join(root, "src/components/interactive-memorize-mode.tsx"), "utf8");
assert.doesNotMatch(active, /recordAnswer\(|resetLocalPractice|autoNext|saveCloudState/);
assert.match(active, /locked\.submit\(`\$\{mode\}:\$\{current\.word\.id\}`/);
assert.doesNotMatch(readFileSync(path.join(root, "src/app/subjects/[id]/vocab/page.tsx"), "utf8"), /function MemorizeMode/);
console.log(JSON.stringify({ choices, fills, fields, checks: "private server grading, all existing numbered questions rendered, exact field counts, restored inputs disabled, no client answers or score reset, vocabulary two directions", mockSelects: selects, studentWrites: 0 }));
