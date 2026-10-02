import "server-only";
import day1 from "@/data/national-day-math-grading-day1.json";
import day2 from "@/data/national-day-math-grading-day2.json";
import day3 from "@/data/national-day-math-grading-day3.json";
import { NATIONAL_DAY_MATH_SECTIONS } from "@/lib/national-day-math";
import type { NationalDayMathQuestion, NationalDayMathSubmissionResult } from "@/lib/national-day-math";
import { gradeNationalDayMathFields, toPublicNationalDayMathSections } from "@/lib/national-day-math-grader";
import type { NationalDayMathRubrics } from "@/lib/national-day-math-grader";

const rubrics = { ...day1, ...day2, ...day3 } as NationalDayMathRubrics;
const quizzes = new Map(NATIONAL_DAY_MATH_SECTIONS.flatMap(section => section.blocks)
  .filter((block): block is NationalDayMathQuestion => block.type === "quiz")
  .map(question => [question.id, question]));

export function getPublicNationalDayMathSections() {
  return toPublicNationalDayMathSections(NATIONAL_DAY_MATH_SECTIONS, rubrics);
}

export function hasNationalDayMathQuestion(questionId: string) {
  return quizzes.has(questionId);
}

export function submitNationalDayMath(questionId: string, answers: unknown): NationalDayMathSubmissionResult {
  const question = quizzes.get(questionId);
  if (!question) throw new Error("这道自测题不存在。");
  const result = gradeNationalDayMathFields(rubrics[questionId].fields, answers);
  return {
    questionId, ...result, answer: question.answer, steps: question.steps,
    ...(question.pitfall ? { pitfall: question.pitfall } : {}),
  };
}
