import Link from "next/link";
import {
  articleMatchesQuery,
  getTheWeekDataPath,
  loadTheWeekLibraryArticles,
  loadTheWeekReport,
  theWeekIssues,
} from "@/lib/the-week-reading";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function statusClass(status: string) {
  return status === "ready"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

export default async function EnglishReadingPage({ params, searchParams }: Params) {
  const { id } = await params;
  const queryParams = await searchParams;
  const query = valueOf(queryParams.q);
  const issue = valueOf(queryParams.issue);

  const report = loadTheWeekReport();
  const articles = loadTheWeekLibraryArticles();
  const issues = theWeekIssues(articles);
  const filtered = articles.filter((article) => {
    if (issue && article.issue_date !== issue) return false;
    return articleMatchesQuery(article, query);
  });
  const visibleArticles = filtered.slice(0, 160);
  const averageWords = articles.length
    ? Math.round(articles.reduce((sum, article) => sum + article.word_count, 0) / articles.length)
    : 0;

  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-6 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/subjects/${id}`}
            className="text-sm font-bold text-rose-700 transition hover:text-rose-900"
          >
            ← 返回英语主页
          </Link>
          <div className="rounded-full border border-rose-100 bg-white px-4 py-2 text-xs font-black text-rose-700 shadow-sm">
            The Week Junior 2024
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[32px] border border-stone-200 bg-white p-7 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-600">
              English Reading Library
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">The Week 阅读</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-stone-600">
              先放入 2024 年 The Week Junior 的文字层提取结果。这里展示适合阅读的候选文章，带来源期数、页码和复核状态，后续可以继续做中文导读、词汇和阅读理解题。
            </p>
            <div className="mt-6 rounded-2xl border border-rose-100 bg-rose-50/60 px-5 py-4 text-sm leading-7 text-rose-900">
              数据来自本地 PDF 提取：图片型或扫描型 PDF 已登记为需要 OCR，当前页面只展示文字层里比较完整的文章候选。
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-3xl font-black text-rose-600">{articles.length}</p>
              <p className="mt-1 text-xs font-bold text-stone-400">可读候选</p>
            </div>
            <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-3xl font-black text-sky-600">{issues.length}</p>
              <p className="mt-1 text-xs font-bold text-stone-400">已提取期数</p>
            </div>
            <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-3xl font-black text-emerald-600">{averageWords}</p>
              <p className="mt-1 text-xs font-bold text-stone-400">平均词数</p>
            </div>
            <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-3xl font-black text-amber-600">{report?.needs_ocr_pdf_count ?? 0}</p>
              <p className="mt-1 text-xs font-bold text-stone-400">需 OCR PDF</p>
            </div>
          </div>
        </section>

        <form className="rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <input
              name="q"
              defaultValue={query}
              placeholder="搜索标题、主题或正文关键词"
              className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
            />
            <select
              name="issue"
              defaultValue={issue}
              className="rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
            >
              <option value="">全部期数</option>
              {issues.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              筛选
            </button>
          </div>
        </form>

        {!report ? (
          <section className="rounded-[32px] border border-dashed border-stone-300 bg-white p-8 text-center">
            <h2 className="text-2xl font-black">还没有找到 The Week 提取数据</h2>
            <p className="mt-3 text-sm leading-7 text-stone-500">
              当前查找路径：{getTheWeekDataPath()}。请先运行提取脚本生成 articles.jsonl 和 extraction-report.json。
            </p>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">文章列表</h2>
                <p className="mt-1 text-sm text-stone-500">
                  共匹配 {filtered.length} 篇，当前显示前 {visibleArticles.length} 篇。
                </p>
              </div>
              <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-500">
                PDF {report.pdf_count} 本 · 文字层 {report.text_layer_pdf_count} 本 · OCR 待处理 {report.needs_ocr_pdf_count} 本
              </div>
            </div>

            <div className="grid gap-3">
              {visibleArticles.map((article) => (
                <Link
                  href={`/subjects/${id}/reading/${article.id}`}
                  key={article.id}
                  className="block rounded-[26px] border border-stone-200 bg-white p-5 shadow-sm transition hover:border-rose-200 hover:bg-rose-50/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700">
                          {article.issue_date}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(article.review_status)}`}>
                          {article.review_status === "ready" ? "可读" : "需复核"}
                        </span>
                        {article.section && (
                          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-bold text-stone-500">
                            {article.section}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 text-xl font-black leading-snug">{article.title}</h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-7 text-stone-500">
                        {article.body}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-2xl bg-stone-50 px-4 py-3 text-right text-xs font-bold text-stone-500">
                      <p>{article.word_count} words</p>
                      <p className="mt-1">P{article.pages.join(", ")}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
