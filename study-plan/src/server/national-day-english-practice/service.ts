import "server-only";
import { englishPracticeBlock } from "./public-bank";
import { englishPracticePrivateAnswer } from "./private-bank";
import type {
  EnglishPracticeFeedback,
  EnglishPracticeLetter,
} from "@/lib/national-day-english-practice-types";

export class EnglishPracticeInputError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "EnglishPracticeInputError";
  }
}

export function gradeEnglishPracticeBlock(
  blockId: string,
  answers: unknown,
): EnglishPracticeFeedback {
  const block = englishPracticeBlock(blockId);
  if (!block) throw new EnglishPracticeInputError("题目不存在", 404);
  if (!answers || typeof answers !== "object" || Array.isArray(answers))
    throw new EnglishPracticeInputError("请选择所有题目的选项后提交");
  const entries = Object.entries(answers);
  const allowed = new Set(block.questions.map((question) => question.id));
  if (entries.length !== allowed.size || entries.some(([id]) => !allowed.has(id)))
    throw new EnglishPracticeInputError(block.kind === "cloze" ? "请完成这一篇完形填空的全部 5 空后提交" : "只接收这一题的选项");
  if (entries.some(([, value]) => typeof value !== "string" || !/^[ABCD]$/.test(value)))
    throw new EnglishPracticeInputError("请选择 A、B、C 或 D 后提交");
  const selected = answers as Record<string, EnglishPracticeLetter>;
  // Validate every requested item before accessing or returning the private bank.
  const results = block.questions.map((question) => {
    const key = englishPracticePrivateAnswer(question.id);
    if (!key || question.options["ABCD".indexOf(key.correctOption)] !== key.correctText)
      throw new Error("判题数据不完整");
    return {
      questionId: question.id,
      selected: selected[question.id],
      correct: selected[question.id] === key.correctOption,
      correctOption: key.correctOption,
      correctText: key.correctText,
      explanation: key.explanation,
    };
  });
  return {
    blockId,
    results,
    score: results.filter((result) => result.correct).length,
    maxScore: results.length,
  };
}
