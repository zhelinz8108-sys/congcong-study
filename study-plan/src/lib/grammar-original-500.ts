import originalGrammarData from "@/data/grammar/original-500.json";

export type OriginalGrammarTopic = {
  id: number;
  title: string;
  questionCount: number;
};

export type OriginalGrammarQuestion = {
  id: number;
  topicId: number;
  prompt: string;
  options: [string, string, string, string];
  answer: "A" | "B" | "C" | "D";
  answerText: string;
};

type OriginalGrammarData = {
  title: string;
  subtitle: string;
  sourceFile: string;
  sourceSha256: string;
  topics: OriginalGrammarTopic[];
  questions: OriginalGrammarQuestion[];
};

export const ORIGINAL_GRAMMAR_DATA = originalGrammarData as OriginalGrammarData;
export const ORIGINAL_GRAMMAR_TOPICS = ORIGINAL_GRAMMAR_DATA.topics;
export const ORIGINAL_GRAMMAR_QUESTIONS = ORIGINAL_GRAMMAR_DATA.questions;

const topicById = new Map(ORIGINAL_GRAMMAR_TOPICS.map((topic) => [topic.id, topic]));

export function getOriginalGrammarTopic(topicId: number): OriginalGrammarTopic | undefined {
  return topicById.get(topicId);
}

export function getOriginalGrammarQuestions(topicId?: number): OriginalGrammarQuestion[] {
  return topicId
    ? ORIGINAL_GRAMMAR_QUESTIONS.filter((question) => question.topicId === topicId)
    : ORIGINAL_GRAMMAR_QUESTIONS;
}

const topicRules: Record<
  number,
  {
    focus: string;
    rule: string;
    trap: string;
  }
> = {
  1: {
    focus: "名词单复数、可数性与冠词",
    rule: "先看名词是否可数、单复数和发音，再决定复数形式、量词或 a / an / the。",
    trap: "不要只看单词首字母；冠词判断看开头的音，复数还要留意不规则变化。",
  },
  2: {
    focus: "人称、物主与指示代词",
    rule: "先判断代词在句中作主语、宾语还是表示所属，再选择主格、宾格、形容词性或名词性物主代词。",
    trap: "名词前用形容词性物主代词；后面没有名词时常用名词性物主代词。",
  },
  3: {
    focus: "疑问词、数词、日期与时间",
    rule: "根据答语判断问的是时间、频率、距离、数量还是所属；日期和楼层等顺序用序数词。",
    trap: "how many 接可数名词复数，how much 问价格或不可数数量，how often 问频率。",
  },
  4: {
    focus: "be、have / has 与 There be",
    rule: "be 动词跟随主语的人称和数；There be 通常按离 be 最近的名词决定单复数。",
    trap: "There be 表示某处有，不和 have / has 混用；news 等形式像复数但作单数。",
  },
  5: {
    focus: "一般现在时与第三人称单数",
    rule: "习惯、规律和事实用一般现在时；主语为 he / she / it 或单数名词时，实义动词用三单形式。",
    trap: "does / doesn't 后的实义动词必须恢复原形，频率副词通常放在实义动词前、be 动词后。",
  },
  6: {
    focus: "现在进行时与一般现在时辨析",
    rule: "now、look、listen、at the moment 常提示 am / is / are + doing；习惯和规律仍用一般现在时。",
    trap: "不要漏掉 be 动词；usually 与 now 同时出现时，要分别判断两个分句。",
  },
  7: {
    focus: "一般过去时与不规则动词",
    rule: "yesterday、last...、...ago 等过去时间提示一般过去时；肯定句注意规则或不规则过去式。",
    trap: "did / didn't 后用动词原形；be 动词过去式根据主语用 was 或 were。",
  },
  8: {
    focus: "will 与 be going to",
    rule: "will 常用于临时决定、预测或承诺；be going to 常表示已有计划或有明显迹象的预测。",
    trap: "will 和 be going to 后都接动词原形，疑问句不要再叠加 do / does。",
  },
  9: {
    focus: "情态动词与祈使句",
    rule: "情态动词后接动词原形；祈使句以动词原形开头，否定祈使句用 Don't + 动词原形。",
    trap: "mustn't 表示禁止，不等于“不必”；建议多用 should，能力多用 can。",
  },
  10: {
    focus: "时间、地点与固定搭配介词",
    rule: "具体时刻常用 at，日期或某一天用 on，较长时间段用 in；固定搭配需要整体记忆。",
    trap: "arrive in / at、listen to、be good at 等搭配不要按中文逐字翻译。",
  },
  11: {
    focus: "形容词、副词与比较结构",
    rule: "形容词修饰名词或作表语，副词修饰动作；两者比较用比较级，三者及以上常用最高级。",
    trap: "than 常提示比较级；as...as 中间用原级，much 可修饰比较级。",
  },
  12: {
    focus: "数量词与不定代词",
    rule: "many / few 修饰可数名词复数，much / little 修饰不可数名词；some 常用于肯定句，any 常用于疑问或否定句。",
    trap: "few / little 表示几乎没有，a few / a little 表示还有一些；注意语气差别。",
  },
  13: {
    focus: "不定式、动名词、连词与固定搭配",
    rule: "根据前面的动词或结构选择 to do 或 doing，并用 because、but、if、when 等连词表达逻辑关系。",
    trap: "want / decide 常接 to do，enjoy / finish 常接 doing；固定搭配要作为整体判断。",
  },
  14: {
    focus: "疑问、否定、感叹与基本句型",
    rule: "一般疑问句把 be / 情态动词提前，或使用 do / does / did；感叹句按中心词选择 What 或 How。",
    trap: "What 后通常接名词短语，How 后通常接形容词或副词；特殊疑问句仍要保持疑问语序。",
  },
  15: {
    focus: "综合语境中的多考点判断",
    rule: "先圈时间词和主语，再判断时态、单复数、词性与固定结构，最后把答案代回整句检查。",
    trap: "综合题常在一句里放两个考点；不要看到熟词就选，要逐空核对句子结构。",
  },
};

