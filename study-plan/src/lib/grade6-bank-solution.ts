/** The content is returned only with an authorised, already-submitted attempt.
 * This module contains types/validation, never an answer key. */
export type BankSolutionStep = { title: string; content: string; fieldIds?: string[] };
export type BankDetailedSolution = {
  id: string;
  thought: string;
  steps: BankSolutionStep[];
  answerSummary: string;
  pitfalls: string[];
  reviewNote?: string;
};

export function assertBankDetailedSolution(value: unknown, id: string, fieldIds: string[]): asserts value is BankDetailedSolution {
  const row = value as BankDetailedSolution;
  const text = (value: unknown, max = 32000) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
  if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).some(key => !["id", "thought", "steps", "answerSummary", "pitfalls", "reviewNote"].includes(key)) || row.id !== id || !text(row.thought) || !text(row.answerSummary) || !Array.isArray(row.steps) || row.steps.length < 2 || row.steps.length > 100 || !Array.isArray(row.pitfalls) || !row.pitfalls.length || row.pitfalls.length > 20 || row.pitfalls.some(p => !text(p)) || (row.reviewNote !== undefined && !text(row.reviewNote))) throw new Error("逐步详解格式不完整");
  const allowed = new Set(fieldIds), covered = new Set<string>();
  for (const step of row.steps) {
    if (!step || typeof step !== "object" || Array.isArray(step) || Object.keys(step).some(key => !["title", "content", "fieldIds"].includes(key)) || !text(step.title, 200) || !text(step.content) || (step.fieldIds !== undefined && (!Array.isArray(step.fieldIds) || !step.fieldIds.length || new Set(step.fieldIds).size !== step.fieldIds.length || step.fieldIds.some(field => typeof field !== "string" || !allowed.has(field))))) throw new Error("逐步详解与小题不匹配");
    for (const field of step.fieldIds ?? []) covered.add(field);
  }
  if (fieldIds.some(field => !covered.has(field))) throw new Error("逐步详解有遗漏的小题");
}
