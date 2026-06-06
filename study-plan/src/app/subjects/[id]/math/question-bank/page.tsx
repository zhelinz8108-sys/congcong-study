"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type QuestionSet = {
  id: string;
  title: string;
  category: string;
  unit_label: string;
  unit_key?: string;
  unit_display?: string;
  import_status: string;
  question_count: number;
  ready_count: number;
  needs_review_count: number;
  source_only_count: number;
  latest_attempt_id?: string | null;
  latest_attempt_status?: string | null;
  latest_total_score?: number | null;
  latest_max_score?: number | null;
};

type FilterOption = { name: string; count: number; value?: string };

export default function MathQuestionBankPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [units, setUnits] = useState<FilterOption[]>([]);
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [attempted, setAttempted] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);

  const loadSets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (unit) params.set("unit", unit);
      if (attempted) params.set("attempted", attempted);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/math/question-sets?${params.toString()}`);
      if (!res.ok) throw new Error("question bank API failed");
      const data = await res.json();
      setSets(data.sets ?? []);
      setCategories(data.filters?.categories ?? []);
      setUnits(data.filters?.units ?? []);
    } catch {
      setSets([]);
      setCategories([]);
      setUnits([]);
      setError("题库数据库还没有连接。请先启动 PostgreSQL，或配置 DATABASE_URL，然后运行 npm run math:import:reset。");
    } finally {
      setLoading(false);
    }
  }, [attempted, category, search, unit]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSets();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSets]);

  const summary = useMemo(
    () => ({
      sets: sets.length,
      questions: sets.reduce((sum, item) => sum + Number(item.question_count ?? 0), 0),
      ready: sets.reduce((sum, item) => sum + Number(item.ready_count ?? 0), 0),
      review: sets.reduce((sum, item) => sum + Number(item.needs_review_count ?? 0), 0),
    }),
    [sets]
  );

  const startPractice = async (setId: string) => {
    setStartingId(setId);
    const res = await fetch("/api/math/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ set_id: setId }),
    });
    const attempt = await res.json();
    setStartingId(null);
    if (res.ok) router.push(`/subjects/${id}/math/question-bank/${setId}?attempt=${attempt.id}`);
    else alert(attempt.error ?? "无法开始练习");
  };

  return (
    <main className="min-h-screen bg-[#faf9f6] px-4 py-6 text-neutral-950 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href={`/subjects/${id}`} className="text-sm font-medium text-neutral-500 hover:text-neutral-950">
              ← 返回数学主页
            </Link>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-neutral-400">
              Math Question Bank
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              数学互动题库
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-500">
              从本地五年级下册资料导入，按题集练习、提交后批改，并自动沉淀错题。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/subjects/${id}/math/generated-practice`}
              className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50"
            >
              PDF 新题训练
            </Link>
            <Link
              href={`/subjects/${id}/math/question-bank/mistakes`}
              className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50"
            >
              查看错题本
            </Link>
          </div>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-2xl font-semibold">{summary.sets}</p>
            <p className="text-sm text-neutral-500">题集</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-2xl font-semibold">{summary.questions}</p>
            <p className="text-sm text-neutral-500">题目</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-2xl font-semibold">{summary.ready}</p>
            <p className="text-sm text-neutral-500">可自动判分</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-2xl font-semibold">{summary.review}</p>
            <p className="text-sm text-neutral-500">需复核</p>
          </div>
        </section>

        <section className="mb-5 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 md:grid-cols-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索题集"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          >
            <option value="">全部分类</option>
            {categories.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.count})
              </option>
            ))}
          </select>
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          >
            <option value="">全部单元</option>
            {units.map((item) => (
              <option key={item.value ?? item.name} value={item.value ?? item.name}>
                {item.name} ({item.count})
              </option>
            ))}
          </select>
          <select
            value={attempted}
            onChange={(event) => setAttempted(event.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          >
            <option value="">全部状态</option>
            <option value="new">还没练过</option>
            <option value="done">已经练过</option>
          </select>
        </section>

        {loading ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500">
            正在加载题库...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
            <p className="font-semibold">题库暂不可用</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : sets.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500">
            还没有题集。请先在项目目录运行 <code className="rounded bg-neutral-100 px-1">npm run math:import:reset</code>。
          </div>
        ) : (
          <div className="grid gap-3">
            {sets.map((set) => {
              const done = set.latest_attempt_status === "submitted";
              return (
                <article key={set.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                        <span className="rounded-full bg-neutral-100 px-2 py-1">{set.category || "未分类"}</span>
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{set.unit_display || set.unit_label || "未标单元｜综合资料"}</span>
                        <span className="rounded-full bg-neutral-100 px-2 py-1">{set.import_status}</span>
                      </div>
                      <h2 className="mt-2 text-lg font-semibold leading-7">{set.title}</h2>
                      <p className="mt-1 text-sm text-neutral-500">
                        {set.question_count} 题 · {set.ready_count} 可自动判分 · {set.needs_review_count} 需复核
                        {done && set.latest_max_score ? ` · 最近 ${set.latest_total_score}/${set.latest_max_score} 分` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {done && set.latest_attempt_id && (
                        <Link
                          href={`/subjects/${id}/math/question-bank/attempts/${set.latest_attempt_id}/result`}
                          className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
                        >
                          看结果
                        </Link>
                      )}
                      <button
                        onClick={() => startPractice(set.id)}
                        disabled={startingId === set.id}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {startingId === set.id ? "启动中..." : done ? "再练一次" : "开始练习"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
