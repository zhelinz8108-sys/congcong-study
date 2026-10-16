import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { readDetailedWork, detailedRoot, detailedSha } from "./grade6-bank-detailed-authoring.mjs";

// Certification is content-bound: independent native-model reviews must cover
// every final row. Arithmetic scanning is a separate check, not a substitute.
// Local private audit output only; no network, database or learner operations.
const work = await readDetailedWork({ complete: true });
const rows = new Map(work.solutions.map(row => [row.id, row]));
const sources = [
  { name: "b-peer-a-audit.json", count: 549, rows: "reports", native: "native" },
  { name: "peer-review-root-c.json", count: 309, rows: "questions", native: "blocks-inputs" },
  { name: "peer-review-b-by-a.json", count: 780, rows: "questions", native: "question" },
  { name: "chapter3-5-circle-peer-audit.json", count: 156, rows: "rows", native: "native" },
  { name: "peer-review-c-independent.json", count: 598, rows: "questions", native: "question" },
  { name: "root-two-independent.json", count: 2, rows: "questions", native: "question" },
];
const reviewedIds = new Set(), proofs = [];
for (const source of sources) {
  const raw = await fs.readFile(path.join(detailedRoot, source.name), "utf8"), review = JSON.parse(raw);
  const list = review[source.rows];
  assert(Array.isArray(list) && list.length === source.count, source.name + ": incomplete independent review");
  for (const key of ["pending", "pendingIds", "failures", "unresolved"]) if (review[key] !== undefined) assert(Array.isArray(review[key]) && review[key].length === 0, source.name + ": unresolved content issue");
  if (review.summary) for (const key of ["expectedDisagreements", "arithmeticManual"]) if (review.summary[key] !== undefined) assert(Array.isArray(review.summary[key]) && review.summary[key].length === 0, source.name + ": unresolved derivation");
  for (const evidence of list) {
    const row = rows.get(evidence.id), question = work.questions.get(evidence.id);
    assert(row && question && !reviewedIds.has(evidence.id), source.name + ": unknown/duplicate coverage");
    assert.equal(evidence.solutionHash, detailedSha(JSON.stringify(row)), evidence.id + ": final solution changed after review");
    const native = source.native === "native" ? question.native : source.native === "blocks-inputs" ? { blocks: question.native.blocks, inputs: question.inputs } : question;
    assert.equal(evidence.nativeQuestionHash ?? evidence.nativeHash, detailedSha(JSON.stringify(native)), evidence.id + ": review refers to another native question");
    reviewedIds.add(evidence.id);
  }
  proofs.push({ name: source.name, count: list.length, digest: detailedSha(raw) });
}
assert.equal(reviewedIds.size, 2394, "Independent review must cover the full bank");
const arithmeticRaw = await fs.readFile(path.join(detailedRoot, "arithmetic-review.json"), "utf8"), arithmetic = JSON.parse(arithmeticRaw);
assert.equal(arithmetic.resolvedDigest, work.resolvedDigest, "Arithmetic review is stale");
assert.equal(arithmetic.publicDigest, work.publicDigest);
assert.equal(arithmetic.draftRows, 2394);
assert.equal(arithmetic.mismatches.length, 0, "Arithmetic discrepancies remain");
proofs.push({ name: "arithmetic-review.json", digest: detailedSha(arithmeticRaw), checks: arithmetic.exactEqualityChains });
const review = { version: 1, status: "verified", total: work.total, publicDigest: work.publicDigest, resolvedDigest: work.resolvedDigest, pendingIds: [], batches: work.batches, independentReviewCoverage: reviewedIds.size, originalInputs: work.native.questions.reduce((n, q) => n + q.inputs.length, 0), solutionSteps: work.solutions.reduce((n, q) => n + q.steps.length, 0), explicitOriginalSourceCaveats: work.solutions.filter(row => row.reviewNote).length, proofs, studentWrites: 0, verifiedAt: new Date().toISOString() };
await fs.writeFile(path.join(detailedRoot, "release-review.json"), JSON.stringify(review, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ passed: true, total: review.total, independentReviewCoverage: review.independentReviewCoverage, originalInputs: review.originalInputs, solutionSteps: review.solutionSteps, exactEqualityChains: arithmetic.exactEqualityChains, explicitOriginalSourceCaveats: review.explicitOriginalSourceCaveats, studentWrites: 0 }));
