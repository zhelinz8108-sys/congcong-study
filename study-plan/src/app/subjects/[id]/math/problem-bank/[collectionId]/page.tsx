import { notFound } from "next/navigation";
import { Grade6BankPractice } from "@/components/grade6-bank";
import { getBankManifest } from "@/server/grade6-bank/bank";

export default async function Grade6CollectionPage({ params, searchParams }: { params: Promise<{ id: string; collectionId: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const { id, collectionId } = await params;
  const collection = (await getBankManifest()).collections.find((c) => c.id === collectionId);
  if (!collection) notFound();
  const { q } = await searchParams;
  const initialQuestionId = typeof q === "string" && collection.questions.some((item) => item.id === q) ? q : undefined;
  return <Grade6BankPractice key={`${id}:${collectionId}`} subjectId={id} collection={collection} initialQuestionId={initialQuestionId} />;
}
