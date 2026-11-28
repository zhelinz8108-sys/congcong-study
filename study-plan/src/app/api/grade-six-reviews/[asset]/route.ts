import path from "node:path";
import type { NextRequest } from "next/server";
import assets from "@/data/grade-six-reviews.json";
import { FAMILY_ACCESS_COOKIE, STUDENT_PROFILE_COOKIE, parseStudentProfileCookie, verifyFamilyAccessToken } from "@/lib/family-access";
import { readFinalExamPdf, readReviewFile } from "@/server/grade-six-reviews";
import { examSummary, mayDownloadExam } from "@/server/math-final-exams";
import { toeflRange } from "@/server/toefl-listening";

export const runtime = "nodejs";

type Context = { params: Promise<{ asset: string }> };

async function serve(request: NextRequest, context: Context) {
  const headers = new Headers({ "Cache-Control": "private, no-cache", Vary: "Cookie" });
  if (!verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value).allowed) {
    return new Response(null, { status: 401, headers });
  }
  const { asset: id } = await context.params;
  if (/^math-final-(?:answers(?:-(?:[1-9]|10))?|pack)$/.test(id)) {
    headers.set("Cache-Control", "private, no-store");
    const student = parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value).id;
    if (!mayDownloadExam(id, await examSummary(student))) return new Response(null, { status: 403, headers });
  }
  const book = assets.find((entry) => entry.id === id);
  const asset = book ? { ...book, bytes: await readReviewFile(book) } : await readFinalExamPdf(id);
  if (!asset) return new Response(null, { status: 404, headers });

  const { bytes } = asset;
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
