import "server-only";
import { createHash } from "node:crypto";
import { sixDocumentPlan, readerLayout, type ReaderNode } from "@/lib/english-six-document";
import type { SixBankQuestion } from "@/lib/english-six-bank";
import { normalizeSixBankAnswer, sixBankInputs } from "@/lib/english-six-bank";
import { sixQuestionBlanks } from "@/lib/english-six-answer";
import type { SixFeedback, SixPage } from "@/lib/english-six";
import { englishSixResource } from "./english-six";

type Source = { page: number; block: number };
type Exercise = SixBankQuestion & { answer: string; explanation: string; accepted: string[][]; choice?: string; sources: Source[] };
type Candidate = { number: number; prompt: string; optionText: string; instruction: string; topic: string; sources: Source[] };
type Key = { number: number; text: string; explanation: string };
type Plan = { exercises: Exercise[]; hidden: Source[]; unmatched: number };
const cache = new Map<string, Plan>();
const numbered = /^\s*(?:[（(]\s*[）)]\s*)?(\d+)[.、．)]\s*([\s\S]*)$/;
const answerHeading = (text: string) => /^(?:【|\[)?\s*(?:参考答案(?:[与及和](?:逐题|详细)?解析)?|答案(?:[与及和]解析)?|详细解析)\s*(?:】|\])?\s*[:：]?\s*$/.test(text);
const taskHeading = (text: string) => /小练笔|综合训练|易错精讲|复习小贴士/.test(text);
const source = (page: number, node: ReaderNode) => node.sources.map(block => ({ page, block }));

function answerEntries(nodes: ReaderNode[]): Key[] {
  const keys: Key[] = [];
  for (const node of nodes) {
    // Some PDFs place several short numbered answers in one extracted block.
    const matches = [...node.text.matchAll(/(?:^|\s)(\d{1,3})[.、．)]\s*/g)];
    if (matches.length && matches[0].index === 0) {
      matches.forEach((match, index) => {
        const text = node.text.slice(match.index! + match[0].length, matches[index + 1]?.index ?? node.text.length).trim();
        const [answer, ...explanation] = text.split(/(?:【解析】|解析\s*[:：])/);
        keys.push({ number: Number(match[1]), text: answer.trim(), explanation: explanation.join(" ").trim() });
      });
    } else if (keys.length && node.kind === "explanation") {
      keys[keys.length - 1].explanation += `${keys[keys.length - 1].explanation ? " " : ""}${node.text}`;
    } else if (keys.length && node.kind === "paragraph") {
      keys[keys.length - 1].text += ` ${node.text}`;
    }
  }
  return keys;
}

function exercise(resourceId: string, question: Candidate, key: Key): Exercise | undefined {
  const options = [...question.optionText.matchAll(/(?:^|\s)([A-F])[.．、)]\s*([\s\S]*?)(?=\s+[A-F][.．、)]\s*|$)/g)]
    .map(match => ({ id: match[1], text: match[2].trim() }));
  if (question.optionText && (options.length < 2 || new Set(options.map(o => o.id)).size !== options.length)) return;
  const choice = options.length ? /^([A-F])(?:\b|[.．、（(:：])/.exec(key.text)?.[1] : undefined;
  if (options.length && !options.some(option => option.id === choice)) return;
  const blanks = sixQuestionBlanks({ prompt: question.prompt }).length;
  const kind = options.length ? "choice" : blanks ? "fill" : "sentence";
  const parts = key.text.split(/[,，;；]/).map(s => s.trim());
  const exact = kind === "choice" || kind === "fill" && (blanks === 1 || parts.length === blanks);
  const accepted = kind === "choice" ? [[choice!]] : (blanks > 1 ? parts : [key.text]).map(part => part.split(/\s*\/\s*/).filter(Boolean));
  const first = question.sources[0];
  const digest = createHash("sha256").update(JSON.stringify([first, question.prompt, options, question.instruction])).digest("hex").slice(0, 12);
  return { id: `sr-${resourceId}-${digest}`, topic: question.topic, kind, prompt: question.prompt,
    context: question.instruction, options, sourcePage: first.page, sourceBlock: first.block,
    inputCount: options.length ? 1 : Math.max(1, blanks), grading: exact ? "exact" : "reference",
    answer: choice ?? key.text,
    explanation: key.explanation || `请结合“${question.topic || question.instruction}”的讲解核对本题。`,
    accepted, choice, sources: question.sources };
}

