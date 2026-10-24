import type { BankAnswers, BankOutcome } from "./grade6-bank-types";

export type BankRule = { id: string; expected: string[]; numeric?: boolean; unit?: string; resultParts?: { expected: string; unit?: string }[] };
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
    .replace(/[−–]/g, "-").replace(/[⁄∕]/g, "/").replace(/×/g, "*").replace(/÷/g, "/");
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

/** Read a final result without awarding or deducting marks for working.
 * Only an explicit final-answer marker or a terminal equality is selected;
 * an arbitrary last number in prose must never become the submitted answer. */
export function bankFinalResult(raw: string): string {
  let value = raw.normalize("NFKC").trim();
  if (/^[=<>≤≥≠]$/.test(value)) return value;
  const finalMarker = [...value.matchAll(/最终(?:答案|结果)\s*[:：=]\s*/g)].at(-1);
  const marker = finalMarker ?? [...value.matchAll(/(?:计算结果|结果|答案|答)\s*[:：=]\s*/g)].at(-1);
  if (marker?.index !== undefined) value = value.slice(marker.index + marker[0].length).trim().split(/[\r\n]+/, 1)[0];
  value = value.split(/(?:验算|检验|验证|检查|回代)\s*[:：]/, 1)[0].trim();
  const lines = value.split(/[\r\n]+/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 1) value = lines.at(-1)!;
  if (/^[=<>≤≥≠]$/.test(value)) return value;
  const equality = value.lastIndexOf("=");
  if (equality >= 0) value = value.slice(equality + 1).trim();
  // Do not silently strip precision/uncertainty markers or extra conclusions.
  return value.replace(/[。；;]$/, "").replace(/^([+-]?\d+(?:\.\d+)?)分之([+-]?\d+(?:\.\d+)?)$/, "$2/$1");
}

/** Result plans are independently built from the authenticated private key.
 * A nonempty rule set is mandatory; work and drawings never earn a free pass. */
function sameExactValue(left: string, right: string) {
  const a = bankExactNumber(left), b = bankExactNumber(right);
  return a !== null && b !== null && a.numerator * b.denominator === b.numerator * a.denominator;
}

function stripResultUnit(raw: string, unit: string) {
  const value = normalizeBankAnswer(raw), suffix = normalizeBankAnswer(unit);
  if (value.endsWith(`(${suffix})`)) return value.slice(0, -suffix.length - 2);
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

function equivalentRatio(left: string, right: string) {
  const parts = (raw: string) => {
    const values = normalizeBankAnswer(raw).split(/[:∶比]/);
    if (values.length < 2 || values.length > 6) return null;
    const result = values.map(bankExactNumber);
    return result.every(value => value !== null) ? result as ExactBankNumber[] : null;
  };
  const a = parts(left), b = parts(right);
  if (!a || !b || a.length !== b.length) return false;
  const pivot = b.findIndex(value => value.numerator !== BigInt(0));
  if (pivot < 0 || a[pivot].numerator === BigInt(0)) return false;
  return a.every((value, index) => value.numerator * a[pivot].denominator * b[pivot].numerator * b[index].denominator === b[index].numerator * b[pivot].denominator * a[pivot].numerator * value.denominator);
}

function equivalentFinalValue(raw: string, rule: BankRule): string {
  const value = bankFinalResult(raw);
  if (rule.expected.some(expected => normalizeBankAnswer(expected) === normalizeBankAnswer(value))) return value;
  const units = new Set(rule.unit ? [rule.unit] : []);
  const canonical = rule.expected.filter(expected => bankExactNumber(expected) !== null);
  // Only authored unit aliases are recognised; a wrong or unknown unit cannot
  // disappear merely because the numeric portion looks correct.
  for (const alias of rule.expected) {
    const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\/[+-]?(?:\d+(?:\.\d+)?|\.\d+))?%?)([^\d\s].{0,24})$/.exec(normalizeBankAnswer(alias));
    if (match && canonical.some(expected => sameExactValue(expected, match[1]))) units.add(match[2]);
  }
  const numeric = rule.numeric || canonical.some(expected => /[./%]/.test(expected)) || units.size > 0;
  if (numeric) {
    const candidates = [value, ...[...units].map(unit => stripResultUnit(value, unit))];
    const expected = canonical.find(expected => candidates.some(candidate => sameExactValue(candidate, expected)));
    if (expected !== undefined) return expected;
  }
  const ratio = rule.expected.find(expected => equivalentRatio(value, expected));
  return ratio ?? value;
}

