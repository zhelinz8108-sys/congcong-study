import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankBody, bankFailure, bankHeaders, bankProfile, bankSubject, bankStudentAnswers } from "@/server/grade6-bank/http";
import { getBankQuestion } from "@/server/grade6-bank/bank";
import { bankBaseRevision, BankRevisionConflict, saveBankResponse } from "@/server/grade6-bank/progress";
export const dynamic = "force-dynamic";
export async function PUT(request: NextRequest) {
  const denied = bankAccess(request, true); if (denied) return denied;
  try {
    const body = await bankBody(request);
    if (Object.keys(body).some((key) => !["subject_id", "question_id", "answers", "base_revision"].includes(key))) throw new Error("提交字段不正确");
    const baseRevision = bankBaseRevision(body.base_revision);
    const subject = bankSubject(body.subject_id), q = typeof body.question_id === "string" ? await getBankQuestion(body.question_id) : undefined;
    if (!q) return NextResponse.json({ error: "题目不存在" }, { status: 404, headers: bankHeaders });
    const answers = bankStudentAnswers(body.answers, q, false);
    return NextResponse.json(await saveBankResponse(bankProfile(request).id, subject, q.id, answers, baseRevision), { headers: bankHeaders });
  } catch (error) {
    if (error instanceof BankRevisionConflict) return NextResponse.json({ error: error.message, response: error.response }, { status: 409, headers: bankHeaders });
    return bankFailure(error);
  }
}