function getCorrectSentence(question: OriginalGrammarQuestion): string {
  if (question.prompt.includes("___")) {
    const parts = question.answerText.split(";").map((part) => part.trim());
    let partIndex = 0;
    return question.prompt.replace(/___/g, () => {
      const part = parts[partIndex] ?? question.answerText;
      partIndex += 1;
      return part;
    });
  }

  if (/which sentence|which question|which .* correct|matches|expresses|describes|tells|word is|group contains|form is|can be read|written as|order/i.test(question.prompt)) {
    return question.answerText;
  }

  return `${question.prompt} — ${question.answerText}`;
}

function getQuestionClue(question: OriginalGrammarQuestion): string {
  const text = `${question.prompt} ${question.answerText}`.toLowerCase();
  if (/yesterday|last\s|ago\b|a minute ago|when she was young/.test(text)) {
    return "题中有明确的过去时间或过去语境。";
  }
  if (/\bnow\b|look!|listen!|at the moment|right now/.test(text)) {
    return "题中有“正在发生”的时间信号。";
  }
  if (/tomorrow|next\s|soon\b|tonight|going to|will\b/.test(text)) {
    return "题中出现未来时间、计划或预测信号。";
  }
  if (/every\s|usually|often|always|sometimes|never|twice a week/.test(text)) {
    return "题中出现习惯、频率或客观规律的信号。";
  }
  if (/than\b|as\s.+\sas|of the three|in our class|the most|the best/.test(text)) {
    return "题目要求比较两个或多个对象。";
  }
  if (/how many|many\b|few\b|fewer\b/.test(text)) {
    return "先检查后面的名词是否为可数名词复数。";
  }
  if (/how much|much\b|little\b|less\b|water|milk|rice|bread|homework|news|weather/.test(text)) {
    return "先检查不可数名词和数量表达的搭配。";
  }
  if (/which sentence|which question|which .* correct|matches|form is|word is|group contains/i.test(question.prompt)) {
    return "这是整句辨析题，要同时检查词形、语序和主谓一致。";
  }
  return "把正确选项代回原句，检查主语、时态和句子成分是否完整。";
}

export function buildOriginalGrammarExplanation(question: OriginalGrammarQuestion) {
  const topic = topicRules[question.topicId] ?? topicRules[15];
  return {
    focus: topic.focus,
    rule: topic.rule,
    reason: `${getQuestionClue(question)} 因此本题选 ${question.answer}（${question.answerText}）。`,
    correctSentence: getCorrectSentence(question),
    trap: topic.trap,
  };
}
