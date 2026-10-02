import { checkMathAnswer, normalizeNationalDayMathAnswer } from "@/lib/national-day-math-answer";
import type { NationalDayMathPracticeField, NationalDayMathPublicSection, NationalDayMathSection } from "@/lib/national-day-math";

export type NationalDayMathGradingField = NationalDayMathPracticeField & {
  accepted: string[];
  format?: "two-decimal" | "three-decimal" | "reduced-fraction" | "digits";
};
export type NationalDayMathRubric = { fields: NationalDayMathGradingField[] };
export type NationalDayMathRubrics = Record<string, NationalDayMathRubric>;

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function matchesFormat(value: string, format?: NationalDayMathGradingField["format"]) {
  const normalized = normalizeNationalDayMathAnswer(value);
  const number = normalized.replace(/^(?:约|大约|≈)/, "");
  if (format === "two-decimal") return /^[+-]?\d+\.\d{2}$/.test(number);
  if (format === "three-decimal") return /^[+-]?\d+\.\d{3}$/.test(number);
  if (format === "digits") return /^[01]+$/.test(normalized);
  if (format === "reduced-fraction") {
    const match = normalized.match(/^([+-]?\d+)\/(\d+)$/);
    if (!match) return false;
    const numerator = Math.abs(Number(match[1]));
    const denominator = Number(match[2]);
    return Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && denominator > 0 && gcd(numerator, denominator) === 1;
  }
  return true;
}

/** Reject incomplete submissions before any solution is returned. */
export function gradeNationalDayMathFields(fields: readonly NationalDayMathGradingField[], answers: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error("请填写所有小问后再提交。");
  const values = answers as Record<string, unknown>;
  const allowed = new Set(fields.map(field => field.id));
  if (Object.keys(values).some(id => !allowed.has(id))) throw new Error("答题字段不正确，请刷新后重试。");
  for (const field of fields) {
    if (!Object.hasOwn(values, field.id) || typeof values[field.id] !== "string" || !(values[field.id] as string).trim()) {
      throw new Error(`请先完成：${field.label}`);
    }
    if ((values[field.id] as string).length > 200) throw new Error("每个答案最多填写200个字符。");
  }
  const results = fields.map(field => {
    const value = values[field.id] as string;
    const normalized = normalizeNationalDayMathAnswer(value);
    const correct = matchesFormat(value, field.format) && (field.kind === "choice"
      ? field.accepted.some(answer => normalizeNationalDayMathAnswer(answer) === normalized)
      : checkMathAnswer(value, field.accepted) === true);
    return { id: field.id, label: field.label, correct, expected: field.accepted[0] };
  });
  return { correct: results.every(result => result.correct), fields: results };
}

/** Keep solutions and accepted keys out of HTML, RSC props and client bundles. */
export function toPublicNationalDayMathSections(sections: NationalDayMathSection[], rubrics: NationalDayMathRubrics): NationalDayMathPublicSection[] {
  return sections.map(section => ({
    ...section,
    blocks: section.blocks.map(block => {
      if (block.type === "text" || block.type === "heading" || block.type === "formula" || block.type === "diagram") return block;
      if (block.type === "example") {
        const { accepted: _accepted, ...example } = block;
        void _accepted;
        return { ...example, type: "example" as const };
      }
      const rubric = rubrics[block.id];
      if (!rubric?.fields.length) throw new Error(`Missing mathematics grading rubric: ${block.id}`);
      return {
        type: "quiz" as const, id: block.id, label: block.label, title: block.title,
        question: block.question, category: block.category, pdfPage: block.pdfPage,
        fields: rubric.fields.map(({ id, label, kind, options, hint }) => ({
          id, label, kind, ...(options ? { options } : {}), ...(hint ? { hint } : {}),
        })),
      };
    }),
  }));
}