// Pair each exercise with its own following answer section. Repeated question
// numbers are matched in source order, and ambiguous groups are never guessed.
export function buildSixReaderPractice(resourceId: string, pages: SixPage[]): Plan {
  const result: Plan = { exercises: [], hidden: [], unmatched: 0 };
  if (!readerLayout(resourceId)) return result;
  let questions: Candidate[] = [], keys: ReaderNode[] = [], current: Candidate | undefined;
  let answering = false, instruction = "", topic: number | undefined;
  const finish = () => {
    const answers = answerEntries(keys);
    const aligned = answering && answers.length === questions.length && answers.every((key, i) => key.number === questions[i].number);
    if (aligned) questions.forEach((question, i) => {
      const item = exercise(resourceId, question, answers[i]);
      if (item) result.exercises.push(item); else result.unmatched++;
    });
    else if (answering) result.unmatched += questions.length;
    questions = []; keys = []; current = undefined; answering = false;
  };
  pages.forEach((page, p) => {
    const plan = sixDocumentPlan(resourceId, p + 1, page);
    for (const section of plan.sections) {
      if (section.topic && section.topic.number !== topic) { finish(); instruction = ""; topic = section.topic.number; }
      for (const node of section.nodes) {
        if (answerHeading(node.text)) {
          answering = true; current = undefined; result.hidden.push(...source(p + 1, node)); continue;
        }
        if (answering && node.kind === "subheading" && taskHeading(node.text)) { finish(); instruction = ""; }
        if (answering) { keys.push(node); result.hidden.push(...source(p + 1, node)); continue; }
        if (node.kind === "subheading") { instruction = node.text; current = undefined; continue; }
        const match = node.kind === "question" && numbered.exec(node.text);
        if (match) {
          current = { number: Number(match[1]), prompt: node.text, optionText: "", instruction,
            topic: section.topic?.title ?? instruction, sources: source(p + 1, node) };
          questions.push(current);
        } else if (current && node.kind === "options") {
          current.optionText += `${current.optionText ? "\n" : ""}${node.text}`;
          current.sources.push(...source(p + 1, node));
        } else if (current && node.kind === "paragraph") {
          current.prompt += ` ${node.text}`; current.sources.push(...source(p + 1, node));
        } else if (node.kind !== "caption") current = undefined;
      }
    }
  });
  finish();
  return result;
}

function practice(resourceId: string): Plan {
  if (!readerLayout(resourceId)) return { exercises: [], hidden: [], unmatched: 0 };
  if (process.env.NODE_ENV === "production" && cache.has(resourceId)) return cache.get(resourceId)!;
  const resource = englishSixResource(resourceId);
  const plan = resource ? buildSixReaderPractice(resourceId, resource.pages) : { exercises: [], hidden: [], unmatched: 0 };
  if (process.env.NODE_ENV === "production") cache.set(resourceId, plan);
  return plan;
}

export function englishSixReaderExercises(resourceId: string, page: number): SixBankQuestion[] {
  return practice(resourceId).exercises.filter(q => q.sourcePage === page).map(q => ({
    id: q.id, topic: q.topic, kind: q.kind, prompt: q.prompt, context: q.context,
    options: q.options, inputCount: q.inputCount, grading: q.grading,
    sourcePage: q.sourcePage, sourceBlock: q.sourceBlock,
  }));
}

export function englishSixReaderContent(resourceId: string, page: number, content: SixPage | null): SixPage | null {
  if (!content || !readerLayout(resourceId)) return content;
  const plan = practice(resourceId);
  const hidden = new Set([...plan.hidden, ...plan.exercises.flatMap(q => q.sources.slice(1))].filter(s => s.page === page).map(s => s.block));
  return { ...content, blocks: content.blocks.map((block, i) => hidden.has(i) ? { kind: "text", text: "" } : block) };
}

export function englishSixReaderGrade(id: string, response: string): SixFeedback | undefined {
  const match = /^sr-([a-f0-9]{12})-[a-f0-9]{12}$/.exec(id);
  if (!match || !response.trim() || response.length > 10000) return;
  const question = practice(match[1]).exercises.find(q => q.id === id);
  if (!question) return;
  const values = sixBankInputs(question, response);
  if (values.some(value => !value.trim()) || question.options.length && !question.options.some(option => option.id === response)) return;
  const correct = question.grading === "reference" ? null : question.choice ? response === question.choice :
    question.accepted.length === values.length && question.accepted.every((variants, i) => variants.some(answer => normalizeSixBankAnswer(answer) === normalizeSixBankAnswer(values[i])));
  return { id, response, answer: question.answer, explanation: question.explanation, correct };
}
