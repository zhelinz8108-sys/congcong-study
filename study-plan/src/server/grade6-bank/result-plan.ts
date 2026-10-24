import "server-only";
import type { BankInput, BankQuestion } from "@/lib/grade6-bank-types";
import { bankExactNumber, type BankPrivateAnswer, type BankRule } from "@/lib/grade6-bank-grader";
import { evaluateBankArithmetic } from "@/lib/grade6-bank-arithmetic";

export type BankResultPlan = {
  rules: BankRule[];
  resultInputIds: string[];
  optionalInputIds: string[];
  fractionGroups?: { numeratorId: string; denominatorId: string }[];
  ready: true;
  assessment?: "closed-v1";
};

// These indicate uncertainty in the result itself, rather than a requirement to
// show workings. Such source caveats cannot become a confident machine grade.
const uncertainResult = /待核验|条件(?:不完整|不足|缺失|不充分)|题干(?:不完整|缺失)|不能唯一|不唯一|歧义|口径|取整|模型|假设|允许|待确认|待核对|原题(?:未|没有)|不(?:作严格|据此).*自动判分|答案(?:有误|错误|不符|不一致)|错误(?:示范|结果|写法)|误算|错算|误写|错写|循环点|循环表示/;
const numeric = "[+-]?(?:(?:\\d+)(?:又|带)\\d+\\/\\d+|(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:\\/[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))?%?)";
const units = "平方千米|平方米|平方分米|平方厘米|平方毫米|立方米|立方分米|立方厘米|千米|分米|厘米|毫米|千克|分钟|小时|毫升|公顷|万元|米|克|吨|秒|元|角|分|人|棵|本|件|套|块|辆|次|天|份|台|只|个|条|年|月|周|圈|度|升|亩|km2|cm2|dm2|m2|cm3|dm3|m3|km|cm|dm|mm|kg|m|g";
type ResultLiteral = { value: string; unit?: string };

function equalNumbers(left: string, right: string) {
  const a = bankExactNumber(left), b = bankExactNumber(right);
  return a !== null && b !== null && a.numerator * b.denominator === b.numerator * a.denominator;
}

/** A literal must terminate a result, never be the start of an expression. */
function literalAt(text: string, start: number): (ResultLiteral & { end: number }) | null {
  const match = new RegExp(`^\\s*(${numeric})(?![\\d./%又带])`).exec(text.slice(start));
  if (!match || !bankExactNumber(match[1])) return null;
  const end = start + match[0].length;
  const suffix = text.slice(end).trimStart();
  if (/^[+\-×÷*/^²³=＝≈a-zA-Z]/.test(suffix) && !new RegExp(`^(?:${units})(?:[，,。；;）)]|$)`).test(suffix)) return null;
  const unit = new RegExp(`^(?:[（(]\\s*)?(${units})(?:\\s*[）)])?(?=[，,。；;、\\s]|$)`).exec(suffix)?.[1];
  // Open-ended/repeating decimals are not their finite prefixes.
  if (/^[.…]/.test(suffix) || /^(?:分之|又|带)/.test(suffix)) return null;
  return { value: match[1], ...(unit ? { unit } : {}), end };
}

/** Only explicit terminal numeric results are supported. Multiple independent
 * outcomes in one response remain manual; no last-number heuristic is used. */
function explicitResult(raw: string, solvedVariable: boolean): ResultLiteral | null {
  const text = raw.normalize("NFKC").replace(/[−–－]/g, "-").split(/验算|检验|检查/)[0].trim();
  const answers = [...text.matchAll(/(?:^|[。；;\n])\s*答\s*[:：]/g)];
  if (answers.length === 1) {
    const marker = answers[0];
    const value = literalAt(text, marker.index! + marker[0].length);
    if (value && !/\d/.test(text.slice(value.end).replace(new RegExp(`^\\s*(?:[（(]\\s*)?(?:${units})(?:\\s*[）)])?`), ""))) return value;
  }
  // An explicit solved-variable assignment is stronger than a numeric value
  // appearing in an intermediate equality or in a later verification.
  const variables = [...text.matchAll(/(?<![a-zA-Z0-9+\-*/^)}\]²³×÷])([a-zA-Z])\s*[=＝]\s*/g)];
  if (variables.length && (!solvedVariable || new Set(variables.map(marker => marker[1])).size !== 1)) return null;
  const solved = variables.map((marker, index) => {
    const tail = text.slice(marker.index! + marker[0].length, variables[index + 1]?.index ?? text.length).split(/[，,。；;\n]/)[0];
    const last = Math.max(tail.lastIndexOf("="), tail.lastIndexOf("＝"));
    return { variable: marker[1], result: literalAt(tail, last + 1) };
  }).filter(item => item.result !== null);
  if (solved.length) {
    if (new Set(solved.map(item => item.variable)).size !== 1 || solved.some(item => !equalNumbers(item.result!.value, solved[0].result!.value))) return null;
    return solved[0].result;
  }
  const values = [...text.matchAll(/[=＝≈]\s*/g)].map(marker => literalAt(text, marker.index! + marker[0].length)).filter((value): value is ResultLiteral & { end: number } => value !== null);
  if (values.length === 1) return values[0];
  if (values.length) return null;
  const direct = literalAt(text, 0);
  if (!direct) return null;
  const tail = text.slice(direct.end).replace(new RegExp(`^\\s*(?:[（(]\\s*)?(?:${units})(?:\\s*[）)])?`), "").trim();
  return !tail || /^[。；;]\s*(?:(?:需|须|应|注意|保留|展示|过程)[^\d]*)?$/.test(tail) ? direct : null;
}

