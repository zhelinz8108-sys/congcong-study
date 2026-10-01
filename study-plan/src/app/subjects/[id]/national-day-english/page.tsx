import NationalDayEnglishHub from "@/components/national-day-english-hub";
import { NATIONAL_DAY_PDF_URL, NATIONAL_DAY_QUESTION_COUNT, NATIONAL_DAY_SUMMARIES } from "@/lib/national-day-english";

export default async function NationalDayEnglishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NationalDayEnglishHub key={id} subjectId={id} sections={NATIONAL_DAY_SUMMARIES} pdfUrl={NATIONAL_DAY_PDF_URL} questionCount={NATIONAL_DAY_QUESTION_COUNT} />;
}
