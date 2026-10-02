"use client";

import Link from "next/link";
import NationalDayEnglishSection from "@/components/national-day-english-lesson";
import type { NationalDaySection } from "@/lib/national-day-english";
import { useNationalDayProgress } from "@/lib/national-day-english-progress";

export default function NationalDayEnglishBook({ subjectId, sections, pdfUrl, questionCount }: {
  subjectId: string;
  sections: NationalDaySection[];
  pdfUrl: string;
  questionCount: number;
}) {
  // Every section shares a single cloud state for answers and writing drafts.
  const learning = useNationalDayProgress(subjectId);
  const { progress, ready } = learning;
  const completed = new Set(progress.completedSections);
  const lessons = sections.filter((section) => section.category === "lesson");
  const completedLessons = lessons.filter((section) => completed.has(section.id)).length;
  const attempts = Object.values(progress.attempts);
  const checked = attempts.filter((attempt) => attempt.checked).length;
  const correct = attempts.filter((attempt) => attempt.checked && attempt.correct).length;
  const mistakes = attempts.filter((attempt) => attempt.checked && attempt.correct === false).length;
  const resume = sections.find((section) => section.id === progress.lastSection) ?? sections[0];

  return (
    <main className="min-h-screen bg-white text-stone-800">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-7 sm:px-6">
        <Link href={`/subjects/${subjectId}`} className="inline-flex rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-500 transition hover:text-orange-700">← 返回英语</Link>
        <header className="mt-6 rounded-[28px] border border-orange-100 bg-orange-50/60 p-6 sm:p-8">
          <p className="text-sm font-bold text-orange-700">🍁 国庆英语 · 完整学习长页</p>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight sm:text-4xl">从第一句开始，<br />一路往下学。</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">全部讲解、例句、词组表、阅读、听读、写作和练习都在这一页。按原文顺序向下读，读懂一个知识点，就直接做下面的题。</p>
          <p className="mt-4 text-xs font-semibold leading-6 text-orange-800">24 个主题 · {lessons.length} 节讲解 · {questionCount} 道原题 · 105 页原文</p>
          <p className="mt-3 text-xs leading-6 text-stone-500">不需要选择分类，也不需要进入章节。题目作答后即时核对，学习进度和写作草稿继续保存到云端。</p>
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-5 block rounded-2xl border border-stone-200 bg-white px-5 py-3 text-center text-sm font-semibold text-stone-600 hover:bg-stone-50">对照原 PDF · 105 页 ↗</a>
          <a href={pdfUrl} download="小学至初一英语语法详解_扩充版.pdf" className="mt-3 block text-center text-xs font-semibold text-stone-500 underline decoration-stone-300 underline-offset-4">下载原 PDF</a>
        </header>

        <section aria-label="学习进度" className="mt-6 rounded-3xl border border-stone-200 p-5">
          <p className="text-sm font-bold">我的学习进度</p>
          <p className="mt-3 text-sm text-stone-600">讲解学完 {ready ? completedLessons : "--"} / {lessons.length} 节</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-orange-300 transition-all" style={{ width: `${completedLessons / lessons.length * 100}%` }} /></div>
          <p className="mt-3 text-xs leading-6 text-stone-500">已核对 {ready ? checked : "--"} 题 · 已掌握 {ready ? correct : "--"} 题 · 待巩固 {ready ? mistakes : "--"} 题</p>
          {ready && (checked > 0 || completed.size > 0 || Object.keys(progress.drafts).length > 0) && <a href={`#section-${resume.id}`} className="mt-3 block text-sm font-semibold leading-6 text-orange-700 underline decoration-orange-200 underline-offset-4">回到上次学习的位置 ↓</a>}
        </section>

        <div className="mt-10 space-y-12" aria-label="全部学习内容">
          {sections.map((section, index) => <NationalDayEnglishSection key={section.id} section={section} index={index} pdfUrl={pdfUrl} learning={learning} />)}
        </div>

        <footer id="national-day-book-end" className="mt-12 rounded-3xl border border-orange-100 bg-orange-50/60 p-6 text-center">
          <p className="text-lg font-bold text-stone-800">已经读到最后了 🍁</p>
          <p className="mt-3 text-sm leading-7 text-stone-600">所有学习内容都在上方。回头再练一遍还不熟悉的题，把规则变成自己的表达。</p>
          <Link href={`/subjects/${subjectId}`} className="mt-4 inline-block text-sm font-semibold text-orange-700">← 返回英语</Link>
        </footer>
      </div>
    </main>
  );
}
