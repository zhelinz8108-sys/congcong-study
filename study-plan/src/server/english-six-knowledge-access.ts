import "server-only";
import { cookies } from "next/headers";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken } from "@/lib/family-access";

export async function canReadEnglishSixKnowledge() {
  return verifyFamilyAccessToken((await cookies()).get(FAMILY_ACCESS_COOKIE)?.value).allowed;
}
