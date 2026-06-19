import Link from "next/link";
import { notFound } from "next/navigation";
import { getTheWeekArticle } from "@/lib/the-week-reading";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string; articleId: string }>;
};

function paragraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default async function EnglishReadingArticlePage({ params }: Params) {
  const { id, articleId } = await params;
  const article = getTheWeekArticle(articleId);
  if (!article) notFound();

  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-6 text-slate-950 sm:px-6">
      <article className="mx-auto max-w-4xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/subjects/${id}/reading`}
            className="text-sm font-bold text-rose-700 transition hover:text-rose-900"
          >
            ← 返回阅读库
          </Link>
          <Link
            href={`/subjects/${id}`}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-black text-stone-500 shadow-sm transition hover:bg-stone-50"
          >
            英语主页
          </Link>
        </header>

        <section className="rounded-[36px] border border-stone-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700">
              {article.issue_date}
            </span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-bold text-stone-500">
              {article.source}
            </span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-bold text-stone-500">
              P{article.pages.join(", ")}
            </span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-bold text-stone-500">
              {article.word_count} words
            </span>
          </div>

          {article.section && (
            <p className="mt-7 text-xs font-black uppercase tracking-[0.22em] text-stone-400">
              {article.section}
            </p>
          )}
          <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            {article.title}
          </h1>

          <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/70 px-5 py-4 text-sm leading-7 text-amber-900">
            来源：{article.source_pdf}。当前为 PDF 文字层自动提取结果，
            {article.review_status === "ready"
              ? "适合先阅读，后续仍建议抽查校对。"
              : "这篇已标记需复核，可能有标题、顺序或图片说明混入问题。"}
          </div>

          <div className="mt-8 space-y-6 text-xl leading-10 text-slate-800">
            {paragraphs(article.body).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      </article>
    </main>
  );
}
