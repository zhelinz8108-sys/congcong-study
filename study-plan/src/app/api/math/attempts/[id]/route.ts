import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureMathQuestionBankSchema } from "@/lib/math-question-bank";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { legacyMathQuestions } from "@/server/legacy-math-first";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
  try {
    await ensureMathQuestionBankSchema();
    const result = await pool.query(`SELECT a.*,qs.title AS set_title,qs.category,qs.unit_label FROM math_attempts a JOIN math_question_sets qs ON qs.id=a.set_id WHERE a.id=$1 AND a.student_id=$2`, [id, profile.id]);
    const attempt = result.rows[0];
    if (!attempt) return NextResponse.json({ error: "练习记录不存在" }, { status: 404 });
    return NextResponse.json({ attempt, questions: await legacyMathQuestions(profile.id, attempt.set_id), storage: "database" });
  } catch { return NextResponse.json({ error: "无法读取答题记录" }, { status: 503 }); }
}
