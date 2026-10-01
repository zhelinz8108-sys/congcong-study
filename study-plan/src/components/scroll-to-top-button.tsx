"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const isNationalDayEnglish = usePathname().includes("/national-day-english");

  useEffect(() => {
    const updateVisibility = () => {
      setVisible(window.scrollY > 420);
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });

    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold transition duration-200 hover:-translate-y-0.5 active:scale-95 ${isNationalDayEnglish ? "border border-orange-200 bg-white text-orange-700 shadow-sm hover:bg-orange-50" : "bg-stone-900 text-white shadow-[0_16px_34px_rgba(15,23,42,0.22)] hover:bg-stone-800"} ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      }`}
      title="回到顶部"
      aria-label="回到顶部"
    >
      ↑
    </button>
  );
}
