import ToeflTempPlayer from "@/components/toefl-temp-player";

export const metadata = { title: "托福临时 | 聪聪学习计划" };

export default async function ToeflTempPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ToeflTempPlayer subjectId={id} />;
}
