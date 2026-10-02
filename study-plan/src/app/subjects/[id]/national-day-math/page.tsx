import type { Metadata } from "next";
import NationalDayMathBook from "@/components/national-day-math-book";
import { NATIONAL_DAY_MATH_SECTIONS, NATIONAL_DAY_MATH_STATS } from "@/lib/national-day-math";

export const metadata: Metadata = {
  title: "国庆数学 · 三天完整学习 | 聪聪学习计划",
  description: "六上数学三天学习长页：完整知识点、图解、117道带步骤例题和89道自测题。",
};

export default async function NationalDayMathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NationalDayMathBook key={id} subjectId={id} sections={NATIONAL_DAY_MATH_SECTIONS} stats={NATIONAL_DAY_MATH_STATS} />;
}
