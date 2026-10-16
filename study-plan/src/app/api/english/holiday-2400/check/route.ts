import { NextRequest, NextResponse } from "next/server";
import { EnglishPracticeInputError, gradeEnglishPracticeSubmission } from "@/server/national-day-english-practice/service";
import { holidayAccess, holidayBody, holidayHeaders } from "@/server/holiday-math-700/http";
import { englishLockedSubmit } from "@/server/english-locked";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const access = holidayAccess(request, true);
  if (access) return access;
  try {
    let body: Record<string, unknown>;
    try {
      body = await holidayBody(request);
    } catch {
      throw new EnglishPracticeInputError("提交格式不正确或内容过大");
    }
    const subject = typeof body.subject_id === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(body.subject_id) ? body.subject_id : "8bd6f79b-99f5-4e68-a961-872d60d260b1";
    const { subject_id: _subject, ...gradingBody } = body;
    void _subject;
    const graded = gradeEnglishPracticeSubmission(gradingBody);
    const student = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value).id;
    const results = [];
    for (const result of graded.results) {
      const record = await englishLockedSubmit(student, "holiday2400", subject, result.questionId, result.selected);
      // Return the first stored selection, never the new one supplied after viewing feedback.
      const correctOption = record.feedback.answer.slice(0, 1);
      results.push({ questionId: result.questionId, selected: record.response, correct: record.feedback.correct, correctOption, correctText: record.feedback.answer.slice(3), explanation: record.feedback.explanation });
    }
    return NextResponse.json({ ...graded, results, score: results.filter(result => result.correct).length }, { headers: holidayHeaders });
  } catch (error) {
    // Only known validation failures are exposed; never echo input or decryption diagnostics.
    return NextResponse.json(
      { error: error instanceof EnglishPracticeInputError ? error.message : "判题服务暂不可用，请稍后重试" },
      { status: error instanceof EnglishPracticeInputError ? error.status : 503, headers: holidayHeaders },
    );
  }
}
