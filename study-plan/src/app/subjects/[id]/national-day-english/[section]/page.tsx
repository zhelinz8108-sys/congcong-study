import { notFound } from "next/navigation";
import NationalDayEnglishLesson from "@/components/national-day-english-lesson";
import { NATIONAL_DAY_PDF_URL, NATIONAL_DAY_SECTIONS } from "@/lib/national-day-english";

export default async function NationalDayEnglishSectionPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section: sectionId } = await params;
  const index = NATIONAL_DAY_SECTIONS.findIndex((section) => section.id === sectionId);
  if (index < 0) notFound();
  return <NationalDayEnglishLesson key={`${id}:${sectionId}`} subjectId={id} section={NATIONAL_DAY_SECTIONS[index]} previous={NATIONAL_DAY_SECTIONS[index - 1] ? { id: NATIONAL_DAY_SECTIONS[index - 1].id, title: NATIONAL_DAY_SECTIONS[index - 1].title } : null} next={NATIONAL_DAY_SECTIONS[index + 1] ? { id: NATIONAL_DAY_SECTIONS[index + 1].id, title: NATIONAL_DAY_SECTIONS[index + 1].title } : null} pdfUrl={NATIONAL_DAY_PDF_URL} />;
}
