import "server-only";
import { createHash } from "node:crypto";
import type { BankQuestion, BankManifest } from "@/lib/grade6-bank-types";

export const SHORT_CHOICE_REVISION = "english-extension-short-v2";
type ShortQuestion = { prompt: string; choices: string[] };
export type ShortChoiceEdition = {
  version: 1;
  revision: typeof SHORT_CHOICE_REVISION;
  sourcePublicDigest: string;
  questions: Record<string, ShortQuestion>;
};

// New identities isolate changed questions from submitted attempts and offline drafts.
// The 600 unchanged fill questions retain their IDs and saved progress.
export function shortChoiceId(id: string) {
  return id.replace(/-(\d{3})$/, (_, number: string) => `-${String(Number(number) + 200).padStart(3, "0")}`);
}

export function validateShortChoices(edition: ShortChoiceEdition, sourceRaw: string, questions: BankQuestion[]) {
  const choices = questions.filter(q => q.kind === "选择题");
  if (edition.version !== 1 || edition.revision !== SHORT_CHOICE_REVISION ||
      edition.sourcePublicDigest !== createHash("sha256").update(sourceRaw).digest("hex") ||
      choices.length !== 600 || Object.keys(edition.questions).length !== choices.length) {
    throw new Error("英语短选项版本与原题库不匹配");
  }
  const prompts = new Set<string>();
  for (const q of choices) {
    const entry = edition.questions[q.id];
    if (!entry || !entry.prompt?.trim() || entry.choices?.length !== 4 ||
        entry.choices.some(text => !text.trim() || text.trim().split(/\s+/).length > 5 || text.length > 40) ||
        new Set(entry.choices.map(text => text.toLowerCase().replace(/[.。]+$/, "").trim())).size !== 4 ||
        prompts.has(entry.prompt.trim())) throw new Error(`英语短选项内容不完整：${q.id}`);
    prompts.add(entry.prompt.trim());
  }
}

export function shortChoiceQuestion(q: BankQuestion, edition: ShortChoiceEdition): BankQuestion {
  if (q.kind !== "选择题") return q;
  const entry = edition.questions[q.id];
  return { ...q, id: shortChoiceId(q.id), prompt: entry.prompt,
    inputs: q.inputs.map(input => ({ ...input, choices: entry.choices.map((text, index) => `${"ABCD"[index]}. ${text}`) })) };
}

export function shortChoiceManifest(manifest: BankManifest): BankManifest {
  return { ...manifest, version: SHORT_CHOICE_REVISION, collections: manifest.collections.map(collection => ({
    ...collection, subtitle: "75 道短选项选择 · 75 道填空 · 结合语境，练习本单元词汇与语法",
    questions: collection.questions.map(q => q.kind === "选择题" ? { ...q, id: shortChoiceId(q.id) } : q),
  })) };
}

/** Preserve the encrypted key's option order; never infer an answer from public content. */
export function shortChoiceAnswer<T extends { id: string; accepted: string[]; answerText: string; explanation: string }>(
  row: T, source: BankQuestion, edition: ShortChoiceEdition,
): T {
  if (source.kind !== "选择题") return row;
  const original = source.inputs[0].choices ?? [];
  const shortened = shortChoiceQuestion(source, edition).inputs[0].choices!;
  const indices = row.accepted.map(value => original.indexOf(value));
  if (indices.length !== 1 || indices.some(index => index < 0)) throw new Error(`英语短选项答案不匹配：${row.id}`);
  const index = indices[0];
  const correct = shortened[index];
  // Full expressions remain useful after submission, especially for cloze questions.
  // Keep the original verified grammar explanation alongside the concise answer.
  return { ...row, id: shortChoiceId(row.id), accepted: [correct], answerText: `正确选项：${correct}`,
    explanation: `本题选择 ${correct}。\n\n对应的完整表达或原意：${original[index].slice(3)}\n\n${row.explanation}` };
}
