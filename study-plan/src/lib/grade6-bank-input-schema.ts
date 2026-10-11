import type { BankAnswers, BankQuestion } from "./grade6-bank-types";
import { assertBankDrawing } from "./grade6-bank-native-validation";

/** Local migration marker only; never a credential, grade or server write right. */
export function bankNativeInputSchema(question: BankQuestion): string | undefined {
  if (!question.native) return undefined;
  const drawingBox = (id: string) => {
    const block = question.native?.blocks.find((block) => block.type === "drawing" && block.fieldId === id);
    return block?.type === "drawing" ? block.viewBox : null;
  };
  return "native-input-v1:" + JSON.stringify(question.inputs.map((field) => [
    field.id, field.kind ?? "text", field.choices ?? null,
    field.kind === "drawing" ? drawingBox(field.id) : null,
  ]));
}

/** Never guess whether historic aggregate text belongs to a new first blank. */
export function bankLegacyAnswerEntries(question: BankQuestion, answers: BankAnswers = {}, localSchema?: string): [string, string][] {
  if (!Object.keys(answers).length) return [];
  const missingFields = question.inputs.some((field) => !Object.hasOwn(answers, field.id));
  if (question.native && missingFields && localSchema !== bankNativeInputSchema(question)) return Object.entries(answers);
  const invalid = Object.entries(answers).some(([id, value]) => {
    const field = question.inputs.find((input) => input.id === id);
    if (!field) return true;
    if (field.kind === "choice" && value.trim()) return !field.choices?.includes(value);
    if (field.kind !== "drawing" || !value.trim()) return false;
    const block = question.native?.blocks.find((block) => block.type === "drawing" && block.fieldId === id);
    try { assertBankDrawing(value, block?.type === "drawing" ? block.viewBox : undefined); return false; }
    catch { return true; }
  });
  return invalid ? Object.entries(answers) : [];
}

export function bankCurrentAnswers(question: BankQuestion, answers: BankAnswers = {}, localSchema?: string): BankAnswers {
  if (bankLegacyAnswerEntries(question, answers, localSchema).length) return {};
  return Object.fromEntries(question.inputs.filter((field) => Object.hasOwn(answers, field.id)).map((field) => [field.id, answers[field.id]]));
}
