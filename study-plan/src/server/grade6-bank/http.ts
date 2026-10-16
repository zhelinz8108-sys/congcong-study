import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { holidayAccess, holidayBody, holidayHeaders } from "@/server/holiday-math-700/http";
import type { BankAnswers, BankQuestion } from "@/lib/grade6-bank-types";
import { assertBankDrawing } from "@/lib/grade6-bank-native-validation";
import { bankNativeInputSchema } from "@/lib/grade6-bank-input-schema";
import { isRetiredBankQuestion } from "./bank";

export const bankHeaders = holidayHeaders;
export function bankRetired(id: unknown) {
  return typeof id === "string" && isRetiredBankQuestion(id)
    ? NextResponse.json({ error: "这道重复题已移出题库，原作答记录已保留。请返回目录继续练习。", code: "QUESTION_RETIRED" }, { status: 410, headers: bankHeaders })
    : null;
}
export function bankAccess(request: NextRequest, write = false) {
  const qa = request.headers.get("x-grade6-qa");
  if (qa && (qa !== "isolated-memory-v1" || process.env.NODE_ENV === "production" || process.env.GRADE6_BANK_TEST_MEMORY !== "1")) return NextResponse.json({ error: "Isolated test memory required" }, { status: 403, headers: bankHeaders });
  return holidayAccess(request, write);
}
export const bankBody = holidayBody;
export function bankProfile(request: NextRequest) {
  return parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
}
export function bankSubject(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error("请选择有效的学科");
  return value;
}
/** Reject a pre-migration browser before it can canonicalize an old aggregate
 * into the first native blank. This token is public, not a write credential. */
export function bankInputSchema(value: unknown, question: BankQuestion) {
  if (question.native && value !== bankNativeInputSchema(question)) throw new Error("提交字段已更新，请刷新页面后重新填写本题");
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
    if (field.kind === "drawing" && answer.trim()) {
      const block = question.native?.blocks.find((block) => block.type === "drawing" && block.fieldId === field.id);
      try {
        if (block?.type !== "drawing") throw new Error("Missing drawing canvas");
        assertBankDrawing(answer, block.viewBox);
      }
      catch { throw new Error("提交格式不正确，请检查绘图内容"); }
    }
    result[field.id] = answer.trim();
  }
  return result;
}
export function bankFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safe = /^(请选择有效|请填写|请先完成|请选择题目|提交字段|提交内容|提交格式)/.test(message);
  return NextResponse.json({ error: safe ? message : "题库服务暂时不可用，作答仍保留在本机，请稍后重试。" }, { status: safe ? 400 : 503, headers: bankHeaders });
}
