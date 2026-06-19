"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CHINESE_READING_PASSAGES,
  CHINESE_READING_TOPICS,
  getChineseReadingPassagesByTopic,
} from "@/lib/chinese-reading";

const levelStyle = {
  基础: "border-emerald-200 bg-emerald-50 text-emerald-700",
  提高: "border-amber-200 bg-amber-50 text-amber-700",
  挑战: "border-rose-200 bg-rose-50 text-rose-700",
} as const;

export default function ChineseReadingPage() {
  const { id: subjectId } = useParams<{ id: string }>();
  const totalQuestions = CHINESE_READING_PASSAGES.reduce(
    (sum, passage) => sum + passage.questions.length,
    0
  );

  return (
    <main className="min-h-screen bg-[#f7f6f2] px-5 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/subjects/${subjectId}/chinese`}
            className="text-sm font-bold text-rose-700 transition hover:text-rose-900"
          >
            ← 返回语文首页
          </Link>
          <Link
            href={`/subjects/${subjectId}/chinese/mistakes`}
            className="rounded-full border border-rose-100 bg-white px-4 py-2 text-sm font-bold text-rose-700 shadow-sm transition hover:bg-rose-50"
          >
            查看错题与薄弱点
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-[1fr_360px] md:items-stretch">
          <div className="rounded-[32px] border border-stone-200 bg-white p-7 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-600">
              Grade 5 Reading Training
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">五年级阅读理解</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-stone-600">
              按能力专题练阅读。每次一篇原创短文，6 道题，选择题即时判分，填空和简答提交后锁定答案，再看标准答案、踩分点和答题模板。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold text-stone-400">专题</p>
              <p className="mt-3 text-3xl font-black text-rose-600">
                {CHINESE_READING_TOPICS.length}
              </p>
            </div>
            <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold text-stone-400">文章</p>
              <p className="mt-3 text-3xl font-black text-sky-600">
                {CHINESE_READING_PASSAGES.length}
              </p>
            </div>
            <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold text-stone-400">题目</p>
              <p className="mt-3 text-3xl font-black text-emerald-600">{totalQuestions}</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {CHINESE_READING_TOPICS.map((topic, topicIndex) => {
            const passages = getChineseReadingPassagesByTopic(topic.key);
            return (
              <article
                key={topic.key}
                className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm"
              >
                <div className="grid gap-4 border-b border-stone-100 px-5 py-5 md:grid-cols-[1fr_240px] md:items-center md:px-6">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-base font-black text-rose-700">
                      {topicIndex + 1}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-black">{topic.name}</h2>
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">
                          {passages.length} 篇 · 每篇 20 分钟
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{topic.goal}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-700">{topic.method}</p>
                    </div>
                  </div>
                  <Link
                    href={`/subjects/${subjectId}/chinese/reading/session/${passages[0]?.id}`}
                    className="inline-flex justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
                  >
                    开始本专题
                  </Link>
                </div>

                <div className="grid gap-3 bg-stone-50/60 p-4 md:grid-cols-3 md:p-5">
                  {passages.map((passage) => (
                    <Link
                      key={passage.id}
                      href={`/subjects/${subjectId}/chinese/reading/session/${passage.id}`}
                      className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${
                            levelStyle[passage.difficulty]
                          }`}
                        >
                          {passage.difficulty}
                        </span>
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">
                          {passage.genre}
                        </span>
                      </div>
                      <h3 className="mt-4 text-lg font-black">{passage.title}</h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-500">
                        {passage.focus}
                      </p>
                      <p className="mt-4 text-sm font-bold text-rose-700">
                        {passage.questions.length} 题 · 查看标准答案和踩分点 →
                      </p>
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
