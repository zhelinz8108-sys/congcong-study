import type { NextRequest } from "next/server";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken } from "@/lib/family-access";
import { atlasPageCount, getMathAtlasPages } from "@/server/grade-six-reviews";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ page: string }> }) {
  const headers = { "Cache-Control": "private, no-cache", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
  if (!verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value).allowed) {
    return new Response(null, { status: 401, headers });
  }
  const { page } = await params;
  const number = Number(page);
  if (!Number.isInteger(number) || String(number) !== page || number < 1 || number > atlasPageCount) {
    return new Response(null, { status: 404, headers });
  }
  const pages = await getMathAtlasPages();
  return Response.json({ number, html: pages[number - 1] }, { headers });
}
