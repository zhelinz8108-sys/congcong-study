import type { Material, Unit, Word } from "@/lib/types";

type ListeningSentenceText = {
  english: string;
  chinese: string;
};

export type ListeningUnit = Unit & {
  words?: Word[];
  materials?: Material[];
  word_count?: number;
  sentenceText?: ListeningSentenceText | null;
};

type ListeningQuestionType = "main" | "detail" | "inference";
export type ListeningBand = {
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

export const LISTENING_BANDS: ListeningBand[] = [
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

export const QUESTION_META: Record<
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

export function buildListeningQuestionsForBand(band: ListeningBand, allUnits: ListeningUnit[]) {
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
