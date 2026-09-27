import { loadCloudState, saveCloudState } from "@/lib/cloud-progress";

export const YIBEN_LISTENING_STORAGE_KEY = "yiben-grade6-listening:v1";
const YIBEN_LISTENING_CLOUD_SCOPE = "listening:yiben-grade6:v1";

export type ListeningStoredAnswer = string | string[];

export type ListeningExerciseProgress = {
  answers: Record<string, ListeningStoredAnswer>;
  submitted: boolean;
  score: number;
  total: number;
  bestScore: number;
  attempts: number;
  updatedAt: string;
};

export type ListeningProgressStore = {
  exercises: Record<string, ListeningExerciseProgress>;
};

export function readListeningProgress(): ListeningProgressStore {
  if (typeof window === "undefined") return { exercises: {} };
  try {
    const raw = window.localStorage.getItem(YIBEN_LISTENING_STORAGE_KEY);
    if (!raw) return { exercises: {} };
    const parsed = JSON.parse(raw) as Partial<ListeningProgressStore>;
    return { exercises: parsed.exercises ?? {} };
  } catch {
    return { exercises: {} };
  }
}

export function writeListeningProgress(store: ListeningProgressStore) {
  saveCloudState(YIBEN_LISTENING_CLOUD_SCOPE, YIBEN_LISTENING_STORAGE_KEY, store);
}

export function loadListeningProgress() {
  return loadCloudState<ListeningProgressStore>(
    YIBEN_LISTENING_CLOUD_SCOPE,
    YIBEN_LISTENING_STORAGE_KEY,
    { exercises: {} },
  );
}

export function exerciseStorageKey(number: number) {
  return String(number).padStart(3, "0");
}
