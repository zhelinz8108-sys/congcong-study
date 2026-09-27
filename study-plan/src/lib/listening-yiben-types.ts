export type ListeningAnswerType =
  | "choice"
  | "multi_choice"
  | "true_false"
  | "order"
  | "fill_blank";

export type ListeningAnswerItem = {
  id: string;
  label: string;
  type: ListeningAnswerType;
  answer: string;
};

export type ListeningSection = {
  title: string;
  rawAnswer: string;
  items: ListeningAnswerItem[];
};

export type ListeningExercise = {
  number: number;
  title: string;
  part: string;
  topic: string;
  pageImages: string[];
  audioSrc: string;
  sections: ListeningSection[];
  transcript: string;
  translation: string;
};

export type ListeningBook = {
  id: string;
  title: string;
  shortTitle: string;
  exerciseCount: number;
  parts: Array<{ title: string; range: string }>;
  exercises: ListeningExercise[];
};

export type ListeningExerciseSummary = Pick<
  ListeningExercise,
  "number" | "title" | "part" | "topic"
> & {
  questionCount: number;
  pageCount: number;
};
