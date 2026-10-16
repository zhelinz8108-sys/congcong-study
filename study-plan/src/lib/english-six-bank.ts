import type { SixEdition, SixQuestion, SixStage } from "./english-six";
import { sixAnswerResponse, sixAnswerValues } from "./english-six-answer";

export type SixBankEntry = {
  id: string; sourceId: string; unit: number; edition: SixEdition; stage: SixStage;
  title: string; sourceTitle: string; questionCount: number; page: number;
};
export type SixBankIndex = {
  version: number; complete: boolean; auditedQuestionLowerBound: number;
  questionCount: number; existingQuestionCount: number; papers: SixBankEntry[];
};
export type SixBankQuestion = SixQuestion & {
  sourcePage: number; sourceBlock: number; inputCount: number; grading: "exact" | "reference";
};
export type SixBankPaper = SixBankEntry & { questions: SixBankQuestion[] };

export function sixBankResponse(question: SixBankQuestion, values: string[]) {
  return sixAnswerResponse(values.slice(0, question.inputCount));
}
export function sixBankInputs(question: SixBankQuestion, response: string): string[] {
  return sixAnswerValues(question.inputCount, response);
}
export const normalizeSixBankAnswer = (value: string) => value.normalize("NFKC")
  .replace(/[‘’]/g, "'").trim().replace(/\s+/g, " ").replace(/[.?!。？！]+$/, "").toLowerCase();
