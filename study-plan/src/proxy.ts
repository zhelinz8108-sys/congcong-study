import { NextRequest, NextResponse } from "next/server";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken } from "@/lib/family-access";

const publicApiPaths = new Set([
  "/api/access/login",
  "/api/access/logout",
  "/api/access/profile",
]);

function shouldSkip(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    publicApiPaths.has(pathname) ||
    /\.(?:css|js|map|png|jpg|jpeg|gif|webp|svg|ico|mp3|wav|pdf|docx?|xlsx?|zip)$/i.test(pathname)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (shouldSkip(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    const access = verifyFamilyAccessToken(request.cookies.get(FAMILY_ACCESS_COOKIE)?.value);
    if (!access.allowed) {
      const message =
        access.reason === "unconfigured" ? "访问密码还没有配置" : "请先输入访问密码";
      return NextResponse.json({ error: message }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
