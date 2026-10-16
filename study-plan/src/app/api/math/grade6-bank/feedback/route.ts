import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankFailure, bankHeaders, bankProfile, bankSubject } from "@/server/grade6-bank/http";
import { bankResponse } from "@/server/grade6-bank/progress";
import { getArchivedBankQuestion } from "@/server/grade6-bank/bank";
import { savedBankFeedback } from "@/server/grade6-bank/feedback";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = bankAccess(request); if (denied) return denied;
  try {
    const subject = bankSubject(request.nextUrl.searchParams.get("subject_id"));
    const id = request.nextUrl.searchParams.get("question_id") ?? "";
    if (!await getArchivedBankQuestion(id)) return NextResponse.json({ error: "题目不存在" }, { status: 404, headers: bankHeaders });
    const response = await bankResponse(bankProfile(request).id, subject, id);
    if (!response || !response.submitted && response.submissions < 1) return NextResponse.json({ error: "请先提交本题" }, { status: 403, headers: bankHeaders });
    return NextResponse.json({ response, feedback: await savedBankFeedback(id, response, bankProfile(request).id) }, { headers: bankHeaders });
  } catch (error) { return bankFailure(error); }
}
