import { notFound } from "next/navigation";
import NationalDayMathBook from "@/components/national-day-math-book";
import { getPublicNationalDayMathSections } from "@/lib/national-day-math-submission";
import {
  getNationalDayMathChapterSummaries,
  getNationalDayMathChapterSections,
} from "@/lib/national-day-math-chapters";

export default async function NationalDayMathChapterPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const { id, chapterId } = await params;
  const sections = getPublicNationalDayMathSections();
  const chapters = getNationalDayMathChapterSummaries(sections);
  const index = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index === -1) notFound();
  const chapter = chapters[index];
  return (
    <NationalDayMathBook
      key={chapterId}
      subjectId={id}
      sections={getNationalDayMathChapterSections(sections, chapter)}
      chapter={chapter}
      nextChapter={chapters[index + 1]}
    />
  );
}
