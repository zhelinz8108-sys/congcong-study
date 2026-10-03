import { NextRequest, NextResponse } from "next/server";
import { holidayQuestion } from "@/server/holiday-math-700/public-bank";
import { checkHolidayAnswer } from "@/server/holiday-math-700/service";
import {
  holidayAccess,
  holidayBody,
  holidayHeaders,
} from "@/server/holiday-math-700/http";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const access = holidayAccess(request, true);
  if (access) return access;
  try {
    const body = await holidayBody(request);
    if (
      Object.keys(body).some(
        (k) => !["question_id", "student_answer"].includes(k),
      )
    )
      throw new Error("只接收题目ID和学生回答");
    if (
      typeof body.question_id !== "string" ||
      !holidayQuestion(body.question_id)
    )
      return NextResponse.json(
        { error: "题目不存在" },
        { status: 404, headers: holidayHeaders },
      );
    return NextResponse.json(
      checkHolidayAnswer(body.question_id, body.student_answer),
      { headers: holidayHeaders },
    );
  } catch (error) {
    // Never echo input, private data, decrypted content or crypto diagnostics.
    const message = error instanceof Error ? error.message : "";
    const safe = /^(?:请|提交|只接收|单项|多空|多选|排序|题目没有)/.test(
      message,
    );
    return NextResponse.json(
      { error: safe ? message : "判题服务暂不可用，请稍后重试" },
      { status: safe ? 400 : 503, headers: holidayHeaders },
    );
  }
}
