import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { bankAccess, bankBody, bankFailure, bankHeaders, bankInputSchema, bankProfile, bankStudentAnswers, bankSubject } from "@/server/grade6-bank/http";
import { bankBaseRevision, bankProgress, bankResponse, BankRevisionConflict, saveBankResponse, bankIsIsolatedTestMemory } from "@/server/grade6-bank/progress";
import { extensionQuestion, extensionSubject, extensionFeedback, extensionManifest } from "./bank";

export async function extensionRead(request: NextRequest, rawSubject: string, action: string) {
  const denied = bankAccess(request); if (denied) return denied;
  const subject = extensionSubject(rawSubject);
  if (!subject || !["progress", "feedback"].includes(action)) return NextResponse.json({error:"页面不存在"},{status:404,headers:bankHeaders});
  try {
    const subjectId = bankSubject(request.nextUrl.searchParams.get("subject_id")), studentId = bankProfile(request).id;
    if (action === "progress") {
      const progress = await bankProgress(studentId, subjectId);
      // Keep historical attempts stored; expose only IDs in the active release.
      const currentIds = new Set((await extensionManifest(subject)).collections.flatMap(collection=>collection.questions.map(question=>question.id)));
      return NextResponse.json({...progress, responses:Object.fromEntries(Object.entries(progress.responses).filter(([id])=>currentIds.has(id))), lastQuestionId:currentIds.has(progress.lastQuestionId)?progress.lastQuestionId:""}, {headers:{...bankHeaders,...(bankIsIsolatedTestMemory()?{"X-Grade6-QA-Memory":"isolated"}:{})}});
    }
    const id = request.nextUrl.searchParams.get("question_id") ?? "";
    if (!await extensionQuestion(subject,id)) return NextResponse.json({error:"题目不存在"},{status:404,headers:bankHeaders});
    const response = await bankResponse(studentId,subjectId,id);
    if (!response || !response.submitted && response.submissions < 1) return NextResponse.json({error:"请先提交本题"},{status:403,headers:bankHeaders});
    return NextResponse.json({response,feedback:await extensionFeedback(subject,id,response.answers)},{headers:bankHeaders});
  } catch(error) { return bankFailure(error); }
}
export async function extensionWrite(request: NextRequest, rawSubject: string, action: string) {
  const denied = bankAccess(request,true); if (denied) return denied;
  const subject=extensionSubject(rawSubject);
  if (!subject || !["draft","submit"].includes(action) || request.method !== (action==="draft"?"PUT":"POST")) return NextResponse.json({error:"请求不正确"},{status:405,headers:bankHeaders});
  try {
    const body=await bankBody(request);
    if (Object.keys(body).some(key=>!["subject_id","question_id","answers","base_revision","input_schema"].includes(key))) throw new Error("提交字段不正确");
    const revision=bankBaseRevision(body.base_revision),subjectId=bankSubject(body.subject_id);
    const q=typeof body.question_id === "string" ? await extensionQuestion(subject,body.question_id):undefined;
    if (!q) return NextResponse.json({error:"题目不存在"},{status:404,headers:bankHeaders});
    bankInputSchema(body.input_schema,q);
    const values=bankStudentAnswers(body.answers,q,action==="submit");
    const feedback=action==="submit"?await extensionFeedback(subject,q.id,values):undefined;
    const response=await saveBankResponse(bankProfile(request).id,subjectId,q.id,values,revision,feedback);
    return NextResponse.json(feedback?{response,feedback}:response,{headers:bankHeaders});
  } catch(error) {
    if (error instanceof BankRevisionConflict) return NextResponse.json({error:error.message,response:error.response},{status:409,headers:bankHeaders});
    return bankFailure(error);
  }
}
