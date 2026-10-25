import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EnglishSixKnowledgeReader from "@/components/english-six-knowledge-reader";
import { canReadEnglishSixKnowledge } from "@/server/english-six-knowledge-access";
import { getEnglishSixKnowledgeSummary, getEnglishSixKnowledgeUnit } from "@/server/english-six-knowledge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "单元知识 · 六上英语" };

export default async function Page({ params }: { params: Promise<{ id: string; unit: string }> }) {
  if (!await canReadEnglishSixKnowledge()) return null;
  const { id, unit: rawUnit } = await params;
  if (!/^[1-8]$/.test(rawUnit)) notFound();
  const unit = await getEnglishSixKnowledgeUnit(Number(rawUnit));
  if (!unit) notFound();
  return <EnglishSixKnowledgeReader subjectId={id} unit={unit} units={(await getEnglishSixKnowledgeSummary()).units} />;
}
