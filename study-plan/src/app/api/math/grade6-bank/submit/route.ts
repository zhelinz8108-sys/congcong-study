import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankBody, bankFailure, bankHeaders, bankProfile, bankSubject, bankStudentAnswers } from "@/server/grade6-bank/http";
import { getBankQuestion, getPrivateBankAnswer, readBankImage } from "@/server/grade6-bank/bank";
import { bankBaseRevision, BankRevisionConflict, saveBankResponse } from "@/server/grade6-bank/progress";
import { gradeBankAnswer } from "@/lib/grade6-bank-grader";
import type { BankFeedback } from "@/lib/grade6-bank-types";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const denied = bankAccess(request, true); if (denied) return denied;
  try {
    const body = await bankBody(request);
    if (Object.keys(body).some((key) => !["subject_id", "question_id", "answers", "base_revision"].includes(key))) throw new Error("提交字段不正确");
    const baseRevision = bankBaseRevision(body.base_revision);
    const subject = bankSubject(body.subject_id), q = typeof body.question_id === "string" ? await getBankQuestion(body.question_id) : undefined;
    if (!q) return NextResponse.json({ error: "题目不存在" }, { status: 404, headers: bankHeaders });
    const answer = await getPrivateBankAnswer(q.id);
    if (!answer) throw new Error("Missing private answer record");
    const studentAnswers = bankStudentAnswers(body.answers, q, true), graded = gradeBankAnswer(answer, studentAnswers);
    const feedback: BankFeedback = { questionId: q.id, ...graded, answerText: graded.outcome === "missing" ? "" : answer.answerText, answerImages: [] };
    // Prepare feedback after validating the complete submission, before saving:
    // a missing asset must not leave a committed grade behind a failed response.
    // Nothing private is returned unless the atomic revision-qualified save succeeds.
    const images = graded.outcome === "missing" ? [] : await Promise.all(answer.answerImages.map(async (relative) => {
      const image = await readBankImage(relative, "private");
      return `data:${image.mime};base64,${image.bytes.toString("base64")}`;
    }));
    const response = await saveBankResponse(bankProfile(request).id, subject, q.id, studentAnswers, baseRevision, feedback);
    return NextResponse.json({ feedback: { ...feedback, answerImages: images }, response }, { headers: bankHeaders });
  } catch (error) {
    if (error instanceof BankRevisionConflict) return NextResponse.json({ error: error.message, response: error.response }, { status: 409, headers: bankHeaders });
    return bankFailure(error);
  }
}
