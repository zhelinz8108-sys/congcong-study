import type { Metadata } from "next";
import NationalDayMathDirectory from "@/components/national-day-math-directory";
import { getNationalDayMathChapterSummaries } from "@/lib/national-day-math-chapters";
import { getPublicNationalDayMathSections } from "@/lib/national-day-math-submission";

export const metadata: Metadata = {
  title: "国庆数学 · 三天完整学习 | 聪聪学习计划",
  description:
    "按教材章节学习六上数学：完整知识点、图解、117道带步骤例题和89道自测题。",
};

export default async function NationalDayMathPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <NationalDayMathDirectory
      key={id}
      subjectId={id}
      chapters={getNationalDayMathChapterSummaries(
        getPublicNationalDayMathSections(),
      )}
    />
  );
}
