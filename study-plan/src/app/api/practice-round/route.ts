import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankHeaders, bankProfile } from "@/server/grade6-bank/http";
import { isRoundId, updatePracticeRound } from "@/server/dot/rounds";

export async function POST(request: NextRequest) {
  const denied = bankAccess(request, true);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!isRoundId(body?.round) || !["finish", "active"].includes(body.action)) {
    return NextResponse.json({ error: "练习场次无效" }, { status: 400 });
  }
  await updatePracticeRound(bankProfile(request).id, body.round, body.action === "finish");
  return new Response(null, { status: 204, headers: bankHeaders });
}
