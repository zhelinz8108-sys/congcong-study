import { NextRequest, NextResponse } from "next/server";
import {
  HOLIDAY_CHAPTERS,
  listHolidayQuestions,
} from "@/server/holiday-math-700/public-bank";
import { holidayAccess, holidayHeaders } from "@/server/holiday-math-700/http";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const access = holidayAccess(request);
  if (access) return access;
  const query = request.nextUrl.searchParams;
  const page = Number(query.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1)
    return NextResponse.json(
      { error: "页码不正确" },
      { status: 400, headers: holidayHeaders },
    );
  const ids = query.has("ids")
    ? (query.get("ids") || "").split(",").filter(Boolean)
    : undefined;
  try {
    return NextResponse.json(
      {
        ...listHolidayQuestions({
          chapter: query.get("chapter") || undefined,
          difficulty: query.get("difficulty") || undefined,
          type: query.get("type") || undefined,
          id: query.get("id") || undefined,
          ids,
          page,
        }),
        chapters: HOLIDAY_CHAPTERS,
      },
      { headers: holidayHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "题目、章节或筛选条件不正确" },
      { status: 400, headers: holidayHeaders },
    );
  }
}
