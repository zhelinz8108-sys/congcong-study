import { NextRequest, NextResponse } from "next/server";
import {
  FAMILY_ACCESS_COOKIE,
  FAMILY_ACCESS_MAX_AGE,
  STUDENT_PROFILE_COOKIE,
  createFamilyAccessToken,
  encodeStudentProfile,
  isFamilyAccessConfigured,
  normalizeStudentProfile,
  verifyFamilyPassword,
} from "@/lib/family-access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isFamilyAccessConfigured()) {
    return NextResponse.json({ error: "访问密码还没有配置" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const password = String(body.password ?? "");

  if (!verifyFamilyPassword(password)) {
    return NextResponse.json({ error: "访问密码不正确" }, { status: 401 });
  }

  const profile = normalizeStudentProfile(body.profile);
  const response = NextResponse.json({ ok: true, profile });
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(FAMILY_ACCESS_COOKIE, createFamilyAccessToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: FAMILY_ACCESS_MAX_AGE,
  });

  response.cookies.set(STUDENT_PROFILE_COOKIE, encodeStudentProfile(profile), {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: FAMILY_ACCESS_MAX_AGE,
  });

  return response;
}
