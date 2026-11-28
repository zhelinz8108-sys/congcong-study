import { NextRequest, NextResponse } from "next/server";
import { parseStudentProfileCookie, STUDENT_PROFILE_COOKIE } from "@/lib/family-access";
import { finalExamNumber } from "@/lib/math-final-exams";
import { holidayAccess, holidayHeaders } from "@/server/holiday-math-700/http";
import { ExamRevisionConflict, getExamPaper, saveExam } from "@/server/math-final-exams";
import { cleanExamValues, ExamInputError } from "@/server/math-final-grading";

export const runtime = "nodejs";
type Context = { params: Promise<{ paper: string }> };
async function write(request: NextRequest, context: Context) {
  const denied = holidayAccess(request, true);
  if (denied) return denied;
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: holidayHeaders });
  const number = finalExamNumber((await context.params).paper);
  if (!number) return respond({ error: "试卷不存在。" }, 404);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 128 * 1024) return respond({ error: "作答内容过长。" }, 413);
    const body = JSON.parse(raw);
    if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= 2147483647) throw new ExamInputError("作答版本无效，请刷新试卷。");
    const paper = await getExamPaper(number), submit = request.method === "POST";
    const values = cleanExamValues(paper.questions, body.values, submit);
    const student = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value).id;
    return respond(await saveExam(student, number, paper, values, body.revision, submit));
  } catch (error) {
    if (error instanceof ExamRevisionConflict) return respond({ error: error.message, state: error.state }, 409);
    if (error instanceof SyntaxError || error instanceof ExamInputError) return respond({ error: error instanceof ExamInputError ? error.message : "作答格式无效。" }, 400);
    console.error("Final exam save failed", error instanceof Error ? error.name : "Unknown");
    return respond({ error: "暂时无法保存，请稍后重试。" }, 503);
  }
}
export { write as POST, write as PUT };
