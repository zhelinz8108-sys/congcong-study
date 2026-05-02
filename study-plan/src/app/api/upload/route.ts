import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { v4 as uuid } from "uuid";

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

  const ext = file.name.split(".").pop() || "";
  const filename = `${uuid()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from("study-uploads")
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: `上传失败: ${error.message}` }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("study-uploads")
    .getPublicUrl(filename);

  return NextResponse.json({
    file_path: urlData.publicUrl,
    file_type: getFileType(file.type),
    original_name: file.name,
  });
}
