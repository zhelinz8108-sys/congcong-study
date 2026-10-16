import { NextRequest, NextResponse } from "next/server";
import { holidayAccess, holidayHeaders } from "@/server/holiday-math-700/http";
import { bankProfile } from "@/server/grade6-bank/http";
import { holidayFirstProgress } from "@/server/math-first-attempts";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const access = holidayAccess(request); if (access) return access;
  try { return NextResponse.json(await holidayFirstProgress(bankProfile(request).id, request.nextUrl.searchParams.get("subject_id") ?? ""), { headers: holidayHeaders }); }
  catch { return NextResponse.json({ error: "学习记录暂不可用" }, { status: 503, headers: holidayHeaders }); }
}
