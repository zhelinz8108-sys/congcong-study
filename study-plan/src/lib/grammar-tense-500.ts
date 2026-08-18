import tenseGrammarData from "@/data/grammar/tense-500.json";
import type { OriginalGrammarQuestion } from "@/lib/grammar-original-500";

export type TenseGrammarTopic = {
  id: number;
  title: string;
  questionCount: number;
};

export type TenseGrammarQuestion = OriginalGrammarQuestion & {
  explanation: string;
};

type TenseGrammarData = {
  title: string;
  subtitle: string;
  sourceFile: string;
  sourceSha256: string;
  topics: TenseGrammarTopic[];
  questions: TenseGrammarQuestion[];
};

type TenseGuide = {
  rule: string;
  trap: string;
};

export const TENSE_GRAMMAR_DATA = tenseGrammarData as TenseGrammarData;
export const TENSE_GRAMMAR_TOPICS = TENSE_GRAMMAR_DATA.topics;
export const TENSE_GRAMMAR_QUESTIONS = TENSE_GRAMMAR_DATA.questions;

const topicById = new Map(TENSE_GRAMMAR_TOPICS.map((topic) => [topic.id, topic]));

const tenseGuides: Record<number, TenseGuide> = {
  1: {
    rule: "习惯、规律、客观事实用一般现在时；第三人称单数作主语时，实义动词通常加 -s 或 -es。",
    trap: "do / does 后必须接动词原形，不要把频率词误当成正在发生。",
  },
  2: {
    rule: "此刻正在发生或现阶段持续的动作，用 am / is / are + doing。",
    trap: "不要漏掉 be 动词；look、listen、now 等信号通常提示现在进行时。",
  },
  3: {
    rule: "过去发生且与现在有关，或从过去持续到现在的状态，用 have / has + 过去分词。",
    trap: "明确的过去时间通常不用现在完成时；has 只跟第三人称单数主语。",
  },
  4: {
    rule: "从过去开始并持续到现在、强调动作过程，用 have / has been + doing。",
    trap: "注意 for 与 since 的区别，并确认题目是在强调持续过程而不是完成结果。",
  },
  5: {
    rule: "过去某个确定时间发生并结束的动作，用动词过去式。",
    trap: "did / didn't 后用动词原形；不规则动词的过去式不能直接加 -ed。",
  },
  6: {
    rule: "过去某一时刻正在进行的动作，用 was / were + doing。",
    trap: "when 常引出较短动作，while 常描述持续背景，但仍要结合完整语境判断。",
  },
  7: {
    rule: "在另一个过去动作之前已经完成的动作，用 had + 过去分词。",
    trap: "先排清两个过去动作的先后，较早发生的动作才用过去完成时。",
  },
  8: {
    rule: "在过去某一时间之前一直持续的动作，用 had been + doing。",
    trap: "题目必须同时有过去参照点和持续过程，不能只看到 for 就机械选择。",
  },
  9: {
    rule: "临时决定、承诺或对未来的预测，常用 will + 动词原形。",
    trap: "will 后不用 to，也不要再变化实义动词形式。",
  },
  10: {
    rule: "已经计划好的未来行动，或根据当前迹象作出的预测，用 am / is / are going to + 动词原形。",
    trap: "先根据主语选 am / is / are，再接 going to 和动词原形。",
  },
  11: {
    rule: "表示未来某个具体时刻正在进行的动作，用 will be + doing。",
    trap: "要有明确的未来时间参照，重点是那个时刻动作正在进行。",
  },
  12: {
    rule: "表示到未来某个时间之前将已完成的动作，用 will have + 过去分词。",
    trap: "by、by the time 等常给出完成截止点，注意不要误选一般将来时。",
  },
  13: {
    rule: "先找时间标志和参照动作，再判断动作的时间、完成状态和持续过程。",
    trap: "综合题不要只看单个时间词，要把主句、从句和动作先后一起核对。",
  },
};

export function buildTenseGrammarExplanation(question: OriginalGrammarQuestion) {
  const tenseQuestion = question as TenseGrammarQuestion;
  const topic = topicById.get(tenseQuestion.topicId);
  const guide = tenseGuides[tenseQuestion.topicId] ?? tenseGuides[13];
  return {
    focus: topic?.title.replace(/^[一二三四五六七八九十]+、/, "") ?? "主流英语时态",
    rule: guide.rule,
    reason: tenseQuestion.explanation,
    correctSentence: tenseQuestion.prompt.includes("___")
      ? tenseQuestion.prompt.replace(/___/g, tenseQuestion.answerText)
      : `${tenseQuestion.prompt} — ${tenseQuestion.answerText}`,
    trap: guide.trap,
  };
}
