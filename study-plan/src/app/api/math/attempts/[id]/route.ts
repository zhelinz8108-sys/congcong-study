import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureMathQuestionBankSchema } from "@/lib/math-question-bank";
import { getLocalAttemptResult } from "@/lib/math-local-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  try {
    await ensureMathQuestionBankSchema();

    const attemptResult = await pool.query(
      `
        SELECT a.*, qs.title AS set_title, qs.category, qs.unit_label
        FROM math_attempts a
        JOIN math_question_sets qs ON qs.id = a.set_id
        WHERE a.id = $1
      `,
      [id]
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) {
      const local = await getLocalAttemptResult(id);
      if (local) return NextResponse.json(local);
      return NextResponse.json({ error: "练习记录不存在" }, { status: 404 });
    }

    const questionsResult = await pool.query(
      `
        SELECT
          q.*,
          r.response_text,
          r.self_rating,
          r.is_correct,
          r.grading_status,
          r.score AS response_score,
          r.max_score,
          r.feedback
        FROM math_questions q
        LEFT JOIN math_responses r ON r.question_id = q.id AND r.attempt_id = $1
        WHERE q.set_id = $2
        ORDER BY q.question_order ASC
      `,
      [id, attempt.set_id]
    );

    return NextResponse.json({
      attempt,
      questions: questionsResult.rows,
      storage: "database",
    });
  } catch {
    const local = await getLocalAttemptResult(id);
    if (local) return NextResponse.json(local);
    return NextResponse.json({ error: "练习记录不存在" }, { status: 404 });
  }
}
