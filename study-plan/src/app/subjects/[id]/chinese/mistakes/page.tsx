"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";

type MistakeRecord = {
  id: string;
  topicKey: string;
  topicName: string;
  passageId: string;
  passageTitle: string;
  questionId: string;
  questionPrompt: string;
  response: string;
  answer: string;
  mistakeTags: string[];
  scoringPoints: string[];
  updatedAt: string;
};

const mistakesStorageKey = "congcong_chinese_reading_mistakes";

function readMistakes() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(mistakesStorageKey) ?? "[]");
    return Array.isArray(parsed) ? (parsed as MistakeRecord[]) : [];
  } catch {
    return [];
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(
    2,
    "0"
  )}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function ChineseMistakesPage() {
  const { id: subjectId } = useParams<{ id: string }>();
  const [mistakes, setMistakes] = useState<MistakeRecord[]>(() => readMistakes());

  const grouped = useMemo(() => {
    const map = new Map<string, MistakeRecord[]>();
    mistakes.forEach((mistake) => {
      const key = mistake.topicName || "未分类";
      map.set(key, [...(map.get(key) ?? []), mistake]);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [mistakes]);

  const clearMistakes = () => {
    window.localStorage.setItem(mistakesStorageKey, "[]");
    setMistakes([]);
  };

  return (
    <main className="min-h-screen bg-[#f7f6f2] px-5 py-8 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/subjects/${subjectId}/chinese`}
            className="text-sm font-bold text-rose-700 transition hover:text-rose-900"
          >
            ← 返回语文首页
          </Link>
          <Link
            href={`/subjects/${subjectId}/chinese/reading`}
            className="rounded-full border border-rose-100 bg-white px-4 py-2 text-sm font-bold text-rose-700 shadow-sm transition hover:bg-rose-50"
          >
            继续阅读训练
          </Link>
        </header>

        <section className="rounded-[32px] border border-stone-200 bg-white p-7 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-600">
                Reading Mistakes
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight">语文错题与薄弱点</h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-stone-600">
                这里记录阅读训练里答错、部分正确或不会的题。复习时先看错因标签，再回到原题按踩分点重新组织答案。
              </p>
            </div>
            <div className="rounded-[24px] bg-stone-50 p-5 text-center">
              <p className="text-3xl font-black text-rose-600">{mistakes.length}</p>
              <p className="mt-1 text-xs font-bold text-stone-400">待复习</p>
            </div>
          </div>
        </section>

        {mistakes.length === 0 ? (
          <section className="rounded-[32px] border border-dashed border-stone-300 bg-white p-10 text-center">
            <h2 className="text-2xl font-black">暂时没有语文阅读错题</h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              做一篇阅读小练后，错误、部分正确和不会的题会自动出现在这里。
            </p>
            <Link
              href={`/subjects/${subjectId}/chinese/reading`}
              className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
            >
              去做阅读训练
            </Link>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearMistakes}
                className="rounded-xl border border-rose-100 bg-white px-4 py-2 text-sm font-black text-rose-700 transition hover:bg-rose-50"
              >
                清空本地错题
              </button>
            </div>

            {grouped.map(([topicName, records]) => (
              <article
                key={topicName}
                className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
                  <h2 className="text-xl font-black">{topicName}</h2>
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">
                    {records.length} 题
                  </span>
                </div>

                <div className="divide-y divide-stone-100">
                  {records.map((record) => (
                    <div key={record.id} className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_240px]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">
                            {record.passageTitle}
                          </span>
                          <span className="text-xs font-bold text-stone-400">
                            {formatDate(record.updatedAt)}
                          </span>
                        </div>
                        <h3 className="mt-3 text-base font-black leading-7">
                          {record.questionPrompt}
                        </h3>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl bg-rose-50 p-4">
                            <p className="text-xs font-black text-rose-600">你的答案</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-rose-800">
                              {record.response}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-emerald-50 p-4">
                            <p className="text-xs font-black text-emerald-600">参考答案</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-emerald-800">
                              {record.answer}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-stone-50 p-4">
                        <p className="text-xs font-black text-stone-500">复习重点</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {record.mistakeTags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <ul className="mt-4 space-y-2 text-xs leading-5 text-stone-600">
                          {record.scoringPoints.map((point) => (
                            <li key={point}>• {point}</li>
                          ))}
                        </ul>
                        <Link
                          href={`/subjects/${subjectId}/chinese/reading/session/${record.passageId}`}
                          className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white"
                        >
                          回到原文
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
