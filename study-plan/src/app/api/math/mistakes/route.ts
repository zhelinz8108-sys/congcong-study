import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureMathQuestionBankSchema, MATH_STUDENT_ID } from "@/lib/math-question-bank";
import { getLocalMistakes } from "@/lib/math-local-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureMathQuestionBankSchema();

    const result = await pool.query(
      `
        WITH latest AS (
          SELECT
            q.id AS question_id,
            q.question_number,
            q.question_type,
            q.prompt,
            q.options,
            q.correct_answer,
            q.explanation,
            q.review_status,
            q.auto_grade,
            qs.id AS set_id,
            qs.title AS set_title,
            qs.category,
            qs.unit_label,
            r.response_text,
            r.self_rating,
            r.is_correct,
            r.grading_status,
            r.score,
            r.max_score,
            r.feedback,
            a.id AS attempt_id,
            a.submitted_at,
            ROW_NUMBER() OVER (PARTITION BY q.id ORDER BY a.submitted_at DESC) AS row_number
          FROM math_responses r
          JOIN math_attempts a ON a.id = r.attempt_id
          JOIN math_questions q ON q.id = r.question_id
          JOIN math_question_sets qs ON qs.id = q.set_id
          WHERE a.student_id = $1 AND a.status = 'submitted'
        )
        SELECT *
        FROM latest
        WHERE row_number = 1 AND is_correct = false
        ORDER BY submitted_at DESC
        LIMIT 200
      `,
      [MATH_STUDENT_ID]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(await getLocalMistakes());
    }

    return NextResponse.json({ mistakes: result.rows, storage: "database" });
  } catch {
    return NextResponse.json(await getLocalMistakes());
  }
}
