import { notFound } from "next/navigation";
import YibenListeningExercise from "@/components/yiben-listening-exercise";
import bookData from "@/data/listening/yiben-grade-6.json";
import type { ListeningBook } from "@/lib/listening-yiben-types";
import { resolveAssetUrl } from "@/lib/asset-url";

const book = bookData as ListeningBook;

export default async function YibenListeningExercisePage({
  params,
}: {
  params: Promise<{ id: string; number: string }>;
}) {
  const { id, number } = await params;
  const exerciseNumber = Number(number);
  const exercise = book.exercises.find((entry) => entry.number === exerciseNumber);
  if (!exercise) notFound();
  const cloudExercise = {
    ...exercise,
    audioSrc: resolveAssetUrl(exercise.audioSrc),
    pageImages: exercise.pageImages.map(resolveAssetUrl),
  };

  return (
    <YibenListeningExercise
      subjectId={id}
      exercise={cloudExercise}
      exerciseCount={book.exerciseCount}
    />
  );
}
