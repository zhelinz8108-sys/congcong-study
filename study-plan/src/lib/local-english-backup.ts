import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Material, Subject, Unit, Word } from "@/lib/types";
import { sm2 } from "@/lib/sm2";

type BackupUnit = Unit & {
  words?: Word[];
  materials?: Material[];
  sentenceText?: { english: string; chinese: string } | null;
  word_count?: number;
};

type BackupSubject = Subject & {
  units: BackupUnit[];
};

let cachedSubject: BackupSubject | null | undefined;

const BACKUP_PATH = path.join(
  process.cwd(),
  ".tmp-audio-rebuild",
  "english-subject-before.json"
);

const STATIC_SUBJECTS: Array<
  Subject & {
    unit_count: number;
    material_count: number;
    totalWords: number;
    dueCount: number;
    masteredCount: number;
  }
> = [
  {
    id: "f3f5f0a4-10d8-4f89-8d8-f6d83f1a1001",
    name: "语文",
    icon: "📖",
    color: "#ef4444",
    sort_order: 1,
    created_at: "2026-03-25T10:32:35+00:00",
    unit_count: 0,
    material_count: 0,
    totalWords: 0,
    dueCount: 0,
    masteredCount: 0,
  },
  {
    id: "4ea6b4fe-bfd3-440f-b780-6d71c2011609",
    name: "数学",
    icon: "🧮",
    color: "#3b82f6",
    sort_order: 2,
    created_at: "2026-03-25T10:32:35+00:00",
    unit_count: 165,
    material_count: 0,
    totalWords: 0,
    dueCount: 0,
    masteredCount: 0,
  },
];

function stripBom(text: string) {
  return text.replace(/^\uFEFF/, "");
}

function isDue(word: Word, now = Date.now()) {
  if (!word.next_review) return true;
  const time = new Date(word.next_review.replace(" ", "T")).getTime();
  return Number.isNaN(time) || time <= now;
}

function publicSubject(subject: BackupSubject): Subject {
  const { units: _units, ...rest } = subject;
  return rest;
}

function staticSubjectById(id: string) {
  return STATIC_SUBJECTS.find((subject) => subject.id === id) ?? null;
}

function staticSubjectResponse(
  subject: (typeof STATIC_SUBJECTS)[number],
  options: { metaOnly?: boolean; summaryOnly?: boolean; includeUnits?: boolean } = {}
) {
  if (options.metaOnly) {
    const {
      unit_count: _unitCount,
      material_count: _materialCount,
      totalWords: _totalWords,
      dueCount: _dueCount,
      masteredCount: _masteredCount,
      ...meta
    } = subject;
    return meta;
  }

  return {
    ...subject,
    units: [],
  };
}

export async function getLocalEnglishSubject(): Promise<BackupSubject | null> {
  if (cachedSubject !== undefined) return cachedSubject;

  try {
    const raw = await readFile(BACKUP_PATH, "utf8");
    const data = JSON.parse(stripBom(raw)) as BackupSubject;
    if (data?.id && Array.isArray(data.units)) {
      cachedSubject = data;
      return cachedSubject;
    }
  } catch {
    // Fall through to null so Supabase-backed routes can report their own errors.
  }

  cachedSubject = null;
  return null;
}

export async function getLocalEnglishSubjectById(id: string) {
  const subject = await getLocalEnglishSubject();
  if (!subject || subject.id !== id) return null;
  return subject;
}

export async function getLocalSubjectsWithCounts() {
  const subject = await getLocalEnglishSubject();
  const subjects = [...STATIC_SUBJECTS];

  if (!subject) return subjects;

  subjects.push({
    ...publicSubject(subject),
    sort_order: 3,
    unit_count: subject.units.length,
    material_count: subject.units.reduce(
      (sum, unit) => sum + (unit.materials?.length ?? 0),
      0
    ),
    totalWords: subject.units.reduce((sum, unit) => sum + (unit.words?.length ?? 0), 0),
    dueCount: 0,
    masteredCount: 0,
  });

  return subjects;
}

export async function getLocalSubjectResponse(
  id: string,
  options: { metaOnly?: boolean; summaryOnly?: boolean; includeUnits?: boolean } = {}
) {
  const staticSubject = staticSubjectById(id);
  if (staticSubject) return staticSubjectResponse(staticSubject, options);

  const subject = await getLocalEnglishSubjectById(id);
  if (!subject) return null;

  if (options.metaOnly) {
    return publicSubject(subject);
  }

  const words = subject.units.flatMap((unit) => unit.words ?? []);
  const dueCount = words.filter((word) => isDue(word)).length;
  const masteredCount = words.filter((word) => word.mastered >= 1).length;

  if (options.summaryOnly) {
    const units = options.includeUnits
      ? subject.units.map((unit) => ({
          ...unit,
          words: undefined,
          materials: undefined,
          sentenceText: undefined,
          word_count: unit.words?.length ?? unit.word_count ?? 0,
        }))
      : [];

    return {
      ...publicSubject(subject),
      units,
      unit_count: subject.units.length,
      totalWords: words.length,
      dueCount,
      masteredCount,
    };
  }

  return {
    ...subject,
    dueCount,
    totalWords: words.length,
    masteredCount,
  };
}

export async function getLocalUnitContent(id: string) {
  const subject = await getLocalEnglishSubject();
  const unit = subject?.units.find((item) => item.id === id);
  if (!unit) return null;
  return {
    unit,
    words: unit.words ?? [],
    materials: unit.materials ?? [],
    sentenceText: unit.sentenceText ?? null,
  };
}

export async function getLocalWords(subjectId: string) {
  const subject = await getLocalEnglishSubjectById(subjectId);
  return subject?.units.flatMap((unit) => unit.words ?? []) ?? null;
}

export async function getLocalDueWords(subjectId: string, limit = 1000) {
  const words = await getLocalWords(subjectId);
  if (!words) return null;
  const dueWords = words
    .filter((word) => isDue(word))
    .sort((a, b) => (a.next_review ?? "").localeCompare(b.next_review ?? ""));
  return dueWords.slice(0, limit);
}

export async function getLocalReviewedWord(wordId: string, quality: number) {
  const subject = await getLocalEnglishSubject();
  const word = subject?.units
    .flatMap((unit) => unit.words ?? [])
    .find((item) => item.id === wordId);

  if (!word) return null;

  const result = sm2({
    interval: word.interval,
    repetitions: word.repetitions,
    ease_factor: word.ease_factor,
    quality,
  });

  return {
    ...word,
    interval: result.interval,
    repetitions: result.repetitions,
    ease_factor: result.ease_factor,
    next_review: result.next_review,
    last_review: new Date().toISOString().replace("T", " ").slice(0, 19),
    mastered: result.mastered,
  };
}
