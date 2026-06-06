import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalQuestionSourceFile } from "@/lib/math-local-store";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string; index: string }> }
) {
  const { setId, index } = await params;
  const kind = request.nextUrl.searchParams.get("kind") === "answer" ? "answer" : "source";
  const file = await getLocalQuestionSourceFile(setId, kind, Number(index));

  if (!file) {
    return NextResponse.json({ error: "原始文件不存在" }, { status: 404 });
  }

  const buffer = await readFile(file.fullPath);
  const ext = path.extname(file.filename).toLowerCase();
  const disposition = ext === ".pdf" ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(
        file.filename
      )}`,
      "Cache-Control": "no-store",
    },
  });
}
