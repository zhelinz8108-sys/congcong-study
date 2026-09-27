import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getStorageFilePath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(
  _request: Request,
  context: RouteContext<"/api/files/[bucket]/[filename]">,
) {
  const { bucket, filename } = await context.params;

  try {
    const filePath = getStorageFilePath(bucket, filename);
    const [content, details] = await Promise.all([
      readFile(/*turbopackIgnore: true*/ filePath),
      stat(/*turbopackIgnore: true*/ filePath),
    ]);
    const contentType = contentTypes[path.extname(filename).toLowerCase()] ?? "application/octet-stream";

    return new Response(new Uint8Array(content), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(details.size),
        "Content-Type": contentType,
        "Last-Modified": details.mtime.toUTCString(),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }
}
