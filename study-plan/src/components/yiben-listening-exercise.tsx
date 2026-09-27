"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  exerciseStorageKey,
  loadListeningProgress,
  readListeningProgress,
  writeListeningProgress,
  type ListeningExerciseProgress,
  type ListeningStoredAnswer,
} from "@/lib/listening-yiben-storage";
import type {
  ListeningAnswerItem,
  ListeningExercise,
} from "@/lib/listening-yiben-types";

type Props = {
  subjectId: string;
  exercise: ListeningExercise;
  exerciseCount: number;
};

const optionLetters = ["A", "B", "C", "D", "E", "F", "G"];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s.,，。;；:：、'"“”‘’()（）\-_]/g, "");
}

function acceptableAnswers(answer: string) {
  const candidates = answer.split(/\s*(?:\||；|;|或)\s*/);
  const expanded = candidates.flatMap((candidate) => {
    if (!candidate.includes("/")) return [candidate];
    const [left, right] = candidate.split("/", 2);
    const suffix = right.match(/^\S+\s+(.+)$/)?.[1];
    return suffix ? [candidate, `${left} ${suffix}`, right] : [candidate, left, right];
  });
  const values = expanded.map((value) => normalized(value)).filter(Boolean);
  return values.length ? values : [normalized(answer)];
}

function isAnswerCorrect(item: ListeningAnswerItem, value: ListeningStoredAnswer | undefined) {
  if (value === undefined) return false;
  if (Array.isArray(value)) {
    const expected = Array.from(item.answer.toUpperCase().matchAll(/[A-F]/g), (match) => match[0]);
    return [...value].sort().join("") === [...new Set(expected)].sort().join("");
  }
  const entered = normalized(value);
  return acceptableAnswers(item.answer).some(
    (expected) => expected === entered || (entered.length >= 2 && expected.includes(entered)),
  );
}

function hasAnswer(value: ListeningStoredAnswer | undefined) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());
}

