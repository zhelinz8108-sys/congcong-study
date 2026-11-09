import type { Metadata } from "next";
import DatedListening from "@/components/dated-listening";

export const metadata: Metadata = { title: "11月9日听力 · 英语" };

export default async function NovemberListeningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DatedListening subjectId={id} />;
}
