import "server-only";
import type { HolidayFeedback } from "@/lib/holiday-math-700-types";
import { gradeHolidayQuestion } from "@/lib/holiday-math-700-grader";
import { holidayQuestion } from "./public-bank";
import { holidayPrivateAnswer } from "./private-bank";

// Family learning is not an exam. Hint 1 can be requested before answering;
// hint 2 can be requested explicitly, never bundled into the question payload.
export function holidayHint(id: string, level: number) {
  if (!holidayQuestion(id)) throw new Error("题目不存在");
  if (level !== 1 && level !== 2) throw new Error("提示等级不正确");
  const record = holidayPrivateAnswer(id);
  if (!record) throw new Error("题目不存在");
  return { question_id: id, level, hint: record.hints[level - 1] };
}
export function checkHolidayAnswer(
  id: string,
  student: unknown,
): HolidayFeedback {
  const question = holidayQuestion(id);
  if (!question) throw new Error("题目不存在");
  const record = holidayPrivateAnswer(id);
  if (!record) throw new Error("题目不存在");
  const result = gradeHolidayQuestion(question, record.answer, student);
  return {
    question_id: id,
    ...result,
    solution: record.solution,
    choice_rationales: record.choice_rationales,
    common_mistakes: record.common_mistakes,
  };
}
