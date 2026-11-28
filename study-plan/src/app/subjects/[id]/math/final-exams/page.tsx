import Link from "next/link";
import { cookies } from "next/headers";
import { FAMILY_ACCESS_COOKIE, STUDENT_PROFILE_COOKIE, parseStudentProfileCookie, verifyFamilyAccessToken } from "@/lib/family-access";
import { finalExamNames } from "@/lib/math-final-exams";
import { examSummary, mayDownloadExam } from "@/server/math-final-exams";
import "./exams.css";

export const metadata = { title: "期末模拟 · 六上数学" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };
export default async function FinalExamsPage({ params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (!verifyFamilyAccessToken(jar.get(FAMILY_ACCESS_COOKIE)?.value).allowed) return null;
  const student = parseStudentProfileCookie(jar.get(STUDENT_PROFILE_COOKIE)?.value).id;
  const records = await examSummary(student);
  const subject = "/subjects/" + encodeURIComponent((await params).id);
  const directory = subject + "/math/final-exams";
  return (
    <main className="final-exams">
      <nav aria-label="返回"><Link href={subject}>← 数学首页</Link></nav>
      <header className="exam-title"><h1>期末模拟</h1><p>六年级上册数学 · 每卷 50 题，每题 2 分。整卷交卷后查看成绩和逐题解析。</p></header>
      <ol className="exam-list" aria-label="模拟试卷">
        {finalExamNames.map((name, i) => {
          const record = records.find(r => r.paper === i + 1);
          const action = !record ? "开始答题" : record.score === null ? "继续作答" : record.score + " 分 · 查看解析";
          return <li key={name}><Link className="exam-paper-link" href={`${directory}/${i + 1}`} prefetch={false}>
            <strong>模拟{name}</strong><span>{action} <span aria-hidden="true">→</span></span>
          </Link></li>;
        })}
      </ol>
      <section className="exam-downloads" aria-label="打印试卷"><h2>打印试卷</h2><ul>
        <li><a href="/api/grade-six-reviews/math-final-student?download=1" download>十份学生卷 PDF</a></li>
        {mayDownloadExam("math-final-pack", records) && <>
          <li><a href="/api/grade-six-reviews/math-final-answers?download=1" download>全套答案解析 PDF</a></li>
          <li><a href="/api/grade-six-reviews/math-final-pack?download=1" download>逐卷打印包 ZIP</a></li>
        </>}
      </ul></section>
    </main>
  );
}
