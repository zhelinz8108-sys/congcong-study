import { NextRequest, NextResponse } from "next/server";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken, STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { readingStudentResults, submitReadingResponse } from "@/server/chinese-reading-progress";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  if (!verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value).allowed) return NextResponse.json({ error: "请先登录。" }, { status: 401, headers });
  const student = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
  try { return NextResponse.json(await readingStudentResults(student.id, request.nextUrl.searchParams.get("passage") ?? undefined), { headers }); }
  catch { return NextResponse.json({ error: "暂时无法读取答题记录。" }, { status: 503, headers }); }
}

export async function POST(request: NextRequest) {
  if (!verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value).allowed) return NextResponse.json({ error: "请先登录。" }, { status: 401, headers });
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.NODE_ENV === "production" ? "https://congcong-study.cn" : request.nextUrl.origin;
  if ((origin && origin !== expectedOrigin) || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "请求来源不正确。" }, { status: 403, headers });
  const student = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
  let body: { passageId: string; questionId: string; value: string };
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 30000) throw new Error();
    body = JSON.parse(text);
    if (!body || typeof body.passageId !== "string" || typeof body.questionId !== "string" || typeof body.value !== "string") throw new Error();
  } catch { return NextResponse.json({ error: "请求格式有误。" }, { status: 400, headers }); }
  try { return NextResponse.json(await submitReadingResponse(student.id, body.passageId, body.questionId, body.value), { headers }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const expected = /没有找到|请选择|请填写|本题|已提交|锁定/.test(message);
    return NextResponse.json({ error: expected ? message : "暂时无法提交答案。" }, { status: expected ? 409 : 503, headers });
  }
}
