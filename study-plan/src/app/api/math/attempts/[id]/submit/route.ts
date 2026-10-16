import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { legacyMathQuestions } from "@/server/legacy-math-first";
import { unsafeSubmissionOrigin } from "@/server/submission-request";
import { ensureFirstSubmissionSchema } from "@/server/first-submission";
import { ensureMathQuestionBankSchema } from "@/lib/math-question-bank";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (unsafeSubmissionOrigin(request)) return NextResponse.json({ error: "请求来源不正确" }, { status: 403 });
  const { id } = await params;
  const profile = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
  await Promise.all([ensureFirstSubmissionSchema(), ensureMathQuestionBankSchema()]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM math_attempts WHERE id=$1 AND student_id=$2 FOR UPDATE", [id, profile.id]);
    const attempt = result.rows[0];
    if (!attempt) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "练习记录不存在" }, { status: 404 });
    }
    if (attempt.status === "submitted") {
      await client.query("COMMIT");
      return NextResponse.json(attempt);
    }
    const questions = await legacyMathQuestions(profile.id, attempt.set_id, client);
    const graded = questions.filter(question => question.locked && question.grading_status !== "self_review");
    const saved = await client.query(`UPDATE math_attempts SET submitted_at=NOW(), status='submitted',total_score=$3,max_score=$4,correct_count=$5,total_count=$6
      WHERE id=$1 AND student_id=$2 AND status!='submitted' RETURNING *`, [id, profile.id,
      graded.reduce((sum, q) => sum + Number(q.response_score ?? 0), 0), graded.reduce((sum, q) => sum + Number(q.max_score ?? 0), 0), graded.filter(q => q.is_correct).length, graded.length]);
    await client.query("COMMIT");
    return NextResponse.json(saved.rows[0] ?? attempt);
  } catch {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "无法读取首次答题成绩，请稍后重试" }, { status: 503 });
  } finally { client.release(); }
}
