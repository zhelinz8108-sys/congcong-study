import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { pool } from "@/lib/db";
import { ensureMathQuestionBankSchema } from "@/lib/math-question-bank";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { unsafeSubmissionOrigin } from "@/server/submission-request";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (unsafeSubmissionOrigin(request)) return NextResponse.json({ error: "请求来源不正确" }, { status: 403 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 4096) return NextResponse.json({ error: "请求内容过大" }, { status: 413 });
  let body: { set_id?: unknown };
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const setId = body && typeof body === "object" && !Array.isArray(body) && typeof body.set_id === "string" ? body.set_id : "";
  const profile = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
  if (!setId || setId.length > 256) return NextResponse.json({ error: "无效的题集ID" }, { status: 400 });

  try {
    await ensureMathQuestionBankSchema();

    const setResult = await pool.query("SELECT id FROM math_question_sets WHERE id = $1", [setId]);
    if (setResult.rowCount === 0) {
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
    return NextResponse.json({ error: "无法建立云端练习，请稍后重试" }, { status: 503 });
  }
}
