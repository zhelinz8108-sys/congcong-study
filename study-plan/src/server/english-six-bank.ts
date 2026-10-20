import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { englishSixIndex, englishSixRoot } from "./english-six";
import { normalizeSixBankAnswer, sixBankInputs, type SixBankIndex, type SixBankPaper, type SixBankQuestion } from "@/lib/english-six-bank";
import type { SixFeedback } from "@/lib/english-six";
import { sixQuestionInputCount } from "@/lib/english-six-answer";

type PrivateQuestion = Omit<SixBankQuestion, "inputCount"> & {
  accepted: string[][]; answer: string; explanation: string;
  keySource: { resourceId: string; page: number; block: number };
};
type PrivatePaper = Omit<SixBankPaper, "questions"> & { questions: PrivateQuestion[] };
const root = path.join(englishSixRoot, "bank");
let cachedIndex: SixBankIndex | undefined;
let cachedLookup: Record<string, string> | undefined;
const paperCache = new Map<string, PrivatePaper>();
export function englishSixBankIndex(): SixBankIndex {
  if (process.env.NODE_ENV === "production" && cachedIndex) return cachedIndex;
  const file = path.join(root, "index.json");
  const stored = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as SixBankIndex :
    { version: 1, complete: false, auditedQuestionLowerBound: 10623, questionCount: 0, existingQuestionCount: 528, papers: [] };
  const sources = new Set(englishSixIndex().resources.map(resource => resource.id));
  const papers = stored.papers.filter(paper => paper.edition === "new" && sources.has(paper.sourceId));
  return cachedIndex = { ...stored, papers, questionCount: papers.reduce((count, paper) => count + paper.questionCount, 0) };
}
export function englishSixBankPrivatePaper(id: string): PrivatePaper | undefined {
  if (!/^[a-f0-9]{12}-[a-f0-9]{8}$/.test(id) || !englishSixBankIndex().papers.some(p => p.id === id)) return;
  if (process.env.NODE_ENV === "production" && paperCache.has(id)) return paperCache.get(id);
  const paper = JSON.parse(readFileSync(path.join(root, "papers", `${id}.json`), "utf8")) as PrivatePaper;
  if (process.env.NODE_ENV === "production") paperCache.set(id, paper);
  return paper;
}
function publicQuestion(q: PrivateQuestion): SixBankQuestion {
  // Explicit projection prevents future answer/provenance fields leaking through object spread.
  return { id: q.id, topic: q.topic, kind: q.kind, prompt: q.prompt, context: q.context, options: q.options,
    ...(q.promptRuns ? { promptRuns: q.promptRuns } : {}), sourcePage: q.sourcePage, sourceBlock: q.sourceBlock,
    inputCount: sixQuestionInputCount(q, q.grading === "exact" ? q.accepted.length : undefined), grading: q.grading };
}
export function englishSixBankPublicPaper(id: string): SixBankPaper | undefined {
  const paper = englishSixBankPrivatePaper(id);
  const entry = englishSixBankIndex().papers.find(p => p.id === id);
  return paper && entry ? { ...entry, questions: paper.questions.map(publicQuestion) } : undefined;
}
export function englishSixBankGrade(id: string, response: string): SixFeedback | undefined {
  if (!/^sx-[a-f0-9]{12}-[a-f0-9]{12}$/.test(id) || !response.trim() || response.length > 10000) return;
  const file = path.join(root, "lookup.private.json");
  if (!existsSync(file)) return;
  const lookup = process.env.NODE_ENV === "production" && cachedLookup ? cachedLookup : cachedLookup = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  const q = lookup[id] && englishSixBankPrivatePaper(lookup[id])?.questions.find(q => q.id === id);
  if (!q) return;
  const pub = publicQuestion(q);
  const inputs = sixBankInputs(pub, response);
  if (inputs.some(v => !v.trim() || v.length > 10000)) return;
  if (q.options.length && !q.options.some(o => o.id === response)) return;
  const correct = q.grading === "reference" ? null : q.options.length ? response === q.answer :
    q.accepted.length === inputs.length && q.accepted.every((variants, i) => variants.some(v => normalizeSixBankAnswer(v) === normalizeSixBankAnswer(inputs[i])));
  return { id, response, answer: q.answer, explanation: q.explanation, correct };
}
