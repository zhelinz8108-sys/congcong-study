"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Subject } from "@/lib/types";

export default function Home() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/subjects");
      if (!res.ok) throw new Error(`加载失败 (${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("数据格式错误");
      setSubjects(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const icons: Record<string, string> = {
    语文: "📖",
    数学: "🧮",
    英语: "🔤",
  };

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <div className="mb-10 text-center">
        <h1 className="mb-2 text-3xl font-bold">聪聪学习计划</h1>
        <p className="text-sm text-stone-400">选择科目，进入对应学习内容</p>
      </div>

      {loading && <div className="py-10 text-center text-stone-400">加载中...</div>}

      {error && (
        <div className="py-10 text-center">
          <p className="mb-3 text-red-500">{error}</p>
          <button
            onClick={load}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
          >
            重试
          </button>
        </div>
      )}

      <div className="space-y-4">
        {subjects.map((subject) => (
          <Link
            key={subject.id}
            href={`/subjects/${subject.id}`}
            className="block rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-colors hover:border-stone-400"
            style={{ borderLeftWidth: 4, borderLeftColor: subject.color }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{icons[subject.name] ?? subject.icon}</span>
                <span className="text-2xl font-bold">{subject.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-stone-400">
                  {subject.unit_count ?? 0} 单元 · {subject.material_count ?? 0} 资料
                </span>
                <span className="text-stone-400">→</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
