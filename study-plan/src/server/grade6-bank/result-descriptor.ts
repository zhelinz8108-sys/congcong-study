import "server-only";
import type { BankNativeBlock, BankNativeInline } from "@/lib/grade6-bank-native-types";
import type { BankQuestion } from "@/lib/grade6-bank-types";
import { bankExactNumber, normalizeBankAnswer, type BankPrivateAnswer, type BankRule } from "@/lib/grade6-bank-grader";
import type { BankResultPlan } from "./result-plan";

export type BankResultSpan = { start: number; end: number; unit?: string };
export type BankResultDescriptor = {
  fields?: Record<string, BankResultSpan[]>;
  optionalInputIds?: string[];
  closed?: {
    prompt: string;
    options: [string, string, string, string];
    answerSpans: { start: number; end: number }[];
    separator?: string;
  };
};

export const BANK_RESULT_ASSESSMENT_SUFFIX = "--result-v1";
export function bankAssessmentId(question: Pick<BankQuestion, "id" | "resultAssessment">) {
  return question.resultAssessment === "closed-v1" ? question.id + BANK_RESULT_ASSESSMENT_SUFFIX : question.id;
}
export function bankAssessmentBaseId(id: string) {
  return id.endsWith(BANK_RESULT_ASSESSMENT_SUFFIX) ? id.slice(0, -BANK_RESULT_ASSESSMENT_SUFFIX.length) : id;
}

function selectedText(answerText: string, span: { start: number; end: number }) {
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > answerText.length) throw new Error("Invalid result descriptor span");
  const result = answerText.slice(span.start, span.end).trim();
  if (!result) throw new Error("Empty result descriptor span");
  return result;
}

function readOnlyInline(nodes: BankNativeInline[]): BankNativeInline[] {
  return nodes.map(node => node.type === "blank" ? { type: "text", value: "□" } : node.type === "fraction"
    ? { ...node, numerator: readOnlyInline(node.numerator), denominator: readOnlyInline(node.denominator) } : node);
}

function readOnlyContext(question: BankQuestion): BankNativeBlock[] {
  if (!question.native) return [{ type: "paragraph", content: [{ type: "text", value: question.prompt }] }];
  return question.native.blocks.flatMap((block): BankNativeBlock[] => {
    if (block.type === "response") return [];
    if (block.type === "drawing") return [{ type: "diagram", viewBox: block.viewBox, label: block.label, shapes: block.shapes }];
    if (block.type === "paragraph") return [{ ...block, content: readOnlyInline(block.content) }];
    if (block.type === "table") return [{ ...block, rows: block.rows.map(row => row.map(readOnlyInline)) }];
    return [block];
  });
}

/** The descriptor stores source positions, never an answer index or answer key.
 * A choice is identified only against the authenticated private teacher text. */
export function applyBankResultDescriptor(question: BankQuestion, answer: BankPrivateAnswer, descriptor: BankResultDescriptor): { question: BankQuestion; plan: BankResultPlan } {
  if (descriptor.closed) {
    const closed = descriptor.closed;
    if (!closed.prompt.trim() || closed.options.length !== 4 || closed.options.some(option => !option.trim()) || new Set(closed.options.map(normalizeBankAnswer)).size !== 4 || !closed.answerSpans.length) throw new Error("Invalid closed-result descriptor");
    const wanted = closed.answerSpans.map(span => selectedText(answer.answerText, span)).join(closed.separator ?? "");
    const matches = closed.options.flatMap((option, index) => normalizeBankAnswer(option) === normalizeBankAnswer(wanted) ? [index] : []);
    if (matches.length !== 1) throw new Error("Closed-result descriptor does not identify exactly one option");
    const letters = ["A", "B", "C", "D"];
    const fieldId = "result-choice";
    const changed: BankQuestion = { ...question, resultAssessment: "closed-v1", resultInputIds: [fieldId],
      inputs: [{ id: fieldId, label: "选择正确答案", kind: "choice", choices: letters }],
      native: { version: 1, blocks: [
        { type: "heading", text: "题目情境" }, ...readOnlyContext(question),
        { type: "heading", text: "请选择正确答案" },
        { type: "paragraph", content: [{ type: "text", value: closed.prompt }] },
        ...closed.options.map((option, index): BankNativeBlock => ({ type: "paragraph", content: [{ type: "text", value: `${letters[index]}. ${option}` }] })),
        { type: "response", fieldId },
      ] } };
    return { question: changed, plan: { ready: true, assessment: "closed-v1", rules: [{ id: fieldId, expected: [letters[matches[0]]] }], resultInputIds: [fieldId], optionalInputIds: [] } };
  }
  const ids = new Set(question.inputs.map(field => field.id));
  const optional = new Set(descriptor.optionalInputIds ?? []);
  if ([...optional].some(id => !ids.has(id))) throw new Error("Unknown optional working field");
  const rules = new Map(answer.rules.filter(rule => !optional.has(rule.id)).map(rule => [rule.id, { ...rule, expected: [...rule.expected] }]));
  for (const [id, spans] of Object.entries(descriptor.fields ?? {})) {
    if (!ids.has(id) || optional.has(id) || !spans.length) throw new Error("Invalid described result field");
    const parts = spans.map(span => {
      const expected = selectedText(answer.answerText, span);
      if (bankExactNumber(expected) === null) throw new Error("Described result is not a complete numeric literal");
      return { expected, ...(span.unit ? { unit: span.unit } : {}) };
    });
    const rule: BankRule = parts.length === 1
      ? { id, expected: [parts[0].expected], numeric: true, ...(parts[0].unit ? { unit: parts[0].unit } : {}) }
      : { id, expected: [parts.map(part => part.expected).join("；")], resultParts: parts };
    rules.set(id, rule);
  }
  if (!rules.size || question.inputs.some(field => !optional.has(field.id) && (!rules.has(field.id) || field.kind === "drawing")) || [...rules.keys()].some(id => !ids.has(id))) throw new Error("Result descriptor leaves an unassessed final outcome");
  const ordered = question.inputs.flatMap(field => rules.has(field.id) ? [rules.get(field.id)!] : []);
  const counts = Object.fromEntries(ordered.filter(rule => rule.resultParts).map(rule => [rule.id, rule.resultParts!.length]));
  return { question: { ...question, ...(Object.keys(counts).length ? { resultPartCounts: counts } : {}) }, plan: { ready: true, rules: ordered, resultInputIds: ordered.map(rule => rule.id), optionalInputIds: [...optional] } };
}

/** Pair fraction blanks by the displayed fraction node, never by field order. */
export function bankFractionGroups(question: BankQuestion, plan: BankResultPlan) {
  const known = new Set(plan.resultInputIds), pairs: { numeratorId: string; denominatorId: string }[] = [];
  const blank = (nodes: BankNativeInline[]) => nodes.length === 1 && nodes[0].type === "blank" ? nodes[0].fieldId : null;
  const visit = (nodes: BankNativeInline[]) => {
    for (const node of nodes) if (node.type === "fraction") {
      const numeratorId = blank(node.numerator), denominatorId = blank(node.denominator);
      if (numeratorId && denominatorId && known.has(numeratorId) && known.has(denominatorId)) pairs.push({ numeratorId, denominatorId });
      visit(node.numerator); visit(node.denominator);
    }
  };
  for (const block of question.native?.blocks ?? []) {
    if (block.type === "paragraph") visit(block.content);
    if (block.type === "table") block.rows.forEach(row => row.forEach(visit));
  }
  return pairs;
}
