import { notFound, redirect } from "next/navigation";
import { NATIONAL_DAY_SECTIONS } from "@/lib/national-day-english";

export default async function NationalDayEnglishSectionPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section: sectionId } = await params;
  const index = NATIONAL_DAY_SECTIONS.findIndex((section) => section.id === sectionId);
  if (index < 0) notFound();
  redirect(`/subjects/${id}/national-day-english#section-${sectionId}`);
}
