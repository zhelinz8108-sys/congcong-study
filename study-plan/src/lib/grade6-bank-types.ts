export type BankDifficulty = 1 | 2 | 3 | 4;
export const BANK_DIFFICULTIES = [
  { value: 1, label: "基础起步", description: "先把概念和基本计算练熟" },
  { value: 2, label: "巩固提高", description: "多一步思考，串起知识点" },
  { value: 3, label: "综合应用", description: "在真实问题中灵活运用" },
  { value: 4, label: "拓展挑战", description: "尝试更有深度的推理" },
] as const;

export type BankInput = { id: string; label: string; kind?: "text" | "choice"; choices?: string[] };
export type BankQuestion = {
  id: string;
  collectionId: string;
  number: number;
  chapter: number | null;
  originalNumber: string;
  sourceName: string;
  sourcePage: number;
  topic: string;
  difficulty: BankDifficulty;
  kind: string;
  prompt: string;
  questionImages: string[];
  inputs: BankInput[];
};
export type BankQuestionRef = Pick<BankQuestion, "id" | "number" | "difficulty" | "topic" | "kind">;
export type BankCollection = {
  id: string;
  title: string;
  subtitle: string;
  mode: "chapter" | "exam";
  chapter: number | null;
  palette: number;
  questionCount: number;
  difficultyCounts: Record<string, number>;
  questions: BankQuestionRef[];
};
export type BankManifest = { version: string; total: number; collections: BankCollection[]; sourceFiles: number };
export type BankAnswers = Record<string, string>;
export type BankOutcome = "correct" | "incorrect" | "review" | "missing";
export type BankFeedback = {
  questionId: string;
  outcome: BankOutcome;
  score: number | null;
  maxScore: number;
  message: string;
  answerText: string;
  answerImages: string[];
  fields: { id: string; correct: boolean | null }[];
};
export type BankResponse = {
  answers: BankAnswers;
  submitted: boolean;
  outcome: BankOutcome | null;
  score: number | null;
  maxScore: number;
  submissions: number;
  updatedAt: string;
  revision: number;
  /** Server revision the local unsaved edit was based on; never server-trusted. */
  baseRevision?: number;
};
export type BankProgress = { responses: Record<string, BankResponse>; lastQuestionId: string; updatedAt: string };

export function bankStats(ids: string[], responses: BankProgress["responses"]) {
  const submitted = ids.map((id) => responses[id]).filter((r) => r?.submitted);
  const graded = submitted.filter((r) => r.outcome === "correct" || r.outcome === "incorrect");
  const correct = graded.filter((r) => r.outcome === "correct").length;
  return {
    answered: submitted.length,
    correct,
    graded: graded.length,
    review: submitted.length - graded.length,
    accuracy: graded.length ? Math.round((correct / graded.length) * 100) : null,
  };
}
