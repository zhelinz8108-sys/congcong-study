import { NextRequest, NextResponse } from "next/server";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { submitLegacyMathQuestion } from "@/server/legacy-math-first";
import { unsafeSubmissionOrigin } from "@/server/submission-request";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (unsafeSubmissionOrigin(request)) return NextResponse.json({ error: "请求来源不正确" }, { status: 403 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 256 * 1024) return NextResponse.json({ error: "答案过长" }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  if (typeof body?.question_id !== "string" || typeof body.response_text !== "string") return NextResponse.json({ error: "缺少题目或答案" }, { status: 400 });
  const { id } = await params;
  const profile = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
  try { return NextResponse.json(await submitLegacyMathQuestion(profile.id, id, body.question_id, body.response_text)); }
  catch (error) {
    const message = error instanceof Error && /^(练习记录不存在|题目不属于本练习|已提交的练习不能修改|请先填写答案)$/u.test(error.message) ? error.message : "保存失败，答案未提交，请稍后重试";
    return NextResponse.json({ error: message }, { status: message.startsWith("保存失败") ? 503 : 409 });
  }
}
