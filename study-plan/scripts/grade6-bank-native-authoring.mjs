import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
import katex from "katex";

export const bankRoot = path.resolve("content/grade6-bank");
export const sha = (value) => createHash("sha256").update(value).digest("hex");
export async function validationModule() {
  const text = await fs.readFile("src/lib/grade6-bank-native-validation.ts", "utf8");
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
export async function authoringRows() {
  const folder = path.join(bankRoot, "private");
  const names = (await fs.readdir(folder)).filter((name) => /^native-[a-z0-9-]+\.mjs$/.test(name)).sort();
  const rows = [];
  for (const name of names) {
    const full = path.join(folder, name), source = await fs.readFile(full);
    const module = await import(pathToFileURL(full).href + "?hash=" + sha(source));
    if (!Array.isArray(module.default)) throw new Error("Invalid native authoring batch");
    for (const row of module.default) rows.push({ row, file: name, authorDigest: sha(source) });
  }
  return rows;
}
export async function sourceDigest(question) {
  const hash = createHash("sha256"); hash.update(JSON.stringify(question));
  for (const image of question.questionImages) {
    const resolved = path.resolve(bankRoot, "public", image), base = path.join(bankRoot, "public") + path.sep;
    if (!resolved.startsWith(base)) throw new Error("Unsafe source image path");
    hash.update(await fs.readFile(resolved));
  }
  return hash.digest("hex");
}
let teacherRows, teacherAudit, pdfPaths;
const pdfDigests = new Map();
export async function teacherDigest(question) {
  teacherRows ??= new Map(JSON.parse(await fs.readFile(path.join(bankRoot, "answers.private.json"), "utf8")).map((row) => [row.id, row]));
  teacherAudit ??= new Map(JSON.parse(await fs.readFile(path.join(bankRoot, "import-audit.private.json"), "utf8")).records.map((row) => [row.id, row]));
  const answer = teacherRows.get(question.id), audit = teacherAudit.get(question.id);
  if (!answer) throw new Error("Teacher pairing unavailable");
  const hash = createHash("sha256"); hash.update(JSON.stringify(answer)); hash.update(JSON.stringify(audit ?? {}));
  for (const image of answer.answerImages) {
    const file = path.resolve(bankRoot, "private", image), base = path.join(bankRoot, "private") + path.sep;
    if (!file.startsWith(base)) throw new Error("Unsafe teacher image path");
    hash.update(await fs.readFile(file));
  }
  if (audit?.answerSource?.endsWith(".pdf")) {
    const folder = path.resolve("../六上/数学");
    pdfPaths ??= (await fs.readdir(folder, { recursive: true })).filter((name) => name.toLowerCase().endsWith(".pdf")).map((name) => path.join(folder, name));
    const matches = pdfPaths.filter((name) => path.basename(name) === audit.answerSource);
    if (matches.length !== 1) throw new Error("Teacher PDF source cannot be uniquely resolved");
    if (!pdfDigests.has(matches[0])) pdfDigests.set(matches[0], sha(await fs.readFile(matches[0])));
    hash.update(pdfDigests.get(matches[0]));
  }
  return hash.digest("hex");
}
export async function validateAuthoring() {
  const baseRaw = await fs.readFile(path.join(bankRoot, "questions.public.json"), "utf8");
  const manifestRaw = await fs.readFile(path.join(bankRoot, "manifest.json"), "utf8");
  const base = JSON.parse(baseRaw), manifest = JSON.parse(manifestRaw), byId = new Map(base.map((q) => [q.id, q]));
  if (manifest.total !== 2394 || base.length !== manifest.total || byId.size !== base.length) throw new Error("Unexpected base bank");
  const { assertBankNative } = await validationModule();
  const entries = await authoringRows(), seen = new Set();
  let formulaCount = 0, fields = 0, drawings = 0, automatic = 0, diagrams = 0;
  for (const { row } of entries) {
    if (Object.keys(row).some((key) => !["id", "inputs", "native", "private"].includes(key)) || !byId.has(row.id) || seen.has(row.id)) throw new Error("Native id mismatch/duplicate");
    seen.add(row.id);
    try { assertBankNative(row.inputs, row.native); } catch (error) { throw new Error(row.id + ": " + error.message); }
    fields += row.inputs.length;
    const a = row.private;
    if (!a || Object.keys(a).some((key) => !["rules", "reviewRequired", "answerText", "answerStatus"].includes(key)) || a.answerStatus !== "verified_native" || typeof a.reviewRequired !== "boolean" || typeof a.answerText !== "string" || !a.answerText.trim() || !Array.isArray(a.rules)) throw new Error("Invalid private native row");
    const ids = new Set(row.inputs.map((field) => field.id));
    if (new Set(a.rules.map((rule) => rule.id)).size !== a.rules.length) throw new Error("Duplicate private rule");
    for (const rule of a.rules) {
      if (Object.keys(rule).some((key) => !["id", "expected", "numeric", "unit"].includes(key)) || !ids.has(rule.id) || !Array.isArray(rule.expected) || !rule.expected.length || rule.expected.some((text) => typeof text !== "string" || !text.trim()) || (rule.numeric !== undefined && typeof rule.numeric !== "boolean") || (rule.unit !== undefined && (typeof rule.unit !== "string" || !rule.unit.trim()))) throw new Error("Invalid private grading rule");
      const field = row.inputs.find((field) => field.id === rule.id);
      if (field.kind === "choice" && rule.expected.some((value) => !field.choices.includes(value))) throw new Error("Choice/rule mismatch");
    }
    if (!a.reviewRequired) {
      if (a.rules.length !== ids.size || row.inputs.some((field) => field.kind === "drawing")) throw new Error("Unreliable auto grading");
      automatic++;
    }
    const formula = (nodes) => { for (const node of nodes) if (node.type === "math") { katex.renderToString(node.tex, { throwOnError: true, trust: false, strict: "error", maxExpand: 1000 }); formulaCount++; } else if (node.type === "fraction") { formula(node.numerator); formula(node.denominator); formulaCount++; } };
    for (const block of row.native.blocks) {
      if (block.type === "paragraph") formula(block.content);
      if (block.type === "table") block.rows.forEach((row) => row.forEach(formula));
      if (block.type === "drawing") drawings++;
      if (block.type === "diagram") diagrams++;
    }
  }
  return { entries, base, manifest, byId, baseDigest: sha(baseRaw + "\n" + manifestRaw), stats: { total: manifest.total, converted: seen.size, pending: manifest.total - seen.size, fields, formulaCount, drawings, diagrams, automatic, review: seen.size - automatic } };
}
