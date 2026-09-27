import courseData from "@/data/grammar/course.json";

export type GrammarTask = {
  prompt: string;
  answer: string;
};

export type GrammarLesson = {
  n: number;
  title: string;
  level: string;
  goal: string;
  rules: string[];
  examples: [string, string][];
  pitfall: string;
  quiz: [string, string][];
  stage: number;
  sourceRefs: string;
  tasks: GrammarTask[];
  deepPractice: GrammarTask[];
};

export type GrammarStageReview = {
  text: string;
  questions: GrammarTask[];
  writing: string;
  check: string;
};

export type GrammarStage = {
  number: number;
  title: string;
  firstLesson: number;
  lastLesson: number;
  description: string;
  review: GrammarStageReview;
};

export type GrammarCourse = {
  title: string;
  subtitle: string;
  source: string;
  stages: GrammarStage[];
  lessons: GrammarLesson[];
};

export const GRAMMAR_COURSE = courseData as GrammarCourse;

export function getGrammarLesson(number: number) {
  return GRAMMAR_COURSE.lessons.find((lesson) => lesson.n === number);
}
export function getGrammarStage(number: number) {
  return GRAMMAR_COURSE.stages.find((stage) => stage.number === number);
}
export function getLessonsForStage(stageNumber: number) {
  return GRAMMAR_COURSE.lessons.filter((lesson) => lesson.stage === stageNumber);
}
