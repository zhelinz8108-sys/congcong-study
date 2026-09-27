import { notFound } from "next/navigation";
import GrammarStageReview from "@/components/grammar-stage-review";
import { getGrammarStage, getLessonsForStage } from "@/lib/grammar-course";

export default async function GrammarStagePage({
  params,
}: {
  params: Promise<{ id: string; number: string }>;
}) {
  const { id, number } = await params;
  const stageNumber = Number(number);
  const stage = getGrammarStage(stageNumber);
  if (!stage) notFound();

  const lessonTitles = getLessonsForStage(stage.number).map(({ n, title }) => ({ n, title }));
  return <GrammarStageReview subjectId={id} stage={stage} lessonTitles={lessonTitles} />;
}
