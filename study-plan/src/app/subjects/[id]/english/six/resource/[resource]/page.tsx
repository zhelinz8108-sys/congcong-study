import EnglishSixReader from "@/components/english-six-reader";
export default async function Page({ params }: { params: Promise<{ id: string; resource: string }> }) {
  const { id, resource } = await params;
  return <EnglishSixReader key={resource} subjectId={id} resourceId={resource} />;
}
