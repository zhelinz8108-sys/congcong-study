"use client";

import { useEffect, useMemo, useState } from "react";
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

type ListeningQuestionType = "main" | "detail" | "inference";
type ListeningFilter = "all" | ListeningQuestionType;

type ListeningBand = {
  key: "primary" | "junior";
  match: string;
  title: string;
  subtitle: string;
  badge: string;
  wordLimit: string;
  tone: string;
};

type ListeningQuestion = {
  id: string;
  type: ListeningQuestionType;
  unit: ListeningUnit;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
  english: string;
  chinese: string;
  audioSrc: string;
  audioStart: number;
  audioEnd: number;
};

const QUESTION_COUNT_PER_BAND = 500;

const LISTENING_BANDS: ListeningBand[] = [
  {
    key: "primary",
    match: "1200",
    title: "小学听力",
    subtitle: "一句话到短句听辨，先练主旨，再练细节和简单推断。",
    badge: "1200词以内",
    wordLimit: "小学词汇",
    tone: "emerald",
  },
  {
    key: "junior",
    match: "2000",
    title: "初中听力",
    subtitle: "短句和小段理解，加入时间、原因、转折和说话意图。",
    badge: "2000词以内",
    wordLimit: "初中词汇",
    tone: "amber",
  },
];

const QUESTION_META: Record<
  ListeningQuestionType,
  { label: string; hint: string; badgeClass: string }
