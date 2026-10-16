import "server-only";
import { pool } from "@/lib/db";
import type { PoolClient } from "pg";

export type FirstSubmission<A = unknown, F = unknown> = {
  answer: A;
  feedback: F;
  submittedAt: string;
};
export type SavedFirstSubmission<A = unknown, F = unknown> = FirstSubmission<A, F> & { replayed: boolean };

let schemaPromise: Promise<void> | null = null;
export function ensureFirstSubmissionSchema() {
  schemaPromise ??= pool.query(`
    CREATE TABLE IF NOT EXISTS student_first_submissions (
      student_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer JSONB NOT NULL,
      feedback JSONB NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (student_id, scope, question_id)
    );
  `).then(() => undefined).catch(error => { schemaPromise = null; throw error; });
  return schemaPromise;
}

function validateIdentity(studentId: string, scope: string, id?: string) {
  if (!/^[a-z0-9_-]{1,64}$/i.test(studentId) || !/^[a-z0-9][a-z0-9:_-]{0,127}$/i.test(scope) || (id !== undefined && (!id || id.length > 256 || /[\u0000-\u001f]/u.test(id)))) throw new Error("无效的答题记录标识");
}
function record<A, F>(row: { answer: A; feedback: F; submitted_at: Date | string }): FirstSubmission<A, F> {
  return { answer: row.answer, feedback: row.feedback, submittedAt: new Date(row.submitted_at).toISOString() };
}
export async function firstSubmission<A = unknown, F = unknown>(studentId: string, scope: string, id: string): Promise<FirstSubmission<A, F> | null> {
  validateIdentity(studentId, scope, id);
  await ensureFirstSubmissionSchema();
  const result = await pool.query("SELECT answer, feedback, submitted_at FROM student_first_submissions WHERE student_id=$1 AND scope=$2 AND question_id=$3", [studentId, scope, id]);
  return result.rows[0] ? record<A, F>(result.rows[0]) : null;
}
export async function firstSubmissions<A = unknown, F = unknown>(studentId: string, scope: string, client?: PoolClient): Promise<Record<string, FirstSubmission<A, F>>> {
  validateIdentity(studentId, scope);
  await ensureFirstSubmissionSchema();
  const result = await (client ?? pool).query("SELECT question_id, answer, feedback, submitted_at FROM student_first_submissions WHERE student_id=$1 AND scope=$2 ORDER BY submitted_at, question_id", [studentId, scope]);
  return Object.fromEntries(result.rows.map(row => [row.question_id, record<A, F>(row)]));
}

/** Shared serialization for draft/submit paths using the same canonical key.
 * The callback must use this client, not start a nested transaction/lock. */
export async function withFirstSubmissionLock<T>(studentId: string, scope: string, id: string, callback: (client: PoolClient, prior: FirstSubmission | null) => Promise<T>): Promise<T> {
  validateIdentity(studentId, scope, id);
  await ensureFirstSubmissionSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify([studentId, scope, id])]);
    const rows = await client.query("SELECT answer, feedback, submitted_at FROM student_first_submissions WHERE student_id=$1 AND scope=$2 AND question_id=$3", [studentId, scope, id]);
    const result = await callback(client, rows.rows[0] ? record(rows.rows[0]) : null);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

/** Only INSERTs. A stable student/module/question key survives attempts,
 * devices, refreshes and concurrent requests. The caller grades on the server;
 * neither later answers nor later grading can change an existing record. */
export async function saveFirstSubmission<A, F>(
  studentId: string,
  scope: string,
  id: string,
  answer: A,
  grade: (answer: A, client: PoolClient) => F | Promise<F>,
  legacy?: { answer: A; feedback: F; submittedAt?: string },
): Promise<SavedFirstSubmission<A, F>> {
  validateIdentity(studentId, scope, id);
  const answerJson = JSON.stringify(answer);
  if (answerJson === undefined || Buffer.byteLength(answerJson, "utf8") > 256 * 1024) throw new Error("答题内容过大或无效");
  await ensureFirstSubmissionSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify([studentId, scope, id])]);
    const prior = await client.query("SELECT answer, feedback, submitted_at FROM student_first_submissions WHERE student_id=$1 AND scope=$2 AND question_id=$3", [studentId, scope, id]);
    if (prior.rows[0]) {
      await client.query("COMMIT");
      return { ...record<A, F>(prior.rows[0]), replayed: true };
    }
    const savedAnswer = legacy ? legacy.answer : answer;
    const feedback = legacy ? legacy.feedback : await grade(savedAnswer, client);
    const savedJson = JSON.stringify(savedAnswer), feedbackJson = JSON.stringify(feedback);
    if (savedJson === undefined || feedbackJson === undefined || Buffer.byteLength(savedJson, "utf8") > 256 * 1024 || Buffer.byteLength(feedbackJson, "utf8") > 512 * 1024) throw new Error("答题反馈过大或无效");
    const date = legacy?.submittedAt && Number.isFinite(Date.parse(legacy.submittedAt)) ? legacy.submittedAt : new Date().toISOString();
    const result = await client.query("INSERT INTO student_first_submissions (student_id, scope, question_id, answer, feedback, submitted_at) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::timestamptz) RETURNING answer, feedback, submitted_at", [studentId, scope, id, savedJson, feedbackJson, date]);
    await client.query("COMMIT");
    return { ...record<A, F>(result.rows[0]), replayed: Boolean(legacy) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
