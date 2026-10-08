import { NextRequest, NextResponse } from "next/server";
import { EnglishPracticeInputError, gradeEnglishPracticeSubmission } from "@/server/national-day-english-practice/service";
import { holidayAccess, holidayBody, holidayHeaders } from "@/server/holiday-math-700/http";

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
    return NextResponse.json(gradeEnglishPracticeSubmission(body), { headers: holidayHeaders });
  } catch (error) {
    // Only known validation failures are exposed; never echo input or decryption diagnostics.
    return NextResponse.json(
      { error: error instanceof EnglishPracticeInputError ? error.message : "判题服务暂不可用，请稍后重试" },
      { status: error instanceof EnglishPracticeInputError ? error.status : 503, headers: holidayHeaders },
    );
  }
}
