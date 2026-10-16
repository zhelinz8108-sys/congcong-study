import "server-only";
import answers from "@/data/english-final-review-answers.json";
import content from "@/data/english-final-review-content.json";
import type { EnglishLockedAnswer, EnglishLockedFeedback } from "@/lib/english-locked-types";

type AnswerBank = Record<string, Record<string, string | string[]>>;
const bank = answers as { choices: AnswerBank; fills: AnswerBank };
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[.?!,，。！？\s]/g, "");

export function finalReviewQuestionIds(): string[] {
  return ([['choice', bank.choices], ['fill', bank.fills]] as const).flatMap(([kind, sections]) =>
    Object.entries(sections).flatMap(([documentId, questions]) => Object.keys(questions).map(key => `${kind}:${documentId}:${key}`)));
}

/** Input counts only; answer text never crosses the server/client boundary. */
export function finalReviewFieldCounts(): Record<string, number> {
  return Object.fromEntries(Object.entries(bank.fills).flatMap(([documentId, questions]) =>
    Object.entries(questions).map(([key, value]) => [`fill:${documentId}:${key}`, Array.isArray(value) ? value.length : 1])));
}

export function gradeFinalReviewLocked(id: string, response: EnglishLockedAnswer): EnglishLockedFeedback {
  const match = /^(choice|fill):(.+):(\d+):([^:]+)$/.exec(id);
  if (!match) throw new Error("题目编号不正确");
  const [, kind, documentId, section, number] = match;
  const document = content.documents.find(d => d.id === documentId);
  if (!document?.sections[Number(section)] || !/^\d+$/.test(number)) throw new Error("期末复习题目不存在");
  const raw = (kind === "choice" ? bank.choices : bank.fills)[documentId]?.[`${section}:${number}`];
  if (raw === undefined) throw new Error("这道题暂未配套答案，不能作为测评题提交");
  const expected = Array.isArray(raw) ? raw : [raw];
  if (kind === "choice") {
    if (typeof response !== "string" || !/^[A-G]$/.test(response)) throw new Error("请选择有效选项");
    return { correct: response === expected[0], answer: expected[0], explanation: "请结合本题语境和相应语法知识核对。" };
  }
  if (!Array.isArray(response) || response.length !== expected.length || response.some(value => typeof value !== "string" || !value.trim() || value.length > 2000)) throw new Error("请完成所有空后提交");
  const correct = response.every((value, index) => {
    // A slash or “或” in one answer position denotes accepted alternatives;
    // separate array elements always denote separate original blanks.
    return expected[index].split(/\s*(?:\||\s或\s|\s\/\s)\s*/).some(answer => normalize(answer) === normalize(value));
  });
  return { correct, answer: expected.join(" / "), explanation: "各项按原题空位顺序核对；答案已经锁定。" };
}
