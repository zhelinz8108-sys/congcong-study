"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ENGLISH_GRAMMAR_CHAPTERS,
  countGrammarExamples,
  countGrammarUnits,
} from "@/lib/english-grammar";
import { ENGLISH_PHRASE_LEVELS, countPhraseItems } from "@/lib/english-phrases";

type WorkspaceView = "phrases" | "grammar";

function getEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();

  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

export default function PhrasePage() {
  const { id } = useParams<{ id: string }>();
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(
    () => new Set(["primary"])
  );
  const [expandedGrammarChapters, setExpandedGrammarChapters] = useState<Set<string>>(
    () => new Set(["present"])
  );
  const [activeView, setActiveView] = useState<WorkspaceView>("grammar");
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState(false);

  const totalItems = ENGLISH_PHRASE_LEVELS.reduce(
    (sum, level) => sum + countPhraseItems(level),
    0
  );
  const totalGrammarUnits = countGrammarUnits();
  const totalGrammarExamples = countGrammarExamples();

  const toggleLevel = (levelKey: string) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(levelKey)) {
        next.delete(levelKey);
      } else {
        next.add(levelKey);
      }
      return next;
    });
  };

  const toggleGrammarChapter = (chapterKey: string) => {
    setExpandedGrammarChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterKey)) {
        next.delete(chapterKey);
      } else {
        next.add(chapterKey);
      }
      return next;
    });
  };

  const playEnglishAudio = (audioId: string, text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const synth = window.speechSynthesis;

    if (playingAudioId === audioId) {
      synth.cancel();
      setPlayingAudioId(null);
      return;
    }

    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getEnglishVoice();

    utterance.lang = "en-US";
    utterance.rate = 0.85;
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      setPlayingAudioId((current) => (current === audioId ? null : current));
    };
    utterance.onerror = () => {
      setPlayingAudioId((current) => (current === audioId ? null : current));
    };

    setPlayingAudioId(audioId);
    synth.speak(utterance);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const synth = window.speechSynthesis;
    const readyTimer = window.setTimeout(() => setSpeechAvailable(true), 0);
    const handleVoicesChanged = () => {
      synth.getVoices();
    };

    synth.getVoices();
    synth.addEventListener("voiceschanged", handleVoicesChanged);

    return () => {
      window.clearTimeout(readyTimer);
      synth.cancel();
      synth.removeEventListener("voiceschanged", handleVoicesChanged);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/subjects/${id}`}
            className="text-sm font-medium text-sky-700 transition hover:text-sky-800"
          >
            ← 返回英语主页
          </Link>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-sky-700 shadow-sm ring-1 ring-sky-100">
            词组与语法
          </span>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] border border-white/80 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-7">
            <p className="text-sm font-semibold text-sky-600">
              English Phrase & Grammar Workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              英语词组与语法
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base">
              这里保留常用词组朗读，也加入《剑桥初级英语语法》的 115 个 unit 和 7 个附录。
              语法条目按书本目录重组，便于按顺序复习。
            </p>

            <div className="mt-6 inline-flex rounded-2xl border border-stone-200 bg-stone-50 p-1">
              <button
                type="button"
                onClick={() => setActiveView("grammar")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  activeView === "grammar"
                    ? "bg-white text-amber-700 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                剑桥语法
              </button>
              <button
                type="button"
                onClick={() => setActiveView("phrases")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  activeView === "phrases"
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                常用词组
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href={`/subjects/${id}/grammar`}
                className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
              >
                完整语法练习 →
              </Link>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                英文可朗读
              </span>
              {!speechAvailable && (
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                  当前浏览器不支持朗读
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                语法条目
              </p>
              <p className="mt-3 text-3xl font-semibold text-sky-600">
                {totalGrammarUnits}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                词组总数
              </p>
              <p className="mt-3 text-3xl font-semibold text-emerald-600">
                {totalItems}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                语法例句
              </p>
              <p className="mt-3 text-3xl font-semibold text-violet-500">
                {totalGrammarExamples}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                朗读状态
              </p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                {speechAvailable ? "可使用" : "不可用"}
              </p>
            </div>
          </div>
        </section>

        {activeView === "grammar" ? (
          <div className="mt-8 space-y-4">
            {ENGLISH_GRAMMAR_CHAPTERS.map((chapter, chapterIndex) => {
              const isOpen = expandedGrammarChapters.has(chapter.key);

              return (
                <section
                  key={chapter.key}
                  className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)]"
                >
                  <button
                    type="button"
                    onClick={() => toggleGrammarChapter(chapter.key)}
                    className="flex w-full items-start justify-between gap-4 bg-gradient-to-r from-white via-white to-amber-50/70 px-5 py-5 text-left transition hover:from-stone-50 hover:to-amber-50 sm:px-6"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-base font-semibold text-amber-700">
                        {chapterIndex + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-semibold text-slate-900">
                            {chapter.name}
                          </h2>
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                            {chapter.units.length} 条语法
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-stone-500">
                          {chapter.subtitle}
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                      {isOpen ? "收起" : "展开"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-stone-100 bg-stone-50/60 p-4 sm:p-5">
                      <div className="grid gap-4 xl:grid-cols-2">
                        {chapter.units.map((unit) => (
                          <article
                            key={unit.id}
                            className="rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                    Unit {unit.id}
                                  </span>
                                  <h3 className="text-base font-semibold text-slate-900">
                                    {unit.title}
                                  </h3>
                                </div>
                                <p className="mt-3 text-sm leading-7 text-stone-600">
                                  {unit.summary}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 space-y-2">
                              {unit.patterns.map((pattern) => (
                                <div
                                  key={`${unit.id}-${pattern}`}
                                  className="rounded-2xl bg-amber-50/70 px-3 py-2 text-sm font-medium leading-6 text-slate-800 ring-1 ring-amber-100"
                                >
                                  {pattern}
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 space-y-3">
                              {unit.examples.map((example, exampleIndex) => {
                                const exampleId = `grammar-${unit.id}-${exampleIndex}`;
                                const isPlaying = playingAudioId === exampleId;

                                return (
                                  <div
                                    key={exampleId}
                                    className="rounded-[22px] border border-stone-200 bg-stone-50/70 p-3"
                                  >
                                    <div className="flex items-start gap-3">
                                      <button
                                        type="button"
                                        onClick={() => playEnglishAudio(exampleId, example.english)}
                                        disabled={!speechAvailable}
                                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs transition ${
                                          isPlaying
                                            ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                        } disabled:cursor-not-allowed disabled:opacity-50`}
                                        title={isPlaying ? "停止朗读" : `播放 ${example.english}`}
                                      >
                                        {isPlaying ? "■" : "▶"}
                                      </button>

                                      <div className="min-w-0 flex-1">
                                        <p className="break-words text-sm font-semibold leading-6 text-slate-900">
                                          {example.english}
                                        </p>
                                        <p className="mt-1 text-sm leading-6 text-stone-500">
                                          {example.chinese}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
        <div className="mt-8 space-y-4">
          {ENGLISH_PHRASE_LEVELS.map((level, levelIndex) => {
            const isOpen = expandedLevels.has(level.key);
            const totalLevelItems = countPhraseItems(level);

            return (
              <section
                key={level.key}
                className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)]"
              >
                <button
                  onClick={() => toggleLevel(level.key)}
                  className="flex w-full items-start justify-between gap-4 bg-gradient-to-r from-white via-white to-sky-50/70 px-5 py-5 text-left transition hover:from-stone-50 hover:to-sky-50 sm:px-6"
                >
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-lg font-semibold text-sky-700">
                      {levelIndex + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold text-slate-900">
                          {level.name}
                        </h2>
                        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                          {totalLevelItems} 条内容
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-500">
                        {level.subtitle}
                      </p>
                    </div>
                  </div>

                  <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                    {isOpen ? "收起" : "展开"}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-stone-100 bg-stone-50/60 p-4 sm:p-5">
                    {level.modules.length > 0 ? (
                      <div className="space-y-5">
                        {level.modules.map((module, moduleIndex) => {
                          const moduleItemCount = module.categories.reduce(
                            (sum, category) => sum + category.items.length,
                            0
                          );

                          return (
                            <section
                              key={`${level.key}-${moduleIndex}`}
                              className="rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
                            >
                              <div className="flex flex-wrap items-end justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                    模块
                                  </p>
                                  <h3 className="mt-1 text-xl font-semibold text-slate-900">
                                    {module.title}
                                  </h3>
                                </div>
                                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                                  {moduleItemCount} 条词组
                                </span>
                              </div>

                              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                                {module.categories.map((category, categoryIndex) => (
                                  <div
                                    key={`${level.key}-${moduleIndex}-${categoryIndex}`}
                                    className="rounded-[28px] border border-stone-200 bg-stone-50/60 p-4"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <h4 className="text-sm font-semibold text-slate-800">
                                        {category.title}
                                      </h4>
                                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-500">
                                        {category.items.length} 条
                                      </span>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                      {category.items.map((item, itemIndex) => {
                                        const phraseId = `${level.key}-${moduleIndex}-${categoryIndex}-${itemIndex}`;
                                        const isPlaying = playingAudioId === phraseId;

                                        return (
                                          <div
                                            key={phraseId}
                                            className="rounded-[24px] border border-sky-100 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_14px_34px_rgba(14,165,233,0.10)]"
                                          >
                                            <div className="flex items-start gap-3">
                                              <button
                                                type="button"
                                                onClick={() => playEnglishAudio(phraseId, item.english)}
                                                disabled={!speechAvailable}
                                                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs transition ${
                                                  isPlaying
                                                    ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                                                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                                } disabled:cursor-not-allowed disabled:opacity-50`}
                                                title={isPlaying ? "停止朗读" : `播放 ${item.english}`}
                                              >
                                                {isPlaying ? "■" : "▶"}
                                              </button>

                                              <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <p className="text-base font-semibold text-slate-900">
                                                    {item.english}
                                                  </p>
                                                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                                                    #{itemIndex + 1}
                                                  </span>
                                                </div>
                                                <p className="mt-2 text-sm leading-6 text-stone-500">
                                                  {item.chinese}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[28px] border border-dashed border-stone-300 bg-white px-4 py-10 text-center text-sm text-stone-400">
                        这一学段的词组内容位置已经预留，后续补充后这里会直接显示。
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
