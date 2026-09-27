import { notFound } from "next/navigation";
import GrammarLessonExperience from "@/components/grammar-lesson-experience";
import { getGrammarLesson, getGrammarStage } from "@/lib/grammar-course";

export default async function GrammarLessonPage({
  params,
}: {
  params: Promise<{ id: string; number: string }>;
}) {
  const { id, number } = await params;
  const lessonNumber = Number(number);
  const lesson = getGrammarLesson(lessonNumber);
  if (!lesson) notFound();

  const stage = getGrammarStage(lesson.stage);
  const previous = getGrammarLesson(lesson.n - 1);
  const next = getGrammarLesson(lesson.n + 1);

  return (
    <GrammarLessonExperience
      subjectId={id}
      lesson={lesson}
      stageTitle={stage?.title ?? "系统课程"}
      previousLesson={previous ? { n: previous.n, title: previous.title } : null}
      nextLesson={next ? { n: next.n, title: next.title } : null}
    />
  );
}
