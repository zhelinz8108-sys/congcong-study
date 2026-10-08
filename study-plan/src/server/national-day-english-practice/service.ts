import "server-only";
import { englishPracticeBlock } from "./public-bank";
import { englishPracticePrivateAnswer } from "./private-bank";
import type {
  EnglishPracticeFeedback,
  EnglishPracticeLetter,
  EnglishPracticeQuestion,
  EnglishPracticeResult,
  EnglishPracticeSingleFeedback,
} from "@/lib/national-day-english-practice-types";

export class EnglishPracticeInputError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "EnglishPracticeInputError";
  }
}

function gradeValidatedQuestion(
  question: EnglishPracticeQuestion,
  selected: EnglishPracticeLetter,
): EnglishPracticeResult {
  const key = englishPracticePrivateAnswer(question.id);
  if (!key || question.options["ABCD".indexOf(key.correctOption)] !== key.correctText)
    throw new Error("判题数据不完整");
  return {
    questionId: question.id,
    selected,
    correct: selected === key.correctOption,
    correctOption: key.correctOption,
    correctText: key.correctText,
    explanation: key.explanation,
  };
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
  const results = block.questions.map((question) => gradeValidatedQuestion(question, selected[question.id]));
  return {
    blockId,
    results,
    score: results.filter((result) => result.correct).length,
    maxScore: results.length,
  };
}

/** Grade one fixed numbered item; sibling cloze blanks never enter this response. */
export function gradeEnglishPracticeQuestion(
  blockId: string,
  questionId: unknown,
  answers: unknown,
): EnglishPracticeSingleFeedback {
  const block = englishPracticeBlock(blockId);
  if (!block) throw new EnglishPracticeInputError("题目不存在", 404);
  if (typeof questionId !== "string" || !/^CH(?:0[1-9]|1\d|2[0-4])-Q(?:00[1-9]|0[1-9]\d|100)$/.test(questionId))
    throw new EnglishPracticeInputError("题目编号不正确");
  const question = block.questions.find((item) => item.id === questionId);
  if (!question) throw new EnglishPracticeInputError("题目不存在或不属于这一题组", 404);
  if (!answers || typeof answers !== "object" || Array.isArray(answers))
    throw new EnglishPracticeInputError("请选择这一题的选项后提交");
  const entries = Object.entries(answers);
  if (entries.length !== 1 || entries[0][0] !== questionId)
    throw new EnglishPracticeInputError("只接收当前这一题的选项");
  const selected = entries[0][1];
  if (typeof selected !== "string" || !/^[ABCD]$/.test(selected))
    throw new EnglishPracticeInputError("请选择 A、B、C 或 D 后提交");
  // All membership/shape/letter checks happen before accessing any private record.
  const result = gradeValidatedQuestion(question, selected as EnglishPracticeLetter);
  return {
    blockId,
    questionId,
    results: [result],
    score: result.correct ? 1 : 0,
    maxScore: 1,
  };
}

/** Preserve the original two-field full-block API and accept only the explicit three-field single-item API. */
export function gradeEnglishPracticeSubmission(raw: unknown): EnglishPracticeFeedback {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new EnglishPracticeInputError("提交格式不正确");
  const body = raw as Record<string, unknown>;
  const single = Object.hasOwn(body, "question_id");
  const allowed = single ? ["block_id", "question_id", "answers"] : ["block_id", "answers"];
  if (Object.keys(body).length !== allowed.length || Object.keys(body).some((key) => !allowed.includes(key)))
    throw new EnglishPracticeInputError(single ? "只接收题目组编号、当前题号和学生选项" : "只接收题目组编号和学生选项");
  if (typeof body.block_id !== "string" || !/^CH(?:0[1-9]|1\d|2[0-4])-B(?:00[1-9]|0[1-6]\d)$/.test(body.block_id))
    throw new EnglishPracticeInputError("题目不存在", 404);
  return single
    ? gradeEnglishPracticeQuestion(body.block_id, body.question_id, body.answers)
    : gradeEnglishPracticeBlock(body.block_id, body.answers);
}
