"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadListeningProgress,
  readListeningProgress,
  type ListeningProgressStore,
} from "@/lib/listening-yiben-storage";
import type { ListeningExerciseSummary } from "@/lib/listening-yiben-types";

type Props = {
  subjectId: string;
  title: string;
  exercises: ListeningExerciseSummary[];
};

const partMeta: Record<string, { range: string; description: string; tone: string }> = {
  话题训练: {
    range: "Exercise 1-55",
    description: "人物、生活、学校、旅行、文化与环境等 11 个常见话题。",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  题型专练: {
    range: "Exercise 56-70",
    description: "长对话与短文理解专项，集中突破信息定位和整体理解。",
    tone: "border-blue-200 bg-blue-50 text-blue-800",
  },
  小升初综合训练: {
    range: "Exercise 71-100",
    description: "完整套题综合训练，衔接小升初真实答题节奏。",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
};

export default function YibenListeningIndex({ subjectId, title, exercises }: Props) {
  const [progress, setProgress] = useState<ListeningProgressStore>({ exercises: {} });

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setProgress(readListeningProgress());
      void loadListeningProgress().then((saved) => {
        if (active) setProgress(saved);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const grouped = useMemo(() => {
    const result = new Map<string, Map<string, ListeningExerciseSummary[]>>();
    exercises.forEach((exercise) => {
      if (!result.has(exercise.part)) result.set(exercise.part, new Map());
      const topics = result.get(exercise.part)!;
      if (!topics.has(exercise.topic)) topics.set(exercise.topic, []);
      topics.get(exercise.topic)!.push(exercise);
    });
    return result;
  }, [exercises]);

  const completed = exercises.filter(
    (exercise) => progress.exercises[String(exercise.number).padStart(3, "0")]?.submitted,
  ).length;
  const totalBest = exercises.reduce((sum, exercise) => {
    const saved = progress.exercises[String(exercise.number).padStart(3, "0")];
    return sum + (saved?.submitted ? saved.bestScore : 0);
  }, 0);
  const totalPossible = exercises.reduce((sum, exercise) => {
    const saved = progress.exercises[String(exercise.number).padStart(3, "0")];
    return sum + (saved?.submitted ? saved.total : 0);
  }, 0);

  return (
    <main className="min-h-screen bg-[#f6f8f7] px-4 py-6 text-neutral-950 sm:px-6 sm:py-9">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-neutral-200 pb-7">
          <Link
            href={`/subjects/${subjectId}`}
            className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-900"
          >
            <span aria-hidden="true">←</span> 返回英语听力
          </Link>
          <div className="mt-7 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
                Grade 6 Listening
              </p>
              <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">{title}</h1>
              <p className="mt-3 text-sm leading-7 text-neutral-600 sm:text-base">
                每篇配套原书题面与官方音频。答完全部必答项后提交整篇，再统一查看成绩、答案、听力原文和中文翻译。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm">
              <div className="rounded-xl bg-neutral-50 px-4 py-3 text-center">
                <p className="text-xl font-black">100</p>
                <p className="text-xs text-neutral-500">篇训练</p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-emerald-700">
                <p className="text-xl font-black">{completed}</p>
                <p className="text-xs">已完成</p>
              </div>
              <div className="rounded-xl bg-blue-50 px-4 py-3 text-center text-blue-700">
                <p className="text-xl font-black">
                  {totalPossible ? Math.round((totalBest / totalPossible) * 100) : 0}%
                </p>
                <p className="text-xs">最佳正确率</p>
              </div>
            </div>
          </div>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${completed}%` }}
            />
          </div>
        </header>

        <div className="mt-8 space-y-10">
          {Array.from(grouped.entries()).map(([part, topics]) => {
            const meta = partMeta[part];
            return (
              <section key={part}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black">{part}</h2>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${meta?.tone}`}>
                        {meta?.range}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{meta?.description}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-7">
                  {Array.from(topics.entries()).map(([topic, topicExercises]) => (
                    <div key={topic}>
                      <div className="mb-3 flex items-center gap-3">
                        <h3 className="text-base font-black text-neutral-800">{topic}</h3>
                        <span className="text-xs font-semibold text-neutral-400">
                          {topicExercises[0].number}-{topicExercises.at(-1)?.number}
                        </span>
                        <span className="h-px flex-1 bg-neutral-200" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {topicExercises.map((exercise) => {
                          const saved = progress.exercises[String(exercise.number).padStart(3, "0")];
                          const complete = Boolean(saved?.submitted);
                          const hasDraft = Boolean(saved && !saved.submitted && Object.keys(saved.answers).length);
                          const bestPercent = saved?.total
                            ? Math.round((saved.bestScore / saved.total) * 100)
                            : 0;
                          return (
                            <Link
                              key={exercise.number}
                              href={`/subjects/${subjectId}/listening/yiben-grade-6/exercise/${exercise.number}`}
                              className={`group min-h-32 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
                                complete
                                  ? "border-emerald-200 bg-emerald-50/70"
                                  : "border-neutral-200 bg-white hover:border-emerald-300"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-black uppercase text-emerald-700">
                                  Exercise {exercise.number}
                                </p>
                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                                    complete
                                      ? "bg-emerald-600 text-white"
                                      : "bg-neutral-100 text-neutral-500 group-hover:bg-emerald-100 group-hover:text-emerald-800"
                                  }`}
                                >
                                  {complete ? "✓" : "→"}
                                </span>
                              </div>
                              <p className="mt-4 text-sm font-bold text-neutral-900">
                                {exercise.questionCount} 个答题项 · {exercise.pageCount} 页
                              </p>
                              <p className="mt-2 text-xs font-semibold text-neutral-500">
                                {complete
                                  ? `最佳 ${bestPercent}%`
                                  : hasDraft
                                    ? "继续未完成练习"
                                    : "尚未开始"}
                              </p>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
