"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ENGLISH_PHRASE_LEVELS, countPhraseItems } from "@/lib/english-phrases";

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
  const [playingPhraseId, setPlayingPhraseId] = useState<string | null>(null);
  const speechAvailable =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const totalItems = ENGLISH_PHRASE_LEVELS.reduce(
    (sum, level) => sum + countPhraseItems(level),
    0
  );
  const totalModules = ENGLISH_PHRASE_LEVELS.reduce(
    (sum, level) => sum + level.modules.length,
    0
  );

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

  const playPhraseAudio = (phraseId: string, phraseText: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const synth = window.speechSynthesis;

    if (playingPhraseId === phraseId) {
      synth.cancel();
      setPlayingPhraseId(null);
      return;
    }

    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(phraseText);
    const voice = getEnglishVoice();

    utterance.lang = "en-US";
    utterance.rate = 0.85;
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      setPlayingPhraseId((current) => (current === phraseId ? null : current));
    };
    utterance.onerror = () => {
      setPlayingPhraseId((current) => (current === phraseId ? null : current));
    };

    setPlayingPhraseId(phraseId);
    synth.speak(utterance);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const synth = window.speechSynthesis;
    const handleVoicesChanged = () => {
      synth.getVoices();
    };

    synth.getVoices();
    synth.addEventListener("voiceschanged", handleVoicesChanged);

    return () => {
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
            词组学习
          </span>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] border border-white/80 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-7">
            <p className="text-sm font-semibold text-sky-600">
              English Phrase Workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              英语词组学习
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base">
              词组内容按学段、模块和分类展开。每条词组都能直接朗读，浏览顺序更清楚，
              也更适合跟读和集中记忆。
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
                按学段展开
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                单条可朗读
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
                词组总数
              </p>
              <p className="mt-3 text-3xl font-semibold text-sky-600">
                {totalItems}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                学段数量
              </p>
              <p className="mt-3 text-3xl font-semibold text-emerald-600">
                {ENGLISH_PHRASE_LEVELS.length}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                模块数量
              </p>
              <p className="mt-3 text-3xl font-semibold text-violet-500">
                {totalModules}
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
                                        const isPlaying = playingPhraseId === phraseId;

                                        return (
                                          <div
                                            key={phraseId}
                                            className="rounded-[24px] border border-sky-100 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_14px_34px_rgba(14,165,233,0.10)]"
                                          >
                                            <div className="flex items-start gap-3">
                                              <button
                                                type="button"
                                                onClick={() => playPhraseAudio(phraseId, item.english)}
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
      </div>
    </div>
  );
}
