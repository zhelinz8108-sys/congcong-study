"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSentenceText } from "@/lib/sentences";
import type { Unit, Word } from "@/lib/types";

type PracticeMode = "en-zh" | "zh-en";
type PracticeScope = "all" | "due" | "mistakes";

type SentenceInfo = {
  english: string;
  chinese: string;
};

type UnitWithSummary = Unit & {
  word_count?: number;
  sentenceText?: SentenceInfo | null;
  sentence_text?: string | null;
};

export type InteractiveWordBook = {
  groupName: string;
  units: UnitWithSummary[];
  totalWords: number;
};

type PracticeEntry = {
  word: Word;
  unit: UnitWithSummary;
  sentenceNumber: number;
  sentenceLabel: string;
  sourceLabel: string;
  sentenceText: SentenceInfo | null;
};

type AnswerRecord = {
  entry: PracticeEntry;
  selectedId: string | null;
  selectedText: string;
  answerText: string;
  correct: boolean;
  skipped: boolean;
};

type SessionHistoryRecord = {
  id: string;
  date: string;
  bookName: string;
  mode: PracticeMode;
  filter: string;
  target: number;
  asked: number;
  correct: number;
  wrong: number;
  accuracy: number;
  completed: boolean;
};

const SESSION_SIZE = 100;
const AUTO_NEXT_DELAY_MS = 850;

const POS_TAGS = [
  "限定词",
  "感叹词",
  "缩略词",
  "情态",
  "名词",
  "动词",
  "形容词",
  "副词",
  "介词",
  "连词",
  "代词",
  "冠词",
  "数词",
  "名",
  "动",
  "形",
  "副",
  "介",
  "连",
  "代",
  "冠",
  "数",
];

function cleanMeaning(value: string | null | undefined) {
  const posPattern = POS_TAGS.join("|");
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      new RegExp(`(^|\\s)(?:${posPattern})(?:\\s*/\\s*(?:${posPattern}))*\\s+`, "g"),
      (match, prefix) => (prefix ? "；" : "")
    )
    .replace(/\b(?:vt|vi|adj|adv|prep|pron|conj|aux|num|art|interj|modal|n|v|a|ad)\.?\b/gi, " ")
    .replace(/[；;，,、]+/g, "；")
    .replace(/\s*；\s*/g, "；")
    .replace(/；{2,}/g, "；")
    .replace(/^；|；$/g, "")
    .trim();
}

function sortUnits(a: UnitWithSummary, b: UnitWithSummary) {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.created_at.localeCompare(b.created_at);
}

function sortEntries(a: PracticeEntry, b: PracticeEntry) {
  if (a.unit.sort_order !== b.unit.sort_order) return a.unit.sort_order - b.unit.sort_order;
  if (a.word.sort_order !== b.word.sort_order) return a.word.sort_order - b.word.sort_order;
  return a.word.created_at.localeCompare(b.word.created_at);
}

function shuffleList<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[next]] = [copy[next], copy[index]];
  }
  return copy;
}

function isWordDue(word: Word) {
  if (!word.next_review) return true;
  const time = new Date(word.next_review.replace(" ", "T")).getTime();
  return Number.isNaN(time) || time <= Date.now();
}

function parseSentenceText(unit: UnitWithSummary): SentenceInfo | null {
  if (unit.sentenceText) return unit.sentenceText;

  const raw = unit.sentence_text;
  if (!raw) return getSentenceText(unit.name, unit.group_name);

  try {
    const parsed = JSON.parse(raw) as Partial<SentenceInfo>;
    if (parsed.english || parsed.chinese) {
      return {
        english: parsed.english ?? "",
        chinese: parsed.chinese ?? "",
      };
    }
  } catch {
    const [english, ...rest] = raw.split("\n");
    if (english || rest.length) {
      return {
        english: english ?? "",
        chinese: rest.join("\n"),
      };
    }
  }

  return getSentenceText(unit.name, unit.group_name);
}

function getEnglishVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => /en-US/i.test(voice.lang)) ??
    voices.find((voice) => /^en/i.test(voice.lang)) ??
    null
  );
}

function readIdSet(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeIdSet(key: string, value: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify([...value]));
}

