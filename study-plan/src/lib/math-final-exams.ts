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
