import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankBody, bankFailure, bankHeaders, bankInputSchema, bankProfile, bankSubject, bankStudentAnswers, bankRetired } from "@/server/grade6-bank/http";
import { getBankQuestion, getPrivateBankAnswer, readBankImage } from "@/server/grade6-bank/bank";
import { bankBaseRevision, BankRevisionConflict, saveBankResponse, bankResponse } from "@/server/grade6-bank/progress";
import { gradeCurrentBankAnswer, bankResultStorageId, withBankPreviousWork } from "@/server/grade6-bank/result-grading";
import type { BankFeedback } from "@/lib/grade6-bank-types";
import { getBankDetailedSolution } from "@/server/grade6-bank/detailed-solution";
import { bankResultTeaching } from "@/server/grade6-bank/result-teaching";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const denied = bankAccess(request, true); if (denied) return denied;
  try {
    const body = await bankBody(request);
    if (Object.keys(body).some((key) => !["subject_id", "question_id", "answers", "base_revision", "input_schema"].includes(key))) throw new Error("提交字段不正确");
    const retired = bankRetired(body.question_id); if (retired) return retired;
    const baseRevision = bankBaseRevision(body.base_revision);
    const subject = bankSubject(body.subject_id), q = typeof body.question_id === "string" ? await getBankQuestion(body.question_id) : undefined;
    if (!q) return NextResponse.json({ error: "题目不存在" }, { status: 404, headers: bankHeaders });
    bankInputSchema(body.input_schema, q);
    const answer = await getPrivateBankAnswer(q.id);
    if (!answer) throw new Error("Missing private answer record");
    const studentAnswers = bankStudentAnswers(body.answers, q, true), graded = await gradeCurrentBankAnswer(q.id, answer, studentAnswers);
    const feedback: BankFeedback = { questionId: q.id, ...graded, answerText: graded.outcome === "missing" ? "" : answer.answerText, answerImages: [] };
    // Prepare feedback after validating the complete submission, before saving:
    // a missing asset must not leave a committed grade behind a failed response.
    // Nothing private is returned unless the atomic revision-qualified save succeeds.
    const images = graded.outcome === "missing" ? [] : await Promise.all(answer.answerImages.map(async (relative) => {
      const image = await readBankImage(relative, "private");
      return `data:${image.mime};base64,${image.bytes.toString("base64")}`;
    }));
    const detailedSolution = graded.outcome === "missing" ? null : await getBankDetailedSolution(q.id);
    const teaching = await bankResultTeaching(q.id, detailedSolution, feedback.answerText);
    const studentId = bankProfile(request).id;
    const previous = q.resultAssessment === "closed-v1" ? await bankResponse(studentId, subject, q.id) : undefined;
    const response = await saveBankResponse(studentId, subject, bankResultStorageId(q), studentAnswers, baseRevision, feedback);
    return NextResponse.json({ feedback: { ...feedback, answerText: teaching.answerText, answerImages: images, ...(teaching.detailedSolution ? { detailedSolution: teaching.detailedSolution } : {}) }, response: previous ? withBankPreviousWork(response, previous) : response }, { headers: bankHeaders });
  } catch (error) {
    if (error instanceof BankRevisionConflict) return NextResponse.json({ error: error.message, response: error.response }, { status: 409, headers: bankHeaders });
    return bankFailure(error);
  }
}
