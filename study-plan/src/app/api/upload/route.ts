import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { v4 as uuid } from "uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 250 * 1024 * 1024);

function getFileType(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "other";
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "没有上传文件" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > maxUploadBytes) {
    return NextResponse.json(
      { error: `文件大小必须在 1 字节到 ${Math.floor(maxUploadBytes / 1024 / 1024)}MB 之间` },
      { status: 413 },
    );
  }

  const rawExt = file.name.includes(".") ? file.name.split(".").pop() ?? "" : "";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  const filename = ext ? `${uuid()}.${ext}` : uuid();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await storage
    .from("study-uploads")
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: `上传失败: ${error.message}` }, { status: 500 });
  }

  const { data: urlData } = storage
    .from("study-uploads")
    .getPublicUrl(filename);

  return NextResponse.json({
    file_path: urlData.publicUrl,
    file_type: getFileType(file.type),
    original_name: file.name,
  });
}
