import HolidayMath700 from "@/components/holiday-math-700";
import { HOLIDAY_CHAPTERS } from "@/server/holiday-math-700/public-bank";
export default async function NationalDayMathPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HolidayMath700 subjectId={id} chapters={HOLIDAY_CHAPTERS} />;
}
