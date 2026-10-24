import "server-only";
import type { BankDetailedSolution } from "@/lib/grade6-bank-solution";
import { getBankResultPlan } from "./bank";
import { getBankResultDescriptor } from "./result-descriptors";

/** Called only after submission access is authorised. Keep the complete source
 * explanation and add the objective variant's conclusion above it. */
export async function bankResultTeaching(questionId: string, detailedSolution: BankDetailedSolution | null, answerText: string) {
  const descriptor = await getBankResultDescriptor(questionId), plan = await getBankResultPlan(questionId);
  if (!descriptor?.closed || plan?.assessment !== "closed-v1") return { detailedSolution, answerText };
  const letter = plan.rules.find(rule => rule.id === "result-choice")?.expected[0];
  const index = ["A", "B", "C", "D"].indexOf(letter ?? "");
  if (index < 0) throw new Error("Missing closed-result conclusion");
  const conclusion = `正确选项：${letter}。${descriptor.closed.options[index]}`;
  return { answerText: `${conclusion}\n\n${answerText}`, detailedSolution: detailedSolution ? {
    ...detailedSolution,
    steps: [{ title: "本题选项判定", content: conclusion, fieldIds: ["result-choice"] }, ...detailedSolution.steps],
    answerSummary: `${conclusion}\n原题参考结论：${detailedSolution.answerSummary}`,
  } : null };
}
