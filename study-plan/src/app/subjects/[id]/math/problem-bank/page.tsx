import Link from "next/link";
import equationBank from "@/lib/math-equation-bank.json";
import fractionBank from "@/lib/math-fraction-bank.json";
import solidBank from "@/lib/math-solid-bank.json";

type Params = {
  params: Promise<{ id: string }>;
};

type ProblemBankSummary = {
  slug: string;
  title: string;
  description: string;
  pageCount: number;
  questionCount: number;
  difficultyCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
};

const banks: Array<{
  href: string;
  action: string;
  bank: ProblemBankSummary;
}> = [
  {
    href: "equations",
    action: "打开简易方程题库",
    bank: equationBank,
  },
  {
    href: "fractions",
    action: "打开分数题库",
    bank: fractionBank,
  },
  {
    href: "solids",
    action: "打开长方体和正方体题库",
    bank: solidBank,
  },
];

const totalQuestions = banks.reduce((sum, item) => sum + item.bank.questionCount, 0);
const totalPages = banks.reduce((sum, item) => sum + item.bank.pageCount, 0);

function difficultyText(bank: ProblemBankSummary) {
  return Object.entries(bank.difficultyCounts)
    .map(([label, count]) => `${label} ${count} 题`)
    .join(" · ");
}

export default async function MathProblemBankPage({ params }: Params) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-[#faf9f6] px-4 py-6 text-neutral-950 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href={`/subjects/${id}`}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-950"
            >
              ← 返回数学主页
            </Link>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-neutral-400">
              Math Problem Bank
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              题库
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-500">
              把 PDF 里的题目、答案和解析整理成网页，适合在电脑上筛选、查找和集中复习。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-neutral-200 bg-white p-2 text-center text-sm">
            <div className="rounded-xl bg-neutral-50 px-4 py-3">
              <p className="text-lg font-semibold">{banks.length}</p>
              <p className="text-xs text-neutral-400">专题</p>
            </div>
            <div className="rounded-xl bg-neutral-50 px-4 py-3">
              <p className="text-lg font-semibold">{totalQuestions}</p>
              <p className="text-xs text-neutral-400">题目</p>
            </div>
            <div className="rounded-xl bg-neutral-50 px-4 py-3">
              <p className="text-lg font-semibold">{totalPages}</p>
              <p className="text-xs text-neutral-400">页来源</p>
            </div>
          </div>
        </header>

        <div className="space-y-4">
          {banks.map(({ action, bank, href }) => (
            <section
              key={bank.slug}
              className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-blue-600">五年级下册</p>
                  <h2 className="mt-2 text-2xl font-bold text-neutral-950">
                    {bank.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-neutral-500">
                    {bank.description}
                  </p>
                  <p className="mt-3 text-sm font-medium text-neutral-600">
                    {difficultyText(bank)}
                  </p>
                </div>
                <Link
                  href={`/subjects/${id}/math/problem-bank/${href}`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  {action}
                </Link>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {Object.entries(bank.categoryCounts)
                  .slice(0, 12)
                  .map(([category, count]) => (
                    <span
                      key={category}
                      className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600"
                    >
                      {category} · {count}
                    </span>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
