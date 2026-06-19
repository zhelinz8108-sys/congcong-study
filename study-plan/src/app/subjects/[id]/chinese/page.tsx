"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CHINESE_READING_PASSAGES,
  CHINESE_READING_TOPICS,
} from "@/lib/chinese-reading";

const moduleCards = [
  {
    name: "阅读理解",
    label: "主训练区",
    description: "按能力专题练概括、人物、句意、赏析、标题、中心、信息提取和非连续性文本。",
    status: "已上线",
    tone: "rose",
    href: "reading",
    items: ["20 分钟小练", "标准答案", "踩分点", "错因归类"],
  },
  {
    name: "基础运用",
    label: "下一阶段",
    description: "字词、句式、标点、修辞、病句、关联词，适合做选择题和语段修改。",
    status: "规划中",
    tone: "sky",
    items: ["词语辨析", "标点修辞", "病句修改", "关联词"],
  },
  {
    name: "作文训练",
    label: "表达能力",
    description: "审题、选材、结构、细节、开头结尾和整篇修改，后续可接入作文点评。",
    status: "规划中",
    tone: "emerald",
    items: ["审题立意", "素材库", "重点段", "修改清单"],
  },
  {
    name: "古诗文",
    label: "积累理解",
    description: "古诗默写、诗意理解、情感分析和文言启蒙，先做背诵与理解结合。",
    status: "规划中",
    tone: "amber",
    items: ["名句默写", "意象情感", "文言实词", "句子翻译"],
  },
  {
    name: "错题与成长档案",
    label: "复习闭环",
    description: "记录阅读训练里的错题、薄弱专题、常错表达和复习建议。",
    status: "已上线",
    tone: "violet",
    href: "mistakes",
    items: ["薄弱专题", "错因标签", "参考答案", "回到原文"],
  },
];

const toneClasses: Record<string, { card: string; badge: string; button: string }> = {
  rose: {
    card: "border-rose-200 bg-rose-50/40",
    badge: "bg-rose-600 text-white",
    button: "bg-rose-600 text-white hover:bg-rose-700",
  },
  sky: {
    card: "border-sky-200 bg-sky-50/40",
    badge: "bg-sky-100 text-sky-700",
    button: "bg-sky-600 text-white hover:bg-sky-700",
  },
  emerald: {
    card: "border-emerald-200 bg-emerald-50/40",
    badge: "bg-emerald-100 text-emerald-700",
    button: "bg-emerald-600 text-white hover:bg-emerald-700",
  },
  amber: {
    card: "border-amber-200 bg-amber-50/40",
    badge: "bg-amber-100 text-amber-700",
    button: "bg-amber-600 text-white hover:bg-amber-700",
  },
  violet: {
    card: "border-violet-200 bg-violet-50/40",
    badge: "bg-violet-100 text-violet-700",
    button: "bg-violet-600 text-white hover:bg-violet-700",
  },
};

export default function ChineseHomePage() {
  const { id: subjectId } = useParams<{ id: string }>();
  const questionCount = CHINESE_READING_PASSAGES.reduce(
    (sum, passage) => sum + passage.questions.length,
    0
  );

  return (
    <main className="min-h-screen bg-[#f7f6f2] px-5 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/subjects/${subjectId}`}
            className="text-sm font-bold text-stone-500 transition hover:text-slate-950"
          >
            ← 返回学科首页
          </Link>
          <Link
            href={`/subjects/${subjectId}/chinese/reading`}
            className="rounded-full border border-rose-100 bg-white px-4 py-2 text-sm font-black text-rose-700 shadow-sm transition hover:bg-rose-50"
          >
            开始阅读小练
          </Link>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_420px] lg:items-stretch">
          <div className="rounded-[34px] border border-stone-200 bg-white p-7 shadow-sm md:p-9">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-600">
              Chinese Exam Boost
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
              五年级语文提分训练
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600">
              第一版先做阅读理解闭环：原创短文、专题训练、提交后锁定答案、标准答案、踩分点、自评和错题复习。目标不是堆资料，而是让聪聪知道每道阅读题该怎么答、为什么扣分。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold text-stone-400">模块</p>
              <p className="mt-3 text-3xl font-black text-slate-950">5</p>
            </div>
            <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold text-stone-400">阅读专题</p>
              <p className="mt-3 text-3xl font-black text-rose-600">
                {CHINESE_READING_TOPICS.length}
              </p>
            </div>
            <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold text-stone-400">阅读题</p>
              <p className="mt-3 text-3xl font-black text-emerald-600">{questionCount}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {moduleCards.map((module) => {
            const tone = toneClasses[module.tone];
            const content = (
              <article
                className={`h-full rounded-[30px] border bg-white p-6 shadow-sm transition ${
                  tone.card
                } ${module.href ? "hover:-translate-y-0.5 hover:shadow-md" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${tone.badge}`}>
                    {module.label}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-500 shadow-sm">
                    {module.status}
                  </span>
                </div>
                <h2 className="mt-5 text-2xl font-black">{module.name}</h2>
                <p className="mt-3 min-h-16 text-sm leading-7 text-stone-600">
                  {module.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {module.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-600 shadow-sm"
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <div className="mt-6">
                  {module.href ? (
                    <span
                      className={`inline-flex rounded-2xl px-5 py-3 text-sm font-black transition ${tone.button}`}
                    >
                      打开{module.name}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-black text-stone-400">
                      后续建设
                    </span>
                  )}
                </div>
              </article>
            );

            return module.href ? (
              <Link
                key={module.name}
                href={`/subjects/${subjectId}/chinese/${module.href}`}
                className="block"
              >
                {content}
              </Link>
            ) : (
              <div key={module.name}>{content}</div>
            );
          })}
        </section>

        <section className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">阅读训练专题</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                先把阅读理解常见扣分点拆开练，熟悉答题模板后再做整套综合训练。
              </p>
            </div>
            <Link
              href={`/subjects/${subjectId}/chinese/reading`}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              查看全部专题
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {CHINESE_READING_TOPICS.map((topic, index) => (
              <div key={topic.key} className="rounded-2xl bg-stone-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-black text-rose-700 shadow-sm">
                    {index + 1}
                  </span>
                  <h3 className="font-black">{topic.name}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-500">{topic.goal}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
