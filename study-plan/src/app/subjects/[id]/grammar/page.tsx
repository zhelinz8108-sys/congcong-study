import GrammarCourseDashboard from "@/components/grammar-course-dashboard";
import { GRAMMAR_COURSE, getLessonsForStage } from "@/lib/grammar-course";

export default async function GrammarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const stages = GRAMMAR_COURSE.stages.map((stage) => ({
    number: stage.number,
    title: stage.title,
    description: stage.description,
    firstLesson: stage.firstLesson,
    lastLesson: stage.lastLesson,
    lessons: getLessonsForStage(stage.number).map(({ n, title, level, goal }) => ({
      n,
      title,
      level,
      goal,
    })),
  }));

  return <GrammarCourseDashboard subjectId={id} stages={stages} />;
}
