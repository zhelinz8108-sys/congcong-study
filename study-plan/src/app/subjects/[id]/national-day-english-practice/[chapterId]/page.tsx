import { notFound } from "next/navigation";
import NationalDayEnglishPractice from "@/components/national-day-english-practice";
import { ENGLISH_PRACTICE_CHAPTERS } from "@/server/national-day-english-practice/public-bank";

export default async function NationalDayEnglishPracticeChapterPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const { id, chapterId } = await params;
  if (!ENGLISH_PRACTICE_CHAPTERS.some((chapter) => chapter.id === chapterId)) notFound();
  return <NationalDayEnglishPractice key={chapterId} subjectId={id} chapters={ENGLISH_PRACTICE_CHAPTERS} chapterId={chapterId} />;
}
