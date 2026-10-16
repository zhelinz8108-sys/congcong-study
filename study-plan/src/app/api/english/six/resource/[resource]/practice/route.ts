import { NextResponse } from "next/server";
import { englishSixResourcePractice } from "@/server/english-six-practice";

export async function GET(_request: Request, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  const paper = englishSixResourcePractice(resource);
  return paper ? NextResponse.json(paper, { headers: { "Cache-Control": "private, no-store" } }) : new NextResponse("Not found", { status: 404 });
}
