import { NextRequest, NextResponse } from "next/server";
import { englishSixBankPublicPaper } from "@/server/english-six-bank";
import { holidayAccess, holidayHeaders } from "@/server/holiday-math-700/http";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ paper: string }> }) {
  const access = holidayAccess(request); if (access) return access;
  const { paper } = await context.params;
  const result = englishSixBankPublicPaper(paper);
  return result ? NextResponse.json(result, { headers: holidayHeaders }) : new NextResponse("Not found", { status: 404, headers: holidayHeaders });
}
