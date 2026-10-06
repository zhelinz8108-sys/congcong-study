import { NextRequest, NextResponse } from "next/server";
import { listEnglishPracticeBlocks } from "@/server/national-day-english-practice/public-bank";
import { holidayAccess, holidayHeaders } from "@/server/holiday-math-700/http";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const access = holidayAccess(request);
  if (access) return access;
  const params = request.nextUrl.searchParams;
  if ([...params.keys()].some((key) => !["chapter", "page"].includes(key)) ||
      params.getAll("chapter").length !== 1 || params.getAll("page").length > 1)
    return NextResponse.json({ error: "请求参数不正确" }, { status: 400, headers: holidayHeaders });
  const chapter = params.get("chapter") ?? "";
  const page = params.get("page") ?? "1";
  if (!/^CH(?:0[1-9]|1\d|2[0-4])$/.test(chapter))
    return NextResponse.json({ error: "章节不存在" }, { status: 404, headers: holidayHeaders });
  if (!/^[1-9]\d{0,3}$/.test(page))
    return NextResponse.json({ error: "页码不正确" }, { status: 400, headers: holidayHeaders });
  try {
    return NextResponse.json(listEnglishPracticeBlocks({ chapter, page: Number(page) }), { headers: holidayHeaders });
  } catch {
    return NextResponse.json({ error: "题库暂不可用，请稍后重试" }, { status: 503, headers: holidayHeaders });
  }
}
