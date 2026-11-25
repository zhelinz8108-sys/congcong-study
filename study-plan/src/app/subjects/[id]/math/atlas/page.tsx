import Link from "next/link";
import { MathAtlas } from "@/components/math-atlas";

export const metadata = { title: "六上数学全知识点图解 · 聪聪学习计划" };

export default async function MathAtlasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-3 py-4 sm:px-5 sm:py-6">
      <Link href={`/subjects/${id}`} className="mb-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#87432a] hover:underline">
        ← 返回数学首页
      </Link>
      <MathAtlas />
    </main>
  );
}
