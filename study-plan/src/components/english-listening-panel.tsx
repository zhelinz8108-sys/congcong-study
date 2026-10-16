"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildListeningQuestionsForBand, LISTENING_BANDS, QUESTION_META, type ListeningBand, type ListeningUnit } from "@/lib/english-listening-bank";
import { useEnglishLocked } from "@/lib/use-english-locked";

type EnglishListeningPanelProps = { subjectId: string; playWordAudio: (src: string, start: number, end: number) => void };
type ListeningFilter = "all" | "main" | "detail" | "inference";


function getToneClasses(tone: string) {
  if (tone === "amber") {
    return {
      border: "border-amber-200",
      bg: "bg-amber-50",
      text: "text-amber-700",
      button: "bg-amber-500 hover:bg-amber-600",
      progress: "bg-amber-500",
    };
  }

  return {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    button: "bg-emerald-500 hover:bg-emerald-600",
    progress: "bg-emerald-500",
  };
}

export function EnglishListeningPanel({ subjectId, playWordAudio }: EnglishListeningPanelProps) {
  const locked = useEnglishLocked("listening-panel", subjectId);
  const [units, setUnits] = useState<ListeningUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBandKey, setActiveBandKey] = useState<ListeningBand["key"] | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [filter, setFilter] = useState<ListeningFilter>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadUnits() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/subjects/${subjectId}`);
        if (!response.ok) {
          throw new Error("听力内容加载失败");
        }
        const data = await response.json();
        if (!cancelled) {
          setUnits(data.units ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "听力内容加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadUnits();

    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const bandSummaries = useMemo(
    () =>
      LISTENING_BANDS.map((band) => {
        const questions = buildListeningQuestionsForBand(band, units);
        const audioCount = new Set(questions.map((question) => question.unit.id)).size;
        return { band, questions, audioCount };
      }),
    [units],
  );

  const activeSummary = bandSummaries.find((summary) => summary.band.key === activeBandKey);
  const activeQuestions = activeSummary?.questions ?? [];
  const filteredQuestions =
    filter === "all"
      ? activeQuestions
      : activeQuestions.filter((question) => question.type === filter);
  const currentQuestion = filteredQuestions[questionIndex] ?? filteredQuestions[0];
  const record = currentQuestion ? locked.records[currentQuestion.id] : undefined;
  const selectedOption = record && typeof record.response === "string" ? record.response : null;
  const isCorrect = record?.feedback.correct === true;

  function startBand(bandKey: ListeningBand["key"]) {
    setActiveBandKey(bandKey);
    setFilter("all");
    setQuestionIndex(0);
  }

  function goNext() {
    setQuestionIndex((current) => Math.min(current + 1, filteredQuestions.length - 1));
  }

  function playCurrentAudio() {
    if (!currentQuestion?.audioSrc) return;
    playWordAudio(currentQuestion.audioSrc, currentQuestion.audioStart, currentQuestion.audioEnd);
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-10 text-center text-stone-500 shadow-sm">
        正在加载听力训练内容...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-10 text-center text-red-600 shadow-sm">
        {error}
      </div>
    );
  }

  if (activeSummary && currentQuestion) {
    const tone = getToneClasses(activeSummary.band.tone);
    const progress = Math.round(((questionIndex + 1) / filteredQuestions.length) * 100);

    return (
      <div className="space-y-8">
        <button
          type="button"
          onClick={() => setActiveBandKey(null)}
          className="text-sm font-semibold text-stone-500 transition hover:text-stone-900"
        >
          ← 返回听力选择
        </button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className={`text-sm font-semibold ${tone.text}`}>{activeSummary.band.wordLimit}</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">{activeSummary.band.title}</h2>
          </div>
          <div className="rounded-full border border-stone-200 bg-white px-5 py-2 text-lg font-semibold text-stone-600 shadow-sm">
            {questionIndex + 1} / {filteredQuestions.length}
          </div>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-stone-100">
          <div
            className={`h-full rounded-full ${tone.progress} transition-all duration-300`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          {[
            ["all", "全部 500 题"],
            ["main", "主旨题"],
            ["detail", "细节题"],
            ["inference", "推断题"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => { setFilter(value as ListeningFilter); setQuestionIndex(0); }}
              className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${
                filter === value
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div
                className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${QUESTION_META[currentQuestion.type].badgeClass}`}
              >
                {QUESTION_META[currentQuestion.type].label}
              </div>
              <p className="mt-5 text-sm font-semibold text-stone-500">
                {QUESTION_META[currentQuestion.type].hint}
              </p>
              <h3 className="mt-3 text-2xl font-black text-slate-950">
                {currentQuestion.prompt}
              </h3>
            </div>

            <button
              type="button"
              onClick={playCurrentAudio}
              className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white shadow-lg transition ${tone.button}`}
              aria-label="播放听力音频"
            >
              ▶
            </button>
          </div>

          <div className="mt-8 space-y-4">
            {locked.error && <p role="alert" className="text-sm text-rose-700">{locked.error}</p>}
            {currentQuestion.options.map((option, optionIndex) => {
              const isSelected = selectedOption === option;
              const isAnswer = option === record?.feedback.answer;
              const showAnswer = selectedOption !== null;

              return (
                <button
                  key={option}
                  type="button"
                  disabled={showAnswer || locked.busy || !locked.ready}
                  onClick={() => void locked.submit(currentQuestion.id, option).catch(() => undefined)}
                  className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left text-lg font-semibold transition ${
                    showAnswer && isAnswer
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : showAnswer && isSelected
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-stone-200 bg-white text-slate-900 hover:border-stone-400"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-sm font-black text-stone-500">
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <span>{option}</span>
                </button>
              );
            })}
          </div>

          {selectedOption && (
            <div className="mt-8 rounded-3xl bg-stone-50 p-6">
              <p className={`text-lg font-black ${isCorrect ? "text-emerald-700" : "text-red-600"}`}>
                {isCorrect ? "答对了" : "这题选错了"}
              </p>
              <p className="mt-3 whitespace-pre-line text-base leading-8 text-stone-700">{record?.feedback.explanation}</p>
              <p className="mt-2 text-xs text-stone-500">首次答案已锁定</p>
              <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
                <p className="font-semibold text-slate-950">{currentQuestion.english}</p>
                <p className="mt-2 text-stone-500">{currentQuestion.chinese}</p>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={goNext}
                  disabled={questionIndex >= filteredQuestions.length - 1}
                  className="rounded-2xl bg-slate-950 px-6 py-3 font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  下一题
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold text-emerald-600">English Listening Workspace</p>
        <h2 className="mt-2 text-4xl font-black text-slate-950">英语听力训练</h2>
        <p className="mt-4 max-w-2xl text-lg leading-9 text-stone-600">
          先用整篇配套训练跟着教材练，再按词汇量进入小学和初中专项训练，逐步提高信息定位与整体理解能力。
        </p>
      </section>

      <Link
        href={`/subjects/${subjectId}/listening/toefl`}
        className="flex items-center justify-between gap-4 rounded-lg border border-teal-200 bg-white px-6 py-5 text-teal-900 transition-colors hover:bg-teal-50"
      >
        <div>
          <h3 className="text-xl font-bold">托福听力</h3>
          <p className="mt-1 text-sm text-teal-700">6.6 · Module 1 / 2 · 27 段 · 47 题</p>
        </div>
        <span aria-hidden="true">→</span>
      </Link>
      <Link
        href={`/subjects/${subjectId}/listening/yiben-grade-6`}
        className="group block overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-md"
      >
        <div className="grid gap-0 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="p-7 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">
                新书 · 100 篇
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                六年级
              </span>
            </div>
            <h3 className="mt-5 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
              2026 一本·小学英语听力训练100篇
            </h3>
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
              100 个 Exercise，配套原书题面和官方音频。完成整篇后统一查看成绩、答案、听力原文与中文翻译。
            </p>
            <div className="mt-6 inline-flex items-center gap-2 font-black text-emerald-700">
              进入书籍目录 <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </div>
          <div className="grid grid-cols-3 border-t border-emerald-100 bg-emerald-50/60 p-5 text-center lg:grid-cols-1 lg:border-l lg:border-t-0">
            <div className="flex flex-col justify-center border-r border-emerald-100 py-3 lg:border-b lg:border-r-0">
              <p className="text-xl font-black text-emerald-800">100</p>
              <p className="mt-1 text-xs font-semibold text-emerald-800/60">篇训练</p>
            </div>
            <div className="flex flex-col justify-center border-r border-emerald-100 py-3 lg:border-b lg:border-r-0">
              <p className="text-xl font-black text-emerald-800">音频</p>
              <p className="mt-1 text-xs font-semibold text-emerald-800/60">逐篇配套</p>
            </div>
            <div className="flex flex-col justify-center py-3">
              <p className="text-xl font-black text-emerald-800">整篇</p>
              <p className="mt-1 text-xs font-semibold text-emerald-800/60">提交反馈</p>
            </div>
          </div>
        </div>
      </Link>

      <div className="grid gap-5 md:grid-cols-2">
        {bandSummaries.map(({ band, questions, audioCount }) => {
          const tone = getToneClasses(band.tone);
          const disabled = questions.length === 0;

          return (
            <section
              key={band.key}
              className={`rounded-[2rem] border bg-white p-7 shadow-sm transition ${
                disabled ? "border-stone-200 opacity-50" : `${tone.border} hover:-translate-y-1`
              }`}
            >
              <div className="flex items-start justify-between gap-5">
                <div>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${tone.bg} ${tone.text}`}>
                    {band.badge}
                  </span>
                  <h3 className="mt-5 text-2xl font-black text-slate-950">{band.title}</h3>
                  <p className="mt-3 text-stone-600">{band.subtitle}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 px-4 py-3 text-right">
                  <p className="text-2xl font-black text-slate-950">{questions.length}</p>
                  <p className="text-sm text-stone-500">道题</p>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-2xl bg-stone-50 p-4">
                  <p className="font-black text-slate-950">主旨</p>
                  <p className="mt-1 text-stone-500">先听大意</p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-4">
                  <p className="font-black text-slate-950">细节</p>
                  <p className="mt-1 text-stone-500">定位信息</p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-4">
                  <p className="font-black text-slate-950">推断</p>
                  <p className="mt-1 text-stone-500">判断意图</p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-stone-100 pt-5">
                <span className="text-sm text-stone-500">可用音频 {audioCount} 条</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => startBand(band.key)}
                  className={`rounded-full px-5 py-3 text-sm font-bold text-white transition ${tone.button} disabled:cursor-not-allowed disabled:bg-stone-300`}
                >
                  开始训练 →
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default EnglishListeningPanel;
