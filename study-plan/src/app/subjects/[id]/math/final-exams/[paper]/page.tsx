import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { FAMILY_ACCESS_COOKIE, STUDENT_PROFILE_COOKIE, parseStudentProfileCookie, verifyFamilyAccessToken } from "@/lib/family-access";
import { finalExamNames, finalExamNumber } from "@/lib/math-final-exams";
import { getExamPaper, examState } from "@/server/math-final-exams";
import PaperForm from "./PaperForm";
import "../exams.css";

type PaperProps = { params: Promise<{ id: string; paper: string }> };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };
export async function generateMetadata({ params }: PaperProps) {
  const number = finalExamNumber((await params).paper);
  return { title: number ? `期末模拟 · ${finalExamNames[number - 1]} · 六上数学` : "期末模拟" };
}
export default async function FinalExamPaper({ params }: PaperProps) {
  const jar = await cookies();
  if (!verifyFamilyAccessToken(jar.get(FAMILY_ACCESS_COOKIE)?.value).allowed) return null;
  const { id, paper } = await params;
  const number = finalExamNumber(paper);
  if (number === null) notFound();
  const student = parseStudentProfileCookie(jar.get(STUDENT_PROFILE_COOKIE)?.value).id;
  const book = await getExamPaper(number);
  const initial = await examState(student, number, book);
  const directory = `/subjects/${encodeURIComponent(id)}/math/final-exams`;
  return (
    <main className="final-exams exam-reader">
      <nav aria-label="返回"><Link href={directory} prefetch={false}>← 全部试卷</Link></nav>
      <header className="exam-title"><h1>期末模拟 · {finalExamNames[number - 1]}</h1>
        <p>六年级上册数学 · 50 题 · 每题 2 分 · 满分 100 分</p></header>
      <PaperForm key={student + number} number={number} student={student} questions={book.questions} initial={initial} directory={directory} />
    </main>
  );
}
