export type SixModule = "lessons" | "sentences" | "reading" | "writing";
export type SixQuestion = {
  id: string; prompt: string; kind: "choice" | "short";
  options: { value: string; text: string }[]; topic: string; pages: number[];
};
export type SixItem = {
  id: string; module: SixModule; title: string; group: string; source: SixModule;
  pages: number[]; unit?: number; sections: { title: string; text: string }[];
  questions: SixQuestion[];
};
export type SixItemSummary = Omit<SixItem, "sections" | "questions"> & { questionCount: number };
export type SixFeedback = { answer: string; explanation: string; points: string[]; prompt?: string; topic?: string };
export type SixResponse = {
  value: string; submittedAt: string; correct: boolean | null;
  selfScore?: "full" | "partial" | "none";
};
export type SixAttempt = {
  id: string; itemId: string; startedAt: string; finishedAt?: string;
  responses: Record<string, SixResponse>;
};
export type SixProgress = { attempts: Record<string, SixAttempt>; current: Record<string, string>; reviewed: string[] };
export const emptySixProgress = (): SixProgress => ({ attempts: {}, current: {}, reviewed: [] });

export const SIX_MODULES: { key: SixModule; name: string; sub: string; color: string }[] = [
  { key: "lessons", name: "课内复习", sub: "课文与语文园地", color: "#be123c" },
  { key: "sentences", name: "句子专项", sub: "13 类语言运用训练", color: "#0369a1" },
  { key: "reading", name: "阅读训练", sub: "阅读方法与整篇小练", color: "#047857" },
  { key: "writing", name: "作文训练", sub: "范文精读与分步练笔", color: "#a16207" },
];

export function scoreSixResponse(response: SixResponse) {
  if (response.correct !== null) return response.correct ? 1 : 0;
  return response.selfScore === "full" ? 1 : response.selfScore === "partial" ? 0.5 : 0;
}

export function sixAttemptStats(attempt: SixAttempt, questionCount: number) {
  const responses = Object.values(attempt.responses);
  const evaluated = responses.filter(r => r.correct !== null || r.selfScore !== undefined);
  const score = evaluated.reduce((sum, r) => sum + scoreSixResponse(r), 0);
  return { answered: responses.length, evaluated: evaluated.length, score,
    complete: evaluated.length === questionCount,
    mastery: evaluated.length ? Math.round(score / evaluated.length * 100) : 0 };
}

// The same immutable transition is used by the API and verified in the tests.
export function recordSixResponse(attempt: SixAttempt, question: SixQuestion, value: string, answer: string, now: string): SixAttempt {
  if (attempt.responses[question.id]) throw new Error("本题已提交，不能修改。重新练习请开始新的一次。");
  if (!value.trim() || value.length > 8000) throw new Error("请填写答案（最多 8000 字）。");
  if (question.kind === "choice" && !question.options.some(o => o.value === value)) throw new Error("请选择一个有效选项。");
  return { ...attempt, responses: { ...attempt.responses, [question.id]: {
    value: value.trim(), submittedAt: now, correct: question.kind === "choice" ? value === answer.trim() : null,
  } } };
}

export function rateSixResponse(attempt: SixAttempt, questionId: string, score: SixResponse["selfScore"]): SixAttempt {
  const response = attempt.responses[questionId];
  if (!response || response.correct !== null) throw new Error("请先提交简答题。");
  if (response.selfScore !== undefined) throw new Error("本次自评已完成，不能修改。");
  if (!["full", "partial", "none"].includes(score ?? "")) throw new Error("请选择有效的自评结果。");
  return { ...attempt, responses: { ...attempt.responses, [questionId]: { ...response, selfScore: score } } };
}
