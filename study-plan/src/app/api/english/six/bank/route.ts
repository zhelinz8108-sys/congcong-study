import { NextRequest, NextResponse } from "next/server";
import { englishSixBankIndex } from "@/server/english-six-bank";
import { holidayAccess, holidayHeaders } from "@/server/holiday-math-700/http";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const access = holidayAccess(request); if (access) return access;
  return NextResponse.json(englishSixBankIndex(), { headers: holidayHeaders });
}
