import Link from "next/link";
import { finalExamNames } from "@/lib/math-final-exams";
import "./exams.css";

export const metadata = { title: "期末模拟 · 六上数学" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

export default async function FinalExamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const subject = `/subjects/${encodeURIComponent(id)}`;
  const directory = subject + "/math/final-exams";
  return (
    <main className="final-exams">
      <nav aria-label="返回"><Link href={subject}>← 数学首页</Link></nav>
      <header className="exam-title">
        <h1>期末模拟</h1>
        <p>六年级上册 · 10 份试卷 · 每卷 50 题，满分 100 分</p>
      </header>
      <ol className="exam-list" aria-label="模拟试卷">
        {finalExamNames.map((name, index) => {
          const href = `${directory}/${index + 1}`;
          return (
            <li key={name}>
              <Link className="exam-paper-link" href={href} prefetch={false}>
                <strong>模拟{name}</strong><span>查看试卷 <span aria-hidden="true">→</span></span>
              </Link>
              <Link className="exam-answer-link" href={href + "?view=answers"} prefetch={false} aria-label={name + "答案解析"}>答案解析</Link>
            </li>
          );
        })}
      </ol>
      <section className="exam-downloads" aria-label="整套下载">
        <h2>整套下载</h2>
        <ul>
          <li><a href="/api/grade-six-reviews/math-final-student?download=1" download>学生卷 PDF（80 页）</a></li>
          <li><a href="/api/grade-six-reviews/math-final-answers?download=1" download>答案解析 PDF（30 页）</a></li>
          <li><a href="/api/grade-six-reviews/math-final-pack?download=1" download>逐卷打印包 ZIP</a></li>
        </ul>
      </section>
    </main>
  );
}
