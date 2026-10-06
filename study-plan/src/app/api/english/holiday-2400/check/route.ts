import { NextRequest, NextResponse } from "next/server";
import { EnglishPracticeInputError, gradeEnglishPracticeBlock } from "@/server/national-day-english-practice/service";
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
    if (Object.keys(body).length !== 2 || Object.keys(body).some((key) => !["block_id", "answers"].includes(key)))
      throw new EnglishPracticeInputError("只接收题目组编号和学生选项");
    if (typeof body.block_id !== "string" || !/^CH(?:0[1-9]|1\d|2[0-4])-B(?:00[1-9]|0[1-6]\d)$/.test(body.block_id))
      throw new EnglishPracticeInputError("题目不存在", 404);
    return NextResponse.json(gradeEnglishPracticeBlock(body.block_id, body.answers), { headers: holidayHeaders });
  } catch (error) {
    // Only known validation failures are exposed; never echo input or decryption diagnostics.
    return NextResponse.json(
      { error: error instanceof EnglishPracticeInputError ? error.message : "判题服务暂不可用，请稍后重试" },
      { status: error instanceof EnglishPracticeInputError ? error.status : 503, headers: holidayHeaders },
    );
  }
}