> = {
  main: {
    label: "主旨题",
    hint: "先抓整段大意，不要逐词翻译。",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  detail: {
    label: "细节题",
    hint: "听清谁、做什么、在哪里、什么时候。",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  inference: {
    label: "推断题",
    hint: "根据语气、因果、转折和上下文判断意图。",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

const INFERENCE_OPTIONS = [
  "说话人在说明原因或解释情况",
  "说话人在表达一个计划",
  "说话人在询问信息",
  "说话人在给出建议或提醒",
  "说话人在描述日常事实",
  "说话人在表达转折后的重点",
  "说话人在说明事情发生的顺序",
  "说话人在表达条件关系",
  "说话人在描述地点或位置",
  "说话人在表达自己的感受",
];

function getBandConfig(groupName?: string | null) {
  const normalized = groupName ?? "";
  return LISTENING_BANDS.find((band) => normalized.includes(band.match)) ?? null;
}

function getAudioMaterial(unit: ListeningUnit) {
  return (
    unit.materials?.find(
      (material) => material.file_type === "audio" && Boolean(material.file_path),
    ) ?? null
  );
}

function getSentenceEnglish(unit: ListeningUnit) {
  return unit.sentenceText?.english?.trim() || unit.name || "";
}

function getSentenceChinese(unit: ListeningUnit) {
  return unit.sentenceText?.chinese?.trim() || "这段音频的主要意思";
}

function getSentenceClipEnd(unit: ListeningUnit) {
  const firstWordWithAudio = unit.words
    ?.filter((word) => word.audio_start !== null && word.audio_start !== undefined)
    .sort((a, b) => Number(a.audio_start) - Number(b.audio_start))[0];

  if (firstWordWithAudio?.audio_start !== null && firstWordWithAudio?.audio_start !== undefined) {
    return Math.max(3.8, Math.min(Number(firstWordWithAudio.audio_start) - 0.4, 40));
  }

  return 12;
}

function seededValue(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleBySeed<T>(items: T[], seed: string) {
  return [...items].sort((a, b) => {
    const valueA = seededValue(`${seed}:${JSON.stringify(a)}`);
    const valueB = seededValue(`${seed}:${JSON.stringify(b)}`);
    return valueA - valueB;
  });
}

function uniqueOptions(options: string[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const cleaned = option.trim();
    if (!cleaned || seen.has(cleaned)) return false;
    seen.add(cleaned);
    return true;
  });
}

function cleanMeaning(meaning?: string | null) {
  return (
    meaning
      ?.replace(/\s+/g, " ")
      .replace(/^\/[^/]+\/\s*/, "")
      .trim() || "相关词义"
  );
}

function getMeaningOption(word: Word) {
  return `${word.word}：${cleanMeaning(word.meaning)}`;
}

function getUsableWords(unit: ListeningUnit) {
  return (
    unit.words
      ?.filter((word) => Boolean(word.word?.trim()) && Boolean(word.meaning?.trim()))
      .sort((a, b) => a.sort_order - b.sort_order) ?? []
  );
}

function getOtherChineseOptions(unit: ListeningUnit, units: ListeningUnit[], seed: string) {
  return shuffleBySeed(
    units
      .filter((candidate) => candidate.id !== unit.id)
      .map(getSentenceChinese)
      .filter(Boolean),
    seed,
  );
}

function getOtherWordOptions(unit: ListeningUnit, units: ListeningUnit[], seed: string) {
  return shuffleBySeed(
    units
      .filter((candidate) => candidate.id !== unit.id)
      .flatMap(getUsableWords)
      .map(getMeaningOption),
    seed,
  );
}

function getQuestionType(index: number): ListeningQuestionType {
  if (index < 165) return "main";
  if (index < 335) return "detail";
  return "inference";
}

function inferListeningPurpose(english: string, chinese: string) {
  const lowerEnglish = english.toLowerCase();
  const text = `${lowerEnglish} ${chinese}`;

  if (/[?？]/.test(text) || /\b(what|where|when|who|why|how|can you|would you)\b/.test(lowerEnglish)) {
    return "说话人在询问信息";
  }
  if (/\b(because|so)\b/.test(lowerEnglish) || /因为|所以|原因/.test(chinese)) {
    return "说话人在说明原因或解释情况";
  }
  if (/\bbut\b/.test(lowerEnglish) || /但是|可是|然而/.test(chinese)) {
    return "说话人在表达转折后的重点";
  }
  if (/\b(should|must|need|please|be careful)\b/.test(lowerEnglish) || /应该|必须|请|小心/.test(chinese)) {
    return "说话人在给出建议或提醒";
  }
  if (/\b(will|going to|tomorrow|next)\b/.test(lowerEnglish) || /将|明天|下周|计划/.test(chinese)) {
    return "说话人在表达一个计划";
  }
  if (/\b(if|when|after|before|then)\b/.test(lowerEnglish) || /如果|当|之后|以前|然后/.test(chinese)) {
    return "说话人在说明事情发生的顺序";
  }
  if (/\b(in|on|at|near|under|behind|between)\b/.test(lowerEnglish) || /在|旁边|下面|后面|之间/.test(chinese)) {
    return "说话人在描述地点或位置";
  }
  if (/\b(happy|sad|tired|hungry|excited|afraid)\b/.test(lowerEnglish) || /高兴|难过|累|饿|兴奋|害怕/.test(chinese)) {
    return "说话人在表达自己的感受";
  }

  return "说话人在描述日常事实";
}

function buildMainQuestion(
  unit: ListeningUnit,
  units: ListeningUnit[],
  index: number,
  band: ListeningBand,
): Omit<ListeningQuestion, "id" | "type" | "unit" | "audioSrc" | "audioStart" | "audioEnd"> {
  const english = getSentenceEnglish(unit);
  const chinese = getSentenceChinese(unit);
  const distractors = getOtherChineseOptions(unit, units, `main:${band.key}:${index}`).slice(0, 6);
  const fallback = ["介绍一个日常活动", "询问一个简单问题", "说明一个地点", "表达一个计划"];
  const options = shuffleBySeed(
    uniqueOptions([chinese, ...distractors, ...fallback]).slice(0, 4),
    `main-options:${unit.id}:${index}`,
  );

  return {
    prompt: "听音频，选择最符合这段内容主旨的一项。",
    options,
    answer: chinese,
    explanation: `主旨题先听完整意思，再选最贴近整句的中文。原句是：${english}`,
    english,
    chinese,
  };
}

function buildDetailQuestion(
  unit: ListeningUnit,
  units: ListeningUnit[],
  index: number,
  band: ListeningBand,
): Omit<ListeningQuestion, "id" | "type" | "unit" | "audioSrc" | "audioStart" | "audioEnd"> {
  const words = getUsableWords(unit);

  if (words.length === 0) {
    return buildMainQuestion(unit, units, index, band);
  }

  const target = words[index % words.length];
  const answer = getMeaningOption(target);
  const distractors = getOtherWordOptions(unit, units, `detail:${band.key}:${index}`).slice(0, 8);
  const options = shuffleBySeed(
    uniqueOptions([answer, ...distractors]).slice(0, 4),
    `detail-options:${unit.id}:${index}`,
  );
  const english = getSentenceEnglish(unit);
  const chinese = getSentenceChinese(unit);

  return {
    prompt: "听音频，选择这段中出现过的关键词或关键信息。",
    options,
    answer,
    explanation: `细节题要定位音频里的关键词。“${target.word}”出现在这段内容中，结合原句可判断答案。原句是：${english}`,
    english,
    chinese,
  };
}

function buildInferenceQuestion(
  unit: ListeningUnit,
  units: ListeningUnit[],
  index: number,
  band: ListeningBand,
): Omit<ListeningQuestion, "id" | "type" | "unit" | "audioSrc" | "audioStart" | "audioEnd"> {
  const english = getSentenceEnglish(unit);
  const chinese = getSentenceChinese(unit);
  const answer = inferListeningPurpose(english, chinese);
  const distractors = shuffleBySeed(
    INFERENCE_OPTIONS.filter((option) => option !== answer),
    `inference:${band.key}:${index}`,
  ).slice(0, 3);
  const options = shuffleBySeed([answer, ...distractors], `inference-options:${unit.id}:${index}`);

  return {
    prompt: "听音频，判断说话人更可能想表达什么。",
    options,
    answer,
    explanation: `推断题不能只看单词，要结合整句关系。这里更合理的判断是：${answer}。原句是：${english}`,
    english,
    chinese,
  };
}

function buildListeningQuestionsForBand(band: ListeningBand, allUnits: ListeningUnit[]) {
  const units = allUnits
    .filter((unit) => getBandConfig(unit.group_name)?.key === band.key)
    .filter((unit) => getAudioMaterial(unit)?.file_path && getSentenceEnglish(unit))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (units.length === 0) return [];

  return Array.from({ length: QUESTION_COUNT_PER_BAND }, (_, index) => {
    const unit = units[index % units.length];
    const type = getQuestionType(index);
    const audioMaterial = getAudioMaterial(unit);
    const base =
      type === "main"
        ? buildMainQuestion(unit, units, index, band)
        : type === "detail"
          ? buildDetailQuestion(unit, units, index, band)
          : buildInferenceQuestion(unit, units, index, band);

    return {
      ...base,
      id: `${band.key}-${type}-${unit.id}-${index}`,
      type,
      unit,
      audioSrc: audioMaterial?.file_path ?? "",
      audioStart: 0,
      audioEnd: getSentenceClipEnd(unit),
    };
  });
}

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
  const [units, setUnits] = useState<ListeningUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBandKey, setActiveBandKey] = useState<ListeningBand["key"] | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
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
  const isCorrect = selectedOption === currentQuestion?.answer;

  useEffect(() => {
    setQuestionIndex(0);
    setSelectedOption(null);
  }, [activeBandKey, filter]);

  function startBand(bandKey: ListeningBand["key"]) {
    setActiveBandKey(bandKey);
    setFilter("all");
    setQuestionIndex(0);
    setSelectedOption(null);
  }

  function goNext() {
    setQuestionIndex((current) => Math.min(current + 1, filteredQuestions.length - 1));
    setSelectedOption(null);
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
              onClick={() => setFilter(value as ListeningFilter)}
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
            {currentQuestion.options.map((option, optionIndex) => {
              const isSelected = selectedOption === option;
              const isAnswer = option === currentQuestion.answer;
              const showAnswer = selectedOption !== null;

              return (
                <button
                  key={option}
                  type="button"
                  disabled={showAnswer}
                  onClick={() => setSelectedOption(option)}
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
              <p className="mt-3 text-base leading-8 text-stone-700">{currentQuestion.explanation}</p>
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
          按词汇量分成小学和初中两个训练板块，每个板块 500 题。题型从主旨题开始，再进入细节题和推断题，适合循序渐进练听力。
        </p>
      </section>

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