function finalResultParts(raw: string, count: number) {
  let value = raw.normalize("NFKC").trim();
  const final = [...value.matchAll(/最终(?:答案|结果)\s*[:：=]\s*/g)].at(-1);
  const marker = final ?? [...value.matchAll(/(?:计算结果|结果|答案|答)\s*[:：=]\s*/g)].at(-1);
  if (marker?.index !== undefined) value = value.slice(marker.index + marker[0].length);
  value = value.split(/(?:验算|检验|验证|检查|回代|(?:计算|解答|解题)?过程)\s*[:：]/, 1)[0].trim().replace(/[。；;]$/, "");
  const lines = value.split(/[\r\n]+/).map(line => line.trim()).filter(Boolean);
  const split = (line: string) => line.split(/[；;，,、]+/).map(part => part.trim()).filter(Boolean);
  if (marker && lines.length && split(lines[0]).length === count) return split(lines[0]);
  if (!marker && lines.length && split(lines.at(-1)!).length === count) return split(lines.at(-1)!);
  return value.split(/[；;，,、\r\n]+/).map(part => part.trim()).filter(Boolean);
}

export function gradeBankFinalAnswers(privateAnswer: BankPrivateAnswer, answers: BankAnswers, rules: BankRule[], fractionGroups: { numeratorId: string; denominatorId: string }[] = []) {
  if (!rules.length) throw new Error("Missing final-result rules");
  if (rules.some(rule => !rule.expected.length || rule.expected.some(expected => !expected.trim()) ||
    rule.numeric && (!rule.expected.some(expected => bankExactNumber(expected) !== null) || rule.expected.some(expected => {
      const normalized = normalizeBankAnswer(expected);
      return /^[+\-\d./%又带]+$/.test(normalized) && bankExactNumber(normalized) === null;
    })))) {
    throw new Error("Invalid final-result rule");
  }
  const finalAnswers = Object.fromEntries(rules.map(rule => {
    if (rule.resultParts) {
      if (!rule.resultParts.length || rule.resultParts.some(part => bankExactNumber(part.expected) === null)) throw new Error("Invalid compound final-result rule");
      const parts = finalResultParts(answers[rule.id] ?? "", rule.resultParts.length);
      const correct = parts.length === rule.resultParts.length && rule.resultParts.every((part, index) => {
        const expected: BankRule = { id: rule.id, expected: [part.expected], numeric: true, ...(part.unit ? { unit: part.unit } : {}) };
        return equivalentFinalValue(parts[index], expected) === part.expected;
      });
      return [rule.id, correct ? rule.expected[0] : "__incorrect_final_parts__"];
    }
    return [rule.id, equivalentFinalValue(answers[rule.id] ?? "", rule)];
  }));
  for (const pair of fractionGroups) {
    const numeratorRule = rules.find(rule => rule.id === pair.numeratorId), denominatorRule = rules.find(rule => rule.id === pair.denominatorId);
    if (!numeratorRule || !denominatorRule) throw new Error("Unknown fraction result field");
    const top = bankExactNumber(bankFinalResult(answers[pair.numeratorId] ?? "")), bottom = bankExactNumber(bankFinalResult(answers[pair.denominatorId] ?? ""));
    const wantedTop = numeratorRule.expected.map(bankExactNumber).find(value => value !== null), wantedBottom = denominatorRule.expected.map(bankExactNumber).find(value => value !== null);
    if (!wantedTop || !wantedBottom || !wantedBottom.numerator) throw new Error("Invalid fraction result rule");
    const correct = top !== null && bottom !== null && bottom.numerator !== BigInt(0) && top.numerator * bottom.denominator * wantedTop.denominator * wantedBottom.numerator === wantedTop.numerator * wantedBottom.denominator * top.denominator * bottom.numerator;
    finalAnswers[pair.numeratorId] = correct ? numeratorRule.expected[0] : "__incorrect_fraction__";
    finalAnswers[pair.denominatorId] = correct ? denominatorRule.expected[0] : "__incorrect_fraction__";
  }
  const graded = gradeBankAnswer({ ...privateAnswer, answerStatus: "verified_native", reviewRequired: false, rules }, finalAnswers);
  return { ...graded, message: graded.outcome === "correct" ? "所有最终答案正确。" : "最终答案有误，请对照完整解析订正。" };
}
