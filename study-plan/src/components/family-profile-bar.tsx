"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { StudentProfile } from "@/lib/family-access";

type FamilyProfileBarProps = {
  initialProfile: StudentProfile;
};

export function FamilyProfileBar({ initialProfile }: FamilyProfileBarProps) {
  const pathname = usePathname();
  const [profile] = useState(initialProfile);
  const [loggingOut, setLoggingOut] = useState(false);

  if (pathname.startsWith("/access")) return null;

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/access/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/";
  }

  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-bold text-slate-700 shadow-lg shadow-slate-900/5 backdrop-blur">
      <span className="rounded-full bg-blue-600 px-2 py-1 text-white">{profile.name}</span>
      <span className="hidden text-slate-400 sm:inline">小朋友档案</span>
      <button
        type="button"
        onClick={logout}
        disabled={loggingOut}
        className="rounded-full border border-slate-200 px-2 py-1 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
      >
        {loggingOut ? "退出中" : "退出"}
      </button>
    </div>
  );
}
