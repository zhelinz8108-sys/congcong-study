import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { FAMILY_ACCESS_COOKIE, verifyFamilyAccessToken } from "@/lib/family-access";
import { finalExamNames, finalExamNumber, finalExamPdf, finalExamSections } from "@/lib/math-final-exams";
import { getFinalExamArticle } from "@/server/grade-six-reviews";
import "../exams.css";

type PaperProps = {
  params: Promise<{ id: string; paper: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
};

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

export async function generateMetadata({ params, searchParams }: PaperProps) {
  const number = finalExamNumber((await params).paper);
  const answers = (await searchParams).view === "answers";
  return { title: number ? `期末模拟 · ${finalExamNames[number - 1]}${answers ? "答案解析" : ""} · 六上数学` : "期末模拟" };
}

export default async function FinalExamPaper({ params, searchParams }: PaperProps) {
  if (!verifyFamilyAccessToken((await cookies()).get(FAMILY_ACCESS_COOKIE)?.value).allowed) return null;
  const { id, paper } = await params;
  const number = finalExamNumber(paper);
  if (number === null) notFound();
  const answers = (await searchParams).view === "answers";
  const edition = answers ? "answers" : "student";
  const name = finalExamNames[number - 1];
  const directory = `/subjects/${encodeURIComponent(id)}/math/final-exams`;
  const href = `${directory}/${number}`;
  const article = await getFinalExamArticle(number, edition);
  return (
    <main className="final-exams exam-reader">
      <nav aria-label="返回"><Link href={directory}>← 全部试卷</Link></nav>
      <header className="exam-title">
        <h1>期末模拟 · {name}{answers && <small>答案解析</small>}</h1>
        <p>{answers ? "六年级上册数学 · 50 题解析" : "六年级上册数学 · 50 题 · 满分 100 分"}</p>
      </header>
      <div className="exam-tools">
        <a className="exam-pdf" href={finalExamPdf(number, edition)} download>
          {answers ? "下载答案 PDF（3 页）" : "下载试卷 PDF（8 页）"}
        </a>
        <Link href={answers ? href : href + "?view=answers"} prefetch={false}>
          {answers ? "返回学生卷" : "查看答案解析"}
        </Link>
      </div>
      {!answers && <p className="exam-note">请准备直尺、圆规。圆周率取 3.14，题目要求用 π 表示时保留 π。图中尺寸以标注为准。</p>}
      <nav className="exam-sections" aria-label="题型导航">
        {finalExamSections.map((label, i) => <a key={label} href={`#part-${i + 1}`}>{label}</a>)}
      </nav>
      <article className="exam-sheet" aria-label={name + (answers ? "答案解析" : "学生卷")} dangerouslySetInnerHTML={{ __html: article }} />
      <nav className="exam-end" aria-label="试卷导航">
        <Link href={directory}>← 全部试卷</Link>
        <Link href={answers ? href : href + "?view=answers"} prefetch={false}>{answers ? "返回学生卷" : "查看答案解析"}</Link>
      </nav>
    </main>
  );
}
