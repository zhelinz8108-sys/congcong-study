import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  FAMILY_ACCESS_COOKIE,
  STUDENT_PROFILE_COOKIE,
  parseStudentProfileCookie,
  verifyFamilyAccessToken,
} from "@/lib/family-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const access = verifyFamilyAccessToken(cookieStore.get(FAMILY_ACCESS_COOKIE)?.value);

  if (!access.allowed) {
    return NextResponse.json({ error: "请先输入访问密码" }, { status: 401 });
  }

  return NextResponse.json({
    profile: parseStudentProfileCookie(cookieStore.get(STUDENT_PROFILE_COOKIE)?.value),
  });
}