function numberedResults(answerText: string, count: number, solvedVariable: boolean): (ResultLiteral | null)[] | null {
  const markers = [...answerText.matchAll(/[（(](\d+)[）)]/g)];
  if (!markers.length) return count === 1 ? [explicitResult(answerText, solvedVariable)] : null;
  if (markers.length !== count || markers.some((marker, index) => Number(marker[1]) !== index + 1)) return null;
  return markers.map((marker, index) => explicitResult(answerText.slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? answerText.length), solvedVariable));
}

/** Associate only an entire, arithmetic-only displayed expression immediately
 * preceding its own response field. Embedded givens in word problems are not
 * expressions to evaluate as answers. */
function calculationExpressions(question: BankQuestion): Map<string, string> {
  const result = new Map<string, string>();
  const blocks = question.native?.blocks ?? [];
  const instruction = blocks.find(block => block.type === "paragraph");
  const title = instruction?.type === "paragraph" ? instruction.content.filter(node => node.type === "text").map(node => node.value).join("").trim() : "";
  const normalizedTitle = title.replace(/[。.!！,，（）()：:\s]/g, "");
  if (!/^(?:脱式计算|简便计算|计算|计算下面各题|计算下列各题|用自己喜欢的方法计算下面各题|用竖式计算|列竖式计算|能简算的要简算|先说出运算顺序再计算|用乘法分配律(?:变式)?计算)(?:能简算的要简算|怎样简便就怎样计算|注意使计算简便)?$/u.test(normalizedTitle)) return result;
  let pending: string | null = null;
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const text = block.content.filter(node => node.type === "text").map(node => node.value).join("").trim();
      const maths = block.content.filter(node => node.type === "math");
      pending = maths.length === 1 && block.content.every(node => node.type === "text" || node.type === "math") && (!text || /^[（(]\d+[）)]$/.test(text)) ? maths[0].tex : null;
    } else if (block.type === "response") {
      if (pending) result.set(block.fieldId, pending.replace(/[=＝]\s*$/, ""));
      pending = null;
    } else pending = null;
  }
  return result;
}

function optionalSeparateWorking(field: BankInput, question: BankQuestion, existing: BankRule[]) {
  // A dedicated, unnumbered work slot alongside a single authored answer is
  // explicitly ancillary. A process-N slot may instead represent a whole
  // separate calculation, so it is never silently omitted here.
  return question.inputs.length === 2 && existing.length === 1 && /^(?:计算过程|解题过程|解答过程|列式过程|验算过程|竖式|验算)$/.test(field.label.trim());
}

/** Result keys remain on the server and are derived from the sealed reviewed
 * answer and/or an independently parsed complete arithmetic expression. */
export function buildBankResultPlan(question: BankQuestion, answer: BankPrivateAnswer): BankResultPlan | null {
  if (answer.answerStatus === "missing" || answer.answerStatus === "mismatch" || !question.inputs.length) return null;
  if (question.inputs.some(field => field.kind === "drawing")) return null;
  if (answer.reviewRequired && uncertainResult.test(answer.answerText)) return null;
  const inputIds = new Set(question.inputs.map(field => field.id));
  if (answer.rules.some(rule => !inputIds.has(rule.id) || !rule.expected.length) || new Set(answer.rules.map(rule => rule.id)).size !== answer.rules.length) return null;
  const rules = new Map(answer.rules.map(rule => [rule.id, { ...rule, expected: [...rule.expected] }]));
  const instructionText = (question.native?.blocks ?? []).filter(block => block.type === "paragraph").slice(0, 1).flatMap(block => block.type === "paragraph" ? block.content.filter(node => node.type === "text").map(node => node.value) : []).join("");
  const teacher = numberedResults(answer.answerText, question.inputs.length, /解方程|解比例/.test(instructionText));
  const expressions = calculationExpressions(question);
  const optional: string[] = [];
  for (const [index, field] of question.inputs.entries()) {
    if (rules.has(field.id)) continue;
    const expression = expressions.get(field.id);
    const arithmetic = expression ? evaluateBankArithmetic(expression) : null;
    const result = teacher?.[index];
    if (arithmetic) {
      const value = arithmetic.denominator === BigInt(1) ? arithmetic.numerator.toString() : `${arithmetic.numerator}/${arithmetic.denominator}`;
      if (result && !equalNumbers(value, result.value)) return null;
      rules.set(field.id, { id: field.id, expected: [value], numeric: true });
    } else if (result && !/理由|说明|证明|解释|规律|变化|方法|循环|数字空|简便记法/.test(field.label)) {
      rules.set(field.id, { id: field.id, expected: [result.value], numeric: true, ...(result.unit ? { unit: result.unit } : {}) });
    } else if (optionalSeparateWorking(field, question, answer.rules)) optional.push(field.id);
    else return null;
  }
  const ordered = question.inputs.flatMap(field => rules.has(field.id) ? [rules.get(field.id)!] : []);
  if (!ordered.length || ordered.length + optional.length !== question.inputs.length) return null;
  return { rules: ordered, resultInputIds: ordered.map(rule => rule.id), optionalInputIds: optional, ready: true };
}
