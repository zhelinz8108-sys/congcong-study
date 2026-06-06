import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { pool } from "@/lib/db";
import { ensureMathQuestionBankSchema } from "@/lib/math-question-bank";
import { saveLocalResponse } from "@/lib/math-local-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseSelfRating(value: unknown) {
  return value === "correct" || value === "partial" || value === "incorrect"
    ? value
    : null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: attemptId } = await params;
  const body = await request.json();
  const questionId = String(body.question_id ?? "");
  const responseText = String(body.response_text ?? "");
  const selfRating = parseSelfRating(body.self_rating);

  if (!questionId) return NextResponse.json({ error: "缺少题目ID" }, { status: 400 });

  try {
    await ensureMathQuestionBankSchema();

    const attemptResult = await pool.query("SELECT status FROM math_attempts WHERE id = $1", [
      attemptId,
    ]);
    if (attemptResult.rowCount === 0) {
      const local = await saveLocalResponse(attemptId, questionId, responseText, selfRating);
      if ("response" in local) return NextResponse.json(local.response);
      return NextResponse.json({ error: local.error }, { status: local.status });
    }
    if (attemptResult.rows[0].status === "submitted") {
      return NextResponse.json({ error: "已提交的练习不能修改" }, { status: 409 });
    }

    const result = await pool.query(
      `
        INSERT INTO math_responses (
          id, attempt_id, question_id, response_text, self_rating, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (attempt_id, question_id) DO UPDATE SET
          response_text = EXCLUDED.response_text,
          self_rating = EXCLUDED.self_rating,
          updated_at = NOW()
        RETURNING *
      `,
      [uuid(), attemptId, questionId, responseText, selfRating]
    );

    return NextResponse.json(result.rows[0]);
  } catch {
    const local = await saveLocalResponse(attemptId, questionId, responseText, selfRating);
    if ("response" in local) return NextResponse.json(local.response);
    return NextResponse.json({ error: local.error }, { status: local.status });
  }
}
