import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";

export const solutionBatches = ["chapter0-2.mjs", "chapter3-5.mjs", "chapter6-7-tests.mjs"];
export const detailedRoot = path.resolve("content/grade6-bank/private/detailed");
export const detailedSha = value => createHash("sha256").update(value).digest("hex");
export async function readDetailedWork({ complete = false } = {}) {
  const nativeRaw = await fs.readFile("content/grade6-bank/questions.native.public.json", "utf8");
  const manifestRaw = await fs.readFile("content/grade6-bank/manifest.json", "utf8");
  const native = JSON.parse(nativeRaw), manifest = JSON.parse(manifestRaw);
  const compiled = ts.transpileModule(await fs.readFile("src/lib/grade6-bank-solution.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { assertBankDetailedSolution } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
  const questions = new Map(native.questions.map(question => [question.id, question])), rows = new Map(), batches = [], invalidDrafts = [];
  if (native.total !== 2394 || questions.size !== native.total || manifest.total !== native.total) throw new Error("Unexpected bank size");
  for (const name of solutionBatches) {
    let raw;
    try { raw = await fs.readFile(path.join(detailedRoot, name)); }
    catch (error) { if (error.code === "ENOENT" && !complete) { batches.push({ name, count: 0, missing: true }); continue; } throw error; }
    const values = (await import(pathToFileURL(path.join(detailedRoot, name)).href + "?sha=" + detailedSha(raw))).default;
    if (!Array.isArray(values)) throw new Error("Invalid solution batch");
    for (const row of values) {
      const question = questions.get(row.id);
      if (!question || rows.has(row.id)) throw new Error("Unknown or duplicate solution id");
      rows.set(row.id, row);
    }
    batches.push({ name, count: values.length, digest: detailedSha(raw) });
  }
  // An explicitly authored correction replaces one same-ID draft, never a
  // question, field, grader, score or ordering. Unknown override IDs fail closed.
  const overridden = new Set();
  for (const overrideName of ["root-overrides.mjs", "root-enrichment-ch2.mjs", "root-enrichment-ch1.mjs", "root-special-t04.mjs", "root-special-t05.mjs", "root-special-t02.mjs", "root-assigned-c-special.mjs", "c-schema-fixes.mjs"]) {
    let overrideRaw;
    try { overrideRaw = await fs.readFile(path.join(detailedRoot, overrideName)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!overrideRaw) continue;
    const values = (await import(pathToFileURL(path.join(detailedRoot, overrideName)).href + "?sha=" + detailedSha(overrideRaw))).default;
    for (const row of values) {
      if (!rows.has(row.id) || overridden.has(row.id)) throw new Error("Unknown or duplicate override id");
      assertBankDetailedSolution(row, row.id, questions.get(row.id).inputs.map(field => field.id));
      rows.set(row.id, row); overridden.add(row.id);
    }
    batches.push({ name: overrideName, count: values.length, digest: detailedSha(overrideRaw) });
  }
  if (complete && rows.size !== native.total) throw new Error("Detailed solutions are not complete; nothing is sealed or published");
  const solutions = manifest.collections.flatMap(collection => collection.questions.map(question => rows.get(question.id))).filter(Boolean);
  // Validate after replacements: an independently checked override is allowed
  // to repair a draft. Never certify the draft which it replaced.
  for (const row of solutions) {
    if (complete && /待补充详解|候选详解|尚未编写|逐题待审|TODO/.test(JSON.stringify(row))) throw new Error(row.id + ": Authoring placeholder remains; release blocked");
    try { assertBankDetailedSolution(row, row.id, questions.get(row.id).inputs.map(field => field.id)); }
    catch (error) { if (complete) throw new Error(row.id + ": " + error.message); invalidDrafts.push({ id: row.id, error: error.message }); }
  }
  const stats = manifest.collections.map(collection => ({ id: collection.id, total: collection.questionCount, detailed: collection.questions.filter(question => rows.has(question.id)).length, sourceCaveats: collection.questions.filter(question => rows.get(question.id)?.reviewNote).length }));
  return { nativeRaw, manifestRaw, native, manifest, questions, solutions, batches, stats, invalidDrafts, total: rows.size, publicDigest: detailedSha(nativeRaw), resolvedDigest: detailedSha(JSON.stringify(solutions)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const work = await readDetailedWork({ complete: process.argv.includes("--complete") });
  console.log(JSON.stringify({ draftRows: work.total, expected: work.native.total, invalidDrafts: work.invalidDrafts.length, resolvedDigest: work.resolvedDigest, batches: work.batches, collections: work.stats }, null, 2));
}
