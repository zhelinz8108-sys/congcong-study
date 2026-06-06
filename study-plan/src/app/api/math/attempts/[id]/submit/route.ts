import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { pool } from "@/lib/db";
import {
  ensureMathQuestionBankSchema,
  gradeMathResponse,
  type MathQuestionForGrading,
} from "@/lib/math-question-bank";
import { submitLocalAttempt } from "@/lib/math-local-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id: attemptId } = await params;

  try {
    await ensureMathQuestionBankSchema();

    const attemptResult = await pool.query("SELECT * FROM math_attempts WHERE id = $1", [
      attemptId,
    ]);
    const attempt = attemptResult.rows[0];
    if (!attempt) {
      const local = await submitLocalAttempt(attemptId);
      if ("attempt" in local) return NextResponse.json(local.attempt);
      return NextResponse.json({ error: local.error }, { status: local.status });
    }

    const questionsResult = await pool.query<MathQuestionForGrading>(
      `
        SELECT id, question_type, correct_answer, score, auto_grade
        FROM math_questions
        WHERE set_id = $1
        ORDER BY question_order ASC
      `,
      [attempt.set_id]
    );
    const responsesResult = await pool.query(
      "SELECT * FROM math_responses WHERE attempt_id = $1",
      [attemptId]
    );
    const responses = new Map(responsesResult.rows.map((row) => [row.question_id, row]));

    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;

    for (const question of questionsResult.rows) {
      const response = responses.get(question.id);
      const grade = gradeMathResponse(
        question,
        response?.response_text ?? "",
        response?.self_rating ?? null
      );
      totalScore += grade.score;
      maxScore += grade.maxScore;
      if (grade.isCorrect) correctCount += 1;

      await pool.query(
        `
          INSERT INTO math_responses (
            id, attempt_id, question_id, response_text, self_rating,
            is_correct, grading_status, score, max_score, feedback, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
          ON CONFLICT (attempt_id, question_id) DO UPDATE SET
            is_correct = EXCLUDED.is_correct,
            grading_status = EXCLUDED.grading_status,
            score = EXCLUDED.score,
            max_score = EXCLUDED.max_score,
            feedback = EXCLUDED.feedback,
            updated_at = NOW()
        `,
        [
          response?.id ?? uuid(),
          attemptId,
          question.id,
          response?.response_text ?? "",
          response?.self_rating ?? null,
          grade.isCorrect,
          grade.status,
          grade.score,
          grade.maxScore,
          grade.feedback,
        ]
      );
    }

    const updateResult = await pool.query(
      `
        UPDATE math_attempts
        SET
          submitted_at = NOW(),
          total_score = $2,
          max_score = $3,
          correct_count = $4,
          total_count = $5,
          status = 'submitted'
        WHERE id = $1
        RETURNING *
      `,
      [attemptId, totalScore, maxScore, correctCount, questionsResult.rowCount]
    );

    return NextResponse.json(updateResult.rows[0]);
  } catch {
    const local = await submitLocalAttempt(attemptId);
    if ("attempt" in local) return NextResponse.json(local.attempt);
    return NextResponse.json({ error: local.error }, { status: local.status });
  }
}
