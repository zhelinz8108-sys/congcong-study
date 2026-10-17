import { NextRequest, NextResponse } from "next/server";
import { englishSixResourcePage } from "@/server/english-six";
import { englishSixPracticePlans } from "@/server/english-six-practice";
import { englishSixReaderContent, englishSixReaderExercises } from "@/server/english-six-reader-practice";
import { readerLayout } from "@/lib/english-six-document";
export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const result = englishSixResourcePage(resource, page);
  const practice = englishSixPracticePlans().get(resource);
  return result ? NextResponse.json({ ...result, asset: readerLayout(resource) ? null : result.asset, content: englishSixReaderContent(resource, page, result.content), meta: { ...result.meta, practice }, practiceCount: practice?.questionCount ?? 0,
    readerExercises: englishSixReaderExercises(resource, page) }, { headers: { "Cache-Control": "private, no-store" } }) : new NextResponse("Not found", { status: 404 });
}