function AnswerControl({
  item,
  value,
  submitted,
  letters,
  onChange,
}: {
  item: ListeningAnswerItem;
  value: ListeningStoredAnswer | undefined;
  submitted: boolean;
  letters: string[];
  onChange: (value: ListeningStoredAnswer) => void;
}) {
  const correct = submitted && isAnswerCorrect(item, value);
  const options = item.type === "true_false" ? ["T", "F"] : letters;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        submitted
          ? correct
            ? "border-emerald-200 bg-emerald-50/70"
            : "border-rose-200 bg-rose-50/70"
          : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-black text-neutral-900">{item.label}</p>
        {submitted && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
              correct ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
            }`}
          >
            {correct ? "正确" : "错误"}
          </span>
        )}
      </div>

      {(item.type === "choice" || item.type === "true_false") && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {options.map((option) => {
            const selected = value === option;
            return (
              <button
                key={option}
                type="button"
                data-testid={`${item.id}-${option}`}
                disabled={submitted}
                onClick={() => onChange(option)}
                className={`min-h-11 rounded-xl border text-sm font-black transition ${
                  selected
                    ? "border-emerald-500 bg-emerald-600 text-white"
                    : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-emerald-300 hover:bg-emerald-50"
                } disabled:cursor-default`}
              >
                {item.type === "true_false" ? (option === "T" ? "T 正确" : "F 错误") : option}
              </button>
            );
          })}
        </div>
      )}

      {item.type === "multi_choice" && (
        <div className="mt-3 grid grid-cols-6 gap-2">
          {letters.map((option) => {
            const selected = Array.isArray(value) && value.includes(option);
            return (
              <button
                key={option}
                type="button"
                data-testid={`${item.id}-${option}`}
                disabled={submitted}
                onClick={() => {
                  const current = Array.isArray(value) ? value : [];
                  onChange(
                    selected ? current.filter((entry) => entry !== option) : [...current, option],
                  );
                }}
                className={`min-h-11 rounded-xl border text-sm font-black transition ${
                  selected
                    ? "border-emerald-500 bg-emerald-600 text-white"
                    : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-emerald-300 hover:bg-emerald-50"
                } disabled:cursor-default`}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      {(item.type === "fill_blank" || item.type === "order") && (
        <input
          value={typeof value === "string" ? value : ""}
          data-testid={item.id}
          disabled={submitted}
          onChange={(event) => onChange(event.target.value)}
          placeholder={item.type === "order" ? "输入顺序，如 3, 1, 4, 2" : "输入答案"}
          className="mt-3 min-h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:text-neutral-700"
        />
      )}

      {submitted && (
        <p className="mt-3 border-t border-black/5 pt-3 text-sm leading-6 text-neutral-700">
          标准答案：<span className="font-black text-neutral-950">{item.answer}</span>
        </p>
      )}
    </div>
  );
}

export default function YibenListeningExercise({ subjectId, exercise, exerciseCount }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [answers, setAnswers] = useState<Record<string, ListeningStoredAnswer>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [speed, setSpeed] = useState(1);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  const items = useMemo(
    () => exercise.sections.flatMap((section) => section.items),
    [exercise.sections],
  );
  const answeredCount = items.filter((item) => hasAnswer(answers[item.id])).length;
  const allAnswered = items.length > 0 && answeredCount === items.length;
  const score = items.filter((item) => isAnswerCorrect(item, answers[item.id])).length;
  const percent = items.length ? Math.round((score / items.length) * 100) : 0;
  const storageKey = exerciseStorageKey(exercise.number);
  const activeSection =
    exercise.sections[activeSectionIndex] ?? exercise.sections[0];

  function lettersForSection(sectionItems: ListeningAnswerItem[]) {
    const matched = sectionItems.flatMap((item) =>
      Array.from(item.answer.toUpperCase().matchAll(/[A-G]/g), (match) => match[0]),
    );
    const highest = Math.max(2, ...matched.map((letter) => optionLetters.indexOf(letter)));
    return optionLetters.slice(0, highest + 1);
  }

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadListeningProgress().then((store) => {
        if (!active) return;
        const saved = store.exercises[storageKey] ?? readListeningProgress().exercises[storageKey];
        if (saved) {
          setAnswers(saved.answers ?? {});
          setSubmitted(Boolean(saved.submitted));
          setBestScore(saved.bestScore ?? 0);
          setAttempts(saved.attempts ?? 0);
        }
        setLoaded(true);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [storageKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration || 0);
    const stop = () => setPlaying(false);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", stop);
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", stop);
    };
  }, []);

  function persist(nextAnswers: Record<string, ListeningStoredAnswer>, nextSubmitted = submitted) {
    if (!loaded) return;
    const store = readListeningProgress();
    const previous = store.exercises[storageKey];
    const nextScore = nextSubmitted
      ? items.filter((item) => isAnswerCorrect(item, nextAnswers[item.id])).length
      : previous?.score ?? 0;
    const record: ListeningExerciseProgress = {
      answers: nextAnswers,
      submitted: nextSubmitted,
      score: nextScore,
      total: items.length,
      bestScore: Math.max(previous?.bestScore ?? 0, nextSubmitted ? nextScore : 0),
      attempts: previous?.attempts ?? attempts,
      updatedAt: new Date().toISOString(),
    };
    store.exercises[storageKey] = record;
    writeListeningProgress(store);
  }

  function updateAnswer(itemId: string, value: ListeningStoredAnswer) {
    const next = { ...answers, [itemId]: value };
    setAnswers(next);
    persist(next, false);
  }

  function submitExercise() {
    if (!allAnswered) return;
    const nextAttempts = attempts + 1;
    const nextBest = Math.max(bestScore, score);
    setSubmitted(true);
    setAttempts(nextAttempts);
    setBestScore(nextBest);
    const store = readListeningProgress();
    store.exercises[storageKey] = {
      answers,
      submitted: true,
      score,
      total: items.length,
      bestScore: nextBest,
      attempts: nextAttempts,
      updatedAt: new Date().toISOString(),
    };
    writeListeningProgress(store);
    window.setTimeout(() => document.getElementById("exercise-result")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function restartExercise() {
    setAnswers({});
    setSubmitted(false);
    const store = readListeningProgress();
    store.exercises[storageKey] = {
      answers: {},
      submitted: false,
      score: 0,
      total: items.length,
      bestScore,
      attempts,
      updatedAt: new Date().toISOString(),
    };
    writeListeningProgress(store);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f8f7] px-3 py-5 text-neutral-950 sm:px-6 sm:py-8">
      <audio ref={audioRef} src={exercise.audioSrc} preload="metadata" />
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href={`/subjects/${subjectId}/listening/yiben-grade-6`}
              className="text-sm font-bold text-emerald-700 hover:text-emerald-900"
            >
              ← 返回 100 篇目录
            </Link>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
              {exercise.part} · {exercise.topic}
            </p>
            <h1 className="mt-2 text-3xl font-black">Exercise {exercise.number}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <span className="rounded-full bg-white px-4 py-2 text-neutral-600 ring-1 ring-neutral-200">
              {exercise.number} / {exerciseCount}
            </span>
            <span className="rounded-full bg-emerald-50 px-4 py-2 text-emerald-700 ring-1 ring-emerald-200">
              {answeredCount} / {items.length} 已答
            </span>
            {bestScore > 0 && (
              <span className="rounded-full bg-blue-50 px-4 py-2 text-blue-700 ring-1 ring-blue-200">
                最佳 {Math.round((bestScore / items.length) * 100)}%
              </span>
            )}
          </div>
        </header>

        <section className="sticky top-2 z-20 mt-5 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleAudio}
                title={playing ? "暂停" : "播放"}
                aria-label={playing ? "暂停音频" : "播放音频"}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg text-white shadow-sm transition hover:bg-emerald-700"
              >
                {playing ? "Ⅱ" : "▶"}
              </button>
              <div className="min-w-24">
                <p className="text-sm font-black">本篇音频</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </p>
              </div>
            </div>
            <input
              aria-label="音频进度"
              type="range"
              min="0"
              max={duration || 1}
              step="0.1"
              value={Math.min(currentTime, duration || 1)}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (audioRef.current) audioRef.current.currentTime = next;
                setCurrentTime(next);
              }}
              className="h-2 min-w-0 flex-1 accent-emerald-600"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-neutral-500">
                音量
                <input
                  aria-label="音量"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setVolume(next);
                    if (audioRef.current) audioRef.current.volume = next;
                  }}
                  className="w-20 accent-emerald-600"
                />
              </label>
              <div className="flex rounded-xl bg-neutral-100 p-1">
                {[0.75, 1, 1.25].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      setSpeed(rate);
                      if (audioRef.current) audioRef.current.playbackRate = rate;
                    }}
                    className={`rounded-lg px-3 py-2 text-xs font-black ${
                      speed === rate ? "bg-white text-emerald-700 shadow-sm" : "text-neutral-500"
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.75fr)]">
          <section className="space-y-4">
            {exercise.pageImages.map((image, index) => (
              <figure
                key={image}
                className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
              >
                <a
                  href={image}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute right-3 top-3 z-10 rounded-full border border-white/80 bg-white/95 px-3 py-2 text-xs font-black text-neutral-700 shadow-sm transition hover:bg-white"
                >
                  查看大图 ↗
                </a>
                {/* The workbook is image-based; these are extracted page assets, not embedded PDFs. */}
                <Image
                  src={image}
                  alt={`Exercise ${exercise.number} 原书题面第 ${index + 1} 页`}
                  width={1500}
                  height={2121}
                  unoptimized
                  className="block h-auto w-full"
                  priority={index === 0}
                />
              </figure>
            ))}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-28">
            <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5 xl:flex xl:max-h-[calc(100vh-8rem)] xl:flex-col xl:overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">
                    Answer Sheet
                  </p>
                  <h2 className="mt-1 text-xl font-black">答题卡</h2>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-600">
                  {answeredCount}/{items.length}
                </span>
              </div>

              <div
                className="mt-4 flex shrink-0 gap-2 overflow-x-auto border-b border-neutral-100 pb-4"
                role="tablist"
                aria-label="答题步骤"
              >
                {exercise.sections.map((section, index) => {
                  const sectionAnswered = section.items.filter((item) =>
                    hasAnswer(answers[item.id]),
                  ).length;
                  const active = index === activeSectionIndex;
                  return (
                    <button
                      key={`${section.title}-${index}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveSectionIndex(index)}
                      className={`min-w-fit rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? "border-emerald-500 bg-emerald-600 text-white shadow-sm"
                          : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-emerald-300 hover:bg-emerald-50"
                      }`}
                    >
                      <span className="block text-sm font-black">{section.title}</span>
                      <span
                        className={`mt-0.5 block text-[11px] font-bold ${
                          active ? "text-emerald-50" : "text-neutral-400"
                        }`}
                      >
                        {sectionAnswered}/{section.items.length} 已答
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeSection && (
                <div
                  key={`${activeSection.title}-${activeSectionIndex}`}
                  className="mt-4 min-h-0 space-y-3 xl:flex-1 xl:overflow-y-auto xl:pr-1"
                  role="tabpanel"
                >
                  {activeSection.items.map((item) => (
                    <AnswerControl
                      key={item.id}
                      item={item}
                      value={answers[item.id]}
                      submitted={submitted}
                      letters={lettersForSection(activeSection.items)}
                      onChange={(value) => updateAnswer(item.id, value)}
                    />
                  ))}
                </div>
              )}

              {exercise.sections.length > 1 && (
                <div className="mt-4 grid shrink-0 grid-cols-2 gap-2 border-t border-neutral-100 pt-4">
                  <button
                    type="button"
                    disabled={activeSectionIndex === 0}
                    onClick={() => setActiveSectionIndex((current) => Math.max(0, current - 1))}
                    className="min-h-10 rounded-xl border border-neutral-200 text-sm font-black text-neutral-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    上一步
                  </button>
                  <button
                    type="button"
                    disabled={activeSectionIndex === exercise.sections.length - 1}
                    onClick={() =>
                      setActiveSectionIndex((current) =>
                        Math.min(exercise.sections.length - 1, current + 1),
                      )
                    }
                    className="min-h-10 rounded-xl border border-neutral-200 text-sm font-black text-neutral-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    下一步
                  </button>
                </div>
              )}

              {!submitted ? (
                <div className="mt-4 shrink-0 border-t border-neutral-100 bg-white pt-4">
                  <button
                    type="button"
                    data-testid="submit-exercise"
                    disabled={!allAnswered}
                    onClick={submitExercise}
                    className="min-h-12 w-full rounded-xl bg-emerald-600 px-5 font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
                  >
                    {allAnswered ? "提交整篇" : `还需完成 ${items.length - answeredCount} 项`}
                  </button>
                  <p className="mt-3 text-center text-xs leading-5 text-neutral-500">
                    提交前不显示答案；请先完成全部必答项。
                  </p>
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-5">
                  <button
                    type="button"
                    onClick={restartExercise}
                    className="min-h-12 rounded-xl border border-neutral-200 font-black text-neutral-700 hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    重新练习
                  </button>
                  {exercise.number < exerciseCount ? (
                    <Link
                      href={`/subjects/${subjectId}/listening/yiben-grade-6/exercise/${exercise.number + 1}`}
                      className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-4 font-black text-white hover:bg-emerald-700"
                    >
                      下一篇 →
                    </Link>
                  ) : (
                    <Link
                      href={`/subjects/${subjectId}/listening/yiben-grade-6`}
                      className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-4 font-black text-white hover:bg-emerald-700"
                    >
                      返回目录
                    </Link>
                  )}
                </div>
              )}
            </section>
          </aside>
        </div>

        {submitted && (
          <section id="exercise-result" className="mt-6 space-y-5 scroll-mt-28">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-7">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                Exercise Result
              </p>
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-3xl font-black">本篇完成</h2>
                  <p className="mt-2 text-sm text-emerald-900/70">
                    第 {attempts} 次提交 · 历史最佳 {bestScore}/{items.length}
                  </p>
                </div>
                <div className="flex items-end gap-3">
                  <p className="text-5xl font-black text-emerald-700">{percent}%</p>
                  <p className="pb-1 text-sm font-bold text-emerald-900">{score}/{items.length} 正确</p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">
                  Listening Script
                </p>
                <h2 className="mt-2 text-2xl font-black">听力原文</h2>
                <div className="mt-5 whitespace-pre-line text-base leading-8 text-neutral-800">
                  {exercise.transcript}
                </div>
              </article>
              <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-600">
                  Chinese Translation
                </p>
                <h2 className="mt-2 text-2xl font-black">中文翻译</h2>
                <div className="mt-5 whitespace-pre-line text-base leading-8 text-neutral-800">
                  {exercise.translation}
                </div>
              </article>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
