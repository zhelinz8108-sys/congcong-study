import type { SixQuestion } from "./english-six";

export function sixQuestionBlanks(question: Pick<SixQuestion, "prompt">) {
  return [...question.prompt.matchAll(/_{2,}|＿{2,}|﹏{2,}/g)].map(match => ({
    start: match.index, end: match.index + match[0].length,
  }));
}

export function sixQuestionInputCount(question: SixQuestion, acceptedCount?: number) {
  if (question.options.length || question.kind === "writing") return 1;
  if (acceptedCount !== undefined) return Math.max(1, acceptedCount);
  return Math.max(1, sixQuestionBlanks(question).length);
}

export function sixAnswerValues(count: number, response: string): string[] {
  if (count <= 1) return [response];
  try {
    const values: unknown = JSON.parse(response);
    if (Array.isArray(values) && values.length === count && values.every(value => typeof value === "string")) return values;
  } catch { /* Older first submissions can contain a single unsplit response. */ }
  return [response, ...Array<string>(count - 1).fill("")];
}

export function sixAnswerResponse(values: string[]) {
  return values.length > 1 ? JSON.stringify(values) : values[0] ?? "";
}

export function sixAnswerDisplay(response: string) {
  try {
    const values: unknown = JSON.parse(response);
    if (Array.isArray(values) && values.every(value => typeof value === "string")) return values.join(" / ");
  } catch { /* A plain response needs no decoding. */ }
  return response;
}
