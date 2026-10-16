import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureMathQuestionBankSchema } from "@/lib/math-question-bank";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { legacyMathQuestions } from "@/server/legacy-math-first";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  const student = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
  try {
    await ensureMathQuestionBankSchema();

    const sets = await pool.query<{ id: string; title: string; category: string; unit_label: string }>("SELECT id,title,category,unit_label FROM math_question_sets ORDER BY id");
    const mistakes = [];
    for (const set of sets.rows) {
      for (const question of await legacyMathQuestions(student.id, set.id)) {
        if (!question.locked || question.is_correct !== false || question.grading_status === "self_review") continue;
        mistakes.push({ ...question, question_id: question.id, set_title: set.title, category: set.category, unit_label: set.unit_label, score: question.response_score });
      }
    }
    return NextResponse.json({ mistakes: mistakes.slice(0, 200), storage: "database" }, { headers });
  } catch {
    return NextResponse.json({ error: "暂时无法读取首次作答错题记录" }, { status: 503, headers });
  }
}
