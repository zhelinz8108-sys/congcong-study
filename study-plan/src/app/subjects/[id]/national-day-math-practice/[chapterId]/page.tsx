import { notFound } from "next/navigation";
import HolidayMath700 from "@/components/holiday-math-700";
import { HOLIDAY_CHAPTERS } from "@/server/holiday-math-700/public-bank";

export default async function NationalDayMathChapterPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const { id, chapterId } = await params;
  if (!HOLIDAY_CHAPTERS.some((chapter) => chapter.chapter_id === chapterId))
    notFound();
  return (
    <HolidayMath700
      key={chapterId}
      subjectId={id}
      chapters={HOLIDAY_CHAPTERS}
      chapterId={chapterId}
    />
  );
}
