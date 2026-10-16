import EnglishSixHub from "@/components/english-six-hub";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EnglishSixHub subjectId={id} />;
}
