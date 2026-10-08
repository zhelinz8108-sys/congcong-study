/** Student-visible contracts. Never import an answer key into a client module. */
export type EnglishPracticeLetter = "A" | "B" | "C" | "D";
export type EnglishPracticeDifficulty = "medium" | "hard" | "extreme";
export type EnglishPracticeQuestion = {
  id: string;
  serial: number;
  number: number;
  options: string[];
};
export type EnglishPracticeBlock = {
  id: string;
  kind: "choice" | "cloze";
  difficulty: EnglishPracticeDifficulty;
  questions: EnglishPracticeQuestion[];
  stem?: string;
  text?: string;
  title?: string;
  passage?: number;
};
export type EnglishPracticeChapter = {
  id: string;
  number: number;
  title: string;
  focus: string[];
  count: number;
  singleChoices: number;
  clozePassages: number;
};
export type EnglishPracticePage = {
  chapter: string;
  blocks: EnglishPracticeBlock[];
  page: number;
  pages: number;
  total: number;
};
export type EnglishPracticeResult = {
  questionId: string;
  selected: EnglishPracticeLetter;
  correct: boolean;
  correctOption: EnglishPracticeLetter;
  correctText: string;
  explanation: string;
};
export type EnglishPracticeFeedback = {
  blockId: string;
  /** Present only when one numbered question (including one cloze blank) was graded. */
  questionId?: string;
  results: EnglishPracticeResult[];
  score: number;
  maxScore: number;
};
export type EnglishPracticeSingleFeedback = EnglishPracticeFeedback & {
  questionId: string;
  results: [EnglishPracticeResult];
  score: 0 | 1;
  maxScore: 1;
};
export const ENGLISH_PRACTICE_DIFFICULTY_LABELS: Record<EnglishPracticeDifficulty,string> = {
  medium: "中等", hard: "困难", extreme: "超级困难",
};
