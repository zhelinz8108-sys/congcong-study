"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type CSSProperties } from "react";
import { useNationalDayMathProgress } from "@/lib/national-day-math-progress";
import { getNationalDayMathPalette } from "@/lib/national-day-math-colors";
import {
  nationalDayMathChapterStats,
  nationalDayMathSectionHref,
  type NationalDayMathChapterSummary,
} from "@/lib/national-day-math-chapters";
import styles from "./national-day-math-book.module.css";

export default function NationalDayMathDirectory({
  subjectId,
  chapters,
}: {
  subjectId: string;
  chapters: NationalDayMathChapterSummary[];
}) {
  const { progress, ready } = useNationalDayMathProgress(subjectId);
  const router = useRouter();
  const quizIds = chapters.flatMap((chapter) => chapter.quizIds);
  const stats = nationalDayMathChapterStats(quizIds, progress.attempts);
  const completionIds = chapters.flatMap(
    (chapter) => chapter.completionSectionIds,
  );
  const completed = new Set(progress.completedSections);
  const finished = completionIds.filter((id) => completed.has(id)).length;
  const resumeHref = nationalDayMathSectionHref(
    subjectId,
    progress.lastSection,
  );
  useEffect(() => {
    // Old long-page bookmarks still reach the same original content section.
    const prefix = "#math-section-";
    const hash = window.location.hash;
    if (!hash.startsWith(prefix)) return;
    const destination = nationalDayMathSectionHref(
      subjectId,
      hash.slice(prefix.length),
    );
    if (destination) router.replace(destination);
  }, [subjectId, router]);

  return (
    <main
      className="min-h-screen bg-white text-slate-800"
      data-national-day-math-directory
    >
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <Link href={`/subjects/${subjectId}`} className={styles.directoryBack}>
          ← 返回数学
        </Link>
        <header
          className={`mt-6 rounded-[28px] border p-6 sm:p-8 ${styles.hero}`}
        >
          <p className="text-sm font-bold text-sky-700">
            🍁 国庆数学 · 三天完整学习
          </p>
          <h1 className="mt-4 text-3xl font-black leading-snug text-slate-800 sm:text-4xl">
            先选一个章节，
            <br />
            再一步一步学明白。
          </h1>
          <p className="mt-4 text-[15px] leading-8 text-slate-600">
            知识点、图解、例题和自测已按教材章节整理。进入章节后，依然从上往下学习，不用打开PDF。
          </p>
          <p className="mt-4 text-sm font-bold leading-7 text-sky-800">
            7个章节 · 4个配套主题活动 · 117道例题 · 89道诊断与自测
          </p>
        </header>
        <section
          aria-label="国庆数学学习进度"
          data-math-directory-stats
          className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6"
        >
          <h2 className="text-base font-bold">我的学习进度</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            已读完 {ready ? finished : "--"} / {completionIds.length}{" "}
            个单元与活动
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            已答 {ready ? stats.answered : "--"} / {stats.total} 题 · 答对{" "}
            {ready ? stats.correct : "--"} 题 · 待订正{" "}
            {ready ? stats.wrong : "--"} 题
          </p>
          <p className="mt-3 text-base font-bold text-sky-800">
            正确率{" "}
            {ready
              ? stats.accuracy === null
                ? "— · 尚未作答"
                : `${stats.accuracy}%`
              : "读取中…"}
          </p>
          <p className="mt-2 text-xs leading-6 text-slate-500">
            正确率按当前系统判题记录统计；自行标记读完和旧版自评不算答对。原有草稿、判分和阅读进度全部保留。
          </p>
          {ready && resumeHref && (
            <Link
              href={resumeHref}
              prefetch={false}
              className={styles.directoryBack}
            >
              继续上次学习 →
            </Link>
          )}
        </section>
        <nav aria-label="国庆数学章节目录" className="mt-8 space-y-4">
          {chapters.map((chapter) => {
            const palette = getNationalDayMathPalette(chapter.colorId);
            const colors = {
              "--math-accent": palette.accent,
              "--math-soft": palette.soft,
              "--math-border": palette.border,
              "--math-marker": palette.marker,
            } as CSSProperties;
            const chapterStats = nationalDayMathChapterStats(
              chapter.quizIds,
              progress.attempts,
            );
            const readCount = chapter.completionSectionIds.filter((id) =>
              completed.has(id),
            ).length;
            return (
              <Link
                key={chapter.id}
                href={`/subjects/${subjectId}/national-day-math/${chapter.id}`}
                prefetch={false}
                data-math-chapter-link={chapter.id}
                style={colors}
                className={styles.directoryCard}
              >
                <p className={styles.directoryLabel}>
                  {chapter.kind === "chapter"
                    ? "教材章节"
                    : chapter.kind === "preparation"
                      ? "开始之前"
                      : "学完之后"}
                </p>
                <h2 className="mt-2 text-xl font-black leading-8">
                  {chapter.title}
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {chapter.subtitle}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {chapter.examples}道例题 · {chapterStats.total}道自测
                  {chapter.completionSectionIds.length > 0 &&
                    ` · 已读完 ${ready ? readCount : "--"}/${chapter.completionSectionIds.length} 个单元与活动`}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  已答 {ready ? chapterStats.answered : "--"} 题 · 答对{" "}
                  {ready ? chapterStats.correct : "--"} 题
                </p>
                <p className={styles.directoryAccuracy}>
                  正确率{" "}
                  {ready
                    ? chapterStats.accuracy === null
                      ? "— · 尚未作答"
                      : `${chapterStats.accuracy}%`
                    : "读取中…"}
                </p>
                <span className="mt-3 block text-sm font-bold">进入学习 →</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </main>
  );
}
