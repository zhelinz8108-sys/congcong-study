import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Reproducible, local-only import. Never reads credentials or writes learner data.
// Raw PDFs remain in the reference library; runtime crops are not PDF embeds.
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(app, "..", "tmp", "grade6-bank-import");
const destination = path.join(app, "content", "grade6-bank");
const selected = process.argv.find((arg) => arg.startsWith("--groups="))?.split("=")[1];
const groups = selected ? selected.split(",") : ["sync", "enrichment", "tests"];
if (groups.some((group) => !["sync", "enrichment", "tests"].includes(group))) throw new Error("Invalid source group");
const dry = process.argv.includes("--check");
const titles = ["学习准备 · 分数除法", "01 · 小数乘法和除法（二）", "02 · 混合运算与数量关系（三）", "03 · 数与运算的再认识", "04 · 比和比例", "05 · 圆", "06 · 放大与缩小", "07 · 确定位置"];
const kinds = { written: "综合作答", multi_blank: "多空填空", multi_part: "多小题", multi_part_calculation: "多小题计算", fill_numeric: "数值填空", single_choice: "选择题", multiple_choice: "多选题", choice: "选择题", true_false: "判断题", "true-false": "判断题", calculation: "计算题", application: "应用题", drawing: "作图题", proof: "推理题", fill_blank: "填空题", fill: "填空题", short_answer: "解答题", solution: "解答题", constructed_response: "解答题" };
// Only explicitly reviewed supplements are accepted; the raw source evidence is
// never overwritten. The canonical private answer records include provenance.
const supplementFile = process.argv.find((arg) => arg.startsWith("--supplements="))?.slice("--supplements=".length);
const supplementRows = supplementFile ? JSON.parse(await fs.readFile(path.resolve(supplementFile), "utf8")) : [];
const supplements = new Map(supplementRows.map((a) => [a.id, a]));
assert(supplements.size === supplementRows.length, "Duplicate supplement id");
for (const a of supplementRows) assert(a.answerStatus === "verified_authored" && a.reviewRequired === true && !a.rules?.length && a.answerText?.trim() && !a.answerImages?.length, "Supplement must be verified authored, private, and review-only");
const questions = [], answers = [], copies = [], metadata = new Map(), audits = {};
const ids = new Set(), sourceFiles = new Set();
const count = (values) => values.reduce((r, value) => (r[value] = (r[value] ?? 0) + 1, r), {});
function assert(condition, message) { if (!condition) throw new Error(message); }
function relativeAsset(group, raw, privacy) {
  assert(typeof raw === "string", "Asset must be a string");
  const clean = raw.replaceAll("\\", "/");
  assert(clean.startsWith(privacy + "/") && !clean.split("/").includes(".."), "Invalid asset privacy/path: " + clean);
  const relative = clean.slice(privacy.length + 1);
  assert(/\.(png|webp|jpe?g)$/i.test(relative), "Unsupported image: " + relative);
  copies.push({ from: path.join(source, group, clean), to: path.join(destination, privacy, group, relative) });
  return `${group}/${relative}`;
}
for (const [priority, group] of groups.entries()) {
  const rawQuestions = JSON.parse(await fs.readFile(path.join(source, group, "questions.public.json"), "utf8"));
  const rawAnswers = JSON.parse(await fs.readFile(path.join(source, group, "answers.private.json"), "utf8"));
  const privateMap = new Map(rawAnswers.map((a) => [a.id, a]));
  assert(privateMap.size === rawAnswers.length && rawQuestions.length === rawAnswers.length, group + " private bijection invalid");
  for (const raw of rawQuestions) {
    assert(/^[a-z0-9_-]{1,100}$/i.test(raw.id) && !ids.has(raw.id), "Invalid/duplicate id: " + raw.id); ids.add(raw.id);
    const originalAnswer = privateMap.get(raw.id); assert(originalAnswer, "Missing private record: " + raw.id);
    const supplement = supplements.get(raw.id), a = supplement ?? originalAnswer;
    const exam = raw.collectionMode === "exam", chapter = exam ? null : Number(raw.chapter);
    assert(exam || Number.isInteger(chapter) && chapter >= 0 && chapter <= 7, "Invalid chapter: " + raw.id);
    const collectionId = exam ? raw.collectionId : `chapter-${chapter}`;
    assert(/^[a-z0-9_-]{1,100}$/i.test(collectionId), "Invalid collection: " + collectionId);
    const difficulty = Math.max(1, Math.min(4, Number(raw.difficulty) || 1));
    const inputs = (supplement?.inputOverrides ?? raw.inputs ?? raw.answerInputs ?? [{ id: "answer", label: "我的答案／过程", type: "text" }]).map((i) => ({
      id: i.id, label: i.label ?? "我的答案", kind: i.kind === "choice" || i.type === "choice" || i.type === "single_choice" ? "choice" : "text",
      ...((i.choices ?? i.options) ? { choices: (i.choices ?? i.options).map((o) => typeof o === "string" ? o : String(o.value)) } : {}),
    }));
    assert(inputs.length && new Set(inputs.map((i) => i.id)).size === inputs.length, "Invalid inputs: " + raw.id);
    const rules = a.rules ?? a.grading?.rules ?? [];
    const invalidCoverage = rules.length !== inputs.length || !inputs.every((i) => rules.some((r) => r.id === i.id));
    for (const r of rules) assert(r.expected?.length && r.expected.every((e) => typeof e === "string" && e.length) && inputs.some((i) => i.id === r.id), "Invalid grading rule: " + raw.id);
    let answerStatus = a.answerStatus || "unconfirmed";
    if (/mismatch|错配/.test(answerStatus)) answerStatus = "mismatch";
    else if (/missing|unconfirmed|缺失/.test(answerStatus)) answerStatus = "missing";
    else if (!/matched|verified|available|complete|provided/.test(answerStatus)) throw new Error("Unknown answer status " + answerStatus);
    const safe = !["missing", "mismatch"].includes(answerStatus);
    const reviewRequired = !safe || !!(a.reviewRequired ?? a.grading?.reviewRequired) || !rules.length || invalidCoverage;
    const questionImages = raw.questionImages.map((img) => relativeAsset(group, img, "public"));
    assert(questionImages.length || raw.prompt?.trim(), "Empty question: " + raw.id);
    const answerImages = safe ? (a.answerImages ?? []).map((img) => relativeAsset(group, img, "private")) : [];
    const answerText = safe ? String(a.answerText ?? "") : "";
    questions.push({ id: raw.id, collectionId, number: 0, chapter, originalNumber: String(raw.originalNumber ?? raw.number ?? ""), sourceName: raw.sourceName, sourcePage: raw.sourcePage, topic: raw.topic ?? "章节练习", difficulty, kind: kinds[raw.kind] ?? raw.kind ?? "综合作答", prompt: raw.prompt ?? "", questionImages, inputs });
    answers.push({ id: raw.id, answerText: answerImages.length ? "" : supplement ? "补充解答（经独立复核，非原教师版答案）：\n" + answerText.replace(/^补充推导答案（非原教师版答案）：/, "") : answerText, answerImages, answerStatus, reviewRequired, rules: reviewRequired ? [] : rules });
    sourceFiles.add(`${group}:${raw.sourceName}`);
    metadata.set(raw.id, { priority, order: raw.sourceOrdinal ?? raw.sourceOrder ?? raw.number ?? raw.chapterSequence ?? questions.length, sourceStatus: originalAnswer.answerStatus, supplementStatus: supplement?.answerStatus, difficultyStatus: raw.difficultyStatus ?? "rubric_estimate", answerSource: originalAnswer.sourceName, answerPage: originalAnswer.sourcePage, sourceKeyImages: originalAnswer.sourceKeyImages ?? [], hasFeedback: safe && !!(answerImages.length || answerText.trim()) });
    if (!audits[collectionId]) audits[collectionId] = { title: exam ? raw.collectionTitle : titles[chapter], mode: exam ? "exam" : "chapter", chapter, palette: exam ? 1 + priority : chapter };
  }
}
for (const id of supplements.keys()) assert(ids.has(id), "Supplement id not in selected sources: " + id);
const collections = Object.entries(audits).map(([id, c]) => {
  const items = questions.filter((q) => q.collectionId === id).sort((a, b) => {
    if (c.mode === "chapter" && a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    const x = metadata.get(a.id), y = metadata.get(b.id);
    return x.priority - y.priority || x.order - y.order || a.id.localeCompare(b.id);
  });
  items.forEach((q, i) => { q.number = i + 1; });
  const refs = items.map(({ id, number, difficulty, topic, kind }) => ({ id, number, difficulty, topic, kind }));
  return { id, ...c, subtitle: c.mode === "chapter" ? "同步基础 · 考点专项 · 课内到拓展 · 按层级顺序练" : "综合检验 · 保留原卷顺序 · 一题一题完成", questionCount: items.length, difficultyCounts: count(items.map((q) => String(q.difficulty))), questions: refs };
}).sort((a, b) => a.mode !== b.mode ? a.mode === "chapter" ? -1 : 1 : a.mode === "chapter" ? a.chapter - b.chapter : a.id.localeCompare(b.id));
const manifest = { version: "grade6-bank-2026-v1", total: questions.length, sourceFiles: sourceFiles.size, collections };
const audit = {
  total: questions.length, autoGraded: answers.filter((a) => !a.reviewRequired).length,
  answerStatuses: count(answers.map((a) => a.answerStatus)),
  reviewRequired: answers.filter((a) => a.reviewRequired && a.answerStatus !== "missing" && a.answerStatus !== "mismatch").length,
  pairedFeedback: [...metadata.values()].filter((m) => m.hasFeedback).length,
  records: questions.map((q) => ({ id: q.id, collectionId: q.collectionId, number: q.number, chapter: q.chapter, ...metadata.get(q.id) })),
  ordering: "Chapter: rubric-estimated level 1..4, then source category/order. Exams: original paper order. Not randomized. Difficulty is an initial estimate, not a calibrated psychometric scale.",
};
for (const { from } of copies) assert((await fs.stat(from)).size > 0, "Missing/empty crop: " + from);
if (!dry) {
  // A regeneration must not silently replace the checked runtime bank with raw
  // source gaps. Explicit reviewed supplements are required before publishing.
  assert(audit.pairedFeedback === questions.length && !answers.some((a) => ["missing", "mismatch"].includes(a.answerStatus)), "Refusing incomplete answer pairing. Supply the independently approved --supplements=path JSON, or use --check for a source audit.");
  await fs.mkdir(destination, { recursive: true });
  // Copies only known individually referenced crops, not cached pages or entire answer PDFs.
  for (const { from, to } of copies) { await fs.mkdir(path.dirname(to), { recursive: true }); await fs.copyFile(from, to); }
  for (const [name, value] of [["manifest.json", manifest], ["questions.public.json", questions], ["answers.private.json", answers], ["import-audit.private.json", audit]]) await fs.writeFile(path.join(destination, name), JSON.stringify(value, null, 2) + "\n");
}
console.log(JSON.stringify({ checkOnly: dry, total: manifest.total, sources: manifest.sourceFiles, collections: collections.map(({ title, questionCount, mode }) => ({ title, questionCount, mode })), statuses: audit.answerStatuses, autoGraded: audit.autoGraded, pairedFeedback: audit.pairedFeedback, crops: copies.length }, null, 2));
