import "server-only";
import { pool } from "@/lib/db";
import { ensureCloudProgressSchema } from "@/lib/cloud-progress-schema";
import { firstSubmission, firstSubmissions, saveFirstSubmission } from "@/server/first-submission";
import { checkHolidayAnswer } from "@/server/holiday-math-700/service";
import { holidayPrivateAnswer } from "@/server/holiday-math-700/private-bank";
import { submitNationalDayMath, legacyNationalDayMathFeedback } from "@/lib/national-day-math-submission";
import type { HolidayFeedback, HolidayStudentAnswer } from "@/lib/holiday-math-700-types";
import type { NationalDayMathSubmissionResult } from "@/lib/national-day-math";

export const HOLIDAY_FIRST_SCOPE = "math:holiday700:v1";
export const NATIONAL_FIRST_SCOPE = "math:national-day:v1";
type LegacyPayload = { drafts?: Record<string, HolidayStudentAnswer>; attempts?: Record<string, Record<string, unknown>>; [key: string]: unknown };
async function legacyPayloads(student: string, module: "holiday700" | "national-day") {
  await ensureCloudProgressSchema();
  const result = await pool.query("SELECT scope, payload, updated_at FROM student_cloud_state WHERE student_id=$1 AND scope LIKE $2 ORDER BY updated_at ASC", [student, `math:${module}:%:v1`]);
  return result.rows as { scope: string; payload: LegacyPayload; updated_at: Date | string }[];
}
async function legacyHoliday(student: string, id: string) {
  for (const row of await legacyPayloads(student, "holiday700")) {
    const attempt = row.payload.attempts?.[id];
    if (!attempt || typeof attempt.correct !== "boolean" || !(Number(attempt.submissions) >= 1)) continue;
    const answer = row.payload.drafts?.[id] ?? "";
    let feedback: HolidayFeedback;
    try { feedback = checkHolidayAnswer(id, answer); }
    catch {
      const record = holidayPrivateAnswer(id); if (!record) throw new Error("题目不存在");
      feedback = { question_id: id, correct: attempt.correct, score: Number(attempt.score) || 0, maxScore: Number(attempt.maxScore) || 1, items: [], solution: record.solution, choice_rationales: record.choice_rationales, common_mistakes: record.common_mistakes };
    }
    // Preserve existing scores; a legacy snapshot is not a new attempt.
    feedback.correct = attempt.correct; feedback.score = Number(attempt.score) || 0; feedback.maxScore = Number(attempt.maxScore) || feedback.maxScore;
    return { answer, feedback, submittedAt: typeof attempt.updatedAt === "string" ? attempt.updatedAt : new Date(row.updated_at).toISOString() };
  }
  return undefined;
}
async function legacyNational(student: string, id: string) {
  for (const row of await legacyPayloads(student, "national-day")) {
    const attempt = row.payload.attempts?.[id];
    if (!attempt?.checked || typeof attempt.value !== "string") continue;
    let answer: Record<string, string> = {};
    try { const value = JSON.parse(attempt.value); if (value && typeof value === "object" && !Array.isArray(value)) answer = value; } catch { /* Old aggregate retained below. */ }
    return { answer, feedback: legacyNationalDayMathFeedback(id, answer, attempt.correct === true), submittedAt: new Date(row.updated_at).toISOString() };
  }
  return undefined;
}
export async function submitHolidayOnce(student: string, id: string, answer: unknown) {
  return saveFirstSubmission<HolidayStudentAnswer, HolidayFeedback>(student, HOLIDAY_FIRST_SCOPE, id, answer as HolidayStudentAnswer,
    async value => checkHolidayAnswer(id, value), await legacyHoliday(student, id));
}
export async function readHolidayFeedback(student: string, id: string) {
  return await firstSubmission<HolidayStudentAnswer, HolidayFeedback>(student, HOLIDAY_FIRST_SCOPE, id) ?? await legacyHoliday(student, id) ?? null;
}
export async function submitNationalOnce(student: string, id: string, answer: unknown) {
  return saveFirstSubmission<Record<string, string>, NationalDayMathSubmissionResult>(student, NATIONAL_FIRST_SCOPE, id, answer as Record<string, string>,
    async value => submitNationalDayMath(id, value), await legacyNational(student, id));
}
export async function readNationalFeedback(student: string, id: string) {
  return await firstSubmission<Record<string, string>, NationalDayMathSubmissionResult>(student, NATIONAL_FIRST_SCOPE, id) ?? await legacyNational(student, id) ?? null;
}
export async function holidayFirstProgress(student: string, subject: string) {
  const rows = await legacyPayloads(student, "holiday700");
  const old = rows.find(row => row.scope === `math:holiday700:${subject}:v1`)?.payload ?? rows.at(-1)?.payload ?? {};
  const drafts = { ...(old.drafts ?? {}) }, attempts = { ...(old.attempts ?? {}) };
  const locked = new Set<string>();
  for (const row of rows) for (const [id, attempt] of Object.entries(row.payload.attempts ?? {})) {
    if (locked.has(id) || typeof attempt.correct !== "boolean" || !(Number(attempt.submissions) >= 1)) continue;
    locked.add(id);
    attempts[id] = attempt;
    drafts[id] = row.payload.drafts?.[id] ?? "";
  }
  for (const [id, r] of Object.entries(await firstSubmissions<HolidayStudentAnswer, HolidayFeedback>(student, HOLIDAY_FIRST_SCOPE))) {
    drafts[id] = r.answer;
    attempts[id] = { correct: r.feedback.correct, score: r.feedback.score, maxScore: r.feedback.maxScore, submissions: 1, wrongCount: r.feedback.correct ? 0 : 1, hinted: false, updatedAt: r.submittedAt };
  }
  return { ...old, drafts, attempts };
}
export async function nationalFirstProgress(student: string, subject: string) {
  const rows = await legacyPayloads(student, "national-day");
  const old = rows.find(row => row.scope === `math:national-day:${subject}:v1`)?.payload ?? rows.at(-1)?.payload ?? {}, attempts = { ...(old.attempts ?? {}) };
  const locked = new Set<string>();
  for (const row of rows) for (const [id, attempt] of Object.entries(row.payload.attempts ?? {})) {
    if (locked.has(id) || !attempt.checked || typeof attempt.value !== "string") continue;
    locked.add(id);
    attempts[id] = attempt;
  }
  for (const [id, r] of Object.entries(await firstSubmissions<Record<string, string>, NationalDayMathSubmissionResult>(student, NATIONAL_FIRST_SCOPE))) {
    attempts[id] = { value: JSON.stringify(r.answer), checked: true, correct: r.feedback.correct, gradingVersion: 2 };
  }
  return { ...old, attempts };
}
