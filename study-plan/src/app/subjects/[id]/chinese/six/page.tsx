import ChineseSixHub from "@/components/chinese-six-hub";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChineseSixHub subjectId={id} />;
}
