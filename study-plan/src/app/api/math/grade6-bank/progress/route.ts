import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankFailure, bankHeaders, bankProfile, bankSubject } from "@/server/grade6-bank/http";
import { bankProgress } from "@/server/grade6-bank/progress";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = bankAccess(request); if (denied) return denied;
  try {
    const subject = bankSubject(request.nextUrl.searchParams.get("subject_id"));
    return NextResponse.json(await bankProgress(bankProfile(request).id, subject), { headers: bankHeaders });
  } catch (error) { return bankFailure(error); }
}
