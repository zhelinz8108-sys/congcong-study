import type { BankAnswers, BankOutcome } from "./grade6-bank-types";

export type BankRule = { id: string; expected: string[]; numeric?: boolean; unit?: string };
export type BankPrivateAnswer = {
  id: string;
  answerText: string;
  answerImages: string[];
  answerStatus: string;
  reviewRequired: boolean;
  rules: BankRule[];
};

export function normalizeBankAnswer(value: string) {
  return value.normalize("NFKC").trim().replace(/^([+-]?\d+)\s+(\d+\s*\/\s*\d+)$/, "$1又$2").replace(/\s+/g, "").replace(/。$/, "")
    .replace(/[−–]/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
}

// A deliberately small parser: no eval, variables, arbitrary expressions or guesses.
// Supports equivalent fractions, decimals, percentages and mixed numbers.
export function bankNumber(raw: string): number | null {
  const value = normalizeBankAnswer(raw);
  const plain = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/.exec(value);
  if (plain) return Number(plain[1]);
  const percent = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))%$/.exec(value);
  if (percent) return Number(percent[1]) / 100;
  const fraction = /^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/.exec(value);
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
  const mixed = /^([+-]?\d+)(?:又|带)(\d+)\/(\d+)$/.exec(value);
  if (mixed && Number(mixed[3]) !== 0) {
    const whole = Number(mixed[1]);
    return whole + (whole < 0 ? -1 : 1) * Number(mixed[2]) / Number(mixed[3]);
  }
  return null;
}

type ExactBankNumber = { numerator: bigint; denominator: bigint };
function exactDecimal(value: string): ExactBankNumber | null {
  if (value.length > 128 || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return null;
  const negative = value.startsWith("-"), unsigned = value.replace(/^[+-]/, "");
  const [whole, decimals = ""] = unsigned.split(".");
  return { numerator: BigInt(negative ? -1 : 1) * BigInt((whole || "0") + decimals), denominator: BigInt(10) ** BigInt(decimals.length) };
}

/** Exact decimal/fraction arithmetic for reviewed native questions. Relative
 * floating-point tolerance can otherwise accept a wrong last decimal digit on
 * a large answer. No expression evaluation, scientific notation or rounding. */
export function bankExactNumber(raw: string): ExactBankNumber | null {
  const value = normalizeBankAnswer(raw);
  if (value.length > 256) return null;
  const plain = exactDecimal(value);
  if (plain) return plain;
  if (value.endsWith("%")) {
    const percent = exactDecimal(value.slice(0, -1));
    return percent ? { numerator: percent.numerator, denominator: percent.denominator * BigInt(100) } : null;
  }
  const mixed = /^([+-]?\d+)(?:又|带)(\d+)\/(\d+)$/.exec(value);
  if (mixed) {
    const denominator = BigInt(mixed[3]);
    if (!denominator) return null;
    const negative = mixed[1].startsWith("-"), whole = BigInt(mixed[1].replace(/^[+-]/, ""));
    return { numerator: BigInt(negative ? -1 : 1) * (whole * denominator + BigInt(mixed[2])), denominator };
  }
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  const top = exactDecimal(parts[0]), bottom = exactDecimal(parts[1]);
  if (!top || !bottom || !bottom.numerator) return null;
  return { numerator: top.numerator * bottom.denominator, denominator: top.denominator * bottom.numerator };
}

function matchesRule(raw: string, rule: BankRule, exact: boolean) {
  let value = normalizeBankAnswer(raw);
  if (rule.unit) {
    const unit = normalizeBankAnswer(rule.unit);
    if (value.endsWith(unit)) value = value.slice(0, -unit.length);
  }
  return rule.expected.some((expected) => {
    const normalizedExpected = normalizeBankAnswer(expected);
    if (normalizedExpected === value || /^[a-z]$/i.test(value) && normalizedExpected.toLowerCase() === value.toLowerCase()) return true;
    if (!rule.numeric) return false;
    if (exact) {
      const actual = bankExactNumber(value), wanted = bankExactNumber(expected);
      return actual !== null && wanted !== null && actual.numerator * wanted.denominator === wanted.numerator * actual.denominator;
    }
    const actual = bankNumber(value), wanted = bankNumber(expected);
    return actual !== null && wanted !== null && Number.isFinite(actual) && Math.abs(actual - wanted) <= 1e-8 * Math.max(1, Math.abs(wanted));
  });
}

export function gradeBankAnswer(privateAnswer: BankPrivateAnswer, answers: BankAnswers) {
  if (privateAnswer.answerStatus === "missing" || privateAnswer.answerStatus === "mismatch") {
    return { outcome: "missing" as BankOutcome, score: null, maxScore: 0, fields: [], message: "答案待核对，不计入正确率。" };
  }
  if (privateAnswer.reviewRequired || !privateAnswer.rules.length) {
    return { outcome: "review" as BankOutcome, score: null, maxScore: 0, fields: [], message: "过程或作图待核验，不计入正确率。" };
  }
  const fields = privateAnswer.rules.map((rule) => ({ id: rule.id, correct: matchesRule(answers[rule.id] ?? "", rule, privateAnswer.answerStatus === "verified_native") }));
  const score = fields.filter((field) => field.correct).length;
  const correct = score === fields.length;
  return { outcome: (correct ? "correct" : "incorrect") as BankOutcome, score, maxScore: fields.length, fields, message: correct ? "" : "请订正标出的作答。" };
}
