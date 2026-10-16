import EnglishSixPractice from "@/components/english-six-practice";
export default async function Page({ params }: { params: Promise<{ id: string; unit: string }> }) {
  const { id, unit } = await params;
  return <EnglishSixPractice key={`${id}:${unit}`} subjectId={id} unit={Number(unit)} />;
}
