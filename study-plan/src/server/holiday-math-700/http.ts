import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  FAMILY_ACCESS_COOKIE,
  verifyFamilyAccessToken,
} from "@/lib/family-access";
export const holidayHeaders = { "Cache-Control": "private, no-store" };
export function holidayAccess(request: NextRequest, mutation = false) {
  if (
    !verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value)
      .allowed
  )
    return NextResponse.json(
      { error: "请先输入访问密码" },
      { status: 401, headers: holidayHeaders },
    );
  if (mutation) {
    const origin = request.headers.get("origin");
    const expected =
      process.env.NODE_ENV === "production"
        ? "https://congcong-study.cn"
        : new URL(
            `${new URL(request.url).protocol}//${request.headers.get("host") || new URL(request.url).host}`,
          ).origin;
    if (origin && origin !== expected)
      return NextResponse.json(
        { error: "请求来源不正确" },
        { status: 403, headers: holidayHeaders },
      );
  }
  return null;
}
export async function holidayBody(request: NextRequest) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 16 * 1024)
    throw new Error("提交内容过大");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("提交格式不正确");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("提交格式不正确");
  return body as Record<string, unknown>;
}
