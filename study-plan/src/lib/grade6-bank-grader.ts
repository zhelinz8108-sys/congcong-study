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

function matchesRule(raw: string, rule: BankRule) {
  let value = normalizeBankAnswer(raw);
  if (rule.unit) {
    const unit = normalizeBankAnswer(rule.unit);
    if (value.endsWith(unit)) value = value.slice(0, -unit.length);
  }
  return rule.expected.some((expected) => {
    const normalizedExpected = normalizeBankAnswer(expected);
    if (normalizedExpected === value || /^[a-z]$/i.test(value) && normalizedExpected.toLowerCase() === value.toLowerCase()) return true;
    if (!rule.numeric) return false;
    const actual = bankNumber(value), wanted = bankNumber(expected);
    return actual !== null && wanted !== null && Number.isFinite(actual) && Math.abs(actual - wanted) <= 1e-8 * Math.max(1, Math.abs(wanted));
  });
}

export function gradeBankAnswer(privateAnswer: BankPrivateAnswer, answers: BankAnswers) {
  if (privateAnswer.answerStatus === "missing" || privateAnswer.answerStatus === "mismatch") {
    return { outcome: "missing" as BankOutcome, score: null, maxScore: 0, fields: [], message: "原资料的配套答案缺失或错配，这题已保存，但暂不计入正确率。" };
  }
  if (privateAnswer.reviewRequired || !privateAnswer.rules.length) {
    return { outcome: "review" as BankOutcome, score: null, maxScore: 0, fields: [], message: "作答已保存。此题含过程、作图或尚未可靠结构化的答案，需要核验，暂不计入正确率。" };
  }
  const fields = privateAnswer.rules.map((rule) => ({ id: rule.id, correct: matchesRule(answers[rule.id] ?? "", rule) }));
  const score = fields.filter((field) => field.correct).length;
  const correct = score === fields.length;
  return { outcome: (correct ? "correct" : "incorrect") as BankOutcome, score, maxScore: fields.length, fields, message: correct ? "答对了！可以看完解析后，手动进入下一题。" : `这题还有需要订正的地方。${fields.length > 1 ? `已答对 ${score}/${fields.length} 项。` : ""}看看答案，再想一遍。` };
}
