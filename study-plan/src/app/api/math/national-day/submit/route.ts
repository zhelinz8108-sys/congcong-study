import { NextRequest, NextResponse } from "next/server";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken } from "@/lib/family-access";
import { hasNationalDayMathQuestion } from "@/lib/national-day-math-submission";
import { readNationalFeedback, submitNationalOnce } from "@/server/math-first-attempts";
import { bankProfile } from "@/server/grade6-bank/http";
import { holidayAccess } from "@/server/holiday-math-700/http";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 16 * 1024;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  const access = verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value);
  if (!access.allowed) return NextResponse.json({ error: "请先输入访问密码" }, { status: 401, headers });
  const origin = request.headers.get("origin");
  // Next's request URL can use the internal 127.0.0.1:3001 origin behind nginx.
  // Accept only this site's public HTTPS origin in production, not forwarded
  // headers supplied by the caller. The local preview stays same-origin.
  const expectedOrigin = process.env.NODE_ENV === "production"
    ? "https://congcong-study.cn"
    : new URL(`${new URL(request.url).protocol}//${request.headers.get("host") || new URL(request.url).host}`).origin;
  if (origin && origin !== expectedOrigin) {
    return NextResponse.json({ error: "请求来源不正确" }, { status: 403, headers });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ error: "提交内容过大" }, { status: 413, headers });
  let body: { questionId?: unknown; answers?: unknown };
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "提交格式不正确" }, { status: 400, headers }); }
  if (!body || typeof body.questionId !== "string" || !hasNationalDayMathQuestion(body.questionId)) {
    return NextResponse.json({ error: "这道自测题不存在" }, { status: 404, headers });
  }
  try {
    const saved = await submitNationalOnce(bankProfile(request).id, body.questionId, body.answers);
    return NextResponse.json({ ...saved.feedback, answers: saved.answer, locked: true }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = /^(请|答题字段|每个答案|这道自测)/.test(message);
    return NextResponse.json({ error: safe ? message : "判题服务暂不可用，请稍后重试" }, { status: safe ? 400 : 503, headers });
  }
}
export async function GET(request: NextRequest) {
  const denied = holidayAccess(request); if (denied) return denied;
  const id = request.nextUrl.searchParams.get("questionId") ?? "";
  if (!hasNationalDayMathQuestion(id)) return NextResponse.json({ error: "题目不存在" }, { status: 404, headers });
  try {
    const saved = await readNationalFeedback(bankProfile(request).id, id);
    if (!saved) return NextResponse.json({ error: "请先提交本题" }, { status: 403, headers });
    return NextResponse.json({ ...saved.feedback, answers: saved.answer, locked: true }, { headers });
  } catch { return NextResponse.json({ error: "学习记录暂不可用" }, { status: 503, headers }); }
}
