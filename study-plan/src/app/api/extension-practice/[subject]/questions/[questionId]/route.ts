import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankHeaders, bankFailure } from "@/server/grade6-bank/http";
import { extensionSubject, extensionQuestion, isRetiredExtensionQuestion } from "@/server/extension-practice/bank";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context:{params:Promise<{subject:string;questionId:string}>}) {
  const denied=bankAccess(request); if (denied) return denied;
  try {
    const {subject:rawSubject,questionId}=await context.params,subject=extensionSubject(rawSubject);
    const q=subject?await extensionQuestion(subject,questionId):undefined;
    if (!q && subject && await isRetiredExtensionQuestion(subject,questionId)) return NextResponse.json({error:"本题已更新，请进入新版选择题。旧作答记录已保留。"},{status:410,headers:bankHeaders});
    return q?NextResponse.json(q,{headers:bankHeaders}):NextResponse.json({error:"题目不存在"},{status:404,headers:bankHeaders});
  } catch(error) { return bankFailure(error); }
}
