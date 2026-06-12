import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { pool } from "@/lib/db";
import { ensureMathQuestionBankSchema } from "@/lib/math-question-bank";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { createLocalAttempt } from "@/lib/math-local-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const setId = String(body.set_id ?? "");
  const profile = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
  if (!setId) return NextResponse.json({ error: "缺少题集ID" }, { status: 400 });

  try {
    await ensureMathQuestionBankSchema();

    const setResult = await pool.query("SELECT id FROM math_question_sets WHERE id = $1", [setId]);
    if (setResult.rowCount === 0) {
      const localAttempt = await createLocalAttempt(setId, profile);
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
      [id, setId, profile.id, profile.name]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch {
    const localAttempt = await createLocalAttempt(setId, profile);
    if (localAttempt) return NextResponse.json(localAttempt, { status: 201 });
    return NextResponse.json({ error: "题集不存在" }, { status: 404 });
  }
}
