export type EnglishLockedModule = "six" | "holiday2400" | "national-day" | "grammar-original" | "grammar-tense" | "grammar-course" | "grammar-stage" | "listening" | "grammar-guide" | "sentence-structure" | "final-review" | "vocab" | "listening-panel";
export type EnglishLockedAnswer = string | string[] | Record<string, string | string[]>;
export type EnglishLockedFeedback = {
  correct: boolean | null;
  answer: string;
  explanation: string;
  contentRevision?: string;
  score?: number;
  total?: number;
  itemResults?: Record<string, { correct: boolean; answer: string }>;
};
export type EnglishLockedRecord = {
  id: string;
  response: EnglishLockedAnswer;
  feedback: EnglishLockedFeedback;
  submittedAt: string;
};
