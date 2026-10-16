import "server-only";
import { getPrivateBankAnswer, readBankImage } from "./bank";
import { gradeBankAnswer } from "@/lib/grade6-bank-grader";
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
  const first = studentId && !bankIsIsolatedTestMemory() ? await firstSubmission<unknown, { feedback: BankFeedback }>(studentId, "math:grade6-bank:v1", questionId) : null;
  const detailedSolution = response.outcome === "missing" ? null : await getBankDetailedSolution(questionId);
  return {
    questionId, ...graded, ...(first?.feedback.feedback ?? {}),
    // Never change a historic score just because content was updated.
    outcome: response.outcome ?? "review", score: response.score, maxScore: response.maxScore,
    // Current teaching content is separate from the immutable score snapshot.
    ...(detailedSolution ? { detailedSolution } : {}),
    answerText: response.outcome === "missing" ? "" : answer.answerText,
    answerImages: response.outcome === "missing" ? [] : await Promise.all(answer.answerImages.map(async relative => {
      const image = await readBankImage(relative, "private");
      return `data:${image.mime};base64,${image.bytes.toString("base64")}`;
    })),
  };
}
