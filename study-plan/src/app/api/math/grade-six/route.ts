import { NextRequest, NextResponse } from "next/server";
import { holidayAccess, holidayBody, holidayHeaders } from "@/server/holiday-math-700/http";
import { bankProfile } from "@/server/grade6-bank/http";
import { firstSubmissions, saveFirstSubmission } from "@/server/first-submission";
import { MATH_GRADE_SIX_ALL_QUESTIONS, MATH_GRADE_SIX_QUESTIONS_BY_UNIT } from "@/lib/math-grade-six-question-bank";
const SCOPE = "math:grade-six:v1";
export const dynamic = "force-dynamic";
type Feedback = { answerIndex: number; explanation: string; isCorrect: boolean };
export async function GET(request: NextRequest) {
  const denied = holidayAccess(request); if (denied) return denied;
  try {
    const records = await firstSubmissions<number, Feedback>(bankProfile(request).id, SCOPE);
    const units = Object.fromEntries(Object.entries(MATH_GRADE_SIX_QUESTIONS_BY_UNIT).map(([unit, rows]) => [unit, rows.map(q => { const { answerIndex: _answer, explanation: _explanation, ...publicQuestion } = q; void _answer; void _explanation; return publicQuestion; })]));
    return NextResponse.json({ units, attempts: Object.fromEntries(Object.entries(records).map(([id, r]) => [id, { value: r.answer, feedback: r.feedback }])) }, { headers: holidayHeaders });
  } catch { return NextResponse.json({ error: "学习记录暂不可用" }, { status: 503, headers: holidayHeaders }); }
}
export async function POST(request: NextRequest) {
  const denied = holidayAccess(request, true); if (denied) return denied;
  try {
    const body = await holidayBody(request);
    if (Object.keys(body).some(k => !["question_id", "value"].includes(k))) throw new Error("提交字段不正确");
    const q = MATH_GRADE_SIX_ALL_QUESTIONS.find(q => q.id === body.question_id);
    if (!q) return NextResponse.json({ error: "题目不存在" }, { status: 404, headers: holidayHeaders });
    if (typeof body.value !== "number" || !Number.isInteger(body.value) || body.value < 0 || body.value >= q.options.length) throw new Error("请选择有效的选项");
    const saved = await saveFirstSubmission<number, Feedback>(bankProfile(request).id, SCOPE, q.id, body.value, value => ({ answerIndex: q.answerIndex, explanation: q.explanation, isCorrect: q.answerIndex === value }));
    return NextResponse.json({ value: saved.answer, feedback: saved.feedback, locked: true }, { headers: holidayHeaders });
  } catch (error) { const message = error instanceof Error ? error.message : ""; const safe = /^(提交字段|请选择)/.test(message); return NextResponse.json({ error: safe ? message : "提交失败，请稍后重试" }, { status: safe ? 400 : 503, headers: holidayHeaders }); }
}
