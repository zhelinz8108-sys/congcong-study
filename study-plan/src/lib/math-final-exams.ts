export const finalExamNames = ["卷一", "卷二", "卷三", "卷四", "卷五", "卷六", "卷七", "卷八", "卷九", "卷十"];
export const finalExamSections = ["选择题", "填空题", "判断并说明理由", "计算与方程", "读图与作图", "解决问题"];
export type FinalExamEdition = "student" | "answers";

export function finalExamNumber(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return number <= finalExamNames.length ? number : null;
}

export function finalExamPdf(number: number, edition: FinalExamEdition) {
  return `/api/grade-six-reviews/math-final-${edition}-${number}?download=1`;
}

export const finalExamGroups = [[0, 12], [12, 26], [26, 32], [32, 38], [38, 43], [43, 50]] as const;
export const finalExamQuestionPoints = 2;
export type ExamValues = Record<string, string>;
export type ExamField = {
  id: string;
  label: string;
  kind: "choice" | "multi" | "number" | "ratio" | "simplestRatio" | "simplestFraction" | "point" | "path" | "binary" | "pi";
  options?: { value: string; html: string }[];
  unit?: string;
};
export type GridPoint = [number, number];
export type ExamGrid = { points: Record<string, GridPoint>; edges: [string, string][]; circle: boolean; route?: boolean };
export type ExamQuestion = { stem: string; figure?: string; grid?: ExamGrid; fields: ExamField[] };
export type ExamMark = { correct: boolean; answer: string; explanation: string; figure?: string; fieldAnswers: string[] };
export type ExamState = { values: ExamValues; revision: number; submittedAt?: string; score?: number; marks?: ExamMark[] };

export function questionAnswered(question: ExamQuestion, values: ExamValues) {
  return question.fields.every(field => Boolean(values[field.id]?.trim()));
}

export function readPoint(value: string): GridPoint | null {
  const match = /^\(?\s*(-?\d{1,3})\s*[,、]\s*(-?\d{1,3})\s*\)?$/.exec(value.normalize("NFKC").trim());
  return match ? [Number(match[1]), Number(match[2])] : null;
}
export function readPath(value: string): GridPoint[] | null {
  const parts = value.normalize("NFKC").split(/\s*(?:;|→|->)\s*/);
  const points = parts.map(readPoint);
  return points.length >= 2 && points.length <= 32 && points.every(point => point !== null) ? points : null;
}
