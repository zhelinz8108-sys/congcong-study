import "server-only";
import { brotliDecompressSync } from "node:zlib";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import assessmentAsset from "@/data/math-final-assessment.json";
import { finalExamNames, type ExamState, type ExamValues } from "@/lib/math-final-exams";
import { readReviewFile } from "./grade-six-reviews";
import { gradeExam, type ExamGrade, type ExamPaper } from "./math-final-grading";

let book: Promise<ExamPaper[]> | undefined;
export async function getExamPaper(number: number) {
  book ??= readReviewFile(assessmentAsset).then(bytes => {
    const papers: ExamPaper[] = JSON.parse(brotliDecompressSync(bytes, { maxOutputLength: 2_000_000 }).toString("utf8"));
    if (papers.length !== finalExamNames.length || papers.some(p => p.questions.length !== 50 || p.keys.length !== 50)) {
      throw new Error("Invalid final exam edition");
    }
    return papers;
  }).catch(error => { book = undefined; throw error; });
  return (await book)[number - 1];
}

type RecordRow = { paper: number; answers: ExamValues; revision: number; grade: ExamGrade | null; submitted_at: Date | null };
type SummaryRow = { paper: number; score: number | null };
function missingTable(error: unknown) { return (error as { code?: string })?.code === "42P01"; }
export async function examSummary(student: string): Promise<SummaryRow[]> {
  try {
    return (await pool.query<SummaryRow>("SELECT paper, (grade->>'score')::int AS score FROM math_final_papers WHERE student_id=$1 ORDER BY paper", [student])).rows;
  } catch (error) { if (missingTable(error)) return []; throw error; }
}
export function mayDownloadExam(id: string, rows: SummaryRow[]) {
  if (id === "math-final-pack" || id === "math-final-answers") return rows.filter(row => row.score !== null).length === finalExamNames.length;
  return rows.some(row => row.score !== null && id === `math-final-answers-${row.paper}`);
}
function stateFromRow(row: RecordRow | undefined, paper: ExamPaper): ExamState {
  if (!row) return { values: {}, revision: 0 };
  const state: ExamState = { values: row.answers, revision: row.revision };
  if (row.grade && row.submitted_at) {
    state.score = row.grade.score;
    state.submittedAt = row.submitted_at.toISOString();
    state.marks = paper.keys.map((key, n) => ({
      correct: row.grade!.correct[n], answer: key.answer, explanation: key.explanation,
      figure: key.figure, fieldAnswers: key.values,
    }));
  }
  return state;
}
const select = "SELECT paper, answers, revision, grade, submitted_at FROM math_final_papers WHERE student_id=$1 AND paper=$2";
export async function examState(student: string, number: number, paper: ExamPaper) {
  try {
    const record = await pool.query<RecordRow>(select, [student, number]);
    return stateFromRow(record.rows[0], paper);
  } catch (error) { if (missingTable(error)) return stateFromRow(undefined, paper); throw error; }
}
let ready: Promise<void> | undefined;
async function prepareTable() {
  // Only a write initializes storage. Read-only preflight and merely opening a paper never create a learner record.
  ready ??= (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('math-final-papers-schema',0))");
      await client.query(`CREATE TABLE IF NOT EXISTS math_final_papers (
        student_id text NOT NULL, paper smallint NOT NULL CHECK(paper BETWEEN 1 AND 10),
        answers jsonb NOT NULL, revision integer NOT NULL, grade jsonb, submitted_at timestamptz,
        PRIMARY KEY(student_id,paper), CHECK((grade IS NULL) = (submitted_at IS NULL)))`);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
export class ExamRevisionConflict extends Error {
  constructor(public state: ExamState) { super("这份卷子在其他页面有更新。"); }
}
async function recordFinishedPaper(client: PoolClient, student: string, number: number) {
  const created = await client.query(`INSERT INTO practice_rounds(student_id, activity, session_key, answered, due_at)
    VALUES($1,$2,$3,50,now()) RETURNING id`, [student, "数学期末模拟 · " + finalExamNames[number - 1], "math-final:" + number]);
  await client.query("UPDATE practice_rounds SET finished_at=now() WHERE id=$1", [created.rows[0].id]);
}
export async function saveExam(student: string, number: number, paper: ExamPaper, values: ExamValues, revision: number, submit: boolean) {
  await prepareTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`math-final:${student}:${number}`]);
    const prior = (await client.query<RecordRow>(select, [student, number])).rows[0];
    if (prior?.submitted_at) {
      await client.query("COMMIT");
      return stateFromRow(prior, paper);
    }
    if ((prior?.revision ?? 0) !== revision) throw new ExamRevisionConflict(stateFromRow(prior, paper));
    const grade = submit ? gradeExam(paper, values) : null;
    const saved = await client.query<RecordRow>(`INSERT INTO math_final_papers(student_id,paper,answers,revision,grade,submitted_at)
      VALUES($1,$2,$3,$4,$5,CASE WHEN $6::boolean THEN now() END)
      ON CONFLICT(student_id,paper) DO UPDATE SET answers=EXCLUDED.answers, revision=EXCLUDED.revision,
      grade=EXCLUDED.grade, submitted_at=EXCLUDED.submitted_at RETURNING *`,
      [student, number, JSON.stringify(values), revision + 1, grade ? JSON.stringify(grade) : null, submit]);
    if (submit) await recordFinishedPaper(client, student, number);
    await client.query("COMMIT");
    return stateFromRow(saved.rows[0], paper);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
