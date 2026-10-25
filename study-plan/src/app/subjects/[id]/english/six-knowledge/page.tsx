import type { Metadata } from "next";
import EnglishSixKnowledgeHub from "@/components/english-six-knowledge-hub";
import { canReadEnglishSixKnowledge } from "@/server/english-six-knowledge-access";
import { getEnglishSixKnowledgeSummary } from "@/server/english-six-knowledge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "六上知识点 · 英语" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!await canReadEnglishSixKnowledge()) return null;
  const { id } = await params;
  return <EnglishSixKnowledgeHub subjectId={id} bookSummary={await getEnglishSixKnowledgeSummary()} />;
}
