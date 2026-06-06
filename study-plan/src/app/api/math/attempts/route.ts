import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { pool } from "@/lib/db";
import {
  ensureMathQuestionBankSchema,
  MATH_STUDENT_ID,
  MATH_STUDENT_NAME,
} from "@/lib/math-question-bank";
import { createLocalAttempt } from "@/lib/math-local-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const setId = String(body.set_id ?? "");
  if (!setId) return NextResponse.json({ error: "缺少题集ID" }, { status: 400 });

  try {
    await ensureMathQuestionBankSchema();

    const setResult = await pool.query("SELECT id FROM math_question_sets WHERE id = $1", [setId]);
    if (setResult.rowCount === 0) {
      const localAttempt = await createLocalAttempt(setId);
      if (localAttempt) return NextResponse.json(localAttempt, { status: 201 });
      return NextResponse.json({ error: "题集不存在" }, { status: 404 });
    }

    const id = uuid();
    const result = await pool.query(
      `
        INSERT INTO math_attempts (id, set_id, student_id, student_name)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [id, setId, MATH_STUDENT_ID, MATH_STUDENT_NAME]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch {
    const localAttempt = await createLocalAttempt(setId);
    if (localAttempt) return NextResponse.json(localAttempt, { status: 201 });
    return NextResponse.json({ error: "题集不存在" }, { status: 404 });
  }
}
