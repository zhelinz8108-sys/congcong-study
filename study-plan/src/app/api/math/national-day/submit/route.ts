import { NextRequest, NextResponse } from "next/server";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken } from "@/lib/family-access";
import { hasNationalDayMathQuestion, submitNationalDayMath } from "@/lib/national-day-math-submission";

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
    return NextResponse.json(submitNationalDayMath(body.questionId, body.answers), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "请填写所有小问后再提交" }, { status: 400, headers });
  }
}
