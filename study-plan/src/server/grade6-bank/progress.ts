import "server-only";
import { pool } from "@/lib/db";
import type { BankAnswers, BankProgress, BankResponse, BankFeedback } from "@/lib/grade6-bank-types";

let schema: Promise<void> | null = null;
const testMemory = () => process.env.NODE_ENV !== "production" && process.env.GRADE6_BANK_TEST_MEMORY === "1";
// Development route bundles can load this module independently. All test-only
// endpoints must share one isolated store so cross-route CAS is exercised.
const testRuntime = globalThis as typeof globalThis & { grade6BankTestMemory?: Map<string, BankProgress> };
const memory = testMemory() ? (testRuntime.grade6BankTestMemory ??= new Map<string, BankProgress>()) : new Map<string, BankProgress>();

async function ensureSchema() {
  schema ??= pool.query(`CREATE TABLE IF NOT EXISTS grade6_bank_responses (
    student_id TEXT NOT NULL, subject_id TEXT NOT NULL, question_id TEXT NOT NULL,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb, submitted BOOLEAN NOT NULL DEFAULT FALSE,
    outcome TEXT, score INTEGER, max_score INTEGER NOT NULL DEFAULT 0,
    submissions INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revision INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (student_id, subject_id, question_id)
  );
  ALTER TABLE grade6_bank_responses ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
  `).then(() => undefined).catch((error) => { schema = null; throw error; });
  return schema;
}
function blank(): BankProgress { return { responses: {}, lastQuestionId: "", updatedAt: "" }; }
function emptyResponse(): BankResponse {
  return { answers: {}, submitted: false, outcome: null, score: null, maxScore: 0, submissions: 0, updatedAt: "", revision: 0 };
}
function responseFromRow(row: { answers: BankAnswers; submitted: boolean; outcome: BankResponse["outcome"]; score: number | null; max_score: number; submissions: number; updated_at: Date | string; revision: number }): BankResponse {
  return { answers: row.answers, submitted: row.submitted, outcome: row.outcome, score: row.score, maxScore: row.max_score, submissions: row.submissions, updatedAt: new Date(row.updated_at).toISOString(), revision: row.revision };
}
export function bankBaseRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= 2147483647) throw new Error("提交格式不正确，请提供有效的版本号");
  return value;
}
export class BankRevisionConflict extends Error {
  constructor(public readonly response: BankResponse) {
    super("作答记录已在其他页面更新，请刷新后重试。");
    this.name = "BankRevisionConflict";
  }
}
export async function bankProgress(studentId: string, subjectId: string): Promise<BankProgress> {
  if (testMemory()) return memory.get(`${studentId}:${subjectId}`) ?? blank();
  await ensureSchema();
  const result = await pool.query("SELECT question_id, answers, submitted, outcome, score, max_score, submissions, updated_at, revision FROM grade6_bank_responses WHERE student_id=$1 AND subject_id=$2 ORDER BY updated_at ASC", [studentId, subjectId]);
  const progress = blank();
  for (const row of result.rows) {
    const updatedAt = new Date(row.updated_at).toISOString();
    progress.responses[row.question_id] = responseFromRow(row);
    progress.lastQuestionId = row.question_id;
    progress.updatedAt = updatedAt;
  }
  return progress;
}
export async function saveBankResponse(studentId: string, subjectId: string, questionId: string, answers: BankAnswers, baseRevision: number, feedback?: BankFeedback): Promise<BankResponse> {
  bankBaseRevision(baseRevision);
  const updatedAt = new Date().toISOString();
  if (testMemory()) {
    const key = `${studentId}:${subjectId}`, progress = memory.get(key) ?? blank(), old = progress.responses[questionId];
    if ((old?.revision ?? 0) !== baseRevision) throw new BankRevisionConflict(old ?? emptyResponse());
    const value: BankResponse = { answers, submitted: !!feedback, outcome: feedback?.outcome ?? null, score: feedback?.score ?? null, maxScore: feedback?.maxScore ?? 0, submissions: (old?.submissions ?? 0) + (feedback ? 1 : 0), updatedAt, revision: baseRevision + 1 };
    memory.set(key, { responses: { ...progress.responses, [questionId]: value }, lastQuestionId: questionId, updatedAt });
    return value;
  }
  await ensureSchema();
  const parameters = [studentId, subjectId, questionId, JSON.stringify(answers), !!feedback, feedback?.outcome ?? null, feedback?.score ?? null, feedback?.maxScore ?? 0, feedback ? 1 : 0];
  const returning = "RETURNING answers, submitted, outcome, score, max_score, submissions, updated_at, revision";
  // The unique key serializes simultaneous first writes; subsequent writes use
  // one atomic revision-qualified UPDATE. A stale draft cannot demote a newer
  // submission, and a stale submission cannot replace a newer edit either.
  const result = baseRevision === 0
    ? await pool.query(`INSERT INTO grade6_bank_responses (student_id, subject_id, question_id, answers, submitted, outcome, score, max_score, submissions, updated_at, revision)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,NOW(),1)
        ON CONFLICT (student_id,subject_id,question_id) DO NOTHING ${returning}`, parameters)
    : await pool.query(`UPDATE grade6_bank_responses SET answers=$4::jsonb, submitted=$5, outcome=$6,
        score=$7, max_score=$8, submissions=submissions+$9, updated_at=NOW(), revision=revision+1
        WHERE student_id=$1 AND subject_id=$2 AND question_id=$3 AND revision=$10 ${returning}`, [...parameters, baseRevision]);
  if (result.rows[0]) return responseFromRow(result.rows[0]);
  const current = await pool.query("SELECT answers, submitted, outcome, score, max_score, submissions, updated_at, revision FROM grade6_bank_responses WHERE student_id=$1 AND subject_id=$2 AND question_id=$3", [studentId, subjectId, questionId]);
  throw new BankRevisionConflict(current.rows[0] ? responseFromRow(current.rows[0]) : emptyResponse());
}
