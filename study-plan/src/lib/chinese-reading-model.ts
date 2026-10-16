import type { ChineseReadingPassage, ChineseReadingQuestion, ChineseReadingTopic } from "./chinese-reading";

export type ReadingPublicQuestion = Pick<ChineseReadingQuestion, "id" | "type" | "prompt" | "options">;
export type ReadingPublicPassage = Omit<ChineseReadingPassage, "questions"> & { questions: ReadingPublicQuestion[] };
export type ReadingPublicTopic = ChineseReadingTopic;
export type ReadingFeedback = Pick<ChineseReadingQuestion, "answer" | "scoringPoints" | "template" | "explanation" | "mistakeTags"> & { isCorrect: boolean | null };
export type ReadingSubmission = { answer: string; feedback: ReadingFeedback; submittedAt: string };
export type ReadingMistake = {
  id: string; topicKey: string; topicName: string; passageId: string; passageTitle: string;
  questionId: string; questionPrompt: string; response: string; answer: string;
  mistakeTags: string[]; scoringPoints: string[]; updatedAt: string;
};
