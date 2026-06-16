import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { FamilyAccessGate } from "@/components/family-access-gate";
import { FamilyProfileBar } from "@/components/family-profile-bar";
import { ScrollToTopButton } from "@/components/scroll-to-top-button";
import {
  DEFAULT_STUDENT_PROFILE,
  FAMILY_ACCESS_COOKIE,
  STUDENT_PROFILE_COOKIE,
  parseStudentProfileCookie,
  verifyFamilyAccessToken,
} from "@/lib/family-access";
import "./globals.css";

export const metadata: Metadata = {
  title: "聪聪学习计划",
  description: "聪聪的学习资料管理系统。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "聪聪学习",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f5f5f4",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const access = verifyFamilyAccessToken(cookieStore.get(FAMILY_ACCESS_COOKIE)?.value);
  const profile = parseStudentProfileCookie(cookieStore.get(STUDENT_PROFILE_COOKIE)?.value);

  return (
    <html lang="zh" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {access.allowed ? (
          <>
            <FamilyProfileBar initialProfile={profile} />
            {children}
            <ScrollToTopButton />
          </>
        ) : (
          <FamilyAccessGate
            setupRequired={!access.configured}
            initialStudentName={DEFAULT_STUDENT_PROFILE.name}
          />
        )}
      </body>
    </html>
  );
}
