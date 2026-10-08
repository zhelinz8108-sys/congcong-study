import type {
  EnglishPracticeFeedback,
  EnglishPracticeLetter,
} from "./national-day-english-practice-types";

export type EnglishPracticeAttempt = {
  correct: boolean;
  selected: EnglishPracticeLetter;
  submissions: number;
  wrongCount: number;
  at: string;
};
export type EnglishPracticeLocation = {
  chapter: string;
  page: number;
  id?: string;
};
export type EnglishPracticeProgress = {
  drafts: Record<string, EnglishPracticeLetter>;
  attempts: Record<string, EnglishPracticeAttempt>;
  location?: EnglishPracticeLocation;
  updatedAt: string;
};

const QUESTION = /^(CH(?:0[1-9]|1\d|2[0-4]))-Q(00[1-9]|0[1-9]\d|100)$/;
const CHAPTER = /^CH(?:0[1-9]|1\d|2[0-4])$/;
const BLOCK = /^(CH(?:0[1-9]|1\d|2[0-4]))-B(00[1-9]|0[1-5]\d|06[0-8])$/;

export function validEnglishPracticeId(id: unknown): id is string {
  return typeof id === "string" && QUESTION.test(id);
}
export function validEnglishPracticeLetter(value: unknown): value is EnglishPracticeLetter {
  return typeof value === "string" && /^[A-D]$/.test(value);
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
export function emptyEnglishPracticeProgress(): EnglishPracticeProgress {
  return { drafts: {}, attempts: {}, updatedAt: "" };
}
export function englishPracticeScope(subjectId: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(subjectId)) throw new TypeError("Invalid subject ID");
  return `english:holiday2400:${subjectId}:v1`;
}
export function normalizeEnglishPracticeLocation(raw: unknown): EnglishPracticeLocation | undefined {
  const value = object(raw);
  if (!value || typeof value.chapter !== "string" || !CHAPTER.test(value.chapter) || !integer(value.page, 1, 10)) return;
  const result: EnglishPracticeLocation = { chapter: value.chapter, page: value.page };
  if (validEnglishPracticeId(value.id)) {
    const match = QUESTION.exec(value.id)!;
    if (match[1] === value.chapter && Math.ceil(Number(match[2]) / 10) === value.page) result.id = value.id;
  }
  return result;
}

/** Whitelist every persisted field, including when loading older or untrusted cloud payloads. */
export function normalizeEnglishPracticeProgress(raw: unknown): EnglishPracticeProgress {
  const value = object(raw);
  const result = emptyEnglishPracticeProgress();
  if (!value) return result;
  if (timestamp(value.updatedAt)) result.updatedAt = value.updatedAt;
  for (const [id, letter] of Object.entries(object(value.drafts) ?? {})) {
    if (validEnglishPracticeId(id) && validEnglishPracticeLetter(letter)) result.drafts[id] = letter;
  }
  for (const [id, input] of Object.entries(object(value.attempts) ?? {})) {
    const attempt = object(input);
    if (!validEnglishPracticeId(id) || !attempt || typeof attempt.correct !== "boolean" ||
      !validEnglishPracticeLetter(attempt.selected) || !integer(attempt.submissions, 1) ||
      !integer(attempt.wrongCount, 0) || attempt.wrongCount > attempt.submissions ||
      (!attempt.correct && attempt.wrongCount === 0) || !timestamp(attempt.at)) continue;
    result.attempts[id] = {
      correct: attempt.correct, selected: attempt.selected,
      submissions: attempt.submissions, wrongCount: attempt.wrongCount, at: attempt.at,
    };
  }
  const location = normalizeEnglishPracticeLocation(value.location);
  if (location) result.location = location;
  return result;
}

/** Public structural information only; no answer key or grading rules enter the browser. */
function blockMembers(blockId: string): string[] | undefined {
  const match = BLOCK.exec(blockId);
  if (!match) return;
  const blockNumber = Number(match[2]);
  const sizes = [
    ...Array<number>(25).fill(1), ...Array<number>(3).fill(5),
    ...Array<number>(25).fill(1), ...Array<number>(3).fill(5),
    ...Array<number>(10).fill(1), ...Array<number>(2).fill(5),
  ];
  const start = sizes.slice(0, blockNumber - 1).reduce((sum, size) => sum + size, 1);
  return Array.from({ length: sizes[blockNumber - 1] }, (_, index) =>
    `${match[1]}-Q${String(start + index).padStart(3, "0")}`);
}

/** Apply a current single-question or legacy complete-block submission atomically. */
export function applyEnglishPracticeFeedback(
  progress: EnglishPracticeProgress,
  raw: unknown,
  at: string,
): EnglishPracticeProgress {
  const value = object(raw);
  if (!value || typeof value.blockId !== "string" || !timestamp(at) || !Array.isArray(value.results)) return progress;
  const allMembers = blockMembers(value.blockId);
  if (!allMembers) return progress;
  const singleQuestion = Object.prototype.hasOwnProperty.call(value, "questionId");
  if (singleQuestion && (!validEnglishPracticeId(value.questionId) || !allMembers.includes(value.questionId))) return progress;
  const members = singleQuestion ? [value.questionId as string] : allMembers;
  if (value.results.length !== members.length || value.maxScore !== members.length ||
    !integer(value.score, 0, members.length)) return progress;
  const results = value.results.map(object);
  const byId = new Map<string, Record<string, unknown>>();
  for (const result of results) {
    if (!result || !validEnglishPracticeId(result.questionId) || !members.includes(result.questionId) ||
      byId.has(result.questionId) || typeof result.correct !== "boolean" ||
      !validEnglishPracticeLetter(result.selected) ||
      (singleQuestion && progress.drafts[result.questionId] !== result.selected) ||
      (progress.drafts[result.questionId] && progress.drafts[result.questionId] !== result.selected)) return progress;
    byId.set(result.questionId, result);
  }
  if (results.filter((result) => result?.correct === true).length !== value.score) return progress;
  const next: EnglishPracticeProgress = {
    ...progress,
    attempts: { ...progress.attempts },
    drafts: { ...progress.drafts },
    updatedAt: at,
    location: { chapter: members[0].slice(0, 4), page: Math.ceil(Number(members[0].slice(-3)) / 10), id: members[0] },
  };
  for (const id of members) {
    const result = byId.get(id)!;
    const old = progress.attempts[id];
    const correct = result.correct as boolean;
    const selected = result.selected as EnglishPracticeLetter;
    next.drafts[id] = selected;
    next.attempts[id] = {
      correct, selected, submissions: Math.min((old?.submissions ?? 0) + 1, Number.MAX_SAFE_INTEGER),
      wrongCount: Math.min((old?.wrongCount ?? 0) + (correct ? 0 : 1), Number.MAX_SAFE_INTEGER), at,
    };
  }
  return next;
}

export function recordEnglishPracticeFeedback(progress: EnglishPracticeProgress, feedback: EnglishPracticeFeedback, at: string) {
  return applyEnglishPracticeFeedback(progress, feedback, at);
}
