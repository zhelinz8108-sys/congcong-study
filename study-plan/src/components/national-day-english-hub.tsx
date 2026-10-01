"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { NationalDaySectionSummary } from "@/lib/national-day-english";
import { useNationalDayProgress } from "@/lib/national-day-english-progress";

type View = "lesson" | "practice" | "reference" | "mistakes";

function shortTitle(title: string) {
  return title.replace(/^\d{2}(?:\.\d+)?\s+/, "");
}

export default function NationalDayEnglishHub({ subjectId, sections, pdfUrl, questionCount }: {
  subjectId: string;
  sections: NationalDaySectionSummary[];
  pdfUrl: string;
  questionCount: number;
}) {
  const { progress, ready } = useNationalDayProgress(subjectId);
  const [view, setView] = useState<View>("lesson");
  const [expanded, setExpanded] = useState("01");
  const base = `/subjects/${subjectId}/national-day-english`;
  const completed = new Set(progress.completedSections);
  const lessonCount = sections.filter((section) => section.category === "lesson").length;
  const completedLessons = sections.filter((section) => section.category === "lesson" && completed.has(section.id)).length;
  const attempts = Object.values(progress.attempts);
  const checked = attempts.filter((attempt) => attempt.checked).length;
  const correct = attempts.filter((attempt) => attempt.checked && attempt.correct).length;
  const needsPractice = (section: NationalDaySectionSummary) => section.questionIds.filter((id) => progress.attempts[id]?.checked && progress.attempts[id]?.correct === false).length;
  const mistakes = attempts.filter((attempt) => attempt.checked && attempt.correct === false).length;
  const resume = sections.find((section) => section.id === progress.lastSection) ?? sections[0];
  const topics = useMemo(() => sections.filter((section) => section.category === "lesson" && section.id === section.topic), [sections]);

  const sectionLink = (section: NationalDaySectionSummary) => {
    const answered = section.questionIds.filter((id) => progress.attempts[id]?.checked).length;
    const wrong = needsPractice(section);
    return (
      <Link key={section.id} href={`${base}/${section.id}`} className="block rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-orange-200 hover:bg-orange-50/50 focus-visible:outline-2 focus-visible:outline-orange-400">
        <p className="text-sm font-bold leading-6 text-stone-800">{completed.has(section.id) ? "✓ " : ""}{shortTitle(section.title)}</p>
        <p className="mt-2 text-xs leading-5 text-stone-500">原 PDF 第 {section.page} 页{section.questionIds.length > 0 ? ` · ${answered} / ${section.questionIds.length} 题已核对` : " · 阅读与整理"}{wrong > 0 ? ` · ${wrong} 题待巩固` : ""}</p>
        <span className="mt-3 block text-xs font-bold text-orange-700">{completed.has(section.id) ? "再读一遍" : "进入学习"} →</span>
      </Link>
    );
  };

  return (
    <main className="min-h-screen bg-white text-stone-800">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-7 sm:px-6">
        <Link href={`/subjects/${subjectId}`} className="inline-flex rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-500 transition hover:text-orange-700">← 返回英语</Link>
        <header className="mt-6 rounded-[28px] border border-orange-100 bg-orange-50/60 p-6 sm:p-8">
          <p className="text-sm font-bold text-orange-700">🍁 国庆英语</p>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight sm:text-4xl">把英语基础，<br />一页一页学明白。</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">从小学到初一，跟着原文理解规则、观察例句，再亲手作答。每道原题都能查看对应答案与解析。</p>
          <p className="mt-4 text-xs font-semibold leading-6 text-orange-800">24 个主题 · {lessonCount} 节讲解 · {questionCount} 道原题 · 105 页原文</p>
          <Link href={`${base}/${resume.id}`} className="mt-6 block rounded-2xl border border-orange-200 bg-orange-100 px-5 py-3.5 text-center text-sm font-bold text-orange-900 transition hover:bg-orange-200">{ready && (checked > 0 || completedLessons > 0) ? `继续学习：${shortTitle(resume.title)}` : "从第 1 节开始"} →</Link>
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-3 block rounded-2xl border border-stone-200 bg-white px-5 py-3 text-center text-sm font-semibold text-stone-600 hover:bg-stone-50">查看原 PDF · 105 页 ↗</a>
          <a href={pdfUrl} download="小学至初一英语语法详解_扩充版.pdf" className="mt-3 block text-center text-xs font-semibold text-stone-500 underline decoration-stone-300 underline-offset-4">下载原 PDF</a>
        </header>

        <section aria-label="学习进度" className="mt-6 rounded-3xl border border-stone-200 p-5">
          <p className="text-sm font-bold">我的学习进度</p>
          <p className="mt-3 text-sm text-stone-600">讲解学完 {ready ? completedLessons : "--"} / {lessonCount} 节</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-orange-300 transition-all" style={{ width: `${completedLessons / lessonCount * 100}%` }} /></div>
          <p className="mt-3 text-xs leading-6 text-stone-500">已核对 {ready ? checked : "--"} 题 · 已掌握 {ready ? correct : "--"} 题 · 待巩固 {ready ? mistakes : "--"} 题</p>
        </section>

        <section className="mt-8" aria-label="学习目录">
          <label className="block text-sm font-bold" htmlFor="national-day-view">选择学习内容</label>
          <select id="national-day-view" value={view} onChange={(event) => setView(event.target.value as View)} className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-orange-300">
            <option value="lesson">语法讲解 · 24 个主题</option>
            <option value="practice">阅读、听读、写作与综合练习</option>
            <option value="reference">词组、动词表与复习工具</option>
            <option value="mistakes">待巩固的题目 · {mistakes} 题</option>
          </select>
          <div className="mt-5 space-y-4">
            {view === "lesson" && topics.map((topic) => {
              const lessons = sections.filter((section) => section.topic === topic.id);
              const done = lessons.filter((section) => completed.has(section.id)).length;
              return (
                <article key={topic.id} className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
                  <button type="button" aria-expanded={expanded === topic.id} aria-controls={`topic-${topic.id}`} onClick={() => setExpanded(expanded === topic.id ? "" : topic.id)} className="block w-full p-5 text-left transition hover:bg-orange-50/40">
                    <span className="block text-xs font-bold text-orange-700">主题 {topic.id}</span>
                    <span className="mt-2 block text-lg font-bold leading-7">{shortTitle(topic.title)}</span>
                    <span className="mt-2 block text-xs text-stone-500">{lessons.length} 节 · 已学完 {done} 节 · {expanded === topic.id ? "收起 ↑" : "展开 ↓"}</span>
                  </button>
                  {expanded === topic.id && <div id={`topic-${topic.id}`} className="space-y-3 border-t border-stone-100 bg-stone-50/50 p-4">{lessons.map(sectionLink)}</div>}
                </article>
              );
            })}
            {(view === "practice" || view === "reference") && sections.filter((section) => section.category === view).map(sectionLink)}
            {view === "mistakes" && (mistakes > 0 ? <><p className="px-1 text-sm leading-7 text-stone-500">进入下面的章节，选择“只看待巩固”，重新作答。掌握后会自动移出这个列表。</p>{sections.filter((section) => needsPractice(section) > 0).map(sectionLink)}</> : <p className="rounded-2xl bg-emerald-50 p-5 text-sm leading-7 text-emerald-800">{ready ? "暂时没有待巩固的题目。开始练习后，需要再想一想的题会出现在这里。" : "正在读取学习进度……"}</p>)}
          </div>
        </section>
      </div>
    </main>
  );
}
