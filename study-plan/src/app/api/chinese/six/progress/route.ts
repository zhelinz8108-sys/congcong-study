import { NextRequest, NextResponse } from "next/server";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken, STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { sixStudentProgress, sixSubmittedFeedback, type SixAction } from "@/server/chinese-six-progress";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  if (!verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value).allowed) return NextResponse.json({ error: "请先登录。" }, { status: 401, headers });
  const profile = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
  try {
    const result = await sixStudentProgress(profile.id);
    return NextResponse.json({ ...result, feedback: sixSubmittedFeedback(result.progress, request.nextUrl.searchParams.get("item") ?? undefined) }, { headers });
  } catch { return NextResponse.json({ error: "暂时无法读取学习记录，请稍后重试。" }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  if (!verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value).allowed) return NextResponse.json({ error: "请先登录。" }, { status: 401, headers });
  const expectedOrigin = process.env.NODE_ENV === "production" ? "https://congcong-study.cn" : request.nextUrl.origin;
  if ((request.headers.get("origin") && request.headers.get("origin") !== expectedOrigin) || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "请求来源不正确。" }, { status: 403, headers });
  const profile = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
  let body: SixAction;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 20000) throw new Error();
    body = JSON.parse(raw) as SixAction;
    if (!body || typeof body.itemId !== "string" || !["start", "answer", "rate", "review"].includes(body.action)) throw new Error();
    if (body.value !== undefined && typeof body.value !== "string") throw new Error();
  } catch { return NextResponse.json({ error: "请求格式有误。" }, { status: 400, headers }); }
  try {
    const result = await sixStudentProgress(profile.id, body);
    return NextResponse.json({ ...result, feedback: sixSubmittedFeedback(result.progress, body.itemId) }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败。";
    const expected = /本题|自评|答案|选项|请选择|没有找到|练习记录|无效操作|请先/.test(message);
    return NextResponse.json({ error: expected ? message : "暂时无法保存，请稍后重试。" }, { status: expected ? 409 : 503, headers });
  }
}
