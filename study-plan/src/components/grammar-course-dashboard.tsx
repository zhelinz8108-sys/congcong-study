"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EMPTY_GRAMMAR_COURSE_PROGRESS,
  loadGrammarCourseProgress,
  type GrammarCourseProgress,
} from "@/lib/grammar-course-progress";

export type GrammarStageSummary = {
  number: number;
  title: string;
  description: string;
  firstLesson: number;
  lastLesson: number;
  lessons: Array<{ n: number; title: string; level: string; goal: string }>;
};

const PALETTES = [
  { bar: "bg-cyan-500", soft: "bg-cyan-50", text: "text-cyan-700", ring: "border-cyan-200", glow: "shadow-cyan-100" },
  { bar: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700", ring: "border-violet-200", glow: "shadow-violet-100" },
  { bar: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700", ring: "border-amber-200", glow: "shadow-amber-100" },
  { bar: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700", ring: "border-emerald-200", glow: "shadow-emerald-100" },
];

export default function GrammarCourseDashboard({
  subjectId,
  stages,
}: {
  subjectId: string;
  stages: GrammarStageSummary[];
}) {
  const [progress, setProgress] = useState<GrammarCourseProgress>(EMPTY_GRAMMAR_COURSE_PROGRESS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadGrammarCourseProgress().then((value) => {
      if (!active) return;
      setProgress(value);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const completed = progress.completedLessons.length;
  const percent = Math.round((completed / 72) * 100);
  const resumeLesson = Math.min(72, Math.max(1, progress.lastLesson || completed + 1));
  const currentStage = Math.min(12, Math.ceil(resumeLesson / 6));
  const completedSet = useMemo(() => new Set(progress.completedLessons), [progress.completedLessons]);
  const completedStageSet = useMemo(() => new Set(progress.completedStages), [progress.completedStages]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f4ef] text-slate-950">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.15),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(139,92,246,0.17),transparent_42%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-7 lg:px-10">
        <nav className="flex items-center justify-between gap-4">
          <Link href={`/subjects/${subjectId}`} className="rounded-full bg-white/75 px-4 py-2 text-sm font-bold text-slate-500 shadow-sm ring-1 ring-slate-200 backdrop-blur transition hover:text-slate-950">
            ← 返回英语
          </Link>
          <span className="hidden rounded-full bg-slate-950 px-4 py-2 text-xs font-black tracking-[0.18em] text-white sm:inline-flex">GRAMMAR · 0 → 1</span>
        </nav>

        <section className="mt-7 overflow-hidden rounded-[40px] bg-[#17142a] text-white shadow-[0_30px_90px_rgba(31,25,70,0.22)]">
          <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1fr_310px] lg:p-12">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-cyan-400/15 px-3 py-1.5 text-xs font-black text-cyan-200 ring-1 ring-cyan-300/20">12 阶段</span>
                <span className="rounded-full bg-violet-400/15 px-3 py-1.5 text-xs font-black text-violet-200 ring-1 ring-violet-300/20">72 节系统课</span>
                <span className="rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-black text-amber-200 ring-1 ring-amber-300/20">720 项迁移任务</span>
              </div>
              <p className="mt-9 text-xs font-black uppercase tracking-[0.24em] text-cyan-300">English grammar pathway</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.15] tracking-tight sm:text-6xl">
                不背一堆规则，<br />把语法搭成一套句子系统。
              </h1>
              <p className="mt-6 max-w-2xl text-sm font-medium leading-7 text-white/60 sm:text-base">
                从句子骨架开始，依次连接名词、动词、时态、从句和高级表达。每课都有规则图解、例句、易错诊断和即时自测，进度自动同步到云端。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={`/subjects/${subjectId}/grammar/lesson/${resumeLesson}`} className="rounded-2xl bg-cyan-300 px-6 py-3.5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-200">
                  {completed > 0 ? `继续第 ${resumeLesson} 课` : "从第 1 课开始"} →
                </Link>
                <a href="#roadmap" className="rounded-2xl bg-white/10 px-6 py-3.5 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15">查看完整路线</a>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="relative grid h-60 w-60 place-items-center rounded-full bg-white/5 ring-1 ring-white/10">
                <div className="absolute inset-5 rounded-full" style={{ background: `conic-gradient(#67e8f9 ${ready ? percent : 0}%, rgba(255,255,255,0.09) 0)` }} />
                <div className="relative grid h-40 w-40 place-items-center rounded-full bg-[#17142a] text-center shadow-inner">
                  <div>
                    <p className="text-5xl font-black">{ready ? `${percent}%` : "--"}</p>
                    <p className="mt-2 text-xs font-black text-white/45">已完成 {ready ? completed : "--"} / 72 课</p>
                  </div>
                </div>
                <span className="absolute -right-2 top-8 rounded-2xl bg-violet-500 px-3 py-2 text-xs font-black shadow-lg">当前 · 阶段 {currentStage}</span>
              </div>
            </div>
          </div>
          <div className="grid border-t border-white/10 bg-white/[0.04] sm:grid-cols-4">
            {[
              ["01", "看懂规则", "每课只解决一个核心问题"],
              ["02", "观察例句", "英文、意义和结构一起看"],
              ["03", "即时判断", "答案展开后马上核对理由"],
              ["04", "迁移表达", "每六课完成阅读与写作"],
            ].map(([number, title, note]) => (
              <div key={number} className="border-white/10 p-5 sm:border-r last:border-r-0">
                <p className="text-xs font-black text-cyan-300">STEP {number}</p>
                <p className="mt-2 font-black">{title}</p>
                <p className="mt-1 text-xs leading-5 text-white/40">{note}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="roadmap" className="scroll-mt-6 pt-16">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-600">12-stage roadmap</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">从一个完整句子，一路走到高级表达</h2>
              <p className="mt-3 max-w-3xl text-sm font-medium leading-7 text-slate-500">每阶段6课。完成6课后进入阶段阅读与写作，把规则迁移到真实语篇。</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500 shadow-sm ring-1 ring-slate-200">
              阶段测评完成 <span className="ml-1 text-violet-700">{ready ? progress.completedStages.length : "--"} / 12</span>
            </div>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {stages.map((stage, index) => {
              const palette = PALETTES[index % PALETTES.length];
              const stageCompleted = completedStageSet.has(stage.number);
              const stageLessonCount = stage.lessons.filter((lesson) => completedSet.has(lesson.n)).length;
              const stagePercent = Math.round((stageLessonCount / stage.lessons.length) * 100);
              return (
                <article key={stage.number} className={`overflow-hidden rounded-[30px] border bg-white shadow-lg ${palette.ring} ${palette.glow}`}>
                  <div className={`h-2 ${palette.bar}`} />
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className={`text-xs font-black uppercase tracking-[0.16em] ${palette.text}`}>Stage {String(stage.number).padStart(2, "0")} · Lesson {String(stage.firstLesson).padStart(2, "0")}-{String(stage.lastLesson).padStart(2, "0")}</p>
                        <h3 className="mt-2 text-2xl font-black">{stage.title}</h3>
                        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{stage.description}</p>
                      </div>
                      <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-sm font-black ${stageCompleted ? "bg-emerald-500 text-white" : `${palette.soft} ${palette.text}`}`}>
                        {stageCompleted ? "✓" : `${stagePercent}%`}
                      </div>
                    </div>

                    <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full transition-all ${palette.bar}`} style={{ width: `${stagePercent}%` }} />
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      {stage.lessons.map((lesson) => {
                        const done = completedSet.has(lesson.n);
                        return (
                          <Link key={lesson.n} href={`/subjects/${subjectId}/grammar/lesson/${lesson.n}`} className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-white hover:shadow-sm">
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black ${done ? "bg-emerald-500 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"}`}>{done ? "✓" : String(lesson.n).padStart(2, "0")}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black text-slate-800 group-hover:text-violet-700">{lesson.title}</span>
                              <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-400">{lesson.level}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>

                    <Link href={`/subjects/${subjectId}/grammar/stage/${stage.number}`} className={`mt-4 flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-black transition hover:-translate-y-0.5 ${palette.soft} ${palette.text}`}>
                      <span>{stageCompleted ? "重新进行阶段阅读与写作" : "进入阶段阅读与写作"}</span><span>→</span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-16 rounded-[36px] border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600">Practice arena</p>
              <h2 className="mt-3 text-3xl font-black">学完规则，去真实题目里验证</h2>
              <p className="mt-3 text-sm font-medium leading-7 text-slate-500">课程负责建立系统，题库负责把判断练成反应。两套500题都保留即时判分、逐题解析和云端进度。</p>
            </div>
            <span className="rounded-full bg-amber-50 px-4 py-2 text-xs font-black text-amber-700">共 1000 道选择题</span>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <Link href={`/subjects/${subjectId}/grammar/practice/mixed`} className="group rounded-[28px] bg-gradient-to-br from-violet-600 to-fuchsia-600 p-6 text-white shadow-lg shadow-violet-100 transition hover:-translate-y-1">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-200">Mixed challenge</p>
              <h3 className="mt-3 text-2xl font-black">500题综合混合练习</h3>
              <p className="mt-3 text-sm font-medium leading-7 text-white/65">所有考点混合出现，实时反馈并解释为什么。</p>
              <span className="mt-7 inline-flex items-center gap-2 text-sm font-black">开始挑战 <span className="transition group-hover:translate-x-1">→</span></span>
            </Link>
            <Link href={`/subjects/${subjectId}/grammar/practice/tense`} className="group rounded-[28px] bg-gradient-to-br from-cyan-500 to-emerald-500 p-6 text-white shadow-lg shadow-cyan-100 transition hover:-translate-y-1">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">Tense challenge</p>
              <h3 className="mt-3 text-2xl font-black">500题时态专项训练</h3>
              <p className="mt-3 text-sm font-medium leading-7 text-white/70">13类主流时态混合判断，配原题解析。</p>
              <span className="mt-7 inline-flex items-center gap-2 text-sm font-black">开始专项 <span className="transition group-hover:translate-x-1">→</span></span>
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href={`/subjects/${subjectId}/grammar-guide`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-black text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"><span>🧠 语法大全 · 可视化知识地图</span><span>→</span></Link>
            <Link href={`/subjects/${subjectId}/sentence-structure`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-black text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700"><span>🧩 句子结构 · 先看懂句子骨架</span><span>→</span></Link>
          </div>
        </section>

        <p className="mt-10 text-center text-xs font-semibold leading-6 text-slate-400">课程依据剑桥初级英语语法主题体系与《英语语法系统课程·迁移训练版》整理，例句与练习为独立编写的学习材料。</p>
      </div>
    </main>
  );
}
