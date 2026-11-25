"use client";

import { useEffect } from "react";

function MathAtlasEntry({ href }: { href: string }) {
  useEffect(() => {
    // Previously shared topic links had their page number on the subject homepage.
    function followOldPageLink() {
      const hash = window.location.hash;
      if (/^#atlas-[1-9]\d*$/.test(hash)) window.location.replace(href + hash);
    }
    followOldPageLink();
    window.addEventListener("hashchange", followOldPageLink);
    return () => window.removeEventListener("hashchange", followOldPageLink);
  }, [href]);

  return (
    <a href={href} className="mb-4 block rounded-2xl border border-[#dfc9aa] border-l-4 border-l-[#a46c43] bg-[#fffaf1] p-5 text-stone-900 shadow-sm hover:border-[#ba936c] focus-visible:outline-2 focus-visible:outline-[#87432a]">
      <h2 className="text-xl font-bold">六上数学全知识点图解</h2>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-stone-600">7 个单元 · 4 个综合实践 · 期末自测</p>
        <span className="text-sm font-semibold text-[#87432a]">阅读图册 <span aria-hidden="true">→</span></span>
      </div>
    </a>
  );
}

type ReviewProps = { subject: "english" } | { subject: "math"; href: string };

export function GradeSixReview(props: ReviewProps) {
  if (props.subject === "math") return <MathAtlasEntry href={props.href} />;
  const title = "六上英语期末复习图册";
  const pdf = "/api/grade-six-reviews/english";
  const audio = "/api/grade-six-reviews/english-listening";
  const linkStyle = "inline-flex min-h-11 items-center rounded-lg px-3 font-semibold underline underline-offset-4 focus-visible:outline-2";

  return (
    <section aria-label={title} className="mb-5 rounded-xl border border-stone-200 bg-white p-5 text-stone-900">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-stone-600">
        图解版 · 55 页 · Unit 1–8 看图对话、语法与读写。第 41–44 页可单独打印做期末自测。
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={pdf} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-4 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2">打开图册</a>
        <a href={`${pdf}?download=1`} download className={linkStyle}>下载 PDF</a>
      </div>
      <div className="mt-4 border-t border-stone-200 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <h3 className="text-base font-semibold">第 41 页自测听力</h3>
          <a href={`${audio}?download=1`} download className={`${linkStyle} text-sm`}>下载 MP3</a>
        </div>
        <audio aria-label="六上英语期末自测听力" controls preload="none" src={audio} className="mt-1 w-full max-w-md" />
      </div>
    </section>
  );
}