function readHistory(key: string) {
  if (typeof window === "undefined") return [] as SessionHistoryRecord[];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? (value as SessionHistoryRecord[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(key: string, value: SessionHistoryRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value.slice(0, 30)));
}

function formatSessionDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function modeLabel(mode: PracticeMode) {
  return mode === "en-zh" ? "英文选中文" : "中文选英文";
}

function answerText(entry: PracticeEntry, mode: PracticeMode) {
  return mode === "en-zh" ? cleanMeaning(entry.word.meaning) : entry.word.word.trim();
}

function questionText(entry: PracticeEntry, mode: PracticeMode) {
  return mode === "en-zh" ? entry.word.word.trim() : cleanMeaning(entry.word.meaning);
}

function optionKey(entry: PracticeEntry, mode: PracticeMode) {
  return answerText(entry, mode).toLowerCase();
}

function buildOptions(current: PracticeEntry, entries: PracticeEntry[], mode: PracticeMode) {
  const correct = optionKey(current, mode);
  const sameSentence = entries.filter((entry) => entry.unit.id === current.unit.id && entry.word.id !== current.word.id);
  const rest = entries.filter((entry) => entry.unit.id !== current.unit.id && entry.word.id !== current.word.id);
  const candidates = [...shuffleList(sameSentence), ...shuffleList(rest)];
  const used = new Set([correct]);
  const options = [current];

  for (const candidate of candidates) {
    const key = optionKey(candidate, mode);
    if (!key || used.has(key)) continue;
    used.add(key);
    options.push(candidate);
    if (options.length === 4) break;
  }

  return shuffleList(options);
}

function accuracy(answers: AnswerRecord[]) {
  if (!answers.length) return 0;
  return Math.round((answers.filter((answer) => answer.correct).length / answers.length) * 100);
}

function scopeLabel(scope: PracticeScope) {
  if (scope === "due") return "今日待复习";
  if (scope === "mistakes") return "错题复习";
  return "全部词条";
}

function selectedSentenceLabel(selectedUnitIds: Set<string>, activeBook: InteractiveWordBook | null) {
  if (!activeBook || selectedUnitIds.size === 0 || selectedUnitIds.size === activeBook.units.length) {
    return "全部句子";
  }
  if (selectedUnitIds.size === 1) {
    const unitId = [...selectedUnitIds][0];
    const sortedUnits = [...activeBook.units].sort(sortUnits);
    const index = sortedUnits.findIndex((unit) => unit.id === unitId);
    return index >= 0 ? `Sentence ${String(index + 1).padStart(2, "0")}` : "已选 1 句";
  }
  return `已选 ${selectedUnitIds.size} 句`;
}

function makeSessionId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function InteractiveMemorizeMode({
  subjectName,
  books,
  words,
  onFinish,
  onReview,
}: {
  subjectName: string;
  books: InteractiveWordBook[];
  words: Word[];
  onFinish: () => void;
  onReview: (wordId: string, quality: number) => Promise<void>;
}) {
  const mistakeKey = `study-plan-interactive-vocab-mistakes:${subjectName}`;
  const historyKey = `study-plan-interactive-vocab-history:${subjectName}`;
  const autoNextKey = "study-plan-interactive-vocab-auto-next";

  const [activeBook, setActiveBook] = useState<InteractiveWordBook | null>(null);
  const [mode, setMode] = useState<PracticeMode>("en-zh");
  const [scope, setScope] = useState<PracticeScope>("all");
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [shuffle, setShuffle] = useState(true);
  const [autoNext, setAutoNext] = useState(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(autoNextKey) === "1" : false
  );
  const [sessionEntries, setSessionEntries] = useState<PracticeEntry[]>([]);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [streak, setStreak] = useState(0);
  const [mistakeIds, setMistakeIds] = useState<Set<string>>(() => readIdSet(mistakeKey));
  const [history, setHistory] = useState<SessionHistoryRecord[]>(() => readHistory(historyKey));
  const [search, setSearch] = useState("");
  const [saveError, setSaveError] = useState("");
  const [pendingSaves, setPendingSaves] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessionSaved, setSessionSaved] = useState(false);
  const autoNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoNextTimer = () => {
    if (autoNextTimer.current) {
      clearTimeout(autoNextTimer.current);
      autoNextTimer.current = null;
    }
  };

  const entriesByBook = useMemo(() => {
    const result = new Map<string, PracticeEntry[]>();

    for (const book of books) {
      const sortedUnits = [...book.units].sort(sortUnits);
      const unitById = new Map(sortedUnits.map((unit, index) => [unit.id, { unit, index }]));
      const bookEntries = words
        .filter((word) => word.unit_id && unitById.has(word.unit_id))
        .map((word) => {
          const unitInfo = unitById.get(word.unit_id!)!;
          const sentenceNumber = unitInfo.index + 1;
          const sentenceLabel = `Sentence ${String(sentenceNumber).padStart(2, "0")}`;
          const sentenceText = parseSentenceText(unitInfo.unit);
          return {
            word,
            unit: unitInfo.unit,
            sentenceNumber,
            sentenceLabel,
            sourceLabel: `${sentenceLabel} · ${unitInfo.unit.group_name || book.groupName}`,
            sentenceText,
          };
        })
        .filter((entry) => entry.word.word.trim() && cleanMeaning(entry.word.meaning))
        .sort(sortEntries);

      result.set(book.groupName, bookEntries);
    }

    return result;
  }, [books, words]);

  const activeEntries = useMemo(
    () => (activeBook ? entriesByBook.get(activeBook.groupName) ?? [] : []),
    [activeBook, entriesByBook]
  );

  const filteredActiveEntries = useMemo(() => {
    return activeEntries.filter((entry) => {
      if (scope === "due" && !isWordDue(entry.word)) return false;
      if (scope === "mistakes" && !mistakeIds.has(entry.word.id)) return false;
      if (selectedUnitIds.size > 0 && !selectedUnitIds.has(entry.unit.id)) return false;
      return true;
    });
  }, [activeEntries, mistakeIds, scope, selectedUnitIds]);

  const current = sessionEntries[currentIdx] ?? null;
  const currentOptions = useMemo(
    () => (current ? buildOptions(current, activeEntries, mode) : []),
    [activeEntries, current, mode]
  );

  const correctCount = answers.filter((answer) => answer.correct).length;
  const wrongCount = answers.length - correctCount;
  const currentAccuracy = accuracy(answers);
  const progress = sessionEntries.length
    ? Math.round((answers.length / sessionEntries.length) * 100)
    : 0;
  const visibleWords = useMemo(() => {
    const query = search.trim().toLowerCase();
    const pool = sessionEntries.length ? sessionEntries : filteredActiveEntries;
    if (!query) return pool;
    return pool.filter((entry) => {
      const text = `${entry.word.word} ${entry.word.phonetic} ${entry.word.meaning} ${cleanMeaning(entry.word.meaning)}`.toLowerCase();
      return text.includes(query);
    });
  }, [filteredActiveEntries, search, sessionEntries]);

  const bookStats = books.map((book) => {
    const bookEntries = entriesByBook.get(book.groupName) ?? [];
    const due = bookEntries.filter((entry) => isWordDue(entry.word)).length;
    const mastered = bookEntries.filter((entry) => entry.word.mastered >= 1).length;
    const mistakes = bookEntries.filter((entry) => mistakeIds.has(entry.word.id)).length;
    return { book, entries: bookEntries, due, mastered, mistakes };
  });

  function startSession(
    overrides: {
      book?: InteractiveWordBook | null;
      scope?: PracticeScope;
      selectedUnitIds?: Set<string>;
      shuffle?: boolean;
    } = {}
  ) {
    clearAutoNextTimer();
    const sourceBook = overrides.book ?? activeBook;
    const sourceEntries = sourceBook ? entriesByBook.get(sourceBook.groupName) ?? [] : activeEntries;
    const nextScope = overrides.scope ?? scope;
    const nextSelectedUnitIds = overrides.selectedUnitIds ?? selectedUnitIds;
    const nextShuffle = overrides.shuffle ?? shuffle;
    const nextFilteredEntries = sourceEntries.filter((entry) => {
      if (nextScope === "due" && !isWordDue(entry.word)) return false;
      if (nextScope === "mistakes" && !mistakeIds.has(entry.word.id)) return false;
      if (nextSelectedUnitIds.size > 0 && !nextSelectedUnitIds.has(entry.unit.id)) return false;
      return true;
    });

    const source = nextShuffle
      ? shuffleList(nextFilteredEntries).slice(0, Math.min(SESSION_SIZE, nextFilteredEntries.length))
      : nextFilteredEntries.slice(0, Math.min(SESSION_SIZE, nextFilteredEntries.length));

    const nextEntries = nextShuffle ? source : [...source].sort(sortEntries);
    setSessionEntries(nextEntries);
    setSessionStarted(true);
    setCurrentIdx(0);
    setSelectedId(null);
    setAnswered(false);
    setAnswers([]);
    setStreak(0);
    setSaveError("");
    setPendingSaves(0);
    setSessionStartedAt(new Date().toISOString());
    setSessionId(makeSessionId());
    setSessionSaved(false);
  }

  function finalizeSession(completed: boolean, answerList = answers) {
    if (sessionSaved || !sessionStartedAt || answerList.length === 0 || !activeBook) return;

    const record: SessionHistoryRecord = {
      id: sessionId || makeSessionId(),
      date: sessionStartedAt,
      bookName: activeBook.groupName,
      mode,
      filter: `${scopeLabel(scope)} · ${selectedSentenceLabel(selectedUnitIds, activeBook)}`,
      target: sessionEntries.length,
      asked: answerList.length,
      correct: answerList.filter((answer) => answer.correct).length,
      wrong: answerList.filter((answer) => !answer.correct).length,
      accuracy: accuracy(answerList),
      completed: completed && answerList.length >= sessionEntries.length,
    };
    const nextHistory = [record, ...history].slice(0, 30);
    setHistory(nextHistory);
    writeHistory(historyKey, nextHistory);
    setSessionSaved(true);
  }

  function openBook(book: InteractiveWordBook) {
    clearAutoNextTimer();
    const emptySelection = new Set<string>();
    setActiveBook(book);
    setSelectedUnitIds(emptySelection);
    setSessionStarted(false);
    setSearch("");
    startSession({ book, selectedUnitIds: emptySelection });
  }

  function backToBooks() {
    finalizeSession(false);
    clearAutoNextTimer();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setActiveBook(null);
    setSessionEntries([]);
    setSessionStarted(false);
    setCurrentIdx(0);
    setSelectedId(null);
    setAnswered(false);
    setAnswers([]);
    setSaveError("");
  }

  function exitPractice() {
    finalizeSession(false);
    clearAutoNextTimer();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    onFinish();
  }

  function toggleMode(nextMode: PracticeMode) {
    if (nextMode === mode) return;
    finalizeSession(false);
    setMode(nextMode);
    startSession();
  }

  function chooseScope(nextScope: PracticeScope) {
    finalizeSession(false);
    setScope(nextScope);
    startSession({ scope: nextScope });
  }

  function toggleUnit(unitId: string) {
    finalizeSession(false);
    const nextIds = new Set(selectedUnitIds);
    if (nextIds.has(unitId)) nextIds.delete(unitId);
    else nextIds.add(unitId);
    setSelectedUnitIds(nextIds);
    startSession({ selectedUnitIds: nextIds });
  }

  function setAllUnits() {
    if (!activeBook) return;
    finalizeSession(false);
    const nextIds = new Set(activeBook.units.map((unit) => unit.id));
    setSelectedUnitIds(nextIds);
    startSession({ selectedUnitIds: nextIds });
  }

  function clearUnits() {
    finalizeSession(false);
    const nextIds = new Set<string>();
    setSelectedUnitIds(nextIds);
    startSession({ selectedUnitIds: nextIds });
  }

  function toggleAutoNext(nextValue: boolean) {
    setAutoNext(nextValue);
    if (!nextValue) clearAutoNextTimer();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(autoNextKey, nextValue ? "1" : "0");
    }
  }

  function speakWord(entry = current) {
    if (!entry || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(entry.word.word);
    const voice = getEnglishVoice();
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    if (voice) utterance.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function goToNextQuestion() {
    clearAutoNextTimer();
    setCurrentIdx((index) => index + 1);
    setSelectedId(null);
    setAnswered(false);
    setSaveError("");
  }

  function recordAnswer(optionId: string | null, skipped = false) {
    if (!current || answered) return;

    const correct = !skipped && optionId === current.word.id;
    const selectedEntry = optionId
      ? currentOptions.find((entry) => entry.word.id === optionId) ?? null
      : null;
    const nextAnswer: AnswerRecord = {
      entry: current,
      selectedId: optionId,
      selectedText: selectedEntry ? answerText(selectedEntry, mode) : "跳过",
      answerText: answerText(current, mode),
      correct,
      skipped,
    };
    const nextAnswers = [...answers, nextAnswer];

    setSelectedId(optionId);
    setAnswered(true);
    setAnswers(nextAnswers);
    setStreak((value) => (correct ? value + 1 : 0));
    setSaveError("");

    const nextMistakes = new Set(mistakeIds);
    if (correct) nextMistakes.delete(current.word.id);
    else nextMistakes.add(current.word.id);
    setMistakeIds(nextMistakes);
    writeIdSet(mistakeKey, nextMistakes);

    setPendingSaves((value) => value + 1);
    onReview(current.word.id, correct ? 2 : 0)
      .catch(() => {
        setSaveError("复习记录保存失败，可继续答题，稍后刷新再试。");
      })
      .finally(() => {
        setPendingSaves((value) => Math.max(0, value - 1));
      });

    if (nextAnswers.length >= sessionEntries.length) {
      finalizeSession(true, nextAnswers);
      return;
    }

    if (correct && autoNext) {
      autoNextTimer.current = setTimeout(goToNextQuestion, AUTO_NEXT_DELAY_MS);
    }
  }

  function handleNext() {
    if (!current) {
      startSession();
      return;
    }
    if (!answered) {
      recordAnswer(null, true);
      return;
    }
    goToNextQuestion();
  }

  function resetLocalPractice() {
    if (!window.confirm("确定清空错题和最近成绩吗？这个操作只影响当前浏览器。")) return;
    const emptyMistakes = new Set<string>();
    setMistakeIds(emptyMistakes);
    setHistory([]);
    writeIdSet(mistakeKey, emptyMistakes);
    writeHistory(historyKey, []);
    startSession();
  }

  useEffect(() => {
    return () => {
      if (autoNextTimer.current) {
        clearTimeout(autoNextTimer.current);
        autoNextTimer.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!activeBook) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f6f7f2] text-slate-900">
        <div className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={exitPractice}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-600 transition hover:border-emerald-200 hover:text-emerald-800"
            >
              返回单词学习
            </button>
            <span className="rounded-lg border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-800">
              {subjectName} · 背单词
            </span>
          </div>

          <section className="mt-6 rounded-lg border border-stone-200 bg-white p-6 shadow-[0_18px_42px_rgba(42,57,51,0.10)]">
            <p className="text-sm font-semibold text-emerald-700">Interactive word practice</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950">
              选择词书
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
              进入后可以按句子筛选、切换英选中/中选英、复习错题并查看最近成绩。
            </p>
          </section>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {bookStats.map(({ book, entries, due, mastered, mistakes }, index) => (
              <button
                key={book.groupName}
                onClick={() => openBook(book)}
                disabled={entries.length < 2}
                className="group rounded-lg border border-stone-200 bg-white p-5 text-left shadow-[0_14px_38px_rgba(42,57,51,0.08)] transition hover:-translate-y-0.5 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-slate-900 text-base font-bold text-white">
                    {index + 1}
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {due} 待复习
                  </span>
                </div>
                <h2 className="mt-5 break-words text-xl font-bold text-slate-950">
                  {book.groupName}
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {entries.length} 个可练单词，已掌握 {mastered} 个，错题 {mistakes} 个。
                </p>
                <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-4">
                  <span className="text-sm font-bold text-emerald-800">开始练习</span>
                  <span className="text-lg text-stone-300 transition group-hover:translate-x-1 group-hover:text-emerald-600">
                    →
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!sessionStarted) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#f6f7f2] p-6">
        <div className="rounded-lg border border-stone-200 bg-white px-6 py-5 text-sm font-semibold text-stone-600 shadow-lg">
          准备词表...
        </div>
      </div>
    );
  }

  const selectedLabel = selectedSentenceLabel(selectedUnitIds, activeBook);
  const sortedUnits = [...activeBook.units].sort(sortUnits);
  const isComplete = sessionEntries.length > 0 && currentIdx >= sessionEntries.length;

  if (sessionEntries.length === 0) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f6f7f2] p-4">
        <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center">
          <div className="w-full rounded-lg border border-stone-200 bg-white p-7 text-center shadow-[0_18px_42px_rgba(42,57,51,0.10)]">
            <h2 className="text-2xl font-bold text-slate-950">当前范围没有可练单词</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              {scope === "mistakes" ? "错题已经清空，可以切换到全部词条。" : "换一个句子范围或词表类型后再开始。"}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                onClick={backToBooks}
                className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-700"
              >
                返回词书
              </button>
              <button
                onClick={() => chooseScope("all")}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
              >
                练全部词
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isComplete) {
    const wrongAnswers = answers.filter((answer) => !answer.correct);
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f6f7f2] text-slate-900">
        <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={backToBooks}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-600 transition hover:text-emerald-800"
            >
              返回词书
            </button>
            <button
              onClick={() => startSession()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
            >
              再练一轮
            </button>
          </div>

          <section className="mt-6 rounded-lg border border-stone-200 bg-white p-6 shadow-[0_18px_42px_rgba(42,57,51,0.10)]">
            <p className="text-sm font-semibold text-emerald-700">{activeBook.groupName}</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">
              本场正确率 {currentAccuracy}%
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              答对 {correctCount} 题，答错 {wrongCount} 题。
            </p>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-emerald-700" style={{ width: `${currentAccuracy}%` }} />
            </div>

            <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-4">
              <h2 className="font-bold text-slate-900">最近成绩</h2>
              <div className="mt-3 grid gap-2 text-sm text-stone-600">
                {history.slice(0, 4).map((record) => (
                  <div key={record.id} className="flex items-center justify-between gap-3 border-t border-stone-200 pt-2 first:border-t-0 first:pt-0">
                    <span className="font-bold text-emerald-800">{record.accuracy}%</span>
                    <span className="min-w-0 flex-1 truncate">
                      {formatSessionDate(record.date)} · {record.bookName} · {record.filter}
                    </span>
                    <span>{record.correct}/{record.asked}</span>
                  </div>
                ))}
              </div>
            </div>

            {wrongAnswers.length > 0 && (
              <div className="mt-6">
                <h2 className="font-bold text-slate-900">错题回看</h2>
                <div className="mt-3 grid gap-3">
                  {wrongAnswers.map((item) => (
                    <div key={`${item.entry.word.id}-${item.entry.sentenceLabel}`} className="rounded-lg border border-stone-200 bg-white p-4">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-lg font-bold text-slate-950">{item.entry.word.word}</span>
                        {item.entry.word.phonetic && (
                          <span className="text-sm text-stone-500">{item.entry.word.phonetic}</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-stone-600">你选：{item.selectedText}</p>
                      <p className="mt-1 text-sm font-bold text-emerald-800">正确：{item.answerText}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  const feedbackText = !current
    ? ""
    : selectedId === current.word.id
      ? `答对了：${current.word.word} ${current.word.phonetic || ""}，${cleanMeaning(current.word.meaning)}`
      : `正确答案：${current.word.word} ${current.word.phonetic || ""}，${answerText(current, mode)}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f6f7f2] text-slate-900">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-slate-900 text-base font-black text-white">
              Aa
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-slate-950">英语单词互动练习</h1>
              <p className="mt-1 text-sm text-stone-600">
                {activeBook.groupName} · {filteredActiveEntries.length} 个可练词
              </p>
            </div>
          </div>

          <div className="grid min-w-[260px] grid-cols-3 gap-2">
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-center">
              <span className="block text-lg font-black text-emerald-900">{answers.length}/{sessionEntries.length}</span>
              <small className="text-stone-500">本场</small>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-center">
              <span className="block text-lg font-black text-emerald-900">{currentAccuracy}%</span>
              <small className="text-stone-500">正确率</small>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-center">
              <span className="block text-lg font-black text-emerald-900">{streak}</span>
              <small className="text-stone-500">连对</small>
            </div>
          </div>
        </header>

        <main className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-[0_18px_42px_rgba(42,57,51,0.10)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-blue-800">
                  第 {currentIdx + 1}/{sessionEntries.length} 题 · {current?.sentenceLabel}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">选择正确答案</h2>
              </div>
              <button
                onClick={backToBooks}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-600 transition hover:border-emerald-200 hover:text-emerald-800"
              >
                词书选择
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-stone-200 bg-stone-50 p-1">
              <button
                onClick={() => toggleMode("en-zh")}
                className={`min-h-10 rounded-md text-sm font-bold transition ${mode === "en-zh" ? "bg-white text-emerald-900 shadow-sm" : "text-stone-500"}`}
              >
                英文选中文
              </button>
              <button
                onClick={() => toggleMode("zh-en")}
                className={`min-h-10 rounded-md text-sm font-bold transition ${mode === "zh-en" ? "bg-white text-emerald-900 shadow-sm" : "text-stone-500"}`}
              >
                中文选英文
              </button>
            </div>

            <div className="mt-4 grid gap-3 rounded-lg border border-stone-200 bg-[#fbfcfa] p-3 sm:grid-cols-[1fr_minmax(160px,260px)_auto] sm:items-center">
              <div className="min-w-0">
                <strong className="block text-emerald-900">本场 {sessionEntries.length} 个词</strong>
                <span className="text-sm font-semibold text-stone-500">
                  {scopeLabel(scope)} · {selectedLabel} · {modeLabel(mode)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-sm font-bold text-stone-500">{answers.length}/{sessionEntries.length}</span>
            </div>

            <div className="mt-4 grid min-h-[180px] content-center rounded-lg border border-stone-200 bg-[#fbfcfa] p-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className={`break-words font-black leading-tight text-slate-950 ${mode === "zh-en" ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"}`}>
                  {current ? questionText(current, mode) : ""}
                </div>
                {mode === "en-zh" && current && (
                  <button
                    onClick={() => speakWord(current)}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-emerald-800 shadow-sm transition hover:bg-emerald-50"
                    title="播放发音"
                  >
                    ▶
                  </button>
                )}
              </div>
              {mode === "en-zh" && current?.word.phonetic && (
                <p className="mt-3 text-lg text-stone-500">{current.word.phonetic}</p>
              )}
            </div>

            <div className="mt-4 grid min-h-[250px] gap-3 sm:grid-cols-2">
              {currentOptions.map((option, index) => {
                const isCorrectOption = current ? option.word.id === current.word.id : false;
                const isSelectedOption = option.word.id === selectedId;
                const stateClass = !answered
                  ? "border-stone-200 bg-white hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50"
                  : isCorrectOption
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                    : isSelectedOption
                      ? "border-rose-500 bg-rose-50 text-rose-800"
                      : "border-stone-200 bg-stone-50 text-stone-400";

                return (
                  <button
                    key={`${option.word.id}-${index}`}
                    onClick={() => recordAnswer(option.word.id)}
                    disabled={answered}
                    className={`min-h-[104px] rounded-lg border px-4 py-3 text-left font-bold leading-6 transition ${stateClass}`}
                  >
                    <span className="mb-2 inline-grid h-7 w-7 place-items-center rounded-full bg-white text-xs font-black text-stone-500 ring-1 ring-stone-200">
                      {String.fromCharCode(65 + index)}
                    </span>
                    {mode === "en-zh" ? (
                      <span className="block break-words">{cleanMeaning(option.word.meaning)}</span>
                    ) : (
                      <span className="block">
                        <span className="block break-words text-lg">{option.word.word}</span>
                        {option.word.phonetic && (
                          <span className="mt-1 block text-sm font-semibold text-stone-500">{option.word.phonetic}</span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className={`mt-4 min-h-[58px] rounded-lg border px-4 py-3 text-sm font-semibold leading-6 ${answered ? (selectedId === current?.word.id ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-800") : "border-transparent text-stone-500"}`}>
              {answered ? feedbackText : " "}
              {pendingSaves > 0 && <span className="ml-2 text-xs text-stone-500">保存中...</span>}
              {saveError && <p className="mt-1 text-xs text-rose-700">{saveError}</p>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => recordAnswer(null, true)}
                disabled={answered}
                className="min-h-10 rounded-lg border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 transition hover:border-stone-300 disabled:opacity-50"
              >
                跳过
              </button>
              <button
                onClick={handleNext}
                className="min-h-10 rounded-lg bg-emerald-700 px-5 text-sm font-bold text-white transition hover:bg-emerald-800"
              >
                {!current ? "开始新训练" : !answered ? "显示答案" : currentIdx + 1 >= sessionEntries.length ? "查看成绩" : "下一题"}
              </button>
            </div>
          </section>

          <aside className="rounded-lg border border-stone-200 bg-white p-4 shadow-[0_18px_42px_rgba(42,57,51,0.10)] lg:sticky lg:top-4">
            <label className="grid gap-2 text-sm font-bold text-stone-600">
              词表类型
              <select
                value={scope}
                onChange={(event) => chooseScope(event.target.value as PracticeScope)}
                className="min-h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm text-slate-900"
              >
                <option value="all">全部词条</option>
                <option value="due">今日待复习</option>
                <option value="mistakes">错题复习</option>
              </select>
            </label>

            <div className="mt-4 grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-stone-600">选择句子</span>
                <span className="text-xs font-bold text-emerald-800">{selectedLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={setAllUnits} className="min-h-9 rounded-lg border border-stone-200 bg-white text-sm font-bold text-stone-700">
                  选中全部
                </button>
                <button onClick={clearUnits} className="min-h-9 rounded-lg border border-stone-200 bg-white text-sm font-bold text-stone-700">
                  清空选择
                </button>
              </div>
              <div className="grid max-h-44 grid-cols-5 gap-1.5 overflow-auto rounded-lg border border-stone-200 bg-[#fbfcfa] p-2">
                {sortedUnits.map((unit, index) => {
                  const selected = selectedUnitIds.has(unit.id);
                  return (
                    <button
                      key={unit.id}
                      onClick={() => toggleUnit(unit.id)}
                      className={`min-h-8 rounded-md border text-xs font-black transition ${selected ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-white text-stone-700 hover:border-emerald-200"}`}
                      title={unit.name}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => startSession()}
              className="mt-4 min-h-10 w-full rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              开始新训练
            </button>

            <div className="mt-4 grid gap-2 text-sm font-semibold text-stone-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={shuffle}
                  onChange={(event) => {
                    finalizeSession(false);
                    const nextShuffle = event.target.checked;
                    setShuffle(nextShuffle);
                    startSession({ shuffle: nextShuffle });
                  }}
                  className="h-4 w-4 accent-emerald-700"
                />
                随机出题
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoNext}
                  onChange={(event) => toggleAutoNext(event.target.checked)}
                  className="h-4 w-4 accent-emerald-700"
                />
                答对后自动下一题
              </label>
            </div>

            <div className="mt-4 rounded-lg border border-stone-200 bg-[#fbfcfa] p-3">
              <strong className="text-sm text-slate-900">最近成绩</strong>
              <div className="mt-2 grid gap-2 text-xs text-stone-600">
                {history.length === 0 ? (
                  <span>还没有完成过训练。</span>
                ) : (
                  history.slice(0, 5).map((record) => (
                    <div key={record.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-t border-stone-200 pt-2 first:border-t-0 first:pt-0">
                      <span className="font-black text-emerald-800">{record.accuracy}%</span>
                      <span className="min-w-0 truncate">
                        {formatSessionDate(record.date)} · {record.bookName}
                      </span>
                      <span>{record.correct}/{record.asked}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 min-h-[112px] rounded-lg border border-stone-200 bg-[#fbfcfa] p-3">
              <strong className="text-sm text-slate-900">来源句子</strong>
              {current ? (
                <div className="mt-2 text-sm leading-6 text-stone-600">
                  {answered && current.sentenceText ? (
                    <>
                      <p className="font-bold text-slate-900">{current.sentenceText.english}</p>
                      {current.sentenceText.chinese && <p>{current.sentenceText.chinese}</p>}
                    </>
                  ) : (
                    <p>{current.sourceLabel}</p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-stone-600">答题后显示对应句子。</p>
              )}
            </div>

            <label className="mt-4 grid gap-2 text-sm font-bold text-stone-600">
              查词
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                type="search"
                placeholder="输入英文或中文"
                className="min-h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm text-slate-900"
              />
            </label>
            <div className="mt-2 text-xs font-semibold text-stone-500">
              {sessionEntries.length ? `本场 ${visibleWords.length} 个词` : `${visibleWords.length} 个词`}
            </div>
            <div className="mt-2 grid max-h-52 gap-1.5 overflow-auto">
              {visibleWords.slice(0, 50).map((entry) => (
                <button
                  key={`${entry.word.id}-${entry.unit.id}`}
                  onClick={() => {
                    const index = sessionEntries.findIndex((item) => item.word.id === entry.word.id);
                    if (index >= 0) {
                      setCurrentIdx(index);
                      setSelectedId(null);
                      setAnswered(false);
                    }
                  }}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-left"
                >
                  <strong className="block break-words text-sm text-emerald-900">{entry.word.word}</strong>
                  <span className="mt-1 block break-words text-xs leading-5 text-stone-600">{cleanMeaning(entry.word.meaning)}</span>
                </button>
              ))}
            </div>

            <button
              onClick={resetLocalPractice}
              className="mt-4 min-h-10 w-full rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-800 transition hover:bg-rose-100"
            >
              清空错题和成绩
            </button>
          </aside>
        </main>
      </div>
    </div>
  );
}
