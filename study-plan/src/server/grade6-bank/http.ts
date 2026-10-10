import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { holidayAccess, holidayBody, holidayHeaders } from "@/server/holiday-math-700/http";
import type { BankAnswers, BankQuestion } from "@/lib/grade6-bank-types";

export const bankHeaders = holidayHeaders;
export const bankAccess = holidayAccess;
export const bankBody = holidayBody;
export function bankProfile(request: NextRequest) {
  return parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
}
export function bankSubject(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error("请选择有效的学科");
  return value;
}
export function bankStudentAnswers(value: unknown, question: BankQuestion, submitting: boolean): BankAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请填写作答内容");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((id) => !question.inputs.some((field) => field.id === id))) throw new Error("提交字段不正确");
  const result: BankAnswers = {};
  for (const field of question.inputs) {
    const answer = input[field.id] ?? "";
    if (typeof answer !== "string" || answer.length > 3000) throw new Error("提交内容过长或格式不正确");
    if (submitting && !answer.trim()) throw new Error("请先完成每一项作答，再提交");
    if (field.kind === "choice" && answer && !field.choices?.includes(answer)) throw new Error("请选择题目提供的选项");
    result[field.id] = answer.trim();
  }
  return result;
}
export function bankFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safe = /^(请选择有效|请填写|请先完成|请选择题目|提交字段|提交内容|提交格式)/.test(message);
  return NextResponse.json({ error: safe ? message : "题库服务暂时不可用，作答仍保留在本机，请稍后重试。" }, { status: safe ? 400 : 503, headers: bankHeaders });
}
