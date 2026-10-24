import "server-only";
import type { BankAnswers, BankProgress, BankResponse } from "@/lib/grade6-bank-types";
import { gradeBankAnswer, gradeBankFinalAnswers } from "@/lib/grade6-bank-grader";
import type { BankPrivateAnswer } from "@/lib/grade6-bank-grader";
import { getBankResultPlan, getPrivateBankAnswer, getArchivedBankQuestion } from "./bank";
import { bankAssessmentId, bankAssessmentBaseId } from "./result-descriptor";

export const bankResultStorageId = bankAssessmentId;

function previousWork(response?: BankResponse): BankResponse["previousSubmission"] {
  return response ? { answers: response.answers, submitted: response.submitted || response.submissions > 0,
    outcome: response.outcome, score: response.score, maxScore: response.maxScore, updatedAt: response.updatedAt } : undefined;
}
export function withBankPreviousWork(response: BankResponse | undefined, previous?: BankResponse): BankResponse {
  const current: BankResponse = response ?? { answers: {}, submitted: false, outcome: null, score: null, maxScore: 0, submissions: 0, updatedAt: "", revision: 0 };
  return previous ? { ...current, previousSubmission: previousWork(previous) } : current;
}

export async function gradeCurrentBankAnswer(questionId: string, answer: BankPrivateAnswer, answers: BankAnswers) {
  const plan = await getBankResultPlan(questionId);
  return plan?.ready ? gradeBankFinalAnswers(answer, answers, plan.rules, plan.fractionGroups) : gradeBankAnswer(answer, answers);
}

/** An updated result-only view of the original submitted answers. Stored first
 * submissions, revisions, timestamps and learner work are never rewritten. */
export async function projectBankResult(questionId: string, response: BankResponse): Promise<BankResponse> {
  if (!response.submitted && response.submissions < 1) return response;
  const plan = await getBankResultPlan(questionId);
  if (!plan?.ready || plan.resultInputIds.some(id => !Object.hasOwn(response.answers, id))) return response;
  const answer = await getPrivateBankAnswer(questionId);
  if (!answer) return response;
  const graded = gradeBankFinalAnswers(answer, response.answers, plan.rules, plan.fractionGroups);
  return { ...response, outcome: graded.outcome, score: graded.score, maxScore: graded.maxScore };
}

export async function projectBankProgress(progress: BankProgress): Promise<BankProgress> {
  const ids = [...new Set(Object.keys(progress.responses).map(bankAssessmentBaseId))];
  const responses = await Promise.all(ids.map(async id => {
    const question = await getArchivedBankQuestion(id);
    const current = question ? progress.responses[bankAssessmentId(question)] : progress.responses[id];
    const view = question?.resultAssessment === "closed-v1" ? withBankPreviousWork(current, progress.responses[id]) : current;
    return [id, view ? await projectBankResult(id, view) : view] as const;
  }));
  return { ...progress, responses: Object.fromEntries(responses.filter((entry): entry is readonly [string, BankResponse] => !!entry[1])),
    lastQuestionId: bankAssessmentBaseId(progress.lastQuestionId) };
}
