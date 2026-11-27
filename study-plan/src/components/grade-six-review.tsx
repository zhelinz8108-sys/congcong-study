"use client";

import { useEffect } from "react";

type ReviewProps = { subject: "math" | "english"; href: string };

export function GradeSixReview({ subject, href }: ReviewProps) {
  const math = subject === "math";
  useEffect(() => {
    if (!math) return;
    // Previously shared math topic links used a fragment on the subject homepage.
    function followOldPageLink() {
      const hash = window.location.hash;
      if (/^#atlas-[1-9]\d*$/.test(hash)) window.location.replace(href + hash);
    }
    followOldPageLink();
    window.addEventListener("hashchange", followOldPageLink);
    return () => window.removeEventListener("hashchange", followOldPageLink);
  }, [href, math]);

  return (
    <a href={href} className="mb-4 block rounded-2xl border border-[#dfc9aa] border-l-4 border-l-[#a46c43] bg-[#fffaf1] p-5 text-stone-900 shadow-sm hover:border-[#ba936c] focus-visible:outline-2 focus-visible:outline-[#87432a]">
      <h2 className="text-xl font-bold">{math ? "六上数学全知识点图解" : "六上英语知识点图解"}</h2>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-stone-600">{math ? "7 个单元 · 4 个综合实践 · 期末自测" : "Unit 1–8 · 词句、语音、读写与期末自测"}</p>
        <span className="text-sm font-semibold text-[#87432a]">阅读图册 <span aria-hidden="true">→</span></span>
      </div>
    </a>
  );
}
