import "server-only";
import { getPrivateBankAnswer, readBankImage, getBankResultPlan } from "./bank";
import { gradeBankAnswer, gradeBankFinalAnswers } from "@/lib/grade6-bank-grader";
import { bankResultTeaching } from "./result-teaching";
import type { BankFeedback, BankResponse } from "@/lib/grade6-bank-types";
import { firstSubmission } from "@/server/first-submission";
import { bankIsIsolatedTestMemory } from "./progress";
import { getBankDetailedSolution } from "./detailed-solution";

/** Feedback is read from the stored attempt, never from replacement inputs. */
export async function savedBankFeedback(questionId: string, response: BankResponse, studentId?: string): Promise<BankFeedback> {
  if (!response.submitted && response.submissions < 1) throw new Error("尚未提交");
  const answer = await getPrivateBankAnswer(questionId);
  if (!answer) throw new Error("Missing private answer record");
  const graded = gradeBankAnswer(answer, response.answers);
  const plan = await getBankResultPlan(questionId);
  const storedId = plan?.assessment === "closed-v1" ? questionId + "--result-v1" : questionId;
  const first = studentId && !bankIsIsolatedTestMemory() ? await firstSubmission<unknown, { feedback: BankFeedback }>(studentId, "math:grade6-bank:v1", storedId) : null;
  const finalResult = plan?.ready && plan.resultInputIds.every(id => Object.hasOwn(response.answers, id))
    ? gradeBankFinalAnswers(answer, response.answers, plan.rules, plan.fractionGroups) : null;
  const outcome = finalResult?.outcome ?? response.outcome;
  const detailedSolution = outcome === "missing" ? null : await getBankDetailedSolution(questionId);
  const teaching = await bankResultTeaching(questionId, detailedSolution, outcome === "missing" ? "" : answer.answerText);
  const snapshot = { ...graded, ...(first?.feedback.feedback ?? {}),
    outcome: response.outcome ?? "review", score: response.score, maxScore: response.maxScore };
  return {
    // Apply the requested result-only policy to the original work in memory.
    // The original first-submission snapshot remains available unchanged.
    ...(finalResult ?? snapshot), questionId,
    // Current teaching content is separate from the immutable score snapshot.
    ...(teaching.detailedSolution ? { detailedSolution: teaching.detailedSolution } : {}),
    answerText: teaching.answerText,
    answerImages: outcome === "missing" ? [] : await Promise.all(answer.answerImages.map(async relative => {
      const image = await readBankImage(relative, "private");
      return `data:${image.mime};base64,${image.bytes.toString("base64")}`;
    })),
  };
}
