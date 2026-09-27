"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function GrammarPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-stone-50 px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/subjects/${id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-stone-400 transition-colors hover:text-stone-700"
        >
          ← 返回英语
        </Link>

        <section className="mt-8 rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-24 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-2xl">
            📚
          </div>
          <h1 className="mt-5 text-2xl font-bold text-stone-800">语法板块待重做</h1>
          <p className="mt-2 text-sm text-stone-400">原有内容已清空</p>
        </section>
      </div>
    </main>
  );
}
