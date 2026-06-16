"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import {
  ENGLISH_SENTENCE_CHAPTERS,
  countSentenceDrills,
  countSentenceExamples,
  countSentenceUnits,
} from "@/lib/english-sentences";

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

export default function SentenceTrainingPage() {
  const { id } = useParams<{ id: string }>();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    () => new Set(["primary"])
  );
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(
    () => new Set(["p1"])
  );
  const [query, setQuery] = useState("");
  const [playingExampleId, setPlayingExampleId] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const searchText = deferredQuery.trim().toLowerCase();
  const isSearching = searchText.length > 0;

  const filteredChapters = ENGLISH_SENTENCE_CHAPTERS.map((chapter) => {
    if (!isSearching) {
      return chapter;
    }

    const units = chapter.units.filter((unit) => {
      const haystack = [
        chapter.name,
        chapter.subtitle,
        chapter.vocabularyBand,
        unit.title,
        unit.summary,
        unit.goal,
        ...unit.patterns,
        ...unit.chunks,
        ...unit.examples.flatMap((example) => [
          example.english,
          example.chinese,
          example.focus,
        ]),
        ...unit.substitutionDrills.flatMap((drill) => [
          drill.prompt,
          drill.model,
          drill.tip,
        ]),
        ...unit.translationDrills.flatMap((drill) => [
          drill.prompt,
          drill.model,
          drill.tip,
        ]),
        unit.outputTask,
        ...unit.teacherTips,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchText);
    });

    return { ...chapter, units };
  }).filter((chapter) => chapter.units.length > 0);

  const toggleChapter = (chapterKey: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterKey)) {
        next.delete(chapterKey);
      } else {
        next.add(chapterKey);
      }
      return next;
    });
  };

  const toggleUnit = (unitId: string) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  const playExampleAudio = (exampleId: string, sentence: string) => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      return;
    }

    const synth = window.speechSynthesis;

    if (playingExampleId === exampleId) {
      synth.cancel();
      setPlayingExampleId(null);
      return;
    }

    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(sentence);
    const voice = getEnglishVoice();

    utterance.lang = "en-US";
    utterance.rate = 0.85;
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      setPlayingExampleId((current) => (current === exampleId ? null : current));
    };
    utterance.onerror = () => {
      setPlayingExampleId((current) => (current === exampleId ? null : current));
    };

    setPlayingExampleId(exampleId);
    window.setTimeout(() => {
      synth.speak(utterance);
    }, 0);
  };

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      const timer = globalThis.setTimeout(() => setSpeechAvailable(false), 0);
      return () => globalThis.clearTimeout(timer);
    }

    const synth = window.speechSynthesis;
    const handleVoicesChanged = () => {
      synth.getVoices();
    };

    const availabilityTimer = globalThis.setTimeout(() => setSpeechAvailable(true), 0);
    synth.getVoices();
    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", handleVoicesChanged);
    } else {
      synth.onvoiceschanged = handleVoicesChanged;
    }

    return () => {
      globalThis.clearTimeout(availabilityTimer);
      synth.cancel();
      if (typeof synth.removeEventListener === "function") {
        synth.removeEventListener("voiceschanged", handleVoicesChanged);
      } else if (synth.onvoiceschanged === handleVoicesChanged) {
        synth.onvoiceschanged = null;
      }
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
            返回英语主页
          </Link>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-sky-700 shadow-sm ring-1 ring-sky-100">
            句子训练
          </span>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] border border-white/80 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-7">
            <p className="text-sm font-semibold text-sky-600">
              English Sentence Workshop
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              句子训练
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600 sm:text-base">
              这套内容不是把单词堆在一起，而是按词汇量阶段，把句型骨架、常用搭配、示范句、
              替换训练、中译英和输出任务连成一整套。先把句子说完整，再把信息说清楚，
              最后过渡到更像写作和口语表达的输出。
            </p>

            <div className="mt-6 rounded-[24px] border border-sky-100 bg-sky-50/70 p-4 text-sm leading-7 text-stone-700">
              建议顺序：先看句型骨架，再跟读示范句，再做替换训练和中译英，最后完成输出任务。
              这样单词、词组和语法才会真正进入表达层。
            </div>

            <div className="mt-6">
              <label
                htmlFor="sentence-search"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-400"
              >
                搜索主题 / 句型 / 训练点
              </label>
              <input
                id="sentence-search"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例如：because / 周末 / 建议 / 环保 / 小组合作"
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                词汇阶段
              </p>
              <p className="mt-3 text-3xl font-semibold text-sky-600">3</p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                1200 / 2000 / 7000
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                训练单元
              </p>
              <p className="mt-3 text-3xl font-semibold text-sky-600">
                {countSentenceUnits()}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                按主题和表达任务拆分
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                示范句
              </p>
              <p className="mt-3 text-3xl font-semibold text-sky-600">
                {countSentenceExamples()}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                每句都可单独朗读
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                训练题
              </p>
              <p className="mt-3 text-3xl font-semibold text-sky-600">
                {countSentenceDrills()}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                替换训练 + 中译英
              </p>
            </div>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
            三个阶段按词汇量递进
          </span>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
            每个单元都包含输出任务
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              speechAvailable
                ? "bg-emerald-50 text-emerald-700"
                : "bg-stone-100 text-stone-500"
            }`}
          >
            {speechAvailable ? "支持例句朗读" : "当前浏览器未启用朗读"}
          </span>
        </div>

        <div className="mt-6 space-y-4">
          {filteredChapters.length > 0 ? (
            filteredChapters.map((chapter) => {
              const isChapterOpen = isSearching || expandedChapters.has(chapter.key);

              return (
                <section
                  key={chapter.key}
                  className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
                >
                  <button
                    type="button"
                    onClick={() => toggleChapter(chapter.key)}
                    className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left transition hover:bg-stone-50"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold text-slate-900">
                          {chapter.name}
                        </h2>
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                          {chapter.vocabularyBand}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-500">
                        {chapter.subtitle}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                      {isChapterOpen ? "收起" : "展开"}
                    </span>
                  </button>

                  {isChapterOpen && (
                    <div className="border-t border-stone-100 bg-stone-50/60 p-4 sm:p-5">
                      <div className="space-y-3">
                        {chapter.units.map((unit) => {
                          const isUnitOpen = isSearching || expandedUnits.has(unit.id);

                          return (
                            <article
                              key={unit.id}
                              className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm"
                            >
                              <button
                                type="button"
                                onClick={() => toggleUnit(unit.id)}
                                className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-stone-50 sm:px-5"
                              >
                                <div className="flex min-w-0 items-start gap-3">
                                  <span className="mt-0.5 rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                                    {unit.id.toUpperCase()}
                                  </span>
                                  <div className="min-w-0">
                                    <h3 className="text-base font-semibold text-slate-900 sm:text-lg">
                                      {unit.title}
                                    </h3>
                                    <p className="mt-1 text-sm leading-6 text-stone-500">
                                      {unit.summary}
                                    </p>
                                  </div>
                                </div>

                                <span className="shrink-0 text-sm font-medium text-stone-400">
                                  {isUnitOpen ? "收起" : "展开"}
                                </span>
                              </button>

                              {isUnitOpen && (
                                <div className="border-t border-stone-100 bg-white px-4 py-4 sm:px-5">
                                  <div className="space-y-4">
                                    <div className="rounded-[24px] border border-sky-100 bg-sky-50/60 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-500">
                                        训练目标
                                      </p>
                                      <p className="mt-3 text-sm leading-7 text-slate-800">
                                        {unit.goal}
                                      </p>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        句型骨架
                                      </p>
                                      <div className="mt-3 space-y-2">
                                        {unit.patterns.map((pattern) => (
                                          <div
                                            key={`${unit.id}-${pattern}`}
                                            className="rounded-2xl bg-white px-4 py-3 text-sm font-medium leading-7 text-slate-900 shadow-sm ring-1 ring-stone-200/80"
                                          >
                                            {pattern}
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        高频搭配
                                      </p>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {unit.chunks.map((chunk) => (
                                          <span
                                            key={`${unit.id}-${chunk}`}
                                            className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-stone-600 shadow-sm ring-1 ring-stone-200/80"
                                          >
                                            {chunk}
                                          </span>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        示范句
                                      </p>
                                      <div className="mt-3 space-y-3">
                                        {unit.examples.map((example, index) => {
                                          const exampleId = `${unit.id}-${index}`;
                                          const isPlaying = playingExampleId === exampleId;

                                          return (
                                            <div
                                              key={exampleId}
                                              className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm"
                                            >
                                              <div className="space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                  <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                                                    {example.focus}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      playExampleAudio(
                                                        exampleId,
                                                        example.english
                                                      );
                                                    }}
                                                    disabled={!speechAvailable}
                                                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs transition ${
                                                      isPlaying
                                                        ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                                                        : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                                    } disabled:cursor-not-allowed disabled:opacity-50`}
                                                    title={
                                                      isPlaying
                                                        ? "停止朗读"
                                                        : `播放 ${example.english}`
                                                    }
                                                    aria-label={
                                                      isPlaying
                                                        ? "停止朗读例句"
                                                        : `播放例句 ${index + 1}`
                                                    }
                                                  >
                                                    {isPlaying ? "■" : "▶"}
                                                  </button>
                                                </div>
                                                <p className="overflow-x-auto whitespace-nowrap text-sm font-medium leading-7 text-slate-900">
                                                  {example.english}
                                                </p>
                                                <p className="overflow-x-auto whitespace-nowrap text-sm leading-7 text-stone-500">
                                                  {example.chinese}
                                                </p>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        替换训练
                                      </p>
                                      <div className="mt-3 space-y-3">
                                        {unit.substitutionDrills.map((drill, index) => (
                                          <div
                                            key={`${unit.id}-sub-${index}`}
                                            className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm"
                                          >
                                            <div className="space-y-3">
                                              <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                                                口头替换 {index + 1}
                                              </span>
                                              <p className="text-sm font-medium leading-7 text-slate-900">
                                                {drill.prompt}
                                              </p>
                                              <p className="overflow-x-auto whitespace-nowrap text-sm leading-7 text-stone-500">
                                                {drill.model}
                                              </p>
                                              <p className="text-xs leading-6 text-stone-400">
                                                {drill.tip}
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        中译英
                                      </p>
                                      <div className="mt-3 space-y-3">
                                        {unit.translationDrills.map((drill, index) => (
                                          <div
                                            key={`${unit.id}-tr-${index}`}
                                            className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm"
                                          >
                                            <div className="space-y-3">
                                              <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                                                翻译训练 {index + 1}
                                              </span>
                                              <p className="text-sm font-medium leading-7 text-slate-900">
                                                {drill.prompt}
                                              </p>
                                              <p className="overflow-x-auto whitespace-nowrap text-sm leading-7 text-stone-500">
                                                {drill.model}
                                              </p>
                                              <p className="text-xs leading-6 text-stone-400">
                                                {drill.tip}
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                                      <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                          输出任务
                                        </p>
                                        <p className="mt-3 text-sm leading-7 text-slate-800">
                                          {unit.outputTask}
                                        </p>
                                      </div>

                                      <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                          老师提醒
                                        </p>
                                        <div className="mt-3 space-y-2">
                                          {unit.teacherTips.map((tip) => (
                                            <div
                                              key={`${unit.id}-${tip}`}
                                              className="rounded-2xl bg-white px-4 py-3 text-sm leading-7 text-stone-600 shadow-sm ring-1 ring-stone-200/80"
                                            >
                                              {tip}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              );
            })
          ) : (
            <div className="rounded-[32px] border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-sm">
              <p className="text-lg font-medium text-stone-500">
                没有找到匹配的句子训练内容
              </p>
              <p className="mt-2 text-sm text-stone-400">
                试试搜索：because、周末、计划、建议、小组合作、环保
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
