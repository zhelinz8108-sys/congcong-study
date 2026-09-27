import Link from "next/link";
import { GrammarOriginal500Practice } from "@/components/grammar-original-500-practice";

export default async function MixedGrammarPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-7 sm:px-7">
      <div className="mx-auto max-w-6xl">
        <Link href={`/subjects/${id}/grammar`} className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-violet-700">← 返回语法课程</Link>
        <GrammarOriginal500Practice />
      </div>
    </main>
  );
}
