"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { MathText } from "@/components/math-text";
import solidBankData from "@/lib/math-solid-bank.json";

type SolidQuestion = {
  number: number;
  difficulty: string;
  category: string;
  prompt: string;
  answer: string;
  explanation: string;
};

type SolidBank = {
  title: string;
  subtitle: string;
  description: string;
  questionCount: number;
  difficultyCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  questions: SolidQuestion[];
};

const solidBank = solidBankData as SolidBank;

const difficultyClass: Record<string, string> = {
  提高: "border-emerald-200 bg-emerald-50 text-emerald-700",
  困难: "border-amber-200 bg-amber-50 text-amber-700",
  超级困难: "border-rose-200 bg-rose-50 text-rose-700",
};

function questionText(question: SolidQuestion) {
  return `${question.number} ${question.difficulty} ${question.category} ${question.prompt} ${question.answer} ${question.explanation}`;
}

export default function SolidProblemBankPage() {
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("全部难度");
  const [category, setCategory] = useState("全部题型");

  const difficulties = Object.keys(solidBank.difficultyCounts);
  const categories = Object.keys(solidBank.categoryCounts);

  const filteredQuestions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return solidBank.questions.filter((question) => {
      if (difficulty !== "全部难度" && question.difficulty !== difficulty) return false;
      if (category !== "全部题型" && question.category !== category) return false;
      if (!keyword) return true;
      return questionText(question).toLowerCase().includes(keyword);
    });
  }, [category, difficulty, query]);

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-6 text-neutral-950 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link
                href={`/subjects/${id}/math/problem-bank`}
                className="text-sm font-medium text-neutral-500 hover:text-neutral-950"
              >
                ← 返回题库
              </Link>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-blue-500">
                Solid Geometry Review
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                {solidBank.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-500">
                {solidBank.subtitle}。题目、答案和详解已整理成网页，适合大屏复习和检索。
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-blue-50 px-4 py-3">
                <p className="text-lg font-bold text-blue-700">{solidBank.questionCount}</p>
                <p className="text-xs text-neutral-500">总题数</p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-4 py-3">
                <p className="text-lg font-bold text-emerald-700">{filteredQuestions.length}</p>
                <p className="text-xs text-neutral-500">当前显示</p>
              </div>
              <div className="rounded-xl bg-amber-50 px-4 py-3">
                <p className="text-lg font-bold text-amber-700">{categories.length}</p>
                <p className="text-xs text-neutral-500">题型</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_180px_220px]">
            <label className="grid gap-1.5 text-sm font-semibold text-neutral-600">
              搜索题目 / 答案 / 解析
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例如：无盖、切割、水位、涂色小方块"
                className="min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-950 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-neutral-600">
              难度
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
                className="min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-950 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option>全部难度</option>
                {difficulties.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-neutral-600">
              题型
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-950 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option>全部题型</option>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <section className="mt-4 flex flex-wrap gap-2">
          {Object.entries(solidBank.difficultyCounts).map(([label, count]) => (
            <button
              key={label}
              onClick={() => setDifficulty(label)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                difficulty === label
                  ? difficultyClass[label] ?? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-neutral-200 bg-white text-neutral-500 hover:border-blue-200 hover:text-blue-700"
              }`}
            >
              {label} · {count}
            </button>
          ))}
          <button
            onClick={() => {
              setDifficulty("全部难度");
              setCategory("全部题型");
              setQuery("");
            }}
            className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900"
          >
            重置筛选
          </button>
        </section>

        <section className="mt-5 space-y-4">
          {filteredQuestions.map((question) => (
            <article
              key={question.number}
              id={`q-${question.number}`}
              className="scroll-mt-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-9 min-w-9 place-items-center rounded-full bg-neutral-950 px-2 text-sm font-bold text-white">
                    {question.number}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      difficultyClass[question.difficulty] ?? "border-blue-200 bg-blue-50 text-blue-700"
                    }`}
                  >
                    {question.difficulty}
                  </span>
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                    {question.category}
                  </span>
                </div>
                <a
                  href={`#q-${question.number}`}
                  className="text-xs font-semibold text-neutral-400 hover:text-blue-600"
                >
                  #{question.number}
                </a>
              </div>

              <p className="mt-4 text-lg font-semibold leading-8 text-neutral-950">
                <MathText text={question.prompt} />
              </p>

              <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(180px,260px)_1fr]">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-bold text-emerald-700">答案</p>
                  <p className="mt-2 text-base font-bold leading-7 text-emerald-950">
                    <MathText text={question.answer} />
                  </p>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <p className="text-xs font-bold text-blue-700">详解</p>
                  <p className="mt-2 text-sm font-medium leading-7 text-neutral-700">
                    <MathText text={question.explanation} />
                  </p>
                </div>
              </div>
            </article>
          ))}

          {filteredQuestions.length === 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
              没有匹配的题目，换一个关键词或重置筛选。
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
