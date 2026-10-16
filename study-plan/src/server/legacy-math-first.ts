import "server-only";
import { pool } from "@/lib/db";
import { ensureMathQuestionBankSchema, gradeMathResponse, type GradeResult, type MathQuestionForGrading } from "@/lib/math-question-bank";
import { firstSubmissions, withFirstSubmissionLock } from "@/server/first-submission";
import { v4 as uuid } from "uuid";
import type { PoolClient } from "pg";

const SCOPE = "math:legacy-bank:v1";
type Question = MathQuestionForGrading & Record<string, unknown> & { explanation: string };
type Feedback = GradeResult & { answer: unknown; explanation: string };
type OldResponse = { response_text: string; is_correct: boolean; grading_status: GradeResult["status"]; score: number; max_score: number; feedback: string; submitted_at: string };
const feedbackOf = (question: Question, old?: OldResponse, text = ""): Feedback => ({
  ...(old ? { isCorrect: old.is_correct, status: old.grading_status, score: Number(old.score), maxScore: Number(old.max_score), feedback: old.feedback } : gradeMathResponse(question, text, null)),
  answer: question.correct_answer, explanation: question.explanation,
});

export async function legacyMathQuestions(studentId: string, setId: string, client?: PoolClient) {
  await ensureMathQuestionBankSchema();
  const [questions, saved, history] = await Promise.all([
    (client ?? pool).query<Question>("SELECT * FROM math_questions WHERE set_id=$1 ORDER BY question_order", [setId]),
    firstSubmissions<string, Feedback>(studentId, SCOPE, client),
    (client ?? pool).query<OldResponse & { question_id: string }>(`SELECT DISTINCT ON (r.question_id) r.*, a.submitted_at
      FROM math_responses r JOIN math_attempts a ON a.id=r.attempt_id
      WHERE a.student_id=$1 AND a.set_id=$2 AND a.status='submitted'
      ORDER BY r.question_id, a.submitted_at, r.created_at`, [studentId, setId]),
  ]);
  const old = new Map(history.rows.map(row => [row.question_id, row]));
  return questions.rows.map(question => {
    const record = saved[question.id], previous = old.get(question.id);
    const feedback = record?.feedback ?? (previous ? feedbackOf(question, previous) : null);
    return {
      id: question.id, set_id: setId, question_number: question.question_number,
      question_order: question.question_order, question_type: question.question_type,
      prompt: question.prompt, options: question.options, score: question.score,
      review_status: question.review_status, auto_grade: question.auto_grade,
      locked: Boolean(record || previous), response_text: record?.answer ?? previous?.response_text ?? null,
      self_rating: null, is_correct: feedback?.isCorrect ?? null,
      grading_status: feedback?.status ?? null, response_score: feedback?.score ?? null,
      max_score: feedback?.maxScore ?? null, feedback: feedback?.feedback ?? null,
      ...(feedback ? { correct_answer: feedback.answer, explanation: feedback.explanation } : {}),
    };
  });
}

export async function submitLegacyMathQuestion(studentId: string, attemptId: string, questionId: string, response: string) {
  await ensureMathQuestionBankSchema();
  return withFirstSubmissionLock(studentId, SCOPE, questionId, async (client, prior) => {
    const attempts = await client.query("SELECT * FROM math_attempts WHERE id=$1 AND student_id=$2 FOR UPDATE", [attemptId, studentId]);
    const attempt = attempts.rows[0];
    if (!attempt) throw new Error("练习记录不存在");
    const questions = await client.query<Question>("SELECT * FROM math_questions WHERE id=$1 AND set_id=$2", [questionId, attempt.set_id]);
    const question = questions.rows[0];
    if (!question) throw new Error("题目不属于本练习");
    if (prior) return { question_id: questionId, response_text: prior.answer, feedback: prior.feedback, locked: true };
    const history = await client.query<OldResponse>(`SELECT r.*, a.submitted_at FROM math_responses r JOIN math_attempts a ON a.id=r.attempt_id
      WHERE r.question_id=$1 AND a.student_id=$2 AND a.status='submitted' ORDER BY a.submitted_at, r.created_at LIMIT 1`, [questionId, studentId]);
    const old = history.rows[0];
    if (!old && attempt.status === "submitted") throw new Error("已提交的练习不能修改");
    if (!old && !response.trim()) throw new Error("请先填写答案");
    const answer = old ? old.response_text : response, feedback = feedbackOf(question, old, answer);
    await client.query(`INSERT INTO student_first_submissions (student_id,scope,question_id,answer,feedback,submitted_at)
      VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::timestamptz)`, [studentId, SCOPE, questionId, JSON.stringify(answer), JSON.stringify(feedback), old?.submitted_at ?? new Date().toISOString()]);
    if (!old) await client.query(`INSERT INTO math_responses (id,attempt_id,question_id,response_text,self_rating,is_correct,grading_status,score,max_score,feedback,updated_at)
      VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,NOW()) ON CONFLICT (attempt_id,question_id) DO UPDATE SET
      response_text=EXCLUDED.response_text,self_rating=NULL,is_correct=EXCLUDED.is_correct,grading_status=EXCLUDED.grading_status,
      score=EXCLUDED.score,max_score=EXCLUDED.max_score,feedback=EXCLUDED.feedback,updated_at=NOW()`,
      [uuid(), attemptId, questionId, answer, feedback.isCorrect, feedback.status, feedback.score, feedback.maxScore, feedback.feedback]);
    return { question_id: questionId, response_text: answer, feedback, locked: true };
  });
}
