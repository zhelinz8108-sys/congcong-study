import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankFailure, bankHeaders } from "@/server/grade6-bank/http";
import { getBankQuestion, readBankImage } from "@/server/grade6-bank/bank";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ questionId: string; index: string }> }) {
  const denied = bankAccess(request); if (denied) return denied;
  try {
    const { questionId, index } = await context.params, q = await getBankQuestion(questionId);
    if (!q || !/^\d{1,2}$/.test(index) || !q.questionImages[Number(index)]) return new NextResponse(null, { status: 404 });
    const image = await readBankImage(q.questionImages[Number(index)], "public");
    return new NextResponse(new Uint8Array(image.bytes), { headers: { ...bankHeaders, "Content-Type": image.mime, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return bankFailure(error); }
}
