import "server-only";
import type { EnglishSixIndex, SixResource } from "@/lib/english-six";
import type { SixBankPaper } from "@/lib/english-six-bank";
import { englishSixIndex, englishSixPaper, englishSixResource } from "./english-six";
import { englishSixBankIndex, englishSixBankPrivatePaper, englishSixBankPublicPaper } from "./english-six-bank";

type Practice = NonNullable<SixResource["practice"]>;
let cachedPlans: Map<string, Practice> | undefined;
const titleKey = (r: SixResource) => `${r.edition}:${r.title.normalize("NFKC").toLowerCase().replace(/[\s_·-]+/g, "")}`;
const textKey = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s_]+/gu, "");

function sourceContainsQuestions(resourceId: string, prompts: string[]) {
  const source = englishSixResource(resourceId);
  if (!source) return false;
  const text = textKey(source.pages.flatMap(page => page.blocks.flatMap(block => block.kind === "text" ? [block.text] : block.kind === "table" ? block.rows.flat() : [])).join("\n"));
  const meaningful = [...new Set(prompts.map(textKey).filter(prompt => prompt.length >= 12))];
  return meaningful.length >= 5 && meaningful.filter(prompt => text.includes(prompt)).length >= meaningful.length * 0.85;
}

export function englishSixPracticePlans() {
  if (process.env.NODE_ENV === "production" && cachedPlans) return cachedPlans;
  const index = englishSixIndex(), bank = englishSixBankIndex();
  const plans = new Map<string, Practice>();
  for (const paper of bank.papers) {
    const previous = plans.get(paper.sourceId);
    plans.set(paper.sourceId, { type: "bank", sourceId: paper.sourceId, questionCount: (previous?.questionCount ?? 0) + paper.questionCount });
  }
  for (let unit = 1; unit <= 8; unit++) {
    const paper = englishSixPaper(unit);
    if (paper) plans.set(paper.sourceId, { type: "assessment", sourceId: paper.sourceId, unit, questionCount: paper.questions.length });
  }
  const candidates = new Map<string, SixResource[]>();
  for (const resource of index.resources) {
    if (!plans.has(resource.id)) continue;
    const key = titleKey(resource);
    candidates.set(key, [...candidates.get(key) ?? [], resource]);
  }
  for (const resource of index.resources) {
    if (plans.has(resource.id) || resource.stage === "reference" || ![".pdf", ".docx"].includes(resource.extension)) continue;
    const matches = candidates.get(titleKey(resource)) ?? [];
    // A matching filename is not enough: alternate PDF/Word editions must also
    // contain the actual question stems before sharing their immutable IDs.
    if (matches.length !== 1) continue;
    const candidate = matches[0], plan = plans.get(candidate.id)!;
    const prompts = plan.type === "assessment" ? englishSixPaper(plan.unit!)?.questions.map(q => q.prompt) ?? [] :
      bank.papers.filter(paper => paper.sourceId === candidate.id).flatMap(paper => englishSixBankPrivatePaper(paper.id)?.questions.map(q => q.prompt) ?? []);
    if (sourceContainsQuestions(resource.id, prompts)) plans.set(resource.id, plan);
  }
  if (process.env.NODE_ENV === "production") cachedPlans = plans;
  return plans;
}

export function englishSixInteractiveIndex(): EnglishSixIndex {
  const index = englishSixIndex(), plans = englishSixPracticePlans();
  return { ...index, resources: index.resources.map(resource => ({ ...resource, ...(plans.has(resource.id) ? { practice: plans.get(resource.id) } : {}) })) };
}

export function englishSixResourcePractice(id: string): SixBankPaper | undefined {
  const meta = englishSixIndex().resources.find(resource => resource.id === id);
  const plan = englishSixPracticePlans().get(id);
  if (!meta || plan?.type !== "bank") return;
  const entries = englishSixBankIndex().papers.filter(paper => paper.sourceId === plan.sourceId);
  const questions = entries.flatMap(entry => englishSixBankPublicPaper(entry.id)?.questions.map(question => ({ ...question, topic: entry.title })) ?? [])
    .sort((a, b) => a.sourcePage - b.sourcePage || a.sourceBlock - b.sourceBlock);
  return { id: `source-${id}`, sourceId: plan.sourceId, sourceTitle: meta.title, title: meta.title,
    unit: entries.every(entry => entry.unit === entries[0].unit) ? entries[0].unit : 0,
    edition: meta.edition, stage: meta.stage, page: 1, questionCount: questions.length, questions };
}
