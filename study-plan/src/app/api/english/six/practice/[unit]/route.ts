import { NextRequest, NextResponse } from "next/server";
import { englishSixPublicPaper } from "@/server/english-six";
import { englishLockedSubmit } from "@/server/english-locked";
import { holidayAccess } from "@/server/holiday-math-700/http";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
export async function GET(_request: Request, context: { params: Promise<{ unit: string }> }) {
  const { unit } = await context.params;
  const paper = englishSixPublicPaper(Number(unit));
  return paper ? NextResponse.json(paper, { headers: { "Cache-Control": "private, no-store" } }) : new NextResponse("Not found", { status: 404 });
}
export async function POST(request: NextRequest, context: { params: Promise<{ unit: string }> }) {
  const access = holidayAccess(request, true); if (access) return access;
  const { unit } = await context.params;
  if (Number(request.headers.get("content-length")) > 16000) return new NextResponse("Too large", { status: 413 });
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 16000) return new NextResponse("Too large", { status: 413 });
    const body = JSON.parse(text) as { id?: unknown; response?: unknown; subject_id?: unknown };
    if (typeof body.id !== "string" || typeof body.response !== "string") throw new Error("Invalid answer");
    if (!englishSixPublicPaper(Number(unit))?.questions.some(question => question.id === body.id)) throw new Error("Invalid question");
    const student = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value).id;
    const subject = typeof body.subject_id === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(body.subject_id) ? body.subject_id : "8bd6f79b-99f5-4e68-a961-872d60d260b1";
    const saved = await englishLockedSubmit(student, "six", subject, body.id, body.response);
    const feedback = { id: saved.id, response: saved.response, ...saved.feedback };
    return NextResponse.json(feedback, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "无效的答题内容" }, { status: 400 }); }
}
