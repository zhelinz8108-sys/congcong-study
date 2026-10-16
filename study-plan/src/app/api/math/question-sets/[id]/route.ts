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
    const result = await pool.query("SELECT * FROM math_question_sets WHERE id=$1", [id]);
    if (!result.rows[0]) return NextResponse.json({ error: "题集不存在" }, { status: 404 });
    const set = { ...result.rows[0] };
    delete set.source_root;
    delete set.source_dir;
    delete set.answer_files;
    return NextResponse.json({ set, questions: await legacyMathQuestions(profile.id, id), storage: "database" });
  } catch { return NextResponse.json({ error: "题库暂时无法读取" }, { status: 503 }); }
}
