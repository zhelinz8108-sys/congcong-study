import { NextRequest, NextResponse } from "next/server";
import { holidayHint } from "@/server/holiday-math-700/service";
import { holidayQuestion } from "@/server/holiday-math-700/public-bank";
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
      typeof body.question_id !== "string" ||
      !holidayQuestion(body.question_id)
    )
      return NextResponse.json(
        { error: "题目不存在" },
        { status: 404, headers: holidayHeaders },
      );
    if (body.level !== 1 && body.level !== 2)
      return NextResponse.json(
        { error: "提示等级不正确" },
        { status: 400, headers: holidayHeaders },
      );
    return NextResponse.json(holidayHint(body.question_id, body.level), {
      headers: holidayHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: "暂时无法获取提示，请稍后重试" },
      { status: 503, headers: holidayHeaders },
    );
  }
}
