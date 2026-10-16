import { NextResponse } from "next/server";
import { englishSixInteractiveIndex } from "@/server/english-six-practice";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(englishSixInteractiveIndex(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "六上资料尚未导入" }, { status: 503 }); }
}
