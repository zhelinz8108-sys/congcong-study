"use client";

import { useEffect, useState } from "react";
import type { Material, Unit, Word } from "@/lib/types";

type ListeningSentenceText = {
  english: string;
  chinese: string;
};

type ListeningUnit = Unit & {
  words?: Word[];
  materials?: Material[];
  word_count?: number;
  sentenceText?: ListeningSentenceText | null;
};

type EnglishListeningPanelProps = {
  subjectId: string;
  playWordAudio: (src: string, start: number, end: number) => void;
};

type ListeningBandConfig = {
  key: string;
  match: string;
  title: string;
  subtitle: string;
  badge: string;
  focus: string;
  border: string;
  bg: string;
  text: string;
  keywordLimit: number;
  checkpoints: string[];
  retellPrompt: string;
};

const LISTENING_METHODS = [
  {
    title: "1. 先听词和词组",
    desc: "先抓能听出来的关键词，不急着逐词翻译，先建立声音和意思的连接。",
  },
  {
    title: "2. 再做句子精听",
    desc: "同一句至少听 3 遍：先抓大意，再抓关键词，最后看原句核对。",
  },
  {
    title: "3. 练信息抓取",
    desc: "听完后回答谁、做什么、在哪里、为什么，逐步建立听力题思维。",
  },
  {
    title: "4. 最后跟读复述",
    desc: "模仿语音语调，再用自己的话说一遍，听力才能真正转成输出能力。",
  },
];

const LISTENING_BANDS: ListeningBandConfig[] = [
  {
    key: "primary",
    match: "1200",
    title: "小学 1200 词听力",
    subtitle: "先抓词块，再听完整句子。",
    badge: "基础输入",
    focus: "适合先做词块辨音、句子大意和简单复述。",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    keywordLimit: 4,
    checkpoints: [
      "先听一遍，只判断这句话在说谁、在做什么。",
      "第二遍抓 2 到 3 个你能听出来的关键词。",
      "第三遍再核对原句，看看漏掉的是动作还是地点。",
    ],
    retellPrompt: "先用中文说一句大意，再用英语复述主语 + 动作。",
  },
  {
    key: "junior",
    match: "2000",
    title: "初中 2000 词听力",
    subtitle: "开始练原因、结果和场景理解。",
    badge: "信息抓取",
    focus: "适合训练细节定位、逻辑关系和句子里的重点信息。",
    border: "border-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-800",
    keywordLimit: 5,
    checkpoints: [
      "第一遍先听主题，不急着记每个词。",
      "第二遍找出时间、地点、动作或原因词。",
      "第三遍判断句子里有没有 because、but、when、if 这类逻辑信号。",
    ],
    retellPrompt: "用中文说出事件，再尝试用英语复述“原因 / 结果 / 场景”中的一个重点。",
  },
  {
    key: "senior",
    match: "7000",
    title: "高中 7000 词听力",
    subtitle: "训练长句拆解、逻辑判断和简短复述。",
    badge: "长句理解",
    focus: "适合练主干识别、修饰信息筛选和听后概括。",
    border: "border-sky-200",
    bg: "bg-sky-50",
    text: "text-sky-800",
    keywordLimit: 6,
    checkpoints: [
      "先听主干：主语、核心动作、结果是什么。",
      "再听补充信息：时间、条件、让步、举例等附加部分。",
      "最后用一句话概括整句想表达的中心意思。",
    ],
    retellPrompt: "先说这句话的主干，再补一个附加信息，尽量别逐词翻译。",
  },
];

function getBandConfig(groupName?: string): ListeningBandConfig {
  const matched =
    LISTENING_BANDS.find((band) => (groupName ?? "").includes(band.match)) ??
    LISTENING_BANDS[0];

  return matched;
}

function getAudioMaterial(unit: ListeningUnit): Material | null {
  return unit.materials?.find((material) => material.file_type === "audio") ?? null;
}

function getKeywordWords(unit: ListeningUnit, limit: number): Word[] {
  return [...(unit.words ?? [])]
    .filter((word) => word.audio_start != null && word.audio_end != null)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    })
    .slice(0, limit);
}

function getSentenceClipEnd(unit: ListeningUnit): number {
  const firstWordWithAudio = [...(unit.words ?? [])]
    .filter((word) => word.audio_start != null)
    .sort((a, b) => {
      const aStart = a.audio_start ?? Number.MAX_SAFE_INTEGER;
      const bStart = b.audio_start ?? Number.MAX_SAFE_INTEGER;
      return aStart - bStart;
    })[0];

  if (firstWordWithAudio?.audio_start == null) {
    return 8;
  }

  return Math.max(3.8, Math.min(firstWordWithAudio.audio_start - 0.4, 12));
}

