import {
  normalizeEnglishPracticeProgress,
  type EnglishPracticeProgress,
} from "./national-day-english-practice-progress-state";

/** Count unique questions using their latest submission, including each individual cloze blank. */
export function englishPracticeStats(progress: Pick<EnglishPracticeProgress, "attempts">, chapterId?: string) {
  const attempts = normalizeEnglishPracticeProgress(progress).attempts;
  const records = Object.entries(attempts).filter(([id]) => !chapterId || id.startsWith(`${chapterId}-`));
  const answered = records.length;
  const correct = records.filter(([, attempt]) => attempt.correct).length;
  return { answered, correct, accuracy: answered ? Math.round((correct / answered) * 1000) / 10 : null };
}

export function englishPracticeAccuracyLabel(accuracy: number | null) {
  return accuracy === null ? "—" : `${accuracy}%`;
}
