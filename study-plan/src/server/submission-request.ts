import "server-only";
import type { NextRequest } from "next/server";

export function unsafeSubmissionOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = process.env.NODE_ENV === "production" ? "https://congcong-study.cn" : request.nextUrl.origin;
  return (origin !== null && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site";
}
