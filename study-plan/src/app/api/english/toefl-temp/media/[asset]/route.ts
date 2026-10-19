import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import data from "@/data/toefl-temp-audio.json";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken } from "@/lib/family-access";
import { toeflRange } from "@/server/toefl-listening";

export const runtime = "nodejs";

async function serve(
  request: NextRequest,
  context: { params: Promise<{ asset: string }> },
  head: boolean,
) {
  if (!verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value).allowed) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { asset } = await context.params;
  const clip = data.clips.find((item) => item.id === asset);
  if (!clip) return new NextResponse("Not found", { status: 404 });

  const file = path.join(process.cwd(), "content/toefl-temp/audio", clip.filename);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new NextResponse("Media unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    Vary: "Cookie",
  });
  const range = toeflRange(request.headers.get("range"), size);
  if (!range) {
    headers.set("Content-Range", `bytes */${size}`);
    return new NextResponse(null, { status: 416, headers });
  }

  const { start, end, status } = range;
  if (status === 206) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  if (head) return new NextResponse(null, { status, headers });

  const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, { status, headers });
}

export async function GET(request: NextRequest, context: { params: Promise<{ asset: string }> }) {
  return serve(request, context, false);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ asset: string }> }) {
  return serve(request, context, true);
}
