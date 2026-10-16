import { NextRequest, NextResponse } from "next/server";
import { holidayAccess, holidayHeaders } from "@/server/holiday-math-700/http";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { englishLockedModule, englishLockedRecords, englishLockedSubmit } from "@/server/english-locked";
import type { EnglishLockedAnswer } from "@/lib/english-locked-types";

export const dynamic = "force-dynamic";
function inputs(request: NextRequest) {
  const exerciseModule = request.nextUrl.searchParams.get("module"), subject = request.nextUrl.searchParams.get("subject");
  if (!englishLockedModule(exerciseModule) || !subject || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(subject)) return null;
  return { module: exerciseModule, subject, student: parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value).id };
}
export async function GET(request: NextRequest) {
  const access = holidayAccess(request); if (access) return access;
  const input = inputs(request); if (!input) return NextResponse.json({ error: "无效的练习类型" }, { status: 400, headers: holidayHeaders });
  try { return NextResponse.json({ records: await englishLockedRecords(input.student, input.module, input.subject) }, { headers: holidayHeaders }); }
  catch { return NextResponse.json({ error: "无法读取首次作答记录，请稍后重试" }, { status: 503, headers: holidayHeaders }); }
}
export async function POST(request: NextRequest) {
  const access = holidayAccess(request, true); if (access) return access;
  const input = inputs(request); if (!input) return NextResponse.json({ error: "无效的练习类型" }, { status: 400, headers: holidayHeaders });
  let body: { id: string; response: EnglishLockedAnswer };
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 100000) throw new Error();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.id !== "string" || !Object.hasOwn(parsed, "response") || Object.keys(parsed).some(key => !["id", "response"].includes(key))) throw new Error();
    body = parsed;
  } catch { return NextResponse.json({ error: "提交格式不正确或内容过大" }, { status: 400, headers: holidayHeaders }); }
  try { return NextResponse.json({ record: await englishLockedSubmit(input.student, input.module, input.subject, body.id, body.response) }, { headers: holidayHeaders }); }
  catch { return NextResponse.json({ error: "请检查答案并稍后重试；已提交的答案不能修改" }, { status: 400, headers: holidayHeaders }); }
}
