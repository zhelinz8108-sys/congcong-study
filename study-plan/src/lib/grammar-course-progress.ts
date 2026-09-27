import { loadCloudState, saveCloudState } from "@/lib/cloud-progress";

export const GRAMMAR_COURSE_SCOPE = "grammar:course:v1";
export const GRAMMAR_COURSE_STORAGE_KEY = "study-plan-grammar-course-progress-v1";

export type GrammarLessonPractice = {
  answered: number[];
  mastered: number[];
};

export type GrammarCourseProgress = {
  completedLessons: number[];
  completedStages: number[];
  lessonPractice: Record<string, GrammarLessonPractice>;
  stageDrafts: Record<string, string>;
  lastLesson: number;
  updatedAt: string;
};

export const EMPTY_GRAMMAR_COURSE_PROGRESS: GrammarCourseProgress = {
  completedLessons: [],
  completedStages: [],
  lessonPractice: {},
  stageDrafts: {},
  lastLesson: 1,
  updatedAt: "",
};

export function normalizeGrammarCourseProgress(value: Partial<GrammarCourseProgress> | null | undefined) {
  return {
    completedLessons: Array.isArray(value?.completedLessons) ? value.completedLessons : [],
    completedStages: Array.isArray(value?.completedStages) ? value.completedStages : [],
    lessonPractice: value?.lessonPractice && typeof value.lessonPractice === "object" ? value.lessonPractice : {},
    stageDrafts: value?.stageDrafts && typeof value.stageDrafts === "object" ? value.stageDrafts : {},
    lastLesson: typeof value?.lastLesson === "number" ? value.lastLesson : 1,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : "",
  } satisfies GrammarCourseProgress;
}
export async function loadGrammarCourseProgress() {
  const value = await loadCloudState<GrammarCourseProgress>(
    GRAMMAR_COURSE_SCOPE,
    GRAMMAR_COURSE_STORAGE_KEY,
    EMPTY_GRAMMAR_COURSE_PROGRESS,
  );
  return normalizeGrammarCourseProgress(value);
}
export function saveGrammarCourseProgress(progress: GrammarCourseProgress) {
  saveCloudState(GRAMMAR_COURSE_SCOPE, GRAMMAR_COURSE_STORAGE_KEY, progress);
}
