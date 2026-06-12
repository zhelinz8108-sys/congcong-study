import { NextResponse } from "next/server";
import { FAMILY_ACCESS_COOKIE, STUDENT_PROFILE_COOKIE } from "@/lib/family-access";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(FAMILY_ACCESS_COOKIE);
  response.cookies.delete(STUDENT_PROFILE_COOKIE);
  return response;
}
