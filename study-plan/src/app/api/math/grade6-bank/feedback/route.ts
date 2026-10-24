import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankFailure, bankHeaders, bankProfile, bankSubject } from "@/server/grade6-bank/http";
import { bankResponse } from "@/server/grade6-bank/progress";
import { getArchivedBankQuestion } from "@/server/grade6-bank/bank";
import { savedBankFeedback } from "@/server/grade6-bank/feedback";
import { projectBankResult, bankResultStorageId, withBankPreviousWork } from "@/server/grade6-bank/result-grading";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = bankAccess(request); if (denied) return denied;
  try {
    const subject = bankSubject(request.nextUrl.searchParams.get("subject_id"));
    const id = request.nextUrl.searchParams.get("question_id") ?? "";
    const question = await getArchivedBankQuestion(id);
    if (!question) return NextResponse.json({ error: "题目不存在" }, { status: 404, headers: bankHeaders });
    const studentId = bankProfile(request).id;
    const response = await bankResponse(studentId, subject, bankResultStorageId(question));
    if (!response || !response.submitted && response.submissions < 1) return NextResponse.json({ error: "请先提交本题" }, { status: 403, headers: bankHeaders });
    const previous = question.resultAssessment === "closed-v1" ? await bankResponse(studentId, subject, id) : undefined;
    return NextResponse.json({ response: withBankPreviousWork(await projectBankResult(id, response), previous), feedback: await savedBankFeedback(id, response, studentId) }, { headers: bankHeaders });
  } catch (error) { return bankFailure(error); }
}
