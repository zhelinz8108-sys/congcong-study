import NationalDayEnglishPractice from "@/components/national-day-english-practice";
import { ENGLISH_PRACTICE_CHAPTERS } from "@/server/national-day-english-practice/public-bank";

export default async function NationalDayEnglishPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NationalDayEnglishPractice subjectId={id} chapters={ENGLISH_PRACTICE_CHAPTERS} />;
}
