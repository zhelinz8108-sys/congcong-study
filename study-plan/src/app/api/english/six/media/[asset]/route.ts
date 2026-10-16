import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken } from "@/lib/family-access";
import { englishSixAsset } from "@/server/english-six";

const types: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };
export async function GET(request: NextRequest, context: { params: Promise<{ asset: string }> }) {
  if (!verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value).allowed) return new NextResponse("Unauthorized", { status: 401 });
  const { asset } = await context.params;
  const data = englishSixAsset(asset);
  if (!data) return new NextResponse("Not found", { status: 404 });
  let size: number;
  try { size = statSync(data.file).size; } catch { return new NextResponse("Media not installed", { status: 503 }); }
  const headers = new Headers({ "Content-Type": types[data.extension] ?? "application/octet-stream", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" });
  if (!types[data.extension]) headers.set("Content-Disposition", `attachment; filename="resource${data.extension}"`);
  let start = 0, end = size - 1, status = 200;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  const stream = Readable.toWeb(createReadStream(data.file, { start, end })) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, { status, headers });
}
