import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankFailure, bankHeaders } from "@/server/grade6-bank/http";
import { getBankQuestion } from "@/server/grade6-bank/bank";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ questionId: string }> }) {
  const denied = bankAccess(request); if (denied) return denied;
  try {
    const { questionId } = await context.params, q = await getBankQuestion(questionId);
    if (!q) return NextResponse.json({ error: "题目不存在" }, { status: 404, headers: bankHeaders });
    return NextResponse.json({ ...q, questionImages: q.questionImages.map((_, index) => `/api/math/grade6-bank/questions/${encodeURIComponent(q.id)}/images/${index}`) }, { headers: bankHeaders });
  } catch (error) { return bankFailure(error); }
}
