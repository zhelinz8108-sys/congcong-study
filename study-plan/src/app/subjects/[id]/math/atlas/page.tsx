import { MathAtlas } from "@/components/math-atlas";

export const metadata = { title: "六上数学全知识点图解 · 聪聪学习计划" };

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

export default async function MathAtlasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full min-w-0 max-w-screen-2xl px-2 py-2 sm:px-6 sm:py-3">
      <a href={`/subjects/${id}`} className="mb-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#87432a] hover:underline">
        ← 返回数学首页
      </a>
      <MathAtlas />
    </main>
  );
}
