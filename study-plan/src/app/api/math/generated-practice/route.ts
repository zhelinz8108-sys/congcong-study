import { NextRequest, NextResponse } from "next/server";
import { holidayAccess, holidayBody, holidayHeaders } from "@/server/holiday-math-700/http";
import { bankProfile } from "@/server/grade6-bank/http";
import { firstSubmissions, saveFirstSubmission } from "@/server/first-submission";
import { generateMathQuestions, gradeGeneratedMathQuestion, type MathGeneratedDifficulty } from "@/lib/math-generated-practice";
const SCOPE = "math:generated:v1";
export const dynamic = "force-dynamic";
type Feedback = { answer: string; explanation: string; isCorrect: boolean; wrongReason: string };
function params(unit: string, difficulty: string) {
  if (!/^unit-[1-8]$/.test(unit) || !["medium", "hard", "super"].includes(difficulty)) throw new Error("请选择有效的单元与难度");
  return generateMathQuestions(unit, difficulty as MathGeneratedDifficulty, 100);
}
export async function GET(request: NextRequest) {
  const denied = holidayAccess(request); if (denied) return denied;
  try {
    const questions = params(request.nextUrl.searchParams.get("unit") ?? "", request.nextUrl.searchParams.get("difficulty") ?? "");
    const records = await firstSubmissions<string, Feedback>(bankProfile(request).id, SCOPE);
    const ids = new Set(questions.map(q => q.id));
    const attempts = Object.fromEntries(Object.entries(records).filter(([id]) => ids.has(id)).map(([id, r]) => [id, { value: r.answer, isCorrect: r.feedback.isCorrect, feedback: r.feedback }]));
    return NextResponse.json({ questions: questions.map(q => { const { answer: _answer, acceptableAnswers: _accepted, explanation: _explanation, wrongReasons: _wrong, ...question } = q; void _answer; void _accepted; void _explanation; void _wrong; return question; }), attempts }, { headers: holidayHeaders });
  } catch { return NextResponse.json({ error: "学习记录暂不可用" }, { status: 503, headers: holidayHeaders }); }
}
export async function POST(request: NextRequest) {
  const denied = holidayAccess(request, true); if (denied) return denied;
  try {
    const body = await holidayBody(request);
    if (Object.keys(body).some(k => !["question_id", "value"].includes(k))) throw new Error("提交字段不正确");
    const match = typeof body.question_id === "string" ? body.question_id.match(/^(unit-[1-8])-(medium|hard|super)-(100|[1-9]\d?)$/) : null;
    if (!match) return NextResponse.json({ error: "题目不存在" }, { status: 404, headers: holidayHeaders });
    if (typeof body.value !== "string" || !body.value.trim() || body.value.length > 3000) throw new Error("请填写答案");
    const question = params(match[1], match[2])[Number(match[3]) - 1];
    const saved = await saveFirstSubmission<string, Feedback>(bankProfile(request).id, SCOPE, question.id, body.value.trim(), value => ({ answer: question.answer, explanation: question.explanation, isCorrect: gradeGeneratedMathQuestion(question, value), wrongReason: question.wrongReasons?.[value] ?? "这个答案没有满足题干条件。" }));
    return NextResponse.json({ value: saved.answer, isCorrect: saved.feedback.isCorrect, feedback: saved.feedback, locked: true }, { headers: holidayHeaders });
  } catch (error) { const message = error instanceof Error ? error.message : ""; const safe = /^(提交字段|请填写)/.test(message); return NextResponse.json({ error: safe ? message : "提交失败，请稍后重试" }, { status: safe ? 400 : 503, headers: holidayHeaders }); }
}
