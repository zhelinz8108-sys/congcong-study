import YibenListeningIndex from "@/components/yiben-listening-index";
import bookData from "@/data/listening/yiben-grade-6.json";
import type { ListeningBook } from "@/lib/listening-yiben-types";

const book = bookData as ListeningBook;

export default async function YibenGradeSixListeningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const exercises = book.exercises.map((exercise) => ({
    number: exercise.number,
    title: exercise.title,
    part: exercise.part,
    topic: exercise.topic,
    questionCount: exercise.sections.reduce((sum, section) => sum + section.items.length, 0),
    pageCount: exercise.pageImages.length,
  }));

  return <YibenListeningIndex subjectId={id} title={book.title} exercises={exercises} />;
}