export default function EnglishListeningPanel({
  subjectId,
  playWordAudio,
}: EnglishListeningPanelProps) {
  const [units, setUnits] = useState<ListeningUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [expandedBands, setExpandedBands] = useState<Set<string>>(
    () => new Set(["primary"])
  );
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(
    () => new Set()
  );
  const [revealedTexts, setRevealedTexts] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    let cancelled = false;

    const loadListeningUnits = async () => {
      setLoading(true);
      setLoadError("");

      try {
        const res = await fetch(`/api/subjects/${subjectId}`);
        if (!res.ok) {
          throw new Error(`Failed to load listening materials (${res.status})`);
        }

        const data = await res.json();
        if (cancelled) {
          return;
        }

        const nextUnits = ((data.units ?? []) as ListeningUnit[]).filter(
          (unit) => getAudioMaterial(unit) && unit.sentenceText?.english
        );

        setUnits(nextUnits);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load listening materials"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadListeningUnits();

    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const searchText = query.trim().toLowerCase();
  const filteredUnits = !searchText
    ? units
    : units.filter((unit) => {
        const haystack = [
          unit.name,
          unit.group_name,
          unit.sentenceText?.english ?? "",
          unit.sentenceText?.chinese ?? "",
          ...(unit.words ?? []).flatMap((word) => [word.word, word.meaning]),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(searchText);
      });

  const groupedBands = LISTENING_BANDS.map((band) => ({
    ...band,
    units: filteredUnits.filter((unit) => (unit.group_name ?? "").includes(band.match)),
  })).filter((band) => band.units.length > 0);

  const totalAudioUnits = units.length;
  const totalKeywordItems = units.reduce(
    (sum, unit) => sum + getKeywordWords(unit, getBandConfig(unit.group_name).keywordLimit).length,
    0
  );

  const toggleBand = (bandKey: string) => {
    setExpandedBands((prev) => {
      const next = new Set(prev);
      if (next.has(bandKey)) {
        next.delete(bandKey);
      } else {
        next.add(bandKey);
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

  const toggleReveal = (unitId: string) => {
    setRevealedTexts((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-white px-6 py-10 text-center text-stone-500">
        正在加载听力训练内容...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white px-6 py-10 text-center">
        <p className="text-sm text-red-500">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-amber-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-amber-600">Listening Roadmap</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            听力训练
          </h3>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            这里不再只是放音频，而是按真正的听力训练顺序来做：先听出关键词，
            再做句子精听，再抓信息，最后跟读复述。现有素材以句子音频为主，
            所以这一版重点先把“词块辨音 + 句子理解 + 复述输出”练扎实。
          </p>

          <div className="mt-6 rounded-[22px] border border-amber-100 bg-amber-50/70 p-4 text-sm leading-7 text-stone-700">
            推荐每次练习只做 3 到 5 条。每条至少听 3 遍：
            第 1 遍抓大意，第 2 遍抓关键词，第 3 遍核对原文并跟读。
          </div>

          <div className="mt-6">
            <label
              htmlFor="listening-search"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-400"
            >
              搜索句子 / 主题 / 关键词
            </label>
            <input
              id="listening-search"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如：because / school / family / travel"
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
          <div className="rounded-[24px] border border-white/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
              训练阶段
            </p>
            <p className="mt-3 text-3xl font-semibold text-amber-600">4</p>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              听词块 / 精听 / 抓信息 / 复述
            </p>
          </div>
          <div className="rounded-[24px] border border-white/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
              可练音频
            </p>
            <p className="mt-3 text-3xl font-semibold text-amber-600">
              {totalAudioUnits}
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              来自现有句子音频素材
            </p>
          </div>
          <div className="rounded-[24px] border border-white/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
              关键词按钮
            </p>
            <p className="mt-3 text-3xl font-semibold text-amber-600">
              {totalKeywordItems}
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              可直接点按做辨音
            </p>
          </div>
          <div className="rounded-[24px] border border-white/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
              词汇阶段
            </p>
            <p className="mt-3 text-3xl font-semibold text-amber-600">3</p>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              1200 / 2000 / 7000
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {LISTENING_METHODS.map((step) => (
          <div
            key={step.title}
            className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="text-sm font-semibold text-slate-900">{step.title}</div>
            <p className="mt-3 text-sm leading-7 text-stone-500">{step.desc}</p>
          </div>
        ))}
      </section>

      <div className="space-y-4">
        {groupedBands.map((band) => {
          const isBandOpen = expandedBands.has(band.key);

          return (
            <section
              key={band.key}
              className={`overflow-hidden rounded-[28px] border ${band.border} bg-white shadow-sm`}
            >
              <button
                type="button"
                onClick={() => toggleBand(band.key)}
                className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left transition hover:bg-stone-50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`text-xl font-semibold ${band.text}`}>{band.title}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${band.bg} ${band.text}`}>
                      {band.badge}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">
                      {band.units.length} 条
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-stone-500">
                    {band.subtitle} {band.focus}
                  </p>
                </div>

                <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                  {isBandOpen ? "收起" : "展开"}
                </span>
              </button>

              {isBandOpen && (
                <div className="border-t border-stone-100 bg-stone-50/60 p-4 sm:p-5">
                  <div className="space-y-3">
                    {band.units.map((unit) => {
                      const isUnitOpen = expandedUnits.has(unit.id);
                      const audioMaterial = getAudioMaterial(unit);
                      const keywords = getKeywordWords(unit, band.keywordLimit);
                      const sentenceEnd = getSentenceClipEnd(unit);
                      const textRevealed = revealedTexts.has(unit.id);

                      return (
                        <article
                          key={unit.id}
                          className="overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => toggleUnit(unit.id)}
                            className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-stone-50"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${band.bg} ${band.text}`}>
                                  {unit.name}
                                </span>
                                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500">
                                  {unit.word_count ?? keywords.length} 个词
                                </span>
                              </div>
                              <p className="mt-2 truncate text-sm font-medium text-slate-900">
                                {unit.sentenceText?.english ?? audioMaterial?.name ?? "Listening item"}
                              </p>
                              <p className="mt-1 text-xs leading-6 text-stone-400">
                                先点“播放原句”做盲听，再点关键词做辨音，最后揭晓原文复述。
                              </p>
                            </div>

                            <span className="shrink-0 text-sm font-medium text-stone-400">
                              {isUnitOpen ? "收起" : "展开"}
                            </span>
                          </button>

                          {isUnitOpen && audioMaterial && (
                            <div className="border-t border-stone-100 px-4 py-4">
                              <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => playWordAudio(audioMaterial.file_path!, 0, sentenceEnd)}
                                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                                  >
                                    播放原句
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleReveal(unit.id)}
                                    className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50"
                                  >
                                    {textRevealed ? "收起原文" : "揭晓原文"}
                                  </button>
                                  <span className="text-xs text-stone-400">
                                    建议至少听 3 遍再看原文
                                  </span>
                                </div>

                                <div className={`rounded-[20px] border ${band.border} ${band.bg} p-4`}>
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                                    这一条怎么练
                                  </p>
                                  <div className="mt-3 space-y-2">
                                    {band.checkpoints.map((checkpoint) => (
                                      <div
                                        key={`${unit.id}-${checkpoint}`}
                                        className="rounded-2xl bg-white px-4 py-3 text-sm leading-7 text-stone-700 shadow-sm ring-1 ring-stone-200/80"
                                      >
                                        {checkpoint}
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="rounded-[20px] border border-stone-200 bg-stone-50/70 p-4">
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                    听词块
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {keywords.length > 0 ? (
                                      keywords.map((word) => (
                                        <button
                                          key={word.id}
                                          type="button"
                                          onClick={() =>
                                            playWordAudio(
                                              audioMaterial.file_path!,
                                              word.audio_start!,
                                              word.audio_end!
                                            )
                                          }
                                          className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                                        >
                                          {word.word}
                                        </button>
                                      ))
                                    ) : (
                                      <span className="text-sm text-stone-400">
                                        这一条还没有单独切词时间点
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {textRevealed && (
                                  <div className="rounded-[20px] border border-stone-200 bg-white p-4 shadow-sm">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                      原文核对
                                    </p>
                                    <p className="mt-3 overflow-x-auto whitespace-nowrap text-sm font-medium leading-7 text-slate-900">
                                      {unit.sentenceText?.english}
                                    </p>
                                    <p className="mt-2 overflow-x-auto whitespace-nowrap text-sm leading-7 text-stone-500">
                                      {unit.sentenceText?.chinese}
                                    </p>
                                  </div>
                                )}

                                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                                  <div className="rounded-[20px] border border-stone-200 bg-white p-4 shadow-sm">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                      听后抓信息
                                    </p>
                                    <div className="mt-3 space-y-2">
                                      <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-7 text-stone-700">
                                        谁或什么是这句话的主角？
                                      </div>
                                      <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-7 text-stone-700">
                                        主要动作或事件是什么？
                                      </div>
                                      <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-7 text-stone-700">
                                        有没有时间、地点、原因或结果信息？
                                      </div>
                                    </div>
                                  </div>

                                  <div className="rounded-[20px] border border-stone-200 bg-white p-4 shadow-sm">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                      跟读复述
                                    </p>
                                    <div className="mt-3 space-y-2">
                                      <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-7 text-stone-700">
                                        先跟读 2 到 3 遍，尽量模仿停顿和重音。
                                      </div>
                                      <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-7 text-stone-700">
                                        {band.retellPrompt}
                                      </div>
                                      <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-7 text-stone-700">
                                        如果能复述，再试着把人物、时间或地点替换掉重新说一遍。
                                      </div>
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
        })}
      </div>
    </div>
  );
}
