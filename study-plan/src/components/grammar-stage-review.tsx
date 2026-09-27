"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GrammarStage } from "@/lib/grammar-course";
import {
  EMPTY_GRAMMAR_COURSE_PROGRESS,
  loadGrammarCourseProgress,
  saveGrammarCourseProgress,
  type GrammarCourseProgress,
} from "@/lib/grammar-course-progress";

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}
function speakEnglish(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}
export default function GrammarStageReview({
  subjectId,
  stage,
  lessonTitles,
}: {
  subjectId: string;
  stage: GrammarStage;
  lessonTitles: Array<{ n: number; title: string }>;
}) {
  const [progress, setProgress] = useState<GrammarCourseProgress>(EMPTY_GRAMMAR_COURSE_PROGRESS);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadGrammarCourseProgress().then((value) => {
      if (!active) return;
      setProgress(value);
      setDraft(value.stageDrafts[String(stage.number)] ?? "");
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [stage.number]);

  const wordCount = useMemo(() => draft.trim().split(/\s+/).filter(Boolean).length, [draft]);
  const completed = progress.completedStages.includes(stage.number);
  const allQuestionsChecked = revealed.length === stage.review.questions.length;

  const persist = (next: GrammarCourseProgress) => {
    setProgress(next);
    saveGrammarCourseProgress(next);
  };

  const saveDraft = () => {
    persist({
      ...progress,
      stageDrafts: { ...progress.stageDrafts, [String(stage.number)]: draft },
      updatedAt: new Date().toISOString(),
    });
  };

  const completeStage = () => {
    persist({
      ...progress,
      completedStages: uniqueSorted([...progress.completedStages, stage.number]),
      stageDrafts: { ...progress.stageDrafts, [String(stage.number)]: draft },
      lastLesson: stage.number < 12 ? stage.lastLesson + 1 : 72,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <main className="min-h-screen bg-[#0b0a12] text-white">
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-7">
        <nav className="space-y-3">
          <Link href={`/subjects/${subjectId}/grammar`} className="rounded-full bg-white/[0.06] px-4 py-2 text-sm font-black text-white/50 shadow-sm ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white">← 课程地图</Link>
          <span className="block w-fit rounded-full bg-white/[0.06] px-4 py-2 text-xs font-black text-white/55 ring-1 ring-white/10">阶段 {stage.number} / 12</span>
        </nav>

        <header className="mt-7 overflow-hidden rounded-[38px] bg-[#17142a] p-6 text-white shadow-[0_28px_80px_rgba(0,0,0,0.35)] ring-1 ring-white/10 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Stage {String(stage.number).padStart(2, "0")} · Read, think, write</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{stage.title} · 阶段迁移站</h1>
          <p className="mt-5 max-w-3xl text-sm font-semibold leading-7 text-white/55">读一段完整语料，检查6个关键判断，再用80-120词完成一次真实表达。这里检验的不是背诵，而是能不能把前6课用起来。</p>
          <div className="mt-7 space-y-2">
            {lessonTitles.map((lesson) => <Link key={lesson.n} href={`/subjects/${subjectId}/grammar/lesson/${lesson.n}`} className="block rounded-2xl bg-white/[0.05] px-4 py-3 text-xs font-black text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white">{lesson.n}. {lesson.title}</Link>)}
          </div>
        </header>

        <section className="mt-8 rounded-[32px] border border-white/10 bg-[#171521] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:p-8">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">01 · Stage reading</p><h2 className="mt-2 text-2xl font-black text-white">先读懂，再解释语法为什么这样用</h2><button type="button" onClick={() => speakEnglish(stage.review.text)} className="mt-4 rounded-full bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-200 ring-1 ring-cyan-300/15 transition hover:bg-cyan-400/15">▶ 朗读全文</button></div>
          <p className="mt-6 rounded-[26px] bg-[#0d0c16] p-6 text-lg font-semibold leading-9 text-white/85 ring-1 ring-white/10 sm:p-8">{stage.review.text}</p>
        </section>

        <section className="mt-8 rounded-[32px] border border-white/10 bg-[#171521] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:p-8">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">02 · Six checks</p><h2 className="mt-2 text-2xl font-black text-white">6个问题，检查是否真正理解</h2><p className="mt-3 text-xs font-black text-violet-300">已核对 {revealed.length} / 6</p></div>
          <div className="mt-6 space-y-3">
            {stage.review.questions.map((question, index) => {
              const open = revealed.includes(index);
              return <article key={question.prompt} className={`rounded-2xl border p-4 transition ${open ? "border-emerald-300/20 bg-emerald-400/[0.07]" : "border-white/[0.08] bg-white/[0.04]"}`}><span className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-black ${open ? "bg-emerald-500 text-white" : "bg-white/[0.06] text-white/40 ring-1 ring-white/10"}`}>{open ? "✓" : index + 1}</span><div className="mt-3"><p className="text-sm font-black leading-7 text-white/80">{question.prompt}</p>{open ? <p className="mt-3 border-t border-emerald-300/15 pt-3 text-sm font-semibold leading-7 text-emerald-100">{question.answer}</p> : <button type="button" onClick={() => setRevealed((items) => uniqueSorted([...items, index]))} className="mt-3 rounded-xl bg-violet-400/10 px-4 py-2 text-xs font-black text-violet-200 ring-1 ring-violet-300/20">展开参考答案</button>}</div></article>;
            })}
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-[34px] bg-[#17142a] text-white shadow-xl">
          <div className="p-6 sm:p-9">
            <div className="mt-7">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">03 · Real writing</p>
              <h2 className="mt-3 text-3xl font-black">把规则写成自己的表达</h2>
              <p className="mt-5 text-sm font-semibold leading-7 text-white/65">{stage.review.writing}</p>
              <div className="mt-5 rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><p className="text-xs font-black text-cyan-300">提交前自检</p><p className="mt-2 text-xs font-semibold leading-6 text-white/65">{stage.review.check}</p></div>
            </div>
            <div>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={saveDraft} placeholder="在这里完成英文写作……" className="min-h-72 w-full resize-y rounded-[24px] border border-white/10 bg-white/[0.06] p-5 text-sm font-semibold leading-7 text-white outline-none transition placeholder:text-white/25 focus:ring-4 focus:ring-cyan-300/20" />
              <div className="mt-3 space-y-3"><p className={`text-xs font-black ${wordCount >= 80 ? "text-emerald-300" : "text-white/40"}`}>{wordCount} words {wordCount >= 80 ? "· 已达到建议长度" : "· 建议至少80词"}</p><button type="button" onClick={saveDraft} className="w-full rounded-xl bg-white/10 px-4 py-3 text-xs font-black transition hover:bg-white/20">保存草稿</button></div>
            </div>
          </div>
        </section>

        <section className={`mt-8 rounded-[34px] p-6 text-center sm:p-9 ${completed ? "bg-emerald-700 text-white" : "border border-white/10 bg-[#171521]"}`}>
          <p className={`text-xs font-black uppercase tracking-[0.18em] ${completed ? "text-white/60" : "text-violet-300"}`}>Stage checkpoint</p>
          <h2 className="mt-3 text-3xl font-black">{completed ? `阶段 ${stage.number} 已完成` : "准备好点亮这一阶段了吗？"}</h2>
          <p className={`mx-auto mt-3 max-w-2xl text-sm font-semibold leading-7 ${completed ? "text-white/70" : "text-white/45"}`}>{allQuestionsChecked ? "6个理解问题已经全部核对。" : `还差 ${stage.review.questions.length - revealed.length} 个问题未核对。`} {wordCount >= 80 ? "写作已经达到建议长度。" : "写作可以继续完善，也可以稍后回来补充。"}</p>
          {!completed && <button type="button" disabled={!allQuestionsChecked} onClick={completeStage} className="mt-6 rounded-2xl bg-violet-600 px-7 py-3.5 text-sm font-black text-white transition enabled:hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-35">完成阶段并保存进度</button>}
          {completed && stage.number < 12 && <Link href={`/subjects/${subjectId}/grammar/lesson/${stage.lastLesson + 1}`} className="mt-6 inline-flex rounded-2xl bg-white/10 px-7 py-3.5 text-sm font-black text-white ring-1 ring-white/15">进入下一阶段 →</Link>}
          {completed && stage.number === 12 && <Link href={`/subjects/${subjectId}/grammar/practice/mixed`} className="mt-6 inline-flex rounded-2xl bg-white/10 px-7 py-3.5 text-sm font-black text-white ring-1 ring-white/15">进入500题综合挑战 →</Link>}
          {!ready && <p className="mt-3 text-xs text-white/30">正在读取云端进度……</p>}
        </section>
      </div>
    </main>
  );
}
