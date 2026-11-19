import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import assets from "@/data/grade-six-reviews.json";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken } from "@/lib/family-access";
import { decryptEnglishSixKnowledge } from "@/server/english-six-knowledge-envelope";
import { toeflRange } from "@/server/toefl-listening";

export const runtime = "nodejs";

const files = new Map<string, Buffer>();

async function fileBytes(asset: (typeof assets)[number]) {
  const cached = files.get(asset.id);
  if (cached) return cached;

  const file = path.join(process.cwd(), "content/grade-six-reviews", asset.id + ".encrypted.json");
  const envelope = JSON.parse(await readFile(file, "utf8"));
  const encoded = decryptEnglishSixKnowledge(envelope, process.env.HOLIDAY_MATH_700_KEY?.trim() ?? "");
  if (typeof encoded !== "string") throw new Error("Invalid grade-six review package");
  const bytes = Buffer.from(encoded, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
    throw new Error("Grade-six review does not match its published edition");
  }
  files.set(asset.id, bytes);
  return bytes;
}

type Context = { params: Promise<{ asset: string }> };

async function serve(request: NextRequest, context: Context) {
  const headers = new Headers({ "Cache-Control": "private, no-cache", Vary: "Cookie" });
  if (!verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value).allowed) {
    return new Response(null, { status: 401, headers });
  }
  const { asset: id } = await context.params;
  const asset = assets.find((entry) => entry.id === id);
  if (!asset) return new Response(null, { status: 404, headers });

  const bytes = await fileBytes(asset);
  const range = toeflRange(request.headers.get("range"), bytes.length);
  headers.set("Accept-Ranges", "bytes");
  if (!range) {
    headers.set("Content-Range", `bytes */${bytes.length}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end, status } = range;
  if (status === 206) headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  headers.set("Content-Disposition", `${disposition}; filename="grade-six-${id}${path.extname(asset.filename)}"; filename*=UTF-8''${encodeURIComponent(asset.filename)}`);
  headers.set("Content-Type", asset.type);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Length", String(end - start + 1));
  const body = request.method === "HEAD" ? null : new Uint8Array(bytes.subarray(start, end + 1));
  return new Response(body, { status, headers });
}

export { serve as GET, serve as HEAD };
