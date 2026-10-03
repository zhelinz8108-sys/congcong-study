import type { HolidayAttempt } from "./holiday-math-700-progress";

/** Count unique questions using their latest submission, never submission totals. */
export function holidayMathStats(
  attempts: Record<string, HolidayAttempt>,
  chapterId?: string,
) {
  const records = Object.entries(attempts).filter(([id]) => {
    const match = /^M6A_(CH0[1-7])_Q(?:00[1-9]|0[1-9]\d|100)$/.exec(id);
    return !!match && (!chapterId || match[1] === chapterId);
  });
  const answered = records.length;
  const correct = records.filter(([, attempt]) => attempt.correct).length;
  return {
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 1000) / 10 : null,
    previouslyWrong: records.filter(([, attempt]) => attempt.wrongCount > 0)
      .length,
  };
}

export function holidayAccuracyLabel(accuracy: number | null) {
  return accuracy === null ? "—" : `${accuracy}%`;
}
