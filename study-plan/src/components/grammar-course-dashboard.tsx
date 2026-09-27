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

export default function GrammarCourseDashboard({
  subjectId,
  stages,
}: {
  subjectId: string;
  stages: GrammarStageSummary[];
}) {
  const [progress, setProgress] = useState<GrammarCourseProgress>(EMPTY_GRAMMAR_COURSE_PROGRESS);
  const [ready, setReady] = useState(false);
  const [expandedStage, setExpandedStage] = useState<number | null>(1);

  useEffect(() => {
    let active = true;
    void loadGrammarCourseProgress().then((value) => {
      if (!active) return;
      setProgress(value);
      const nextLesson = Math.min(72, Math.max(1, value.lastLesson || value.completedLessons.length + 1));
      setExpandedStage(Math.min(12, Math.ceil(nextLesson / 6)));
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
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[linear-gradient(180deg,rgba(34,211,238,0.10),transparent)]" />
      <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-7">
        <nav>
          <Link href={`/subjects/${subjectId}`} className="rounded-full bg-white/75 px-4 py-2 text-sm font-bold text-slate-500 shadow-sm ring-1 ring-slate-200 backdrop-blur transition hover:text-slate-950">
            ← 返回英语
          </Link>
        </nav>

        <section className="mt-7 overflow-hidden rounded-[34px] bg-[#17142a] text-white shadow-[0_24px_70px_rgba(31,25,70,0.18)]">
          <div className="p-6 sm:p-10">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-cyan-400/15 px-3 py-1.5 text-xs font-black text-cyan-200 ring-1 ring-cyan-300/20">12 阶段</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white/70">72 节系统课</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white/70">720 项迁移任务</span>
            </div>
            <p className="mt-9 text-xs font-black uppercase tracking-[0.24em] text-cyan-300">English grammar pathway</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.15] tracking-tight sm:text-6xl">
              从第一个完整句子开始，<br />一步一步搭起语法系统。
            </h1>
            <p className="mt-6 max-w-2xl text-sm font-medium leading-7 text-white/60 sm:text-base">
              每次只学一个主题：先理解，再观察，再判断，最后迁移到真实表达。
            </p>
            <div className="mt-8 max-w-sm space-y-3">
              <Link href={`/subjects/${subjectId}/grammar/lesson/${resumeLesson}`} className="block rounded-2xl bg-cyan-300 px-6 py-3.5 text-center text-sm font-black text-slate-950 transition hover:bg-cyan-200">
                {completed > 0 ? `继续第 ${resumeLesson} 课` : "从第 1 课开始"} →
              </Link>
              <a href="#roadmap" className="block rounded-2xl bg-white/10 px-6 py-3.5 text-center text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15">向下查看学习路线</a>
            </div>
          </div>
          <div className="border-t border-white/10 bg-white/[0.04] p-6 sm:p-10">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">当前学习进度</p>
            <p className="mt-3 text-4xl font-black">{ready ? `${percent}%` : "--"}</p>
            <p className="mt-2 text-sm font-bold text-white/50">已完成 {ready ? completed : "--"} / 72 课 · 当前阶段 {currentStage}</p>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${ready ? percent : 0}%` }} />
            </div>
          </div>
          <div className="border-t border-white/10 bg-white/[0.04]">
            {[
              ["01", "看懂规则", "每课只解决一个核心问题"],
              ["02", "观察例句", "英文、意义和结构一起看"],
              ["03", "即时判断", "答案展开后马上核对理由"],
              ["04", "迁移表达", "每六课完成阅读与写作"],
            ].map(([number, title, note]) => (
              <div key={number} className="border-b border-white/10 p-6 last:border-b-0 sm:px-10">
                <p className="text-xs font-black text-cyan-300">STEP {number}</p>
                <p className="mt-2 font-black">{title}</p>
                <p className="mt-1 text-xs leading-5 text-white/40">{note}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="roadmap" className="scroll-mt-6 pt-16">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">12-stage roadmap</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">按顺序往下学，不需要来回找</h2>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-7 text-slate-500">每阶段6课，完成后进行一次阅读与写作。阶段测评已完成 {ready ? progress.completedStages.length : "--"} / 12。</p>
          </div>

          <div className="mt-8 space-y-6">
            {stages.map((stage) => {
              const stageCompleted = completedStageSet.has(stage.number);
              const stageLessonCount = stage.lessons.filter((lesson) => completedSet.has(lesson.n)).length;
              const stagePercent = Math.round((stageLessonCount / stage.lessons.length) * 100);
              return (
                <article key={stage.number} className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
                  <div className="h-2 bg-cyan-500" />
                  <button type="button" onClick={() => setExpandedStage((value) => value === stage.number ? null : stage.number)} aria-expanded={expandedStage === stage.number} className="block w-full p-5 text-left sm:p-7">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Stage {String(stage.number).padStart(2, "0")} · Lesson {String(stage.firstLesson).padStart(2, "0")}-{String(stage.lastLesson).padStart(2, "0")}</p>
                      <h3 className="mt-2 text-2xl font-black">{stage.title}</h3>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{stage.description}</p>
                      <p className={`mt-4 text-sm font-black ${stageCompleted ? "text-emerald-600" : "text-cyan-700"}`}>{stageCompleted ? "本阶段已完成 ✓" : `本阶段进度 ${stagePercent}%`}</p>
                    </div>

                    <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${stagePercent}%` }} />
                    </div>
                    <p className="mt-4 text-xs font-black text-slate-400">{expandedStage === stage.number ? "点击收起本阶段 ↑" : "点击展开本阶段的6节课 ↓"}</p>
                  </button>

                  {expandedStage === stage.number && <div className="border-t border-slate-100 p-5 sm:p-7">
                    <div className="space-y-2">
                      {stage.lessons.map((lesson) => {
                        const done = completedSet.has(lesson.n);
                        return (
                          <Link key={lesson.n} href={`/subjects/${subjectId}/grammar/lesson/${lesson.n}`} className="group block rounded-2xl border border-slate-100 bg-slate-50/80 p-4 transition hover:border-cyan-200 hover:bg-white hover:shadow-sm">
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black ${done ? "bg-emerald-500 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"}`}>{done ? "✓" : String(lesson.n).padStart(2, "0")}</span>
                            <span className="mt-3 block min-w-0">
                              <span className="block text-sm font-black text-slate-800 group-hover:text-cyan-700">{lesson.title}</span>
                              <span className="mt-1 block text-[11px] font-semibold text-slate-400">{lesson.level}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>

                    <Link href={`/subjects/${subjectId}/grammar/stage/${stage.number}`} className="mt-4 block rounded-2xl bg-cyan-50 px-4 py-3 text-center text-sm font-black text-cyan-700 transition hover:bg-cyan-100">
                      {stageCompleted ? "重新进行阶段阅读与写作" : "进入阶段阅读与写作"} →
                    </Link>
                  </div>}
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-16 rounded-[36px] border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Practice arena</p>
            <h2 className="mt-3 text-3xl font-black">学完规则，再用题目验证</h2>
            <p className="mt-3 text-sm font-medium leading-7 text-slate-500">两套题库都提供即时判分、逐题解析和云端进度，共1000题。</p>
          </div>
          <div className="mt-7 space-y-4">
            <Link href={`/subjects/${subjectId}/grammar/practice/mixed`} className="group block rounded-[28px] bg-slate-950 p-6 text-white transition hover:bg-slate-900">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Mixed challenge</p>
              <h3 className="mt-3 text-2xl font-black">500题综合混合练习</h3>
              <p className="mt-3 text-sm font-medium leading-7 text-white/65">所有考点混合出现，实时反馈并解释为什么。</p>
              <span className="mt-7 inline-flex items-center gap-2 text-sm font-black">开始挑战 <span className="transition group-hover:translate-x-1">→</span></span>
            </Link>
            <Link href={`/subjects/${subjectId}/grammar/practice/tense`} className="group block rounded-[28px] bg-cyan-600 p-6 text-white transition hover:bg-cyan-700">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">Tense challenge</p>
              <h3 className="mt-3 text-2xl font-black">500题时态专项训练</h3>
              <p className="mt-3 text-sm font-medium leading-7 text-white/70">13类主流时态混合判断，配原题解析。</p>
              <span className="mt-7 inline-flex items-center gap-2 text-sm font-black">开始专项 <span className="transition group-hover:translate-x-1">→</span></span>
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            <Link href={`/subjects/${subjectId}/grammar-guide`} className="block rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-black text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"><span className="block">🧠 语法大全 · 可视化知识地图</span><span className="mt-2 block text-xs">进入 →</span></Link>
            <Link href={`/subjects/${subjectId}/sentence-structure`} className="block rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-black text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700"><span className="block">🧩 句子结构 · 先看懂句子骨架</span><span className="mt-2 block text-xs">进入 →</span></Link>
          </div>
        </section>

        <p className="mt-10 text-center text-xs font-semibold leading-6 text-slate-400">课程依据剑桥初级英语语法主题体系与《英语语法系统课程·迁移训练版》整理，例句与练习为独立编写的学习材料。</p>
      </div>
    </main>
  );
}
