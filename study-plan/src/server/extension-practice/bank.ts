import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { decryptEnglishSixKnowledge } from "@/server/english-six-knowledge-envelope";
import type { BankQuestion, BankCollection, BankFeedback, BankManifest } from "@/lib/grade6-bank-types";
import { gradeBankFinalAnswers, normalizeBankAnswer, type BankPrivateAnswer } from "@/lib/grade6-bank-grader";

export type ExtensionSubject = "math" | "english";
export type ExtensionPrivateRow = { id: string; accepted: string[]; numeric: boolean; unit?: string; topic?: string; explanation: string; answerText: string };
type PublicRelease = { version: 1; subject: ExtensionSubject; manifest: BankManifest; questions: BankQuestion[] };
type PrivateRelease = { version: 1; subject: ExtensionSubject; publicDigest: string; answers: ExtensionPrivateRow[] };
const releaseCache = new Map<ExtensionSubject, Promise<PublicRelease>>();
const answerCache = new Map<ExtensionSubject, Promise<Map<string, ExtensionPrivateRow>>>();
export function extensionSubject(raw: unknown): ExtensionSubject | null { return raw === "math" || raw === "english" ? raw : null; }
function root(subject: ExtensionSubject) { return path.join(process.cwd(), "content", `${subject}-extension`); }
export function isExtensionQuestion(subject: ExtensionSubject, id: string) { return new RegExp(`^${subject === "math" ? "MX" : "EX"}-[0-7]-[0-9]{3}$`).test(id); }
function release(subject: ExtensionSubject) {
  let pending = releaseCache.get(subject);
  if (!pending) {
    pending = readFile(path.join(root(subject), "questions.public.json"), "utf8").then(raw => {
      const data = JSON.parse(raw) as PublicRelease;
      const expected = subject === "math" ? 800 : 1200;
      if (data.version !== 1 || data.subject !== subject || data.manifest.total !== expected || data.manifest.collections.length !== 8 || data.questions.length !== expected || new Set(data.questions.map(q => q.id)).size !== expected || data.questions.some(q => !isExtensionQuestion(subject, q.id))) throw new Error("拓展题库版本不完整");
      return data;
    });
    releaseCache.set(subject, pending);
  }
  return pending;
}
export async function extensionManifest(subject: ExtensionSubject) { return (await release(subject)).manifest; }
export async function extensionCollection(subject: ExtensionSubject, id: string): Promise<BankCollection | undefined> { return (await extensionManifest(subject)).collections.find(c => c.id === id); }
export async function extensionQuestion(subject: ExtensionSubject, id: string): Promise<BankQuestion | undefined> {
  const row = isExtensionQuestion(subject, id) ? (await release(subject)).questions.find(q => q.id === id) : undefined;
  if (!row) return undefined;
  // Explicit projection: future authoring fields must not enter question APIs.
  return { id: row.id, collectionId: row.collectionId, number: row.number, chapter: row.chapter,
    originalNumber: row.originalNumber, sourceName: row.sourceName, sourcePage: row.sourcePage,
    topic: row.topic, difficulty: row.difficulty, kind: row.kind, prompt: row.prompt,
    questionImages: [], inputs: row.inputs.map(field => ({ id: field.id, label: field.label,
      kind: field.kind, ...(field.choices ? { choices: [...field.choices] } : {}) })), resultInputIds: ["answer"] };
}
async function answers(subject: ExtensionSubject) {
  let pending = answerCache.get(subject);
  if (!pending) {
    pending = (async () => {
      const [publicRaw, encrypted] = await Promise.all([readFile(path.join(root(subject), "questions.public.json"), "utf8"), readFile(path.join(root(subject), "answers.encrypted.json"), "utf8")]);
      const data = decryptEnglishSixKnowledge(JSON.parse(encrypted), process.env.HOLIDAY_MATH_700_KEY?.trim() ?? "") as PrivateRelease;
      const pub = await release(subject);
      if (data.version !== 1 || data.subject !== subject || data.publicDigest !== createHash("sha256").update(publicRaw).digest("hex") || data.answers.length !== pub.questions.length || new Set(data.answers.map(row => row.id)).size !== data.answers.length || data.answers.some(row => !pub.questions.some(q => q.id === row.id) || !row.accepted.length || !row.explanation.trim())) throw new Error("拓展答案与题目不匹配");
      return new Map(data.answers.map(row => [row.id, row]));
    })();
    answerCache.set(subject, pending);
  }
  return pending;
}
function normalizeMathText(value: string) { return normalizeBankAnswer(value).replace(/[∶：]/g, ":").replace(/[°º]/g, "度"); }
function normalizeEnglish(value: string) { return value.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[‐‑]/g, "-").replace(/\s*,\s*/g, ",").trim().replace(/\s+/g, " ").replace(/[.?!。？！]+$/, "").toLowerCase(); }
/** Called only after validating a full submission or authorizing saved feedback. */
export async function extensionFeedback(subject: ExtensionSubject, id: string, values: Record<string, string>): Promise<BankFeedback> {
  const row = (await answers(subject)).get(id);
  if (!row) throw new Error("拓展答案缺失");
  const privateAnswer: BankPrivateAnswer = { id, answerText: row.answerText, answerImages: [], answerStatus: "verified_native", reviewRequired: false, rules: [{ id: "answer", expected: row.accepted, numeric: row.numeric, ...(row.unit ? { unit: row.unit } : {}) }] };
  const graded = gradeBankFinalAnswers(privateAnswer, values, privateAnswer.rules);
  const correct = subject === "english" ? row.accepted.some(value => normalizeEnglish(value) === normalizeEnglish(values.answer ?? "")) : row.numeric ? graded.outcome === "correct" : row.accepted.some(value => normalizeMathText(value) === normalizeMathText(values.answer ?? ""));
  return { questionId: id, outcome: correct ? "correct" : "incorrect", score: correct ? 1 : 0, maxScore: 1, message: "", answerText: row.answerText, answerImages: [], fields: [{id:"answer", correct}], detailedSolution: {
    id, thought: subject === "math" ? "结合题目条件，逐步核对本题的关键关系。" : `${row.topic ? `本题考查：${row.topic}。` : ""}结合语境、语法和固定搭配，确定符合题意的答案。`, steps: [{title:"分析与解答", content:row.explanation, fieldIds:["answer"]}, {title:"正确答案",content:row.answerText,fieldIds:["answer"]}], answerSummary:row.answerText, pitfalls:[subject === "math" ? "先确认单位、比较标准及题目要求的量，再填写最终结果。" : "结合上下文判断词义、时态和搭配；注意题干给出的词形与词数要求。"],
  }};
}
