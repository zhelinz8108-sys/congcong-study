import { notFound } from "next/navigation";
import ChineseSixWorkspace from "@/components/chinese-six-workspace";
import { sixPublicItem } from "@/server/chinese-six-bank";
import { sixGuide } from "@/lib/chinese-six-guides";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string; itemId: string }>; searchParams: Promise<{ question?: string }> }) {
  const { id, itemId } = await params;
  const { question } = await searchParams;
  const item = sixPublicItem(itemId);
  if (!item) notFound();
  return <ChineseSixWorkspace key={`${item.id}-${question ?? ""}`} subjectId={id} item={item} guide={sixGuide(item)} initialQuestion={question} />;
}
