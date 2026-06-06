import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureMathQuestionBankSchema } from "@/lib/math-question-bank";
import { getLocalQuestionSet } from "@/lib/math-local-store";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const includeAnswers = new URL(request.url).searchParams.get("include_answers") === "1";

  try {
    await ensureMathQuestionBankSchema();

    const setResult = await pool.query("SELECT * FROM math_question_sets WHERE id = $1", [id]);
    const set = setResult.rows[0];
    if (!set) {
      const local = await getLocalQuestionSet(id, includeAnswers);
      if (local) return NextResponse.json(local);
      return NextResponse.json({ error: "题集不存在" }, { status: 404 });
    }

    const questionColumns = includeAnswers
      ? "*"
      : `
        id,
        set_id,
        question_number,
        question_order,
        question_type,
        prompt,
        options,
        score,
        source_anchor,
        source_excerpt,
        render_mode,
        review_status,
        auto_grade,
        created_at
      `;

    const questionsResult = await pool.query(
      `
        SELECT ${questionColumns}
        FROM math_questions
        WHERE set_id = $1
        ORDER BY question_order ASC
      `,
      [id]
    );

    return NextResponse.json({
      set,
      questions: questionsResult.rows,
      storage: "database",
    });
  } catch {
    const local = await getLocalQuestionSet(id, includeAnswers);
    if (local) return NextResponse.json(local);
    return NextResponse.json({ error: "题集不存在" }, { status: 404 });
  }
}
