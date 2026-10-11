import ChineseSixMistakes from "@/components/chinese-six-mistakes";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChineseSixMistakes subjectId={id} />;
}
