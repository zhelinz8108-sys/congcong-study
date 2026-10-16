import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appRoot } from "./holiday-math-test-utils.mjs";

const root = path.join(appRoot, "content/english-six");
const read = file => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const index = read("bank/index.json");
const questions = index.papers.flatMap(entry => {
  const file = `bank/papers/${entry.id}.json`;
  return read(file).questions.map(q => ({ ...q, file, unit: entry.unit, edition: entry.edition, source: entry.sourceTitle }));
});
for (let unit = 1; unit <= 8; unit++) {
  const file = `practice/${unit}.json`, paper = read(file);
  questions.push(...paper.questions.map(q => ({ ...q, file, unit, edition: "new", source: paper.title })));
}
const findings = [];
const add = (q, rule, detail) => findings.push({ id: q.id, unit: q.unit, file: q.file, rule, detail, prompt: q.prompt,
  options: q.options, answer: q.answer, explanation: q.explanation, context: q.context, grading: q.grading, topic: q.topic });
const norm = s => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const ids = new Set();
for (const q of questions) {
  if (ids.has(q.id)) add(q, "duplicate-id", q.id);
  ids.add(q.id);
  if (!q.prompt?.trim() || !q.answer?.trim() || !q.explanation?.trim()) add(q, "empty-field", "prompt/answer/explanation");
  if (q.options.length && !q.options.some(o => o.id === q.answer)) add(q, "invalid-option-key", q.answer);
  const texts = q.options.map(o => norm(o.text));
  if (q.promptRuns && q.promptRuns.map(r => r.text).join("") !== q.prompt) add(q, "stale-prompt-runs", q.promptRuns.map(r => r.text).join(""));
  for (const o of q.options) if (o.runs && o.runs.map(r => r.text).join("") !== o.text) add(q, "stale-option-runs", `${o.id}: ${o.runs.map(r => r.text).join("")}`);
  if (new Set(texts).size !== texts.length) add(q, "duplicate-options", "identical option texts");
  const blanks = [...q.prompt.matchAll(/[_＿]{2,}/g)];
  const keyText = q.options.find(o => o.id === q.answer)?.text ?? q.accepted?.[0]?.[0] ?? q.answer;
  if (blanks.length === 1 && !/对话第|短文第|完形填空第/.test(q.prompt)) {
    const filled = q.prompt.replace(/[_＿]{2,}/, keyText);
    if (/\b(a|an|the)\s+\1\b|\b(?:a\s+an|an\s+a)\b/i.test(filled)) add(q, "repeated-article", filled);
    if (/\b(?:did|didn't|did not)\s+(?:went|saw|took|bought|was|were|ate|made|wrote|told|felt)\b/i.test(filled)) add(q, "did-with-past", filled);
  }
  if (/对[画划]线/.test(q.prompt) && !q.promptRuns?.some(r => r.underline)) add(q, "missing-underline", "target is not visually marked");
  const cues = ["tomorrow", "yesterday", "last week", "last night", "last Friday", "every day", "every year", "next week", "just now"];
  if (/根据|由|提示|标志|时间状语/.test(q.explanation)) for (const cue of cues) {
    const cuePattern = new RegExp(`\\b${cue}\\b`, "i");
    const source = norm(`${q.prompt} ${q.context ?? ""} ${q.topic}`).replace(/,\s*/g, " ");
    const translated = cue === "yesterday" && /昨天/.test(q.prompt);
    if (cuePattern.test(norm(q.explanation)) && !cuePattern.test(source) && !translated)
      add(q, "explanation-absent-time", cue);
  }
  const stated = [...q.explanation.matchAll(/(?:故|因此|所以)?选\s*([A-H])(?:[。．.，、；\s]|$)/g)].map(m => m[1]);
  if (q.options.length && q.grading !== "reference" && stated.length === 1 && stated[0] !== q.answer && !/原题|原参考|已修正|也成立|均可/.test(q.explanation))
    add(q, "explanation-key-disagreement", stated[0]);
  if (q.options.length && !q.context && !/根据|结合|课文|课本|词库|提示|一般将来时|一般过去时|一般现在时|用.*时/.test(q.topic) && blanks.length === 1) {
    const terms = new Set(texts);
    if (terms.has("will be") && terms.has("is") && terms.has("was") && !/tomorrow|yesterday|last |next |ago|every |now|will|was|were|did/i.test(q.prompt))
      add(q, "underdetermined-tense", "present/past/future all grammatical without context");
  }
  if (q.kind === "sentence" && !/[\u3400-\u9fff]/.test(q.prompt) && /,/.test(q.prompt) && !/[_＿]/.test(q.prompt)) {
    const tokens = value => norm(value).replace(/[‘’]/g, "'").match(/[a-z]+(?:'[a-z]+)*|\d+/g)?.sort().join(" ") ?? "";
    if (tokens(q.prompt) !== tokens(q.answer)) add(q, "reordering-word-mismatch", `given: ${tokens(q.prompt)}; answer: ${tokens(q.answer)}`);
  }
  const slot = /(?:短文|完形填空)第\s*(\d+)\s*空/.exec(q.prompt);
  if (slot && q.context && q.options.length) {
    const marker = new RegExp(`(?<![0-9])${slot[1]}\\s*[.．]?\\s*[_＿]{2,}\\s*[.．]?`, "g");
    const completed = q.context.replace(marker, ` ${keyText} `);
    if (/\b(a|an|the|become|will|be)\s+\1\b|\b(?:a\s+an|an\s+a)\b/i.test(completed))
      add(q, "cloze-repeated-word", completed);
  }
}
const counts = Object.fromEntries([...new Set(findings.map(f => f.rule))].map(rule => [rule, findings.filter(f => f.rule === rule).length]));
const reviewedReference = findings.filter(f => f.rule === "underdetermined-tense" && f.grading === "reference");
const unresolved = findings.filter(f => !reviewedReference.includes(f));
const out = path.join(appRoot, "tmp/english-six-quality");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "audit.json"), JSON.stringify({ questions: questions.length, counts, findings, reviewedReference, unresolved }, null, 2));
if (process.argv.includes("--export")) {
  for (let unit = 1; unit <= 8; unit++) {
    const rows = questions.filter(q => q.unit === unit);
    writeFileSync(path.join(out, `unit-${unit}.json`), JSON.stringify(rows, null, 2));
  }
}
console.log(JSON.stringify({ questions: questions.length, counts, unresolved: unresolved.length, report: path.join(out, "audit.json") }));
if (unresolved.length) process.exitCode = 1;
