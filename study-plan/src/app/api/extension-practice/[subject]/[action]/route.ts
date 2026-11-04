import { NextRequest } from "next/server";
import { extensionRead, extensionWrite } from "@/server/extension-practice/http";
export const dynamic = "force-dynamic";
type Context = {params:Promise<{subject:string; action:string}>};
export async function GET(request:NextRequest,context:Context) { const {subject,action}=await context.params; return extensionRead(request,subject,action); }
export async function POST(request:NextRequest,context:Context) { const {subject,action}=await context.params; return extensionWrite(request,subject,action); }
export async function PUT(request:NextRequest,context:Context) { const {subject,action}=await context.params; return extensionWrite(request,subject,action); }
