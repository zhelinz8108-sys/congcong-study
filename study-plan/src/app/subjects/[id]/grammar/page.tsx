"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ENGLISH_GRAMMAR_CHAPTERS,
  type GrammarChapter,
  type GrammarExample,
  type GrammarUnit,
  countGrammarUnits,
} from "@/lib/english-grammar";

type GrammarFormCard = {
  label: string;
  value: string;
  hint: string;
};

type GrammarPracticeCard = {
  label: string;
  task: string;
  sample: string;
  hint: string;
};

type GrammarLearningGuide = {
  headline: string;
  learningCopy: string;
  teacherScript: string;
  keyMoves: string[];
  checkpoints: string[];
};

type SpeechLang = "en-US" | "zh-CN";

const GENERATED_GRAMMAR_AUDIO_BASE = "/generated-audio/grammar";

type SpeechTune = {
  rate: number;
  pitch: number;
  volume: number;
};

type GrammarDifficulty = "medium" | "hard" | "super";
type GrammarDifficultyFilter = GrammarDifficulty | "all";
type GrammarQuestionKind = "sentence" | "dialogue" | "scenario" | "mini_context" | "pattern";

type GrammarQuizQuestion = {
  id: string;
  unitId: number;
  difficulty: GrammarDifficulty;
  kind: GrammarQuestionKind;
  prompt: string;
  instruction: string;
  options: string[];
  answer: string;
  explanation: string;
  sourceSentence: string;
  choiceExplanations?: Record<string, string>;
};

type GrammarQuizAnswer = {
  questionId: string;
  selected: string;
  answer: string;
  correct: boolean;
};

type ActiveGrammarQuiz =
  | { type: "unit"; unit: GrammarUnit }
  | { type: "mixed"; sessionIndex: number };

type GrammarQuizSource = {
  key: string;
  eyebrow: string;
  title: string;
  summary: string;
  totalLabel: string;
  questions: GrammarQuizQuestion[];
  showDifficultyFilters: boolean;
};

const grammarUnitRange = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => start + index);

const PINNED_GRAMMAR_ORDER_LABEL =
  "1-12 -> 24 -> 25-28 -> 30-35 -> 37-49 -> 59-96 -> 103-115";

const PINNED_GRAMMAR_UNIT_IDS = [
  ...grammarUnitRange(1, 12),
  24,
  ...grammarUnitRange(25, 28),
  ...grammarUnitRange(30, 35),
  ...grammarUnitRange(37, 49),
  ...grammarUnitRange(59, 96),
  ...grammarUnitRange(103, 115),
];

const PINNED_GRAMMAR_UNIT_ID_SET = new Set(PINNED_GRAMMAR_UNIT_IDS);

const grammarAudioUnitPrefix = (unitId: number) =>
  `${GENERATED_GRAMMAR_AUDIO_BASE}/unit-${String(unitId).padStart(3, "0")}`;

const GRAMMAR_UNITS_BY_ID = new Map<number, GrammarUnit>(
  ENGLISH_GRAMMAR_CHAPTERS.flatMap((chapter) =>
    chapter.units.map((unit) => [unit.id, unit] as const)
  )
);

const PINNED_GRAMMAR_UNITS = PINNED_GRAMMAR_UNIT_IDS.reduce<GrammarUnit[]>(
  (units, unitId) => {
    const unit = GRAMMAR_UNITS_BY_ID.get(unitId);
    if (unit) {
      units.push(unit);
    }
    return units;
  },
  []
);

const canPracticeGrammarUnit = (unitId: number) =>
  PINNED_GRAMMAR_UNIT_ID_SET.has(unitId);

const preferredVoiceHints: Record<SpeechLang, string[]> = {
  "zh-CN": [
    "xiaoxiao",
    "xiaoyi",
    "xiaohan",
    "xiaobei",
    "yunxi",
    "yunjian",
    "natural",
    "online",
    "neural",
    "microsoft",
    "huihui",
    "yaoyao",
  ],
  "en-US": [
    "jenny",
    "aria",
    "michelle",
    "sonia",
    "libby",
    "ava",
    "emma",
    "natural",
    "online",
    "neural",
    "premium",
    "microsoft",
    "google us english",
  ],
};

const voicePenaltyHints = ["desktop", "legacy", "compact"];

function getVoiceScore(voice: SpeechSynthesisVoice, lang: SpeechLang): number {
  const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  const voiceLang = voice.lang.toLowerCase();
  const targetLang = lang.toLowerCase();
  const langPrefix = targetLang.split("-")[0];
  let score = 0;

  if (voiceLang === targetLang) {
    score += 120;
  } else if (voiceLang.startsWith(targetLang)) {
    score += 100;
  } else if (voiceLang.startsWith(langPrefix)) {
    score += 70;
  }

  preferredVoiceHints[lang].forEach((hint, index) => {
    if (name.includes(hint)) {
      score += Math.max(48 - index * 3, 12);
    }
  });

  voicePenaltyHints.forEach((hint) => {
    if (name.includes(hint)) {
      score -= 16;
    }
  });

  if (!voice.localService) {
    score += 10;
  }

  return score;
}

function getVoiceForLang(lang: SpeechLang): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  const langPrefix = lang.toLowerCase().split("-")[0];
  const matchingVoices = voices
    .filter((voice) => voice.lang.toLowerCase().startsWith(langPrefix))
    .sort((a, b) => getVoiceScore(b, lang) - getVoiceScore(a, lang));

  return matchingVoices[0] ?? null;
}

function getSpeechTune(lang: SpeechLang): SpeechTune {
  return lang === "en-US"
    ? { rate: 0.78, pitch: 1.04, volume: 0.95 }
    : { rate: 0.86, pitch: 1.08, volume: 0.95 };
}

function softenChineseSpeech(text: string): string {
  return text
    .replace(/[：:]/g, "，")
    .replace(/[；;]/g, "。")
    .replace(/\s+/g, " ")
    .trim();
}

function prepareSpeechText(text: string, lang: SpeechLang): string {
  return lang === "en-US" ? speakableEnglish(text) : softenChineseSpeech(text);
}

function speakableEnglish(text: string): string {
  return text
    .replace(/\.\.\./g, " something ")
    .replace(/\/+/g, " or ")
    .replace(/\s+/g, " ")
    .trim();
}

function ex(english: string, chinese: string): GrammarExample {
  return { english, chinese };
}

function dedupeExamples(examples: GrammarExample[]): GrammarExample[] {
  const seen = new Set<string>();

  return examples.filter((example) => {
    const key = example.english.trim().toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildFormCards(unit: GrammarUnit): GrammarFormCard[] {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();
  const formCards: GrammarFormCard[] = unit.patterns.slice(0, 3).map((pattern, index) => ({
    label: index === 0 ? "基础式" : index === 1 ? "扩展式" : "应用式",
    value: pattern,
    hint: "先按这个句型说一遍，再把主语、地点或时间换成自己的内容。",
  }));

  if (/疑问|question|\?/.test(normalized)) {
    formCards.push({
      label: "回答式",
      value: "Yes, ... / No, ...",
      hint: "先用 Yes 或 No，再补完整回答。",
    });
  } else if (/否定|don't|doesn't|didn't|isn't|aren't|haven't|mustn't|can't/.test(normalized)) {
    formCards.push({
      label: "否定式",
      value: "主语 + not / don't / doesn't + ...",
      hint: "先确定主语，再选对否定形式。",
    });
  } else if (/比较|than|older|more|less|as\.\.\.as/.test(normalized)) {
    formCards.push({
      label: "比较式",
      value: "A + be / 动词 + 比较结构 + than + B",
      hint: "比较两样东西时，要把两边都说完整。",
    });
  } else if (/there /.test(normalized)) {
    formCards.push({
      label: "地点式",
      value: "There is / are ... + 地点",
      hint: "先说“有”，再补地点。",
    });
  } else if (/a\/an|some|any|every|both|either|neither|none|much|many|few|little/.test(normalized)) {
    formCards.push({
      label: "数量式",
      value: "限定词 + 名词 / 代词",
      hint: "先想名词能不能数，再选对应形式。",
    });
  } else if (/介词|at |in |on |from|until|since|with|about|behind|under|through/.test(normalized)) {
    formCards.push({
      label: "搭配式",
      value: "动词 / 时间 / 地点 + 介词短语",
      hint: "介词常和固定时间、地点、动作搭配出现。",
    });
  } else if (/phrasal|短语动词|put on|run away|go in|fall off/.test(normalized)) {
    formCards.push({
      label: "连用式",
      value: "动词 + 小词 + 宾语",
      hint: "先看宾语是名词还是代词，再决定放在中间还是后面。",
    });
  } else {
    formCards.push({
      label: "替换式",
      value: "换主语 / 时间 / 地点再造句",
      hint: "保持语法结构不变，只换内容。",
    });
  }

  formCards.push({
    label: "口头练习",
    value: "照读一句，再换一个信息说第二句",
    hint: "优先替换人物、地点、时间或数量，让句型真正用起来。",
  });

  return formCards.slice(0, 5);
}

function buildExtraExamples(unit: GrammarUnit): GrammarExample[] {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();

  if (normalized.includes("am / is / are（疑问句）")) {
    return [
      ex("Is your teacher in the office now?", "你们老师现在在办公室吗？"),
      ex("Are your books on the desk?", "你的书在桌子上吗？"),
    ];
  }

  if (normalized.includes("am / is / are")) {
    return [
      ex("My little cousin is very funny.", "我的小表弟很有趣。"),
      ex("We are in the computer room this afternoon.", "今天下午我们在电脑教室。"),
    ];
  }

  if (normalized.includes("现在进行时") && normalized.includes("疑问")) {
    return [
      ex("Is the baby sleeping now?", "宝宝现在在睡觉吗？"),
      ex("What are your classmates writing?", "你的同学们正在写什么？"),
    ];
  }

  if (normalized.includes("现在进行时") && normalized.includes("比较")) {
    return [
      ex("I am wearing my sports shoes today, but I usually wear black shoes.", "我今天穿的是运动鞋，但我平时穿黑鞋。"),
      ex("They are eating outside now, but they usually eat in the dining room.", "他们现在在外面吃，但平时在餐厅吃。"),
    ];
  }

  if (normalized.includes("现在进行时")) {
    return [
      ex("My brother is washing his bike in the yard.", "我哥哥正在院子里洗自行车。"),
      ex("The ducks are swimming across the pond.", "鸭子们正在游过池塘。"),
    ];
  }

  if (normalized.includes("一般现在时") && normalized.includes("疑问")) {
    return [
      ex("Do your parents read with you at night?", "你父母晚上会陪你一起读书吗？"),
      ex("Does this bus stop near the museum?", "这辆公交车会在博物馆附近停吗？"),
    ];
  }

  if (normalized.includes("一般现在时") && normalized.includes("否定")) {
    return [
      ex("My father doesn't drink coffee at night.", "我爸爸晚上不喝咖啡。"),
      ex("We don't stay out late on school days.", "上学日我们不在外面待到很晚。"),
    ];
  }

  if (normalized.includes("一般现在时")) {
    return [
      ex("My uncle drives to work every weekday.", "我叔叔每个工作日都开车上班。"),
      ex("The sun rises in the east.", "太阳从东方升起。"),
    ];
  }

  if (normalized.includes("i have.../i've got")) {
    return [
      ex("I have got a warm coat for winter.", "我有一件过冬的厚外套。"),
      ex("She has a pet turtle in a small tank.", "她有一只养在小缸里的宠物乌龟。"),
    ];
  }

  if (normalized.includes("was / were") || normalized.includes("was/were")) {
    return [
      ex("The streets were quiet early in the morning.", "清晨街道很安静。"),
      ex("I was nervous before the speech.", "演讲前我有点紧张。"),
    ];
  }

  if (normalized.includes("didn't") || normalized.includes("did you")) {
    return [
      ex("We didn't hear the bell because it was noisy.", "因为太吵，我们没听见铃声。"),
      ex("Did your team win the match yesterday?", "你们队昨天赢了比赛吗？"),
    ];
  }

  if (normalized.includes("过去进行时") && normalized.includes("比较")) {
    return [
      ex("I was taking notes when the teacher asked a question.", "老师提问时，我正在记笔记。"),
      ex("They were cleaning the room when the guests arrived.", "客人到时，他们正在打扫房间。"),
    ];
  }

  if (normalized.includes("过去进行时")) {
    return [
      ex("She was making a card at seven o'clock.", "七点时她正在做卡片。"),
      ex("We were waiting under the tree for the bus.", "我们当时正在树下等公交车。"),
    ];
  }

  if (normalized.includes("一般过去时")) {
    return [
      ex("The class visited the farm last month.", "全班上个月参观了农场。"),
      ex("I found an old photo in the drawer.", "我在抽屉里发现了一张旧照片。"),
    ];
  }

  if (normalized.includes("present perfect") || normalized.includes("现在完成时") || normalized.includes("have done")) {
    if (normalized.includes("ever")) {
      return [
        ex("Have you ever ridden in a hot-air balloon?", "你坐过热气球吗？"),
        ex("She has never spoken to a TV reporter.", "她从没跟电视记者说过话。"),
      ];
    }

    if (normalized.includes("for / since / ago") || normalized.includes("for since ago")) {
      return [
        ex("We have waited here for half an hour.", "我们已经在这里等了半个小时。"),
        ex("He joined the club two years ago.", "他两年前加入了这个俱乐部。"),
      ];
    }

    return [
      ex("I have already packed my schoolbag for tomorrow.", "我已经把明天的书包收拾好了。"),
      ex("She hasn't called her grandma yet.", "她还没有给奶奶打电话。"),
    ];
  }

  if (normalized.includes("被动语态")) {
    return [
      ex("The library door is opened at eight every day.", "图书馆的门每天八点打开。"),
      ex("The sports field has been cleaned for the event.", "为了活动，操场已经被清扫过了。"),
    ];
  }

  if (normalized.includes("规则动词") || normalized.includes("不规则动词")) {
    return [
      ex("We studied for the test and then went to bed early.", "我们复习了考试，然后早早睡了。"),
      ex("She took the book and wrote her name on it.", "她拿起书并在上面写下名字。"),
    ];
  }

  if (normalized.includes("going to")) {
    return [
      ex("They are going to build a kite after lunch.", "他们午饭后要做风筝。"),
      ex("I am going to call my cousin this evening.", "我今晚要给表哥打电话。"),
    ];
  }

  if (normalized.includes("what are you doing tomorrow")) {
    return [
      ex("We are having a music lesson tomorrow morning.", "我们明天上午要上音乐课。"),
      ex("My aunt is visiting us this weekend.", "我阿姨这个周末要来看我们。"),
    ];
  }

  if (normalized.includes("will") || normalized.includes("shall")) {
    return [
      ex("I think our class will enjoy the science show.", "我觉得我们班会喜欢这场科学表演。"),
      ex("Shall we finish the poster before dinner?", "我们晚饭前把海报做完好吗？"),
    ];
  }

  if (normalized.includes("might")) {
    return [
      ex("The train might be late because of the rain.", "因为下雨，火车可能会晚点。"),
      ex("We might see stars if the sky gets clear.", "如果天空放晴，我们也许能看到星星。"),
    ];
  }

  if (normalized.includes("can") || normalized.includes("could")) {
    return [
      ex("Can your sister skate on the ice now?", "你姐姐现在会在冰上滑冰吗？"),
      ex("Could you hold this box for a minute?", "你能帮我拿一下这个箱子吗？"),
    ];
  }

  if (normalized.includes("must") || normalized.includes("need to")) {
    return [
      ex("You must keep your hands clean before lunch.", "午饭前你必须把手洗干净。"),
      ex("We don't need to leave so early today.", "我们今天不用那么早出发。"),
    ];
  }

  if (normalized.includes("should")) {
    return [
      ex("You should check your answer again.", "你应该再检查一遍答案。"),
      ex("Children should be kind to animals.", "孩子们应该善待动物。"),
    ];
  }

  if (normalized.includes("have to")) {
    return [
      ex("I have to wear my school uniform on Monday.", "星期一我必须穿校服。"),
      ex("She has to finish the poster before lunch.", "她必须在午饭前完成海报。"),
    ];
  }

  if (normalized.includes("would you like") || normalized.includes("i'd like")) {
    return [
      ex("Would you like to join our reading club?", "你想加入我们的阅读俱乐部吗？"),
      ex("I'd like a bowl of rice and some vegetables.", "我想要一碗米饭和一些蔬菜。"),
    ];
  }

  if (normalized.includes("let's") || normalized.includes("don't do")) {
    return [
      ex("Please keep the door closed when the heater is on.", "开暖气时请把门关上。"),
      ex("Let's finish the hard part first.", "我们先把难的部分做完吧。"),
    ];
  }

  if (normalized.includes("used to")) {
    return [
      ex("We used to play under that tree after school.", "我们以前放学后常在那棵树下玩。"),
      ex("My grandmother used to work in a bookstore.", "我奶奶以前在书店工作。"),
    ];
  }

  if (normalized.includes("there is") || normalized.includes("there are")) {
    return [
      ex("There is a long line outside the bakery.", "面包店外面排着长队。"),
      ex("There are three lamps in our living room.", "我们客厅里有三盏灯。"),
    ];
  }

  if (normalized.includes("there was") || normalized.includes("there will be") || normalized.includes("there has")) {
    return [
      ex("There will be a parent meeting next Friday.", "下周五会有家长会。"),
      ex("There has been heavy traffic near the bridge.", "桥附近一直很堵。"),
    ];
  }

  if (normalized.startsWith("it") || normalized.includes("it...")) {
    return [
      ex("It is a long way to the station from here.", "从这里到车站有很长一段路。"),
      ex("It is fun to build things with your hands.", "自己动手做东西很有趣。"),
    ];
  }

  if (normalized.includes("too/either") || normalized.includes("so am i") || normalized.includes("neither")) {
    return [
      ex("I like drawing, and my cousin does too.", "我喜欢画画，我表哥也喜欢。"),
      ex("She can't skate, and I can't either.", "她不会滑冰，我也不会。"),
    ];
  }

  if (normalized.includes("who") || normalized.includes("what") || normalized.includes("which") || normalized.includes("how")) {
    return [
      ex("Who is carrying that big box?", "谁在搬那个大箱子？"),
      ex("How did your team get to the stadium?", "你们队怎么到体育场的？"),
    ];
  }

  if (normalized.includes("said that") || normalized.includes("told me that")) {
    return [
      ex("My brother said that he would help me later.", "我哥哥说他晚一点会帮我。"),
      ex("Our coach told us that practice would start early.", "教练告诉我们训练会提前开始。"),
    ];
  }

  if (normalized.includes("to do") || normalized.includes("doing") || normalized.includes("want you to")) {
    return [
      ex("I want to learn how to make dumplings.", "我想学怎么包饺子。"),
      ex("My teacher wants us to speak more clearly.", "老师想让我们说得更清楚。"),
    ];
  }

  if (normalized.includes("go to") || normalized.includes("go on") || normalized.includes("go for") || normalized.includes("go-ing")) {
    return [
      ex("We go for a bike ride on cool evenings.", "天气凉快的傍晚我们会骑车兜风。"),
      ex("My brother goes fishing with Grandpa in summer.", "我哥哥夏天和爷爷去钓鱼。"),
    ];
  }

  if (normalized.includes("get")) {
    return [
      ex("I get nervous before a big game.", "大比赛前我会紧张。"),
      ex("We usually get to the station by seven.", "我们通常七点前到车站。"),
    ];
  }

  if (normalized.includes("do 与 make") || normalized.includes("do and make") || normalized.includes("make")) {
    return [
      ex("I make my bed before I go downstairs.", "我下楼前会整理床铺。"),
      ex("We do the cleaning together every Saturday.", "我们每周六一起大扫除。"),
    ];
  }

  if (normalized.includes("have")) {
    return [
      ex("We have a short class meeting every Monday.", "我们每周一都有一个简短班会。"),
      ex("She had a cold drink after the race.", "比赛后她喝了一杯冷饮。"),
    ];
  }

  if (normalized.includes("my / his / their") || normalized.includes("mine") || normalized.includes("myself") || normalized.includes("kate’s")) {
    return [
      ex("Their new house has a yellow door.", "他们的新房子有一扇黄色的门。"),
      ex("I fixed the model plane myself.", "模型飞机是我自己修好的。"),
    ];
  }

  if (normalized.includes("a / an") || normalized.includes("a/an")) {
    return [
      ex("She saw an eagle high in the sky.", "她看见一只鹰高高飞在天上。"),
      ex("I bought a useful map for the trip.", "我为这次旅行买了一张有用的地图。"),
    ];
  }

  if (normalized.includes("single") || normalized.includes("plural") || normalized.includes("单数") || normalized.includes("复数")) {
    return [
      ex("One child was waiting, but two parents arrived.", "原来只有一个孩子在等，后来来了两位家长。"),
      ex("These buses stop near the sports center.", "这些公交车在体育中心附近停。"),
    ];
  }

  if (normalized.includes("可数") || normalized.includes("不可数")) {
    return [
      ex("We need some paper and two boxes.", "我们需要一些纸和两个盒子。"),
      ex("There isn't much cheese in the fridge.", "冰箱里没有多少奶酪了。"),
    ];
  }

  if (normalized.includes("the") || normalized.includes("冠词") || normalized.includes("music") || normalized.includes("地名")) {
    return [
      ex("The playground is behind the new building.", "操场在新楼后面。"),
      ex("We often listen to music in the art room.", "我们常在美术教室听音乐。"),
    ];
  }

  if (normalized.includes("this/that") || normalized.includes("one/ones") || normalized.includes("some 与 any") || normalized.includes("both") || normalized.includes("much") || normalized.includes("few")) {
    return [
      ex("These gloves are mine, but those ones are my sister's.", "这些手套是我的，那些是我妹妹的。"),
      ex("We still have a few oranges and a little juice.", "我们还剩几个橙子和一点果汁。"),
    ];
  }

  if (normalized.includes("形容词") || normalized.includes("副词") || normalized.includes("比较级") || normalized.includes("最高级") || normalized.includes("enough") || normalized.includes("too")) {
    return [
      ex("This backpack is light enough for my little brother.", "这个背包对我弟弟来说够轻。"),
      ex("The red train is much faster than the old one.", "红色那列火车比旧的快得多。"),
    ];
  }

  if (normalized.includes("词序") || normalized.includes("always") || normalized.includes("still") || normalized.includes("give me")) {
    return [
      ex("She usually finishes her reading before eight.", "她通常八点前读完书。"),
      ex("Please send the photo to me after dinner.", "请在晚饭后把照片发给我。"),
    ];
  }

  if (normalized.includes("because") || normalized.includes("when") || normalized.includes("if") || normalized.includes("定语从句")) {
    return [
      ex("If you save your work now, you won't lose it.", "如果你现在保存文件，就不会丢。"),
      ex("The girl who sits by the window is our monitor.", "坐在窗边的那个女孩是我们的班长。"),
    ];
  }

  if (normalized.includes("at 8 o'clock") || normalized.includes("on monday") || normalized.includes("in april") || normalized.includes("before") || normalized.includes("after") || normalized.includes("during") || normalized.includes("while")) {
    return [
      ex("We usually leave home at a quarter past seven.", "我们通常七点一刻离开家。"),
      ex("During the holiday, I read two chapter books.", "假期里我读了两本章节书。"),
    ];
  }

  if (normalized.includes("behind") || normalized.includes("under") || normalized.includes("opposite") || normalized.includes("through") || normalized.includes("by") || normalized.includes("with") || normalized.includes("look at") || normalized.includes("listen to")) {
    return [
      ex("The small shop is opposite the library gate.", "那家小店在图书馆门口对面。"),
      ex("We walked through the tunnel with our flashlights on.", "我们打着手电穿过了隧道。"),
    ];
  }

  if (normalized.includes("短语动词") || normalized.includes("put on") || normalized.includes("run away")) {
    return [
      ex("Please turn off the fan before you leave.", "你离开前请把风扇关掉。"),
      ex("He picked up the coin and put it in his pocket.", "他捡起硬币，把它放进口袋。"),
    ];
  }

  return [
    ex("Try this pattern with your own school life example.", "试着把这个句型换成你自己的校园场景。"),
    ex("Say the same idea again with a different person or place.", "把同一个意思换一个人物或地点再说一次。"),
  ];
}

function buildScenarioExamples(unit: GrammarUnit): GrammarExample[] {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();

  if (/疑问|question|\?/.test(normalized)) {
    return [
      ex("Is the school gate still open now?", "学校大门现在还开着吗？"),
      ex("Do your friends play table tennis after class?", "你的朋友们下课后打乒乓球吗？"),
    ];
  }

  if (/否定|don't|doesn't|didn't|isn't|aren't|haven't|can't|mustn't/.test(normalized)) {
    return [
      ex("My little brother can't tie his shoes by himself yet.", "我弟弟还不会自己系鞋带。"),
      ex("We didn't carry umbrellas, so we got wet.", "我们没带伞，所以淋湿了。"),
    ];
  }

  if (normalized.includes("一般现在时")) {
    return [
      ex("Our music teacher starts class with a short song.", "我们的音乐老师上课总会先唱一首短歌。"),
      ex("My best friend finishes her homework before dinner.", "我最好的朋友总在晚饭前写完作业。"),
    ];
  }

  if (normalized.includes("现在进行时")) {
    return [
      ex("Two boys are carrying sports mats into the hall.", "两个男孩正把体操垫搬进礼堂。"),
      ex("My mother is cutting fruit in the kitchen now.", "我妈妈现在正在厨房切水果。"),
    ];
  }

  if (normalized.includes("一般过去时") || normalized.includes("过去进行时")) {
    return [
      ex("I dropped my pencil case on the stairs this morning.", "今天早上我在楼梯上掉了铅笔盒。"),
      ex("We were talking softly when the lights went out.", "灯灭的时候，我们正在小声说话。"),
    ];
  }

  if (normalized.includes("现在完成时") || normalized.includes("have done")) {
    return [
      ex("I have finished my reading record for this week.", "我已经完成这周的阅读记录了。"),
      ex("She has just put the clean cups back on the shelf.", "她刚把洗好的杯子放回架子上。"),
    ];
  }

  if (/will|shall|going to|might/.test(normalized)) {
    return [
      ex("We will plant small trees on Friday afternoon.", "我们周五下午会种小树。"),
      ex("My cousin is going to join the basketball tryout.", "我表哥打算参加篮球选拔。"),
    ];
  }

  if (/can|could|should|must|have to|need to/.test(normalized)) {
    return [
      ex("You should bring a notebook for the science show.", "你应该给科学展示带一本笔记本。"),
      ex("We have to stay inside because the wind is too strong.", "因为风太大，我们必须待在室内。"),
    ];
  }

  if (/there is|there are|there was|there will be/.test(normalized)) {
    return [
      ex("There are several quiet corners in our new library.", "我们新图书馆里有几个安静的角落。"),
      ex("There will be a short art talk after lunch.", "午饭后会有一个简短的美术分享。"),
    ];
  }

  if (/形容词|副词|比较级|最高级|enough|too/.test(normalized)) {
    return [
      ex("This question is harder than the last one, but it is still fair.", "这道题比上一道难，但还是合理的。"),
      ex("The blue bottle is the lightest one in the box.", "蓝色水瓶是箱子里最轻的那个。"),
    ];
  }

  if (/because|when|if|who|which|that|定语从句/.test(normalized)) {
    return [
      ex("When the rain stops, we can finish the game outside.", "雨停了以后，我们就能到外面把比赛踢完。"),
      ex("The boy who helped me yesterday is in Grade Five.", "昨天帮我的那个男孩上五年级。"),
    ];
  }

  if (/介词|behind|under|through|by|with|look at|listen to/.test(normalized)) {
    return [
      ex("The art box is under the long table near the window.", "美术盒在窗边那张长桌子下面。"),
      ex("We walked by the lake with our teacher after lunch.", "午饭后我们和老师沿着湖边走。"),
    ];
  }

  return [
    ex("Try one more sentence about your family, class, or weekend plan.", "再用你的家人、班级或周末计划说一句。"),
    ex("Keep the grammar the same and change only one key word.", "保持语法不变，只替换一个关键信息。"),
  ];
}

function buildChallengeExamples(unit: GrammarUnit): GrammarExample[] {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();

  if (normalized.includes("am / is / are（疑问句）")) {
    return [
      ex("Is your father in his room, or is he still talking on the phone downstairs?", "你爸爸是在房间里，还是还在楼下打电话？"),
      ex("Are these shoes dry enough to wear after the heavy rain this morning?", "今天早上下过大雨后，这双鞋已经干到可以穿了吗？"),
      ex("Why is your little brother so quiet when the other children are still playing?", "别的孩子还在玩，你弟弟为什么这么安静？"),
    ];
  }

  if (normalized.includes("am / is / are")) {
    return [
      ex("My little sister is usually quiet, but she is very excited today because her team won.", "我妹妹平时很安静，但今天她非常兴奋，因为她的队赢了。"),
      ex("The walls in our classroom are clean now, although they were very dirty last week.", "我们教室的墙现在很干净，虽然上周还很脏。"),
      ex("I am ready for the talk, but my partner is still checking the last card.", "我已经准备好做分享了，但我的搭档还在检查最后一张卡片。"),
    ];
  }

  if (normalized.includes("i have.../i've got")) {
    return [
      ex("I have got two things to finish before dinner, so I can't go out yet.", "晚饭前我还有两件事要完成，所以现在还不能出去。"),
      ex("She has got a good ear for music, which is why she learns songs so quickly.", "她的乐感很好，所以学歌特别快。"),
      ex("We have got enough chairs for the parents, but we still need more cups.", "我们给家长准备的椅子够了，但杯子还需要更多。"),
    ];
  }

  if (normalized.includes("was / were") || normalized.includes("was/were")) {
    return [
      ex("The room was so hot that we opened every window before class began.", "房间太热了，所以我们在上课前把所有窗户都打开了。"),
      ex("My grandparents were tired after the long trip, but they still smiled all evening.", "我爷爷奶奶长途旅行后很累，但整个晚上还是一直在笑。"),
      ex("I was only seven when I first stayed at school for a full day.", "我第一次在学校待满一整天时，才七岁。"),
    ];
  }

  if (/疑问|question|\?/.test(normalized)) {
    return [
      ex("When you get home after school, do you start your homework at once?", "你放学回家后，会马上开始写作业吗？"),
      ex("Is your little brother still awake, or has he gone to bed already?", "你弟弟现在还醒着，还是已经上床睡觉了？"),
      ex("Why are the two boys standing near the gate when class has already started?", "既然已经上课了，那两个男孩为什么还站在门口？"),
    ];
  }

  if (/否定|don't|doesn't|didn't|isn't|aren't|haven't|can't|mustn't/.test(normalized)) {
    return [
      ex("She doesn't join the game when she feels tired after a long class.", "上一节长课以后，如果她觉得累，就不会参加游戏。"),
      ex("We aren't ready to leave because Dad hasn't come back with the car yet.", "爸爸还没把车开回来，所以我们还不能出发。"),
      ex("I can't finish the last part tonight unless you help me check it first.", "除非你先帮我检查一下，不然我今晚完成不了最后一部分。"),
    ];
  }

  if (normalized.includes("一般现在时")) {
    return [
      ex("My sister usually reads for half an hour before she goes to sleep.", "我姐姐通常在睡前读半小时书。"),
      ex("The school bus leaves at seven, so we never eat breakfast too slowly.", "校车七点开，所以我们吃早饭从不太慢。"),
      ex("Our teacher often gives us a short quiz after we review the new words.", "老师常常在我们复习完新单词后，给我们一个小测验。"),
    ];
  }

  if (normalized.includes("现在进行时")) {
    return [
      ex("The children are waiting in the hall because the rain is too heavy outside.", "因为外面雨太大，孩子们正在礼堂里等。"),
      ex("Two girls are cleaning the board while the rest of the class is packing up.", "当班里其他同学在收拾东西时，两个女孩正在擦黑板。"),
      ex("My mother is cutting fruit in the kitchen while I am setting the table.", "我妈妈正在厨房切水果，而我正在摆桌子。"),
    ];
  }

  if (normalized.includes("一般过去时") || normalized.includes("过去进行时") || normalized.includes("used to")) {
    return [
      ex("I dropped my cup when I ran across the kitchen for the phone.", "我为了去接电话跑过厨房时，把杯子掉了。"),
      ex("We were walking home when the sky suddenly turned dark.", "我们正在走回家时，天空突然变暗了。"),
      ex("My brother forgot his bag, so I took it to his classroom after lunch.", "我哥哥忘了带书包，所以我午饭后把书包送到他的教室。"),
    ];
  }

  if (normalized.includes("现在完成时") || normalized.includes("have done")) {
    return [
      ex("I have finished the hard part, but I still need to check the last page.", "我已经完成了最难的部分，但最后一页还需要检查。"),
      ex("She has never seen the sea, although she has read many books about it.", "虽然她读过很多关于大海的书，但她从没见过海。"),
      ex("We have lived in this area since my sister started primary school.", "从我姐姐上小学开始，我们就一直住在这个区。"),
    ];
  }

  if (/will|shall|going to|might/.test(normalized)) {
    return [
      ex("If the weather stays fine, we will practice outside after the second class.", "如果天气一直好，我们会在第二节课后到外面练习。"),
      ex("My uncle is going to fix the old bike when he has time this weekend.", "我叔叔这个周末有空时，打算把那辆旧自行车修好。"),
      ex("The train might be late, so we should leave home a little earlier.", "火车可能会晚点，所以我们应该稍微早一点出门。"),
    ];
  }

  if (/can|could|should|must|have to|need to/.test(normalized)) {
    return [
      ex("You should wash the fruit before you cut it for the class picnic.", "你给班级野餐切水果前，应该先把水果洗干净。"),
      ex("We must stay quiet while the younger children are having a test.", "低年级孩子考试的时候，我们必须保持安静。"),
      ex("I can carry the light box, but I can't lift the one by the door.", "我能搬那个轻箱子，但搬不动门边那个。"),
    ];
  }

  if (/there is|there are|there was|there will be/.test(normalized)) {
    return [
      ex("There is a long list of books that we still need for the new term.", "新学期我们还需要一长串书单上的书。"),
      ex("There are only two chairs left, so we may have to stand for a while.", "只剩两把椅子了，所以我们可能得站一会儿。"),
      ex("There will be a short meeting in the library after the last lesson.", "最后一节课后，图书馆里会有一个简短会议。"),
    ];
  }

  if (normalized.includes("被动语态")) {
    return [
      ex("The class photo was taken after the rain stopped, so everyone looked relaxed again.", "雨停后才拍了班级合影，所以大家看起来又放松了。"),
      ex("The room has been cleaned well enough for the parents to come in now.", "房间已经打扫得够干净了，家长现在可以进来了。"),
      ex("A short note will be sent home if any student leaves early today.", "如果今天有学生提前离开，学校会发一张简短通知回家。"),
    ];
  }

  if (/形容词|副词|比较级|最高级|enough|too/.test(normalized)) {
    return [
      ex("This road is much safer than the one behind the market when it gets dark.", "天一黑，这条路比市场后面的那条安全得多。"),
      ex("The second plan is more useful because it saves both time and paper.", "第二个方案更有用，因为它既省时间又省纸。"),
      ex("Of the three boys, Ben was the most careful when he checked the answers.", "三个男孩里，Ben 检查答案时最仔细。"),
    ];
  }

  if (/because|when|if|who|which|that|定语从句/.test(normalized)) {
    return [
      ex("If you speak too fast, the younger children may not understand your idea.", "如果你说得太快，低年级孩子可能听不懂你的意思。"),
      ex("The girl who won the first prize also helped me with the poster.", "拿了一等奖的那个女孩也帮我做了海报。"),
      ex("We stayed indoors because the wind was so strong that the windows shook.", "因为风太大，连窗户都在晃，我们只好待在屋里。"),
    ];
  }

  if (normalized.includes("said that") || normalized.includes("told me that")) {
    return [
      ex("My mother said that I should rest first because my face looked very tired.", "我妈妈说我应该先休息，因为我的脸看起来很累。"),
      ex("Our teacher told us that the meeting would start early if the parents arrived on time.", "老师告诉我们，如果家长准时到，会议就会提前开始。"),
      ex("He said that he could help later, but only after he finished his own work.", "他说他晚点可以帮忙，但得先做完自己的事。"),
    ];
  }

  if (normalized.includes("to do") || normalized.includes("doing") || normalized.includes("want you to")) {
    return [
      ex("I enjoy reading by the window when the house is quiet in the afternoon.", "下午家里很安静时，我喜欢坐在窗边看书。"),
      ex("My teacher wants us to explain our answers instead of only giving the result.", "老师希望我们解释答案，而不是只报结果。"),
      ex("It is hard to stay calm when everyone around you is speaking at once.", "当周围所有人同时说话时，很难保持冷静。"),
    ];
  }

  if (/介词|behind|under|through|by|with|look at|listen to/.test(normalized)) {
    return [
      ex("Please put the clean cups on the top shelf above the small sink.", "请把干净的杯子放到小水池上方最上层的架子上。"),
      ex("A tall man with a blue bag was waiting outside the shop near our school.", "一个背蓝色包的高个子男人正在我们学校附近那家店外等。"),
      ex("After lunch we walked through the park and across the bridge to the museum.", "午饭后我们穿过公园，又过了桥，走到了博物馆。"),
    ];
  }

  if (normalized.includes("a / an") || normalized.includes("a/an")) {
    return [
      ex("A young doctor gave us a talk about sleep, and an older teacher wrote the key points down.", "一位年轻医生给我们做了睡眠讲座，一位年长老师把重点记了下来。"),
      ex("I saw a small dog under the chair and an orange bag beside the door.", "我看见椅子下有一只小狗，门边还有一个橙色的包。"),
      ex("She bought a useful map and an extra pen before the class trip began.", "班级出行开始前，她买了一张有用的地图和一支备用笔。"),
    ];
  }

  if (normalized.includes("可数") || normalized.includes("不可数")) {
    return [
      ex("We still need some paper, a little glue, and three clean boxes for the art task.", "美术任务里，我们还需要一些纸、一点胶水和三个干净盒子。"),
      ex("There isn't much milk left, but there are enough eggs for breakfast.", "牛奶剩得不多了，但做早饭的鸡蛋还够。"),
      ex("How much time do we have, and how many pages do we need to read tonight?", "我们还有多少时间？今晚还要读多少页？"),
    ];
  }

  if (normalized.includes("this/that") || normalized.includes("one/ones") || normalized.includes("some 与 any") || normalized.includes("both") || normalized.includes("much") || normalized.includes("few")) {
    return [
      ex("These gloves are warmer than those, but the black ones fit me better when I ride home.", "这些手套比那些更暖，但我骑车回家时黑色那副更合手。"),
      ex("We have a few clean cups left, but we do not have any large plates.", "我们还剩几个干净杯子，但已经没有大盘子了。"),
      ex("Both answers look possible at first, yet only this one matches the whole story.", "这两个答案乍看都像对的，但只有这个和整段意思一致。"),
    ];
  }

  if (normalized.includes("词序") || normalized.includes("always") || normalized.includes("still") || normalized.includes("give me")) {
    return [
      ex("She almost always finishes the hard questions first, and then she checks the easy ones again.", "她几乎总是先做完难题，然后再把简单题检查一遍。"),
      ex("Please send me the photo after dinner, because I still need it for the class board.", "晚饭后请把照片发给我，因为我还要把它用在班级展示板上。"),
      ex("My father still gets up early, even when he goes to bed very late.", "即使睡得很晚，我爸爸还是会早起。"),
    ];
  }

  if (normalized.includes("短语动词") || normalized.includes("put on") || normalized.includes("run away")) {
    return [
      ex("Please take off your wet shoes before you walk into the hall, and then hang up your coat.", "进礼堂前请先脱下湿鞋，然后把外套挂起来。"),
      ex("He picked up the note, looked at it twice, and then put it back on the desk.", "他捡起纸条，看了两遍，然后又放回桌上。"),
      ex("The little dog ran away at first, but it came back when the boy called softly.", "那只小狗一开始跑开了，但男孩轻声叫它时，它又回来了。"),
    ];
  }

  return [
    ex("Use this grammar in a longer sentence about school, home, or a weekend plan.", "把这个语法放进一个更长的句子里，场景可以是学校、家里或周末计划。"),
    ex("Say the same idea again, but change both the person and the time.", "把同一个意思再说一遍，但人物和时间都换掉。"),
    ex("Try one sentence with because or when so the idea becomes more complete.", "试着加上 because 或 when，让句子意思更完整。"),
  ];
}

function buildPracticeCards(unit: GrammarUnit): GrammarPracticeCard[] {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();
  const firstPattern = unit.patterns[0] ?? "Make one more sentence with this grammar.";
  const cards: GrammarPracticeCard[] = [
    {
      label: "换内容",
      task: "保持句型不变，只换人物、地点、时间或数量。",
      sample: firstPattern,
      hint: "先照着说一遍，再改一个信息重新说。",
    },
  ];

  if (/疑问|question|\?/.test(normalized)) {
    cards.push({
      label: "问答配对",
      task: "先自己提问，再用完整句回答。",
      sample: "Is he ready? Yes, he is. / No, he isn't.",
      hint: "回答别只停在 Yes 或 No。",
    });
  }

  if (/否定|don't|doesn't|didn't|isn't|aren't|haven't|can't|mustn't/.test(normalized)) {
    cards.push({
      label: "肯否转换",
      task: "把肯定句改成否定句，再说回肯定句。",
      sample: "She likes math. -> She doesn't like math.",
      hint: "注意 not 和助动词的位置。",
    });
  }

  if (normalized.includes("一般现在时")) {
    cards.push({
      label: "三单训练",
      task: "把 I / we 句换成 he / she 句。",
      sample: "I walk home. -> He walks home.",
      hint: "第三人称单数常要加 -s 或 -es。",
    });
  }

  if (normalized.includes("现在进行时")) {
    cards.push({
      label: "看图描述",
      task: "用 be + doing 说眼前正在发生的动作。",
      sample: "The girls are drawing on the board.",
      hint: "先看谁在做，再说正在做什么。",
    });
  }

  if (normalized.includes("一般过去时") || normalized.includes("过去进行时") || normalized.includes("used to")) {
    cards.push({
      label: "时间替换",
      task: "把 today / now 换成 yesterday / last night 再造句。",
      sample: "We play outside. -> We played outside yesterday.",
      hint: "过去时间要和过去形式一起出现。",
    });
  }

  if (/比较|than|as\.\.\.as|最高级/.test(normalized)) {
    cards.push({
      label: "比较扩展",
      task: "换两样新的东西做比较。",
      sample: "My bag is heavier than yours.",
      hint: "比较对象两边都要说清楚。",
    });
  }

  if (/can|could|should|must|have to|need to|will|might/.test(normalized)) {
    cards.push({
      label: "建议表达",
      task: "把规则、建议或计划说成一整句。",
      sample: "We should line up quietly before class.",
      hint: "先想“该做什么”，再补场景。",
    });
  }

  if (/because|when|if|who|which|that|定语从句/.test(normalized)) {
    cards.push({
      label: "连句练习",
      task: "把两个短句连成一个长句。",
      sample: "I stayed inside because it was raining.",
      hint: "先想清楚两句之间的关系。",
    });
  }

  cards.push({
    label: "口头复述",
    task: "把第一条例句换成你自己的校园或家庭场景。",
    sample: unit.examples[0]?.english ?? "Use the first example and change the scene.",
    hint: "不必全换，只改最重要的 1 到 2 个信息。",
  });

  return cards.slice(0, 4);
}

function buildLearningGuide(unit: GrammarUnit): GrammarLearningGuide {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();
  const firstPattern = unit.patterns[0] ?? unit.title;
  const baseCopy =
    "学习这个知识点时，不要只背中文意思，要先判断它在句子里承担什么作用，再把结构放回完整语境中检查。";

  let focus = "句子结构";
  let learningCopy = `${baseCopy}${unit.summary} 训练时先读完整句，再定位关键词，最后用一个自己的生活场景重新说一遍。`;
  let keyMoves = [
    "先看句子想表达的是状态、动作、数量、地点还是原因。",
    "再找主语、时间词和关键词，判断需要哪一种语法结构。",
    `最后套入常用句型：${firstPattern}，并把句子读顺。`,
  ];
  let checkpoints = [
    "主语和动词形式是否一致。",
    "时间词、地点词或数量词是否和语法结构匹配。",
    "句子读出来是否完整自然，不只剩一个孤立答案。",
  ];

  if (/there is|there are|there was|there will be|there has/.test(normalized)) {
    focus = "there be 存在句";
    learningCopy =
      "这一类句子专门用来说明“某处有某物”或“某时会有某事”。学习时先找地点或时间，再看后面的名词是单数还是复数，最后决定 is、are、was、were 或 will be。";
    keyMoves = [
      "先圈出地点或时间，例如 in the room、next Friday。",
      "再看真正被介绍的名词，单数用 is / was，复数用 are / were。",
      "如果是将来发生，用 there will be，不要受后面名词影响乱改 will。",
    ];
    checkpoints = [
      "不要把 there 当成真正主语，真正决定形式的是后面的名词。",
      "地点短语通常放在句末，读题时要把句子读完整。",
      "否定和疑问句也要保持 there be 的结构。",
    ];
  } else if (/am \/ is \/ are|was \/ were|be 动词|be /.test(normalized)) {
    focus = "be 动词搭配";
    learningCopy =
      "be 动词的核心是说明身份、状态、地点或正在发生的动作。关键不是死记 am、is、are，而是先判断主语是谁，再看句子是不是现在、过去或正在进行。";
    keyMoves = [
      "先找主语：I 配 am，he / she / it 或单数名词配 is，you / we / they 或复数名词配 are。",
      "再看时间：过去状态用 was / were，正在进行用 be + 动词 ing。",
      "疑问句把 be 动词提前，回答时也用同一个 be 动词。",
    ];
    checkpoints = [
      "不要把 be 原形直接放在普通主语后面。",
      "看到复数名词或 they，要优先想到 are / were。",
      "疑问句和回答要保持同一套 be 动词。",
    ];
  } else if (/doing|ing|present continuous|past continuous/.test(normalized)) {
    focus = "进行时";
    learningCopy =
      "进行时用来强调动作正在发生，结构重点是“be 动词 + 动词 ing”。做题时先判断动作是不是正在进行，再根据主语选择 am、is、are、was 或 were。";
    keyMoves = [
      "先找 now、Look、Listen、at that time 等动作进行的提示。",
      "再根据主语选择正确的 be 动词。",
      "最后检查动词是否变成 ing 形式，不能只写原形。",
    ];
    checkpoints = [
      "有 be 还不够，后面的动作必须用 ing。",
      "不要把习惯动作误判成正在进行。",
      "疑问句把 be 提到主语前，动词 ing 保持不变。",
    ];
  } else if (/do you|does|don't|doesn't|do \/ work \/ like|一般现在/.test(normalized)) {
    focus = "一般现在时";
    learningCopy =
      "一般现在时表达习惯、事实和经常发生的事情。它最容易错在第三人称单数：主语变成 he、she、it 或单数名词时，动词和助动词都要跟着变。";
    keyMoves = [
      "先找 every day、usually、often 等习惯性时间词。",
      "再判断主语是不是第三人称单数。",
      "肯定句注意动词 -s / -es，否定和疑问句用 do / does 后接动词原形。",
    ];
    checkpoints = [
      "用了 does / doesn't 后，后面的实义动词要回到原形。",
      "I / you / we / they 不用 does。",
      "不要把 now 的正在动作误写成一般现在时。",
    ];
  } else if (/did|worked|went|used to|过去|last |yesterday|ago/.test(normalized)) {
    focus = "过去时间线";
    learningCopy =
      "过去相关结构都要先建立时间线：事情发生在过去、是否已经结束、当时是否正在进行。判断清楚时间线后，再选择一般过去时、过去进行时或 used to。";
    keyMoves = [
      "先圈出 yesterday、last week、ago、when 等过去提示。",
      "已完成的动作用一般过去时，过去某一刻正在做用 was / were + ing。",
      "否定和疑问句用 did 后，实义动词回到原形。",
    ];
    checkpoints = [
      "不要在 did 后继续使用过去式。",
      "was / were 后接 ing 时，强调当时正在进行。",
      "used to 表示过去常常如此，现在未必如此。",
    ];
  } else if (/have done|has done|already|yet|ever|never|since|for|present perfect/.test(normalized)) {
    focus = "现在完成时";
    learningCopy =
      "现在完成时关注“过去发生的事对现在仍有影响”。它不是单纯讲过去，而是把过去和现在连起来，所以要特别留意 already、yet、ever、for、since 等信号。";
    keyMoves = [
      "先判断结果是否和现在有关。",
      "再根据主语选择 have 或 has，并使用过去分词。",
      "遇到 for / since 时，分清一段时间和起点时间。",
    ];
    checkpoints = [
      "has 只给第三人称单数使用。",
      "already 常用于肯定，yet 常用于否定和疑问。",
      "不要把现在完成时简单当成一般过去时。",
    ];
  } else if (/will|shall|going to|might|can|could|should|must|have to|need to/.test(normalized)) {
    focus = "情态与计划表达";
    learningCopy =
      "情态动词和计划表达用来说明能力、可能、建议、义务或将来安排。学习时先问自己：这句话是在说能不能、应不应该、必须不必须，还是将要发生。";
    keyMoves = [
      "先判断语气：能力、建议、规则、可能性或计划。",
      "情态动词后面接动词原形，不随主语变形。",
      "be going to 强调计划，will 更常用于预测或临时决定。",
    ];
    checkpoints = [
      "can / should / must 后不要加 to。",
      "have to 会随主语变成 has to。",
      "might 表示可能性，不等于一定会发生。",
    ];
  } else if (/a \/ an|a\/an|the|some|any|much|many|few|little|single|plural|mine|myself|my \/ his/.test(normalized)) {
    focus = "名词与限定词";
    learningCopy =
      "名词、冠词、代词和数量词的重点是先看名词能不能数、是不是特指、是否单复数一致。判断越细，选项越不容易混。";
    keyMoves = [
      "先判断名词是可数还是不可数。",
      "再看是否特指：第一次提到常用 a / an，已知对象常用 the。",
      "最后检查代词、数量词和名词单复数是否一致。",
    ];
    checkpoints = [
      "a / an 不能直接修饰复数名词或不可数名词。",
      "some 多用于肯定句，any 常用于否定和疑问句。",
      "much 修饰不可数，many 修饰可数复数。",
    ];
  } else if (/than|as\.\.\.as|more|most|enough|too|形容词|副词|比较/.test(normalized)) {
    focus = "形容词副词与比较";
    learningCopy =
      "形容词和副词要先分清修饰对象：修饰名词多用形容词，修饰动作多用副词。比较结构要把比较双方说完整，最高级要看比较范围。";
    keyMoves = [
      "先看被修饰的是名词还是动词。",
      "有 than 时用比较级，有 of / in 等范围时常用最高级。",
      "too 表示过于，enough 表示足够，位置和意思都要检查。",
    ];
    checkpoints = [
      "不要用 good 修饰动作，通常要用 well。",
      "比较级后面常接 than。",
      "最高级前常有 the，但副词最高级要看具体结构。",
    ];
  } else if (/because|when|if|who|which|that|said that|told me that/.test(normalized)) {
    focus = "从句与连接";
    learningCopy =
      "从句类知识点的核心是把两个意思连接成一个更完整的句子。先判断两句话之间是原因、时间、条件、转述还是修饰关系，再选择连接词和语序。";
    keyMoves = [
      "先找两层意思：主句说什么，从句补充什么。",
      "原因用 because，时间用 when，条件用 if，修饰名词常用 who / which / that。",
      "转述句要注意人称、时态和语序的变化。",
    ];
    checkpoints = [
      "because 和 so 通常不要在同一句里重复使用。",
      "if 引导条件时，主句和从句的时态要配合。",
      "定语从句要紧跟被修饰的名词。",
    ];
  } else if (/at |in |on |behind|under|through|with|look at|listen to|put on|run away|介词|短语动词/.test(normalized)) {
    focus = "介词与固定搭配";
    learningCopy =
      "介词和短语动词不能只靠中文直译，要放在具体场景里记。学习时先判断时间、地点、方向或动作搭配，再把整个短语当作一个整体使用。";
    keyMoves = [
      "先判断介词表达时间、地点、方向还是方式。",
      "遇到固定搭配时，把动词和小词一起记。",
      "短语动词后接代词时，注意代词常放在中间。",
    ];
    checkpoints = [
      "不要把中文里的“在”全部翻成 in。",
      "on / in / at 的时间和地点范围不同。",
      "look at、listen to 这类搭配要整体记。",
    ];
  }

  const teacherScript = [
    `现在我们学习 Unit ${unit.id}：${unit.title}。`,
    `这一讲的重点是${focus}。`,
    learningCopy,
    `做题时按三步来：第一，判断句子场景；第二，找主语、时间词和关键词；第三，套入结构后把整句读一遍。`,
    `下面的句型和例句都可以单独点播放，建议先听一遍，再自己跟读一遍。`,
  ].join("");

  return {
    headline: `${unit.title}：先懂用法，再套句型`,
    learningCopy,
    teacherScript,
    keyMoves,
    checkpoints,
  };
}

function buildDisplayExamples(unit: GrammarUnit): GrammarExample[] {
  return dedupeExamples([
    ...buildChallengeExamples(unit),
    ...buildExtraExamples(unit),
    ...buildScenarioExamples(unit),
  ]).slice(0, 7);
}

function countRichGrammarExamples(): number {
  return ENGLISH_GRAMMAR_CHAPTERS.reduce(
    (sum, chapter) =>
      sum +
      chapter.units.reduce(
        (chapterSum, unit) => chapterSum + buildDisplayExamples(unit).length,
        0
      ),
    0
  );
}

function grammarUnitMatchesSearch(unit: GrammarUnit, searchText: string): boolean {
  const formCards = buildFormCards(unit);
  const practiceCards = buildPracticeCards(unit);
  const displayExamples = buildDisplayExamples(unit);
  const learningGuide = buildLearningGuide(unit);
  const haystack = [
    unit.title,
    unit.summary,
    ...unit.patterns,
    learningGuide.headline,
    learningGuide.learningCopy,
    learningGuide.teacherScript,
    ...learningGuide.keyMoves,
    ...learningGuide.checkpoints,
    ...formCards.flatMap((formCard) => [formCard.label, formCard.value, formCard.hint]),
    ...practiceCards.flatMap((practiceCard) => [
      practiceCard.label,
      practiceCard.task,
      practiceCard.sample,
      practiceCard.hint,
    ]),
    ...displayExamples.flatMap((example) => [example.english, example.chinese]),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(searchText);
}

const GRAMMAR_QUIZ_DIFFICULTY_COUNTS: Record<GrammarDifficulty, number> = {
  medium: 200,
  hard: 200,
  super: 100,
};

const GRAMMAR_QUIZ_COUNT_PER_UNIT = Object.values(GRAMMAR_QUIZ_DIFFICULTY_COUNTS).reduce(
  (sum, count) => sum + count,
  0
);

const MIXED_GRAMMAR_QUIZ_TOTAL = 1000;
const MIXED_GRAMMAR_SESSION_SIZE = 100;
const MIXED_GRAMMAR_SESSION_COUNT = Math.ceil(
  MIXED_GRAMMAR_QUIZ_TOTAL / MIXED_GRAMMAR_SESSION_SIZE
);

const GRAMMAR_DIFFICULTIES: {
  value: GrammarDifficulty;
  label: string;
  hint: string;
}[] = [
  { value: "medium", label: "基础选择", hint: "200 题 · 句子、对话、情景选择" },
  { value: "hard", label: "变式选择", hint: "200 题 · 换场景考同一语法点" },
  { value: "super", label: "综合选择", hint: "100 题 · 短上下文和句型变式" },
];

const GRAMMAR_DIFFICULTY_META: Record<GrammarDifficulty, { label: string; badge: string }> = {
  medium: { label: "基础选择", badge: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  hard: { label: "变式选择", badge: "bg-amber-50 text-amber-700 ring-amber-100" },
  super: { label: "综合选择", badge: "bg-sky-50 text-sky-700 ring-sky-100" },
};

const GRAMMAR_QUESTION_KIND_META: Record<GrammarQuestionKind, { label: string; badge: string }> = {
  sentence: { label: "句子选择", badge: "bg-slate-100 text-slate-700 ring-slate-200" },
  dialogue: { label: "对话选择", badge: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  scenario: { label: "情景选择", badge: "bg-amber-50 text-amber-700 ring-amber-100" },
  mini_context: { label: "短文选择", badge: "bg-sky-50 text-sky-700 ring-sky-100" },
  pattern: { label: "变式选择", badge: "bg-violet-50 text-violet-700 ring-violet-100" },
};

const GRAMMAR_KIND_SEQUENCE: Record<GrammarDifficulty, GrammarQuestionKind[]> = {
  medium: ["sentence", "dialogue", "scenario", "sentence", "pattern"],
  hard: ["scenario", "pattern", "dialogue", "mini_context", "sentence"],
  super: ["mini_context", "scenario", "pattern", "dialogue", "sentence"],
};

function normalizeSentence(sentence: string): string {
  return sentence.replace(/\s+/g, " ").trim();
}

function seededNumber(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function shuffleBySeed<T>(items: T[], seed: number): T[] {
  return [...items]
    .map((item, index) => ({ item, order: seededNumber(seed + index * 37) }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

type QuizTemplate = {
  stem: string;
  answer: string;
  distractors: string[];
  note: string;
};

const qt = (stem: string, answer: string, distractors: string[], note: string): QuizTemplate => ({
  stem,
  answer,
  distractors,
  note,
});

const TEMPLATE_SLOTS: Record<GrammarDifficulty, Record<string, string[]>> = {
  medium: {
    name: ["Tom", "Amy", "Lucy", "Ben", "Nina", "Leo", "Mike", "Lily"],
    plural: ["the children", "my friends", "the students", "we", "they", "the boys"],
    place: ["the classroom", "the library", "the park", "the kitchen", "school", "home"],
    object: ["book", "bag", "pencil", "pen", "photo", "ball", "cup", "box"],
    objectPlural: ["books", "bags", "pencils", "pens", "photos", "balls", "cups", "boxes"],
    food: ["bread", "rice", "water", "milk", "fruit", "eggs", "apples"],
    adjective: ["happy", "ready", "tired", "quiet", "careful", "clean", "cold"],
    time: ["today", "now", "yesterday", "every day", "last night", "this morning"],
  },
  hard: {
    name: ["Jack", "Mary", "Sam", "Anna", "David", "Grace", "Tony", "Kate"],
    plural: ["my classmates", "the players", "the teachers", "the girls", "my parents", "our friends"],
    place: ["the music room", "the bus stop", "the zoo", "the shop", "the playground", "the dining room"],
    object: ["notebook", "story book", "toy", "bike", "map", "letter", "key", "cake"],
    objectPlural: ["notebooks", "story books", "toys", "bikes", "maps", "letters", "keys", "cakes"],
    food: ["noodles", "cakes", "tea", "juice", "chicken", "fish", "vegetables"],
    adjective: ["busy", "early", "late", "warm", "young", "old", "easy", "hard"],
    time: ["this morning", "last weekend", "before dinner", "after class", "on Monday", "next week"],
  },
  super: {
    name: ["Peter", "Helen", "John", "May", "Eric", "Jane", "Paul", "Susan"],
    plural: ["the children", "the students", "the singers", "the runners", "the family", "the class"],
    place: ["the art room", "the sports field", "the school gate", "the book shop", "the small garden", "the dining hall"],
    object: ["picture", "school bag", "watch", "shirt", "card", "toy car", "water bottle", "homework"],
    objectPlural: ["pictures", "school bags", "watches", "shirts", "cards", "toy cars", "water bottles", "homework books"],
    food: ["soup", "cakes", "milk", "rice", "bread", "fruit", "water"],
    adjective: ["kind", "safe", "right", "wrong", "slow", "fast", "strong", "weak"],
    time: ["after school", "before lunch", "while we waited", "when class began", "after the game", "before bed"],
  },
};

function pickBySeed<T>(items: T[], seed: number): T {
  return items[Math.floor(seededNumber(seed) * items.length) % items.length];
}

function uniqueTexts(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeSentence(item).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function endWithPeriod(note: string): string {
  const trimmed = note.trim();
  return trimmed.endsWith("。") ? trimmed : `${trimmed}。`;
}

function simplifySubjectPhrase(subject: string): string {
  return subject
    .replace(/\s+/g, " ")
    .replace(/^(and|but|so)\s+/i, "")
    .replace(/^(today|usually|now|then|yesterday)\s+/i, "")
    .trim();
}

function extractSubjectBeforeBlank(prompt: string): string {
  const beforeBlank = prompt.split("____")[0]?.trim() ?? "";
  if (!beforeBlank) return "";

  const lastPart = beforeBlank
    .split(/[,;.!?]\s*/)
    .filter(Boolean)
    .pop() ?? beforeBlank;

  return simplifySubjectPhrase(lastPart);
}

function extractSubjectAfterBlank(prompt: string): string {
  const afterBlank = prompt.split("____")[1]?.trim() ?? "";
  if (!afterBlank) return "";

  const words = afterBlank.replace(/[?.!,]/g, "").split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  const second = words[1] ?? "";
  if (!first) return "";
  if (/^(the|my|your|our|his|her|this|that)$/i.test(first) && second) {
    return `${first} ${second}`;
  }

  return first;
}

function extractBlankSubject(prompt: string): string {
  return extractSubjectBeforeBlank(prompt) || extractSubjectAfterBlank(prompt);
}

function isPluralSubject(subject: string): boolean {
  const lower = subject.toLowerCase();
  return (
    /^(you|we|they)$/.test(lower) ||
    /\b(children|people|friends|students|boys|girls|players|teachers|parents|classmates|runners|singers|photos|books|bags|pencils|pens|balls|cups|boxes|notebooks|toys|bikes|maps|letters|keys|cakes|pictures|shirts|cards|cars|bottles)\b/.test(lower) ||
    /\b\w+s\b/.test(lower)
  );
}

function describeSubject(subject: string): string {
  const lower = subject.toLowerCase();
  if (!subject) return "这句话的主语";
  if (lower === "i") return "主语是 I";
  if (lower === "you") return "主语是 you";
  if (lower === "we" || lower === "they") return `主语是 ${subject}`;
  if (isPluralSubject(subject)) return `${subject} 表示复数或多人`;
  if (/^[A-Z][a-z]+$/.test(subject)) return `${subject} 是一个人名，属于 he/she`;
  return `${subject} 是单数主语`;
}

function getTimeClue(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\b(now|look|listen)\b/.test(lower)) return "题目有 now / Look / Listen，说明动作正在进行";
  if (/\b(yesterday|last night|last weekend|ago)\b/.test(lower)) return "题目有过去时间，说明动作发生在过去";
  if (/\b(every day|every saturday|usually|on monday)\b/.test(lower)) return "题目有习惯性时间，说明用一般现在时";
  if (/\b(tomorrow|next week)\b/.test(lower)) return "题目有将来时间，说明说的是之后的事";
  return "";
}

function describeBeUse(choice: string): string {
  const lower = choice.toLowerCase();
  if (lower === "am") return "am 只和 I 搭配";
  if (lower === "is") return "is 和 he/she/it 或单数主语搭配";
  if (lower === "are") return "are 和 you/we/they 或复数主语搭配";
  if (lower === "be") return "be 是原形，不能直接跟普通主语作谓语";
  if (lower === "was") return "was 表示过去，和 I/he/she/it 或单数主语搭配";
  if (lower === "were") return "were 表示过去，和 you/we/they 或复数主语搭配";
  return "";
}

function parseDoNegative(choice: string): { helper: string; verb: string } | null {
  const match = choice
    .toLowerCase()
    .match(/^(don't|doesn't|didn't|do not|does not|did not)\s+([a-z]+)\b/);

  if (!match) return null;

  return {
    helper: match[1],
    verb: match[2],
  };
}

function parseBeNotVerb(choice: string): { helper: string; verb: string } | null {
  const match = choice
    .toLowerCase()
    .match(/^(am|is|are|was|were)\s+not\s+([a-z]+)\b/);

  if (!match) return null;

  return {
    helper: match[1],
    verb: match[2],
  };
}

function describeDoHelper(helper: string): string {
  if (helper === "don't" || helper === "do not") return "I / you / we / they 或复数主语";
  if (helper === "doesn't" || helper === "does not") return "he / she / it 或单数第三人称";
  if (helper === "didn't" || helper === "did not") return "过去时";
  return "这个主语";
}

function makeGrammarExplanation(prompt: string, answer: string, note: string): string {
  const subject = extractBlankSubject(prompt);
  const subjectDescription = describeSubject(subject);
  const answerLower = answer.toLowerCase();
  const timeClue = getTimeClue(prompt);

  if (/^(am|is|are|was|were)$/i.test(answer)) {
    return `${subjectDescription}，所以这里用 ${answer}。`;
  }

  const beDoing = answerLower.match(/^(am|is|are|was|were)\s+\w+ing\b/);
  if (beDoing) {
    const clue = timeClue ? `${timeClue}，` : "";
    return `${clue}${subjectDescription}，所以用 ${answer}。`;
  }

  if (/^(do|does|did|have|has)$/i.test(answer) || /^don't|^doesn't|^didn't/i.test(answer)) {
    const clue = timeClue ? `${timeClue}；` : "";
    return `${clue}${subjectDescription}，所以这里用 ${answer}。`;
  }

  if (/\b(goes|plays|likes|rises|has)\b/i.test(answer)) {
    const clue = timeClue ? `${timeClue}；` : "";
    return `${clue}${subjectDescription}，动词要跟着主语变化，所以用 ${answer}。`;
  }

  return endWithPeriod(note);
}

function makeWrongChoiceExplanation(prompt: string, answer: string, selected: string): string {
  const subject = extractBlankSubject(prompt);
  const subjectText = subject ? subject : "这里的主语";
  const selectedUse = describeBeUse(selected);
  const answerLower = answer.toLowerCase();
  const selectedLower = selected.toLowerCase();
  const answerDoNegative = parseDoNegative(answer);
  const selectedDoNegative = parseDoNegative(selected);
  const selectedBeNotVerb = parseBeNotVerb(selected);

  if (answerDoNegative && selectedDoNegative) {
    if (selectedDoNegative.verb !== answerDoNegative.verb) {
      return `你选的 ${selected} 错在 ${selectedDoNegative.helper} 后面用了 ${selectedDoNegative.verb}；助动词后面要接动词原形 ${answerDoNegative.verb}。`;
    }

    if (selectedDoNegative.helper !== answerDoNegative.helper) {
      return `${subjectText} 要用 ${answerDoNegative.helper}，不用 ${selectedDoNegative.helper}；${selectedDoNegative.helper} 是给 ${describeDoHelper(selectedDoNegative.helper)} 用的。`;
    }
  }

  if (answerDoNegative && selectedBeNotVerb) {
    return `你选的 ${selected} 是 be 动词否定，后面不能直接接动词原形 ${selectedBeNotVerb.verb}；这题要用 ${answerDoNegative.helper} + ${answerDoNegative.verb}。`;
  }

  if (selectedUse && describeBeUse(answer)) {
    return `你选的 ${selected} 不适合 ${subjectText}：${selectedUse}。`;
  }

  if (answerLower.startsWith("does") && selectedLower.startsWith("do")) {
    return `${subjectText} 是第三人称单数，所以不能用 ${selected}。`;
  }

  if (answerLower.startsWith("do") && selectedLower.startsWith("does")) {
    return `${subjectText} 不是第三人称单数，所以不能用 ${selected}。`;
  }

  if (answerLower.includes("ing") && !selectedLower.includes("ing")) {
    return `题目是在说正在发生的动作，所以不能用 ${selected}。`;
  }

  if (!answerLower.includes("ing") && selectedLower.includes("ing")) {
    return `题目不是“正在做”，所以不能用 ${selected}。`;
  }

  return "";
}

function buildGrammarFeedback(question: GrammarQuizQuestion, selected: string): string {
  const wrongExplanation = selected === question.answer
    ? ""
    : question.choiceExplanations?.[selected] ?? makeWrongChoiceExplanation(question.prompt, question.answer, selected);

  return [question.explanation, wrongExplanation].filter(Boolean).join(" ");
}

const DEFAULT_DISTRACTORS = ["do", "does", "is"];

const TEMPLATE_BANK: Record<string, QuizTemplate[]> = {
  bePresent: [
    qt("I ____ ready for class.", "am", ["is", "are", "be"], "I 后面用 am。"),
    qt("{name} ____ in {place} now.", "is", ["are", "am", "be"], "单数主语后面用 is。"),
    qt("{plural} ____ late today.", "are", ["is", "am", "be"], "复数主语和 you 后面用 are。"),
    qt("The {objectPlural} ____ on the desk.", "are", ["is", "am", "be"], "复数名词作主语时用 are。"),
  ],
  beQuestion: [
    qt("____ you ready?", "Are", ["Is", "Am", "Do"], "be 动词一般疑问句要把 be 放到主语前。"),
    qt("____ {name} at home?", "Is", ["Are", "Am", "Does"], "单数主语提问用 Is。"),
    qt("____ I late?", "Am", ["Is", "Are", "Do"], "I 的 be 动词是 am，疑问句写 Am I...?"),
  ],
  presentContinuous: [
    qt("Look! {name} ____ a picture.", "is drawing", ["draws", "draw", "drawing"], "现在进行时用 be + -ing。"),
    qt("{plural} ____ football now.", "are playing", ["play", "plays", "played"], "复数主语现在进行时用 are + -ing。"),
    qt("I ____ for my {object}.", "am looking", ["look", "looks", "looking"], "I 的现在进行时用 am + -ing。"),
  ],
  presentContinuousQuestion: [
    qt("____ you listening to me?", "Are", ["Do", "Is", "Does"], "现在进行时疑问句把 be 动词提前。"),
    qt("What ____ {plural} doing?", "are", ["is", "do", "does"], "主语是复数时用 are doing。"),
    qt("____ {name} studying now?", "Is", ["Does", "Are", "Do"], "单数主语现在进行时疑问句用 Is。"),
  ],
  presentSimple: [
    qt("{name} ____ to school by bus every day.", "goes", ["go", "going", "is going"], "第三人称单数的一般现在时动词常加 -s 或 -es。"),
    qt("{plural} ____ English on Monday.", "have", ["has", "having", "are have"], "复数主语用动词原形。"),
    qt("The sun ____ in the east.", "rises", ["rise", "is rising", "rising"], "客观事实用一般现在时。"),
  ],
  presentSimpleNegative: [
    qt("{name} ____ coffee.", "doesn't drink", ["don't drink", "isn't drink", "doesn't drinks"], "第三人称单数否定用 doesn't + 动词原形。"),
    qt("{plural} ____ late on school days.", "don't stay", ["doesn't stay", "aren't stay", "don't stays"], "复数主语否定用 don't + 动词原形。"),
    qt("I ____ meat.", "don't eat", ["doesn't eat", "am not eat", "don't eats"], "I 的一般现在时否定用 don't。"),
  ],
  presentSimpleQuestion: [
    qt("____ {name} like music?", "Does", ["Do", "Is", "Are"], "第三人称单数一般现在时疑问句用 Does。"),
    qt("Where ____ {plural} live?", "do", ["does", "are", "is"], "复数主语一般现在时疑问句用 do。"),
    qt("____ you walk to school?", "Do", ["Does", "Are", "Is"], "you 的一般现在时疑问句用 Do。"),
  ],
  presentVsContinuous: [
    qt("Usually I walk, but today I ____ the bus.", "am taking", ["take", "takes", "took"], "today 表示临时情况时常用现在进行时。"),
    qt("{name} ____ tennis every Saturday.", "plays", ["is playing", "play", "played"], "every Saturday 表示习惯，用一般现在时。"),
    qt("Listen! Someone ____ outside.", "is singing", ["sings", "sing", "sang"], "Listen! 提示此刻正在发生，用现在进行时。"),
  ],
  have: [
    qt("I ____ two {objectPlural}.", "have", ["has", "am", "having"], "I / you / we / they 用 have。"),
    qt("{name} ____ a new {object}.", "has", ["have", "is have", "having"], "第三人称单数用 has。"),
    qt("____ you got a pen?", "Have", ["Has", "Do", "Are"], "have got 的疑问句把 Have / Has 提前。"),
  ],
  wasWere: [
    qt("The weather ____ cold yesterday.", "was", ["were", "is", "are"], "单数或不可数主语过去状态用 was。"),
    qt("{plural} ____ at {place} last night.", "were", ["was", "are", "is"], "复数主语过去状态用 were。"),
    qt("I ____ tired after the game.", "was", ["were", "am", "are"], "I 的过去式 be 用 was。"),
  ],
  pastSimple: [
    qt("We ____ the museum yesterday.", "visited", ["visit", "visits", "are visiting"], "yesterday 表示过去，规则动词常加 -ed。"),
    qt("{name} ____ a letter last night.", "wrote", ["writes", "write", "written"], "write 的过去式是 wrote。"),
    qt("They ____ home late.", "came", ["come", "comes", "coming"], "come 的过去式是 came。"),
  ],
  pastQuestionNegative: [
    qt("I ____ see John at school yesterday.", "didn't", ["don't", "doesn't", "wasn't"], "一般过去时否定用 didn't + 动词原形。"),
    qt("____ you finish the homework?", "Did", ["Do", "Does", "Were"], "一般过去时疑问句用 Did。"),
    qt("{name} didn't ____ the answer.", "know", ["knew", "knows", "known"], "didn't 后面接动词原形。"),
  ],
  pastContinuous: [
    qt("At eight o'clock, I ____ breakfast.", "was having", ["had", "am having", "have"], "过去某一时刻正在进行，用 was/were + -ing。"),
    qt("{plural} ____ football when it started to rain.", "were playing", ["played", "are playing", "play"], "复数主语过去进行时用 were + -ing。"),
    qt("{name} ____ when I called.", "was sleeping", ["slept", "is sleeping", "sleeps"], "when I called 提供过去时间点。"),
  ],
  pastVsContinuous: [
    qt("When I arrived, {name} ____ dinner.", "was cooking", ["cooked", "cooks", "is cooking"], "背景动作正在进行，用过去进行时。"),
    qt("After dinner, {name} ____ the dishes.", "washed", ["was washing", "washes", "is washing"], "完成的过去动作常用一般过去时。"),
    qt("I ____ my homework when the phone rang.", "was doing", ["did", "do", "have done"], "一个过去动作被另一个动作打断，用过去进行时。"),
  ],
  presentPerfect: [
    qt("I ____ my homework.", "have finished", ["finished", "has finished", "finish"], "现在完成时用 have/has + 过去分词。"),
    qt("{name} ____ her key.", "has lost", ["lost", "have lost", "loses"], "第三人称单数现在完成时用 has + 过去分词。"),
    qt("{plural} ____ the room.", "have cleaned", ["cleaned", "has cleaned", "are cleaning"], "复数主语现在完成时用 have + 过去分词。"),
  ],
  perfectMarkers: [
    qt("I have ____ finished lunch.", "just", ["yet", "ever", "ago"], "just 表示刚刚。"),
    qt("Have you finished ____?", "yet", ["already", "just", "ago"], "yet 常用于疑问句和否定句句末。"),
    qt("{name} has ____ left.", "already", ["yet", "ever", "ago"], "already 表示已经。"),
  ],
  perfectExperience: [
    qt("Have you ____ been to Beijing?", "ever", ["never", "yet", "ago"], "ever 常用于询问经历。"),
    qt("{name} has ____ seen snow.", "never", ["ever", "yet", "ago"], "never 表示从未。"),
    qt("This is the best film I have ____ seen.", "ever", ["never", "ago", "yet"], "最高级后谈经历时常用 ever。"),
  ],
  perfectDuration: [
    qt("How long ____ you lived here?", "have", ["did", "do", "are"], "How long 与现在完成时连用时用 have/has。"),
    qt("{name} has lived here ____ 2020.", "since", ["for", "ago", "during"], "since 后接时间起点。"),
    qt("We have known each other ____ five years.", "for", ["since", "ago", "from"], "for 后接一段时间。"),
  ],
  forSinceAgo: [
    qt("I have known him ____ five years.", "for", ["since", "ago", "during"], "for 后接一段时间。"),
    qt("He moved here two years ____.", "ago", ["since", "for", "before"], "ago 与一般过去时连用。"),
    qt("She has studied here ____ September.", "since", ["for", "ago", "during"], "since 后接起点。"),
  ],
  perfectVsPast: [
    qt("I ____ my homework yesterday.", "did", ["have done", "has done", "do"], "yesterday 要用一般过去时。"),
    qt("I ____ my homework, so I can go out now.", "have done", ["did", "do", "was doing"], "过去动作影响现在，用现在完成时。"),
    qt("{name} ____ to London in 2022.", "went", ["has gone", "goes", "has been"], "具体过去时间用一般过去时。"),
  ],
  passive: [
    qt("This room ____ every day.", "is cleaned", ["cleans", "cleaned", "is cleaning"], "被动语态用 be + 过去分词。"),
    qt("The window ____ broken yesterday.", "was", ["is", "has", "were"], "过去被动语态用 was/were + 过去分词。"),
    qt("The letter has ____ sent.", "been", ["be", "being", "was"], "现在完成时被动语态用 has/have been done。"),
  ],
  futureGoing: [
    qt("I ____ visit my aunt tomorrow.", "am going to", ["go to", "went to", "going"], "be going to 表示计划或打算。"),
    qt("Look at the clouds. It ____ rain.", "is going to", ["will to", "goes to", "is"], "根据现在迹象预测常用 be going to。"),
    qt("{plural} ____ have a test next week.", "are going to", ["is going to", "will to", "going"], "主语是复数时用 are going to。"),
  ],
  futureWill: [
    qt("I think it ____ be sunny tomorrow.", "will", ["is going", "does", "was"], "will 常用于预测。"),
    qt("____ I open the window?", "Shall", ["Will", "Do", "Am"], "Shall I...? 可用于主动提出做某事。"),
    qt("Don't worry. I ____ help you.", "will", ["am", "was", "do"], "临时决定或愿意帮忙常用 will。"),
  ],
  modal: [
    qt("Take an umbrella. It ____ rain later.", "might", ["must", "should", "can"], "might 表示可能。"),
    qt("You ____ touch that wire. It is dangerous.", "mustn't", ["don't need to", "should", "can"], "mustn't 表示禁止。"),
    qt("You look tired. You ____ go to bed early.", "should", ["mustn't", "might", "can"], "should 表示建议。"),
    qt("I ____ get up early tomorrow.", "have to", ["mustn't", "can", "might"], "have to 表示客观需要。"),
    qt("____ you like some tea?", "Would", ["Do", "Are", "Have"], "Would you like...? 是礼貌邀请。"),
    qt("When I was five, I ____ swim.", "couldn't", ["can't", "mustn't", "don't"], "could/couldn't 表示过去能力。"),
  ],
  imperative: [
    qt("____ quiet, please.", "Be", ["Are", "Do", "You"], "祈使句用动词原形开头。"),
    qt("____ run in the classroom.", "Don't", ["Doesn't", "No", "Not"], "否定祈使句用 Don't + 动词原形。"),
    qt("____ do this exercise together.", "Let's", ["Let", "We", "Shall"], "Let's + 动词原形表示一起做。"),
  ],
  usedTo: [
    qt("My father ____ live in a small village.", "used to", ["uses to", "is used to", "use to"], "used to 表示过去常常。"),
    qt("We didn't ____ play computer games.", "use to", ["used to", "using to", "uses to"], "否定句 did not 后用 use to。"),
    qt("Did you ____ walk to school?", "use to", ["used to", "using to", "uses to"], "疑问句 Did 后用 use to。"),
  ],
  thereIt: [
    qt("There ____ a book on the desk.", "is", ["are", "am", "be"], "There is 后接单数名词。"),
    qt("There ____ many people at the station.", "are", ["is", "was", "be"], "There are 后接复数名词。"),
    qt("____ is cold today.", "It", ["There", "This", "That"], "谈天气常用 It 作主语。"),
    qt("There ____ be a meeting tomorrow.", "will", ["is", "was", "has"], "There will be 表示将会有。"),
  ],
  auxiliary: [
    qt("I like tea, and my sister ____ too.", "does", ["is", "do", "has"], "第三人称单数用 does 代替前面的动作。"),
    qt("Tom isn't here, ____ he?", "is", ["isn't", "does", "has"], "反意疑问句前否后肯。"),
    qt("I don't like coffee. ____ do I.", "Neither", ["So", "Too", "Either"], "Neither do I 表示我也不。"),
  ],
  questions: [
    qt("____ did you meet yesterday?", "Who", ["Which", "Where", "How"], "问人用 Who。"),
    qt("How long ____ it take to get there?", "does", ["do", "is", "are"], "it 作主语时一般现在时疑问句用 does。"),
    qt("Do you know where she ____?", "lives", ["does live", "live", "is live"], "间接疑问句用陈述语序。"),
    qt("____ book is this?", "Whose", ["Who", "Which", "What"], "询问所属关系用 Whose。"),
  ],
  reported: [
    qt("She said that she ____ tired.", "was", ["is", "has", "were"], "转述过去说的话，时态常后移。"),
    qt("He told me that he ____ busy.", "was", ["is", "has", "will"], "told me 后接 that 从句。"),
    qt("They said they ____ come later.", "would", ["will", "can", "shall"], "直接引语 will 转述时常变 would。"),
  ],
  ingInfinitive: [
    qt("I enjoy ____ music.", "listening to", ["to listen", "listen", "listened"], "enjoy 后接动词 -ing。"),
    qt("I want ____ home.", "to go", ["going", "go", "went"], "want 后常接 to do。"),
    qt("She asked me ____ quiet.", "to be", ["being", "be", "was"], "ask somebody to do something。"),
    qt("I went to the shop ____ some bread.", "to buy", ["buying", "buy", "bought"], "to do 可表示目的。"),
  ],
  commonVerbs: [
    qt("Let's ____ for a walk.", "go", ["get", "make", "have"], "go for a walk 是固定搭配。"),
    qt("I ____ a mistake in the test.", "made", ["did", "had", "got"], "make a mistake 是固定搭配。"),
    qt("She ____ lunch at noon.", "has", ["does", "makes", "gets"], "have lunch 表示吃午饭。"),
    qt("It is getting ____.", "dark", ["darkly", "darkness", "darkerly"], "get + 形容词表示变得。"),
  ],
  pronouns: [
    qt("Please help ____.", "me", ["I", "my", "mine"], "动词后用宾格。"),
    qt("This is ____ book.", "my", ["me", "mine", "I"], "名词前用形容词性物主代词。"),
    qt("This bag is ____.", "mine", ["my", "me", "I"], "单独表示“我的”用名词性物主代词 mine。"),
    qt("{name} cut ____ while cooking.", "herself", ["her", "she", "hers"], "反身代词表示动作回到主语自己身上。"),
    qt("This is ____ camera.", "Kate's", ["Kate", "Kates", "Kates'"], "'s 表示所属关系。"),
  ],
  articlesNouns: [
    qt("I saw ____ elephant.", "an", ["a", "the", "some"], "elephant 以元音音素开头，用 an。"),
    qt("She bought ____ book.", "a", ["an", "some", "any"], "第一次提到一个可数单数名词，用 a/an。"),
    qt("____ sun is bright today.", "The", ["A", "An", "Some"], "独一无二的事物常用 the。"),
    qt("There is ____ water in the bottle.", "some", ["a", "many", "any"], "water 不可数，肯定句常用 some。"),
    qt("I have two ____.", "buses", ["bus", "busies", "buss"], "bus 的复数是 buses。"),
  ],
  determiners: [
    qt("I don't have ____ money.", "any", ["some", "a", "many"], "否定句里常用 any。"),
    qt("____ students passed the test.", "All", ["Every", "Each", "Both"], "students 是复数，all 可直接修饰复数名词。"),
    qt("There is ____ in the room. It is empty.", "nobody", ["somebody", "anybody", "everybody"], "empty 表示没有人。"),
    qt("We have ____ time. Hurry up!", "little", ["few", "many", "a few"], "time 不可数，表示几乎没有用 little。"),
    qt("Do you have ____ questions?", "any", ["some", "a", "much"], "疑问句里问“有没有”常用 any。"),
    qt("____ child needs a pencil.", "Every", ["All", "Both", "Many"], "child 是单数，every 后接单数名词。"),
    qt("____ of the two answers is right.", "Neither", ["All", "Every", "Many"], "两者都不，用 neither。"),
    qt("There are ____ apples in the bag.", "a few", ["a little", "much", "any"], "apples 是可数复数，少量几个用 a few。"),
  ],
  demonstratives: [
    qt("____ is my pencil.", "This", ["These", "Those", "They"], "this 指近处单数。"),
    qt("____ are my shoes.", "These", ["This", "That", "It"], "these 指近处复数。"),
    qt("I like ____ red apple.", "that", ["those", "these", "they"], "apple 是单数，用 this / that。"),
    qt("____ books are on the desk.", "Those", ["That", "This", "It"], "books 是复数，用 these / those。"),
  ],
  oneOnes: [
    qt("This pen is blue. I want the red ____.", "one", ["ones", "it", "them"], "one 代替前面提过的单数名词。"),
    qt("These shoes are old. I like the new ____.", "ones", ["one", "it", "that"], "ones 代替前面提过的复数名词。"),
    qt("Which cup do you want? The small ____.", "one", ["ones", "them", "these"], "cup 是单数，所以用 one。"),
    qt("Which books are yours? The two green ____.", "ones", ["one", "it", "that"], "books 是复数，所以用 ones。"),
  ],
  adjectivesAdverbs: [
    qt("This book is very ____.", "interesting", ["interestingly", "interestedly", "interest"], "be 动词后常接形容词。"),
    qt("She speaks English ____.", "well", ["good", "betterly", "best"], "修饰 speaks 用副词 well。"),
    qt("This bag is ____ than mine.", "heavier", ["heavy", "heaviest", "more heavy"], "than 前常用比较级。"),
    qt("This is ____ bag in the shop.", "the biggest", ["bigger", "big", "biggest"], "最高级前常用 the。"),
    qt("She is old ____ to go alone.", "enough", ["too", "very", "so"], "形容词 + enough 表示足够。"),
    qt("This box is not ____ heavy as that one.", "as", ["than", "so", "too"], "not as ... as 表示“不如……”。"),
    qt("The tea is ____ hot to drink.", "too", ["enough", "very much", "as"], "too + 形容词 + to do 表示“太……而不能”。"),
    qt("This is the ____ story in the book.", "most interesting", ["more interesting", "interesting", "interestingly"], "多音节形容词最高级用 the most + 形容词。"),
  ],
  wordOrder: [
    qt("Choose the correct sentence: ____", "She speaks English very well.", ["She speaks very well English.", "Very well she speaks English.", "She English speaks very well."], "英语基本词序通常是主语 + 谓语 + 宾语/状语。"),
    qt("Choose the correct sentence: ____", "I gave Mary the book.", ["I gave the book Mary.", "I Mary gave the book.", "Gave I Mary the book."], "give 后可以接双宾语：give somebody something。"),
    qt("Choose the correct sentence: ____", "I always get up early.", ["I get up always early.", "Always I get up early.", "I get always up early."], "频率副词常放在实义动词前。"),
    qt("Choose the correct sentence: ____", "Give it to me.", ["Give me it.", "Give to me it.", "It give to me."], "代词 it 作宾语时常用 give it to me。"),
    qt("Choose the correct sentence: ____", "Please put your shoes on.", ["Please put on your shoes them.", "Please your shoes put on.", "Put please your shoes on."], "短语动词和宾语的位置要自然。"),
  ],
  clauses: [
    qt("I was tired, ____ I went to bed early.", "so", ["because", "but", "or"], "so 表示结果。"),
    qt("I stayed at home ____ it rained.", "because", ["so", "but", "or"], "because 表示原因。"),
    qt("Call me ____ you arrive.", "when", ["because", "although", "but"], "when 引导时间状语从句。"),
    qt("If it rains, we ____ at home.", "will stay", ["stay", "stayed", "would stay"], "真实条件句常用 if + 一般现在时，主句用 will。"),
    qt("If I had more time, I ____ learn French.", "would", ["will", "can", "am"], "虚拟条件句常用 would。"),
    qt("The woman ____ lives next door is a nurse.", "who", ["which", "where", "when"], "指人时定语从句可用 who。"),
  ],
  prepositions: [
    qt("The lesson starts ____ eight o'clock.", "at", ["on", "in", "to"], "具体时刻用 at。"),
    qt("We have music ____ Monday.", "on", ["in", "at", "to"], "星期几前用 on。"),
    qt("Flowers bloom ____ spring.", "in", ["on", "at", "to"], "季节前用 in。"),
    qt("The shop is open ____ Monday to Friday.", "from", ["since", "until", "for"], "from ... to 表示从...到...。"),
    qt("Please wait here ____ I come back.", "until", ["since", "for", "during"], "until 表示直到。"),
    qt("Wash your hands ____ lunch.", "before", ["during", "while", "until"], "before 表示在...之前。"),
    qt("The cat is ____ the bed.", "under", ["through", "over", "opposite"], "under 表示在...下面。"),
    qt("We walked ____ the forest.", "through", ["over", "under", "at"], "through 表示穿过内部空间。"),
    qt("{name} is good ____ drawing.", "at", ["in", "on", "for"], "good at 是固定搭配。"),
    qt("Please listen ____ the teacher.", "to", ["at", "for", "with"], "listen to 是固定搭配。"),
  ],
  phrasalVerbs: [
    qt("Please come ____ and sit down.", "in", ["off", "away", "up"], "come in 表示进来。"),
    qt("Turn ____ the light before you leave.", "off", ["on", "up", "away"], "turn off 表示关掉。"),
    qt("Put ____ your coat. It is cold.", "on", ["off", "up", "away"], "put on 表示穿上。"),
    qt("This music is loud. Turn it ____.", "down", ["off", "away", "in"], "turn it down 表示调低音量。"),
    qt("Take ____ your shoes before bed.", "off", ["on", "up", "in"], "take off 表示脱下。"),
    qt("Please put your hat ____.", "on", ["off", "away", "down"], "put on 可以把宾语放在中间或后面。"),
    qt("The boy fell ____ the bike.", "off", ["on", "in", "up"], "fall off 表示从……掉下来。"),
    qt("The dog ran ____ quickly.", "away", ["off", "in", "on"], "run away 表示跑开。"),
  ],
  spellingIrregular: [
    qt("The past tense of go is ____.", "went", ["goed", "gone", "going"], "go 是不规则动词，过去式是 went。"),
    qt("The past participle of see is ____.", "seen", ["saw", "seed", "seeing"], "see 的过去分词是 seen。"),
    qt("The -ing form of make is ____.", "making", ["makeing", "madeing", "makes"], "以不发音 e 结尾的动词加 -ing 常去 e。"),
    qt("The past tense of stop is ____.", "stopped", ["stoped", "stopping", "stops"], "重读闭音节结尾常双写辅音再加 -ed。"),
    qt("She's can mean she is or ____.", "she has", ["she does", "she was", "she have"], "'s 可能表示 is 或 has。"),
  ],
};

const UNIT_TEMPLATE_OVERRIDES: Partial<Record<number, keyof typeof TEMPLATE_BANK>> = {
  24: "spellingIrregular",
  25: "futureGoing",
  30: "modal",
  31: "modal",
  32: "modal",
  33: "modal",
  34: "modal",
  35: "imperative",
  37: "thereIt",
  38: "thereIt",
  39: "thereIt",
  40: "auxiliary",
  41: "auxiliary",
  42: "auxiliary",
  43: "auxiliary",
  44: "questions",
  45: "questions",
  46: "questions",
  47: "questions",
  48: "questions",
  49: "questions",
  59: "pronouns",
  60: "pronouns",
  61: "pronouns",
  62: "pronouns",
  63: "pronouns",
  64: "pronouns",
  65: "articlesNouns",
  66: "articlesNouns",
  67: "articlesNouns",
  68: "articlesNouns",
  69: "articlesNouns",
  70: "articlesNouns",
  71: "commonVerbs",
  72: "articlesNouns",
  73: "articlesNouns",
  74: "demonstratives",
  75: "oneOnes",
  76: "determiners",
  77: "determiners",
  78: "determiners",
  79: "determiners",
  80: "determiners",
  81: "determiners",
  82: "determiners",
  83: "determiners",
  84: "determiners",
  85: "adjectivesAdverbs",
  86: "adjectivesAdverbs",
  87: "adjectivesAdverbs",
  88: "adjectivesAdverbs",
  89: "adjectivesAdverbs",
  90: "adjectivesAdverbs",
  91: "adjectivesAdverbs",
  92: "adjectivesAdverbs",
  93: "adjectivesAdverbs",
  94: "wordOrder",
  95: "perfectMarkers",
  96: "wordOrder",
  103: "prepositions",
  104: "prepositions",
  105: "prepositions",
  106: "prepositions",
  107: "prepositions",
  108: "prepositions",
  109: "prepositions",
  110: "prepositions",
  111: "prepositions",
  112: "prepositions",
  113: "prepositions",
  114: "phrasalVerbs",
  115: "phrasalVerbs",
};

function fillTemplate(text: string, unit: GrammarUnit, serial: number, difficulty: GrammarDifficulty): string {
  const slots = TEMPLATE_SLOTS[difficulty];
  return text.replace(/\{(\w+)\}/g, (_match, key: string, offset: number, fullText: string) => {
    const values = slots[key] ?? TEMPLATE_SLOTS.medium[key] ?? [unit.title];
    const value = pickBySeed(values, unit.id * 1009 + serial * 41 + key.length * 17);
    const startsSentence = offset === 0 || /[.!?]\s*$/.test(fullText.slice(0, offset));
    return startsSentence ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  });
}

function getTemplateKey(unit: GrammarUnit): keyof typeof TEMPLATE_BANK {
  const override = UNIT_TEMPLATE_OVERRIDES[unit.id];
  if (override) return override;

  const title = unit.title.toLowerCase();
  const text = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();

  if (unit.id >= 117 && unit.id <= 120) return "spellingIrregular";
  if (unit.id === 116) return "passive";
  if (unit.id >= 121) return "phrasalVerbs";
  if (title.includes("疑问句") && title.includes("am / is / are")) return "beQuestion";
  if (title.includes("am / is / are")) return "bePresent";
  if (title.includes("are you doing")) return "presentContinuousQuestion";
  if (title.includes("i am doing 与 i do")) return "presentVsContinuous";
  if (title.includes("i am doing") || text.includes("现在进行时")) return "presentContinuous";
  if (title.includes("do you")) return "presentSimpleQuestion";
  if (title.includes("don't")) return "presentSimpleNegative";
  if (title.includes("i do") || text.includes("一般现在时")) return "presentSimple";
  if (title.includes("have...") || title.includes("i've got")) return "have";
  if (title.includes("was / were")) return "wasWere";
  if (title.includes("i was doing 与 i did")) return "pastVsContinuous";
  if (title.includes("i was doing") || text.includes("过去进行时")) return "pastContinuous";
  if (title.includes("didn't") || title.includes("did you")) return "pastQuestionNegative";
  if (title.includes("worked") || text.includes("一般过去时")) return "pastSimple";
  if (title.includes("have done 与 i did")) return "perfectVsPast";
  if (title.includes("for / since / ago")) return "forSinceAgo";
  if (title.includes("how long have")) return "perfectDuration";
  if (title.includes("ever")) return "perfectExperience";
  if (title.includes("just") || title.includes("already") || title.includes("yet")) return "perfectMarkers";
  if (title.includes("have done") || text.includes("现在完成时")) return "presentPerfect";
  if (/is done|was done|being done|has been done|被动/.test(text)) return "passive";
  if (/will\/shall|will|shall/.test(text)) return "futureWill";
  if (/going to|tomorrow/.test(text)) return "futureGoing";
  if (/might|can|could|must|should|have to|would you like|情态动词/.test(text)) return "modal";
  if (/do this|don't do|let's/.test(text)) return "imperative";
  if (title.includes("used to")) return "usedTo";
  if (/there|it \.\.\.|there will be/.test(text)) return "thereIt";
  if (/too\/either|neither|so am|have you|are you|don't you|助动词|否定句/.test(text)) return "auxiliary";
  if (/who saw|who did|what|which|how long|where|疑问句/.test(text)) return "questions";
  if (text.includes("间接引语") || title.includes("said that") || title.includes("told me")) return "reported";
  if (/work\/working|to do|doing|want somebody|动词 -ing|不定式/.test(text)) return "ingInfinitive";
  if (/go \/ get \/ do \/ make \/ have|go to|go on|go for|go -ing|do 与 make|have$/.test(text)) return "commonVerbs";
  if (/i\/me|my\/his|mine|myself|'s|所有格|代词/.test(text)) return "pronouns";
  if (text.includes("短语动词") || title.includes("put on")) return "phrasalVerbs";
  if (
    text.includes("介词") ||
    /\bat\b|\bon\b|\bin\b|\bto\b|from|until|since|for|before|after|during|while|under|behind|opposite|through|over|by|with|about|listen to|look at|good at|afraid of|in \/ at \/ on|to \/ in \/ at/.test(text)
  ) return "prepositions";
  if (title.includes("who") || title.includes("which") || title.includes("when") || title.includes("if ") || /and|but|because|定语从句|从句/.test(text)) return "clauses";
  if (text.includes("词序") || title.includes("give me") || title.includes("always")) return "wordOrder";
  if (/形容词|副词|older|bigger|biggest|than|enough|too|well/.test(text)) return "adjectivesAdverbs";
  if (/\bsome\b|\bany\b|\bevery\b|\ball\b|\bboth\b|\beither\b|\bneither\b|\bmuch\b|\bmany\b|\blittle\b|\bfew\b|限定词/.test(text)) return "determiners";
  if (/a \/ an|\bthe\b|单数|复数|可数|不可数|名词/.test(text)) return "articlesNouns";

  return "presentSimple";
}

type FilledQuizTemplate = {
  stem: string;
  answer: string;
  distractors: string[];
  sourceSentence: string;
  explanation: string;
};

const GRAMMAR_SCENARIO_PROMPTS = [
  "课堂练习里出现了这句话，空格处应该选什么？",
  "老师让学生补全这句英文，选最自然的一项。",
  "做练习册时遇到这句，空格处选哪一个？",
  "根据这句话的主语和语境，选正确形式。",
  "把这句英文说完整，空格处应该填哪一项？",
];

const GRAMMAR_DIALOGUE_PROMPTS = [
  "A: 这里应该怎么填？\nB: {stem}",
  "A: 哪个选项最合适？\nB: {stem}",
  "A: 请把这句英文补完整。\nB: {stem}",
  "A: 这句话要注意语法形式。\nB: {stem}",
];

function makeSourceSentence(stem: string, answer: string): string {
  return stem.includes("Choose the correct sentence") ? answer : stem.replace("____", answer);
}

function getFilledQuizTemplate(
  unit: GrammarUnit,
  index: number,
  difficulty: GrammarDifficulty
): FilledQuizTemplate {
  const templateKey = getTemplateKey(unit);
  const templates = TEMPLATE_BANK[templateKey] ?? TEMPLATE_BANK.presentSimple;
  const template = templates[(index + unit.id) % templates.length];
  const stem = fillTemplate(template.stem, unit, index, difficulty);
  const answer = fillTemplate(template.answer, unit, index, difficulty);
  const distractors = template.distractors.map((option) => fillTemplate(option, unit, index, difficulty));
  const sourceSentence = makeSourceSentence(stem, answer);
  const explanation = makeGrammarExplanation(stem, answer, template.note);

  return { stem, answer, distractors, sourceSentence, explanation };
}

function getQuestionKind(unit: GrammarUnit, index: number, difficulty: GrammarDifficulty): GrammarQuestionKind {
  const sequence = GRAMMAR_KIND_SEQUENCE[difficulty];
  return sequence[(index + unit.id) % sequence.length];
}

function explainWrongChoice(prompt: string, answer: string, selected: string): string {
  if (selected === answer) return "";

  return (
    makeWrongChoiceExplanation(prompt, answer, selected) ||
    `你选的 ${selected} 不符合这题的语法位置；这里应使用 ${answer}。`
  );
}

function buildPhraseChoiceExplanations(
  stem: string,
  answer: string,
  options: string[]
): Record<string, string> {
  return options.reduce<Record<string, string>>((explanations, option) => {
    if (option !== answer) {
      explanations[option] = explainWrongChoice(stem, answer, option);
    }
    return explanations;
  }, {});
}

function buildChoicePrompt(
  data: FilledQuizTemplate,
  unit: GrammarUnit,
  index: number,
  difficulty: GrammarDifficulty,
  kind: GrammarQuestionKind
): { instruction: string; prompt: string } {
  const isSentenceChoice = data.stem.includes("Choose the correct sentence");
  const scenario = pickBySeed(GRAMMAR_SCENARIO_PROMPTS, unit.id * 13 + index * 7);
  const dialogue = pickBySeed(GRAMMAR_DIALOGUE_PROMPTS, unit.id * 17 + index * 11);
  const example = unit.examples[(index + unit.id) % Math.max(1, unit.examples.length)]?.english;
  const pattern = unit.patterns[index % Math.max(1, unit.patterns.length)];

  if (isSentenceChoice) {
    return {
      instruction: "四选一：选出语序或表达最正确的一句。",
      prompt: "哪一句英文最自然、语法最正确？",
    };
  }

  if (kind === "dialogue") {
    return {
      instruction: "四选一：读对话，选空格处最合适的答案。",
      prompt: dialogue.replace("{stem}", data.stem),
    };
  }

  if (kind === "scenario") {
    return {
      instruction: "四选一：根据情景选择正确答案。",
      prompt: `${scenario}\n${data.stem}`,
    };
  }

  if (kind === "mini_context") {
    return {
      instruction: "四选一：先看例句，再完成新句子。",
      prompt: `例句：${example ?? data.sourceSentence}\n新句：${data.stem}`,
    };
  }

  if (kind === "pattern") {
    return {
      instruction: "四选一：同一语法点换个句子来选。",
      prompt: `语法形式：${pattern ?? unit.title}\n${data.stem}`,
    };
  }

  return {
    instruction: "四选一：选择最合适的答案补全句子。",
    prompt: data.stem,
  };
}

function buildGrammarQuestion(
  unit: GrammarUnit,
  index: number,
  difficulty: GrammarDifficulty
): GrammarQuizQuestion {
  const kind = getQuestionKind(unit, index, difficulty);
  const data = getFilledQuizTemplate(unit, index, difficulty);
  const options = shuffleBySeed(
    uniqueTexts([data.answer, ...data.distractors, ...DEFAULT_DISTRACTORS]).slice(0, 4),
    unit.id * 4000 + index
  );
  const prompt = buildChoicePrompt(data, unit, index, difficulty, kind);

  return {
    id: `${unit.id}-${difficulty}-${index}-${kind}`,
    unitId: unit.id,
    difficulty,
    kind,
    instruction: prompt.instruction,
    prompt: prompt.prompt,
    options,
    answer: data.answer,
    sourceSentence: data.sourceSentence,
    explanation: data.explanation,
    choiceExplanations: buildPhraseChoiceExplanations(data.stem, data.answer, options),
  };
}

function buildGrammarQuizQuestions(unit: GrammarUnit): GrammarQuizQuestion[] {
  if (!canPracticeGrammarUnit(unit.id)) {
    return [];
  }

  const questions: GrammarQuizQuestion[] = [];

  GRAMMAR_DIFFICULTIES.forEach((difficulty) => {
    const targetCount = GRAMMAR_QUIZ_DIFFICULTY_COUNTS[difficulty.value];

    for (let index = 0; index < targetCount; index += 1) {
      const serial = questions.length + 1;

      questions.push(buildGrammarQuestion(unit, serial, difficulty.value));
    }
  });

  return questions;
}

function getMixedGrammarDifficulty(index: number): GrammarDifficulty {
  const slot = index % 10;
  if (slot < 4) return "medium";
  if (slot < 8) return "hard";
  return "super";
}

function buildMixedGrammarQuestion(index: number): GrammarQuizQuestion {
  const unit = PINNED_GRAMMAR_UNITS[(index * 37 + Math.floor(index / 7)) % PINNED_GRAMMAR_UNITS.length];
  const difficulty = getMixedGrammarDifficulty(index);
  const serial = Math.floor(index / PINNED_GRAMMAR_UNITS.length) * 17 + index + 1;
  const question = buildGrammarQuestion(unit, serial, difficulty);

  return {
    ...question,
    id: `mixed-${index + 1}-${question.id}`,
  };
}

function buildMixedGrammarQuestionPool(): GrammarQuizQuestion[] {
  return Array.from({ length: MIXED_GRAMMAR_QUIZ_TOTAL }, (_item, index) =>
    buildMixedGrammarQuestion(index)
  );
}

function buildMixedGrammarSessionQuestions(sessionIndex: number): GrammarQuizQuestion[] {
  const start = sessionIndex * MIXED_GRAMMAR_SESSION_SIZE;
  return buildMixedGrammarQuestionPool().slice(start, start + MIXED_GRAMMAR_SESSION_SIZE);
}

function GrammarQuizMode({
  source,
  onExit,
}: {
  source: GrammarQuizSource;
  onExit: () => void;
}) {
  const [difficultyFilter, setDifficultyFilter] = useState<GrammarDifficultyFilter>("all");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<GrammarQuizAnswer[]>([]);

  const questionBank = source.questions;
  const difficultyCounts = useMemo(
    () =>
      GRAMMAR_DIFFICULTIES.reduce<Record<GrammarDifficulty, number>>((counts, difficulty) => {
        counts[difficulty.value] = questionBank.filter(
          (question) => question.difficulty === difficulty.value
        ).length;
        return counts;
      }, { medium: 0, hard: 0, super: 0 }),
    [questionBank]
  );
  const questions = useMemo(() => {
    if (!source.showDifficultyFilters || difficultyFilter === "all") return questionBank;
    return questionBank.filter((question) => question.difficulty === difficultyFilter);
  }, [difficultyFilter, questionBank, source.showDifficultyFilters]);
  const current = questions[currentIndex];
  const answered = selected !== null;
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;
  const answeredCount = answers.length;
  const correctCount = answers.filter((answer) => answer.correct).length;
  const wrongCount = Math.max(0, answeredCount - correctCount);
  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const accuracyTone =
    answeredCount === 0
      ? "bg-white text-stone-500 ring-stone-200"
      : accuracy >= 80
        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
        : accuracy >= 60
          ? "bg-amber-50 text-amber-700 ring-amber-100"
          : "bg-rose-50 text-rose-700 ring-rose-100";

  const chooseDifficulty = (nextDifficultyFilter: GrammarDifficultyFilter) => {
    setDifficultyFilter(nextDifficultyFilter);
    setCurrentIndex(0);
    setSelected(null);
    setAnswers([]);
  };

  const chooseOption = (option: string) => {
    if (answered || !current) return;
    setSelected(option);
    setAnswers((prev) => [
      ...prev,
      {
        questionId: current.id,
        selected: option,
        answer: current.answer,
        correct: option === current.answer,
      },
    ]);
  };

  const goNext = () => {
    setSelected(null);
    setCurrentIndex((index) => index + 1);
  };

  const restart = () => {
    setCurrentIndex(0);
    setSelected(null);
    setAnswers([]);
  };

  if (questions.length === 0 || currentIndex >= questions.length) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#fbfaf7]">
        <div className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onExit}
              className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 transition hover:bg-white hover:text-slate-900"
            >
              ← 返回语法
            </button>
            <button
              type="button"
              onClick={restart}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              再练一轮
            </button>
          </div>

          <section className="mt-8 rounded-[32px] border border-stone-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-medium text-amber-600">{source.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">
              本轮完成 {answeredCount} 题，正确率 {accuracy}%
            </h1>
            <p className="mt-3 text-sm leading-7 text-stone-500">
              每题选完立即判分并显示解析；不会自动跳题，建议先看懂解析再点“下一题”。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-semibold text-emerald-700">答对</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-700">{correctCount}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 p-4">
                <p className="text-xs font-semibold text-rose-700">答错</p>
                <p className="mt-2 text-2xl font-semibold text-rose-700">{wrongCount}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-700">正确率</p>
                <p className="mt-2 text-2xl font-semibold text-amber-700">{accuracy}%</p>
              </div>
              <div className="rounded-2xl bg-stone-50 p-4">
                <p className="text-xs font-semibold text-stone-500">题库</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {source.totalLabel}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const difficultyMeta = GRAMMAR_DIFFICULTY_META[current.difficulty];
  const kindMeta = GRAMMAR_QUESTION_KIND_META[current.kind];
  const isCorrect = selected === current.answer;
  const feedbackExplanation = selected ? buildGrammarFeedback(current, selected) : current.explanation;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#fbfaf7]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 transition hover:bg-white hover:text-slate-900"
          >
            ← 返回语法
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-500 ring-1 ring-stone-200">
              {currentIndex + 1} / {questions.length}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-500 ring-1 ring-stone-200">
              已答 {answeredCount}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
              答对 {correctCount}
            </span>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700 ring-1 ring-rose-100">
              答错 {wrongCount}
            </span>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${accuracyTone}`}>
              正确率 {answeredCount > 0 ? `${accuracy}%` : "--"}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${difficultyMeta.badge}`}>
              {difficultyMeta.label}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${kindMeta.badge}`}>
              {kindMeta.label}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-500 ring-1 ring-stone-200">
              Unit {current.unitId}
            </span>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {source.showDifficultyFilters && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => chooseDifficulty("all")}
            className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
              difficultyFilter === "all"
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-stone-500 ring-stone-200 hover:text-slate-900"
            }`}
          >
            全部 {questionBank.length} 题
          </button>
          {GRAMMAR_DIFFICULTIES.map((difficulty) => (
            <button
              key={difficulty.value}
              type="button"
              onClick={() => chooseDifficulty(difficulty.value)}
              className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
                difficultyFilter === difficulty.value
                  ? "bg-amber-600 text-white ring-amber-600"
                  : "bg-white text-stone-500 ring-stone-200 hover:text-slate-900"
              }`}
              title={difficulty.hint}
            >
              {difficulty.label} {difficultyCounts[difficulty.value]} 题
            </button>
          ))}
        </div>
        )}

        <main className="flex flex-1 items-center justify-center py-8">
          <div className="w-full rounded-[34px] border border-stone-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.07)] sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-600">{source.eyebrow}</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {source.title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-stone-500">
                  {source.summary}
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                {source.totalLabel} · 小学 1200 词内 · 多场景选择
              </span>
            </div>

            <section className="mt-8 rounded-[26px] border border-amber-100 bg-amber-50/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                {current.instruction}
              </p>
              <p className="mt-4 whitespace-pre-line text-xl font-semibold leading-9 text-slate-950">
                {current.prompt}
              </p>
            </section>

            <div className="mt-6 grid gap-3">
              {current.options.map((option, index) => {
                const isAnswer = option === current.answer;
                const isSelected = option === selected;
                const stateClass = !answered
                  ? "border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50"
                  : isAnswer
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : isSelected
                      ? "border-rose-400 bg-rose-50 text-rose-700"
                      : "border-stone-200 bg-stone-50 text-stone-400";

                return (
                  <button
                    key={`${current.id}-${option}-${index}`}
                    type="button"
                    onClick={() => chooseOption(option)}
                    disabled={answered}
                    className={`flex min-h-16 items-center gap-4 rounded-2xl border px-4 py-3 text-left text-base font-medium transition ${stateClass}`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-stone-500 ring-1 ring-stone-200">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="leading-7">{option}</span>
                  </button>
                );
              })}
            </div>

            {answered && (
              <div className="mt-6 rounded-[24px] bg-stone-50 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        isCorrect ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {isCorrect ? "答对了。" : "这题选错了。"}
                    </p>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-200">
                        <p className="text-xs font-semibold text-stone-400">你的选择</p>
                        <p className="mt-1 font-semibold text-slate-800">{selected}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-emerald-100">
                        <p className="text-xs font-semibold text-emerald-600">正确答案</p>
                        <p className="mt-1 font-semibold text-emerald-700">{current.answer}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-700">
                      {feedbackExplanation}
                    </p>
                    <p className="mt-3 text-sm font-medium leading-7 text-emerald-700">
                      正确句子：{current.sourceSentence}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={goNext}
                    className="shrink-0 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
                  >
                    {currentIndex + 1 >= questions.length ? "查看结果" : "下一题"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function GrammarPage() {
  const { id } = useParams<{ id: string }>();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    () => new Set(["pinned", "present"])
  );
  const [expandedUnits, setExpandedUnits] = useState<Set<number>>(
    () => new Set([1])
  );
  const [query, setQuery] = useState("");
  const [playingSpeechId, setPlayingSpeechId] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [, setVoiceRefreshKey] = useState(0);
  const [activeQuiz, setActiveQuiz] = useState<ActiveGrammarQuiz | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const deferredQuery = useDeferredValue(query);
  const searchText = deferredQuery.trim().toLowerCase();
  const isSearching = searchText.length > 0;

  const pinnedChapter: GrammarChapter = {
    key: "pinned",
    name: "置顶学习顺序",
    subtitle: `按 ${PINNED_GRAMMAR_ORDER_LABEL} 固定排列，先练这些核心 unit。`,
    units: PINNED_GRAMMAR_UNITS,
  };

  const grammarChaptersForDisplay = [
    pinnedChapter,
    ...ENGLISH_GRAMMAR_CHAPTERS.map((chapter) => ({
      ...chapter,
      units: chapter.units.filter((unit) => !PINNED_GRAMMAR_UNIT_ID_SET.has(unit.id)),
    })),
  ];

  const filteredChapters = grammarChaptersForDisplay.map((chapter) => {
    if (!isSearching) {
      return chapter;
    }

    const units = chapter.units.filter((unit) => grammarUnitMatchesSearch(unit, searchText));

    return { ...chapter, units };
  }).filter((chapter) => chapter.units.length > 0);

  const activeQuizSource = useMemo<GrammarQuizSource | null>(() => {
    if (!activeQuiz) return null;

    if (activeQuiz.type === "unit") {
      const questions = buildGrammarQuizQuestions(activeQuiz.unit);
      return {
        key: `unit-${activeQuiz.unit.id}`,
        eyebrow: `Unit ${activeQuiz.unit.id}`,
        title: activeQuiz.unit.title,
        summary: activeQuiz.unit.summary,
        totalLabel: `${GRAMMAR_QUIZ_COUNT_PER_UNIT} 题 / unit`,
        questions,
        showDifficultyFilters: true,
      };
    }

    const sessionNumber = activeQuiz.sessionIndex + 1;
    const questions = buildMixedGrammarSessionQuestions(activeQuiz.sessionIndex);

    return {
      key: `mixed-${activeQuiz.sessionIndex}`,
      eyebrow: `Mixed Session ${sessionNumber}/${MIXED_GRAMMAR_SESSION_COUNT}`,
      title: `混合练习 Session ${sessionNumber}`,
      summary: `从 ${PINNED_GRAMMAR_UNITS.length} 个置顶 unit 中混合抽题，本 session 固定 ${questions.length} 道四选一选择题。`,
      totalLabel: `${questions.length} 题 / session`,
      questions,
      showDifficultyFilters: false,
    };
  }, [activeQuiz]);

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

  const toggleUnit = (unitId: number) => {
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

  const stopGeneratedAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audioRef.current = null;
  }, []);

  const playSpeechAudio = (
    speechId: string,
    text: string,
    lang: SpeechLang,
    audioSrc?: string
  ) => {
    const stopSpeechSynthesis = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };

    if (playingSpeechId === speechId) {
      stopSpeechSynthesis();
      stopGeneratedAudio();
      setPlayingSpeechId(null);
      return;
    }

    if (audioSrc && typeof window !== "undefined") {
      stopSpeechSynthesis();
      stopGeneratedAudio();

      const audio = new Audio(audioSrc);
      audioRef.current = audio;
      audio.preload = "auto";
      audio.onended = () => {
        if (audioRef.current !== audio) {
          return;
        }
        setPlayingSpeechId((current) => (current === speechId ? null : current));
        audioRef.current = null;
      };
      audio.onerror = () => {
        if (audioRef.current !== audio) {
          return;
        }
        audioRef.current = null;
        setPlayingSpeechId((current) => (current === speechId ? null : current));
        playSpeechAudio(speechId, text, lang);
      };

      setPlayingSpeechId(speechId);
      void audio.play().catch(() => {
        if (audioRef.current !== audio) {
          return;
        }
        audioRef.current = null;
        setPlayingSpeechId((current) => (current === speechId ? null : current));
        playSpeechAudio(speechId, text, lang);
      });
      return;
    }

    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      return;
    }

    const synth = window.speechSynthesis;

    synth.cancel();
    stopGeneratedAudio();

    const utterance = new SpeechSynthesisUtterance(prepareSpeechText(text, lang));
    const voice = getVoiceForLang(lang);
    const tune = getSpeechTune(lang);

    utterance.lang = lang;
    utterance.rate = tune.rate;
    utterance.pitch = tune.pitch;
    utterance.volume = tune.volume;
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      setPlayingSpeechId((current) => (current === speechId ? null : current));
    };
    utterance.onerror = () => {
      setPlayingSpeechId((current) => (current === speechId ? null : current));
    };

    setPlayingSpeechId(speechId);
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
      return;
    }

    const synth = window.speechSynthesis;
    const readyTimer = window.setTimeout(() => {
      setSpeechAvailable(true);
      setVoiceRefreshKey((key) => key + 1);
    }, 0);
    const handleVoicesChanged = () => {
      synth.getVoices();
      setVoiceRefreshKey((key) => key + 1);
    };

    synth.getVoices();
    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", handleVoicesChanged);
    } else {
      synth.onvoiceschanged = handleVoicesChanged;
    }

    return () => {
      window.clearTimeout(readyTimer);
      stopGeneratedAudio();
      synth.cancel();
      if (typeof synth.removeEventListener === "function") {
        synth.removeEventListener("voiceschanged", handleVoicesChanged);
      } else if (synth.onvoiceschanged === handleVoicesChanged) {
        synth.onvoiceschanged = null;
      }
    };
  }, [stopGeneratedAudio]);

  useEffect(() => {
    return () => {
      stopGeneratedAudio();
    };
  }, [stopGeneratedAudio]);

  if (activeQuizSource) {
    return (
      <GrammarQuizMode
        key={activeQuizSource.key}
        source={activeQuizSource}
        onExit={() => setActiveQuiz(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/subjects/${id}`}
            className="text-sm font-medium text-amber-700 transition hover:text-amber-800"
          >
            ← 返回英语主页
          </Link>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-700 shadow-sm ring-1 ring-amber-100">
            语法学习
          </span>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] border border-white/80 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-7">
            <p className="text-sm font-semibold text-amber-600">
              English Grammar Workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              英语语法
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600 sm:text-base">
              基于《剑桥初级英语语法》115 个 unit 和 7 个附录的目录重组，内容改写成适合小学生的学习笔记。
              只给置顶学习顺序里的 {PINNED_GRAMMAR_UNITS.length} 个 unit 出多场景语法选择题；单 unit 可练 500 题，混合练习另有 1000 题，按 100 题一个 session 切分。
            </p>

            <div className="mt-6 rounded-[24px] border border-amber-100 bg-amber-50/60 p-4 text-sm leading-7 text-stone-700">
              非置顶 unit 只保留学习笔记，不显示出题入口；出题范围固定为 1-12、24、25-28、30-35、37-49、59-96、103-115。
            </div>

            <div className="mt-6">
              <label
                htmlFor="grammar-search"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-400"
              >
                搜索语法点
              </label>
              <input
                id="grammar-search"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例如：一般现在时 / because / in on at"
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                出题 Unit
              </p>
              <p className="mt-3 text-3xl font-semibold text-amber-600">
                {PINNED_GRAMMAR_UNITS.length}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                目录 Unit
              </p>
              <p className="mt-3 text-3xl font-semibold text-sky-600">
                {countGrammarUnits()}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                例句总量
              </p>
              <p className="mt-3 text-3xl font-semibold text-emerald-600">
                {countRichGrammarExamples()}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                适用程度
              </p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                小学进阶
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-amber-100 bg-amber-50/60 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Mixed Grammar Sessions
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                混合 1000 题
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                从置顶的 {PINNED_GRAMMAR_UNITS.length} 个 unit 混合出题，全部仍是四选一选择题；每个 session 固定 {MIXED_GRAMMAR_SESSION_SIZE} 道。
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-amber-700 ring-1 ring-amber-100">
              {MIXED_GRAMMAR_SESSION_COUNT} sessions
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: MIXED_GRAMMAR_SESSION_COUNT }, (_item, sessionIndex) => {
              const start = sessionIndex * MIXED_GRAMMAR_SESSION_SIZE + 1;
              const end = Math.min(start + MIXED_GRAMMAR_SESSION_SIZE - 1, MIXED_GRAMMAR_QUIZ_TOTAL);

              return (
                <button
                  key={`mixed-session-${sessionIndex}`}
                  type="button"
                  onClick={() => setActiveQuiz({ type: "mixed", sessionIndex })}
                  className="rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-amber-100 transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white hover:ring-slate-900"
                >
                  <span className="block text-sm font-semibold">Session {sessionIndex + 1}</span>
                  <span className="mt-1 block text-xs opacity-70">
                    第 {start}-{end} 题 · {MIXED_GRAMMAR_SESSION_SIZE} 道
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="mt-8 space-y-4">
          {filteredChapters.length > 0 ? (
            filteredChapters.map((chapter) => {
              const isChapterOpen = isSearching || expandedChapters.has(chapter.key);

              return (
                <section
                  key={chapter.key}
                  className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)]"
                >
                  <button
                    onClick={() => toggleChapter(chapter.key)}
                    className="flex w-full items-start justify-between gap-4 bg-white px-5 py-5 text-left transition hover:bg-stone-50 sm:px-6"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-base font-semibold text-amber-700">
                        {chapter.name.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-semibold text-slate-900">
                            {chapter.name}
                          </h2>
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                            {chapter.units.length} 个 unit
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-stone-500">
                          {chapter.subtitle}
                        </p>
                      </div>
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
                          const canPractice = canPracticeGrammarUnit(unit.id);
                          const formCards = buildFormCards(unit);
                          const practiceCards = buildPracticeCards(unit);
                          const displayExamples = buildDisplayExamples(unit);
                          const learningGuide = buildLearningGuide(unit);
                          const unitAudioPrefix = canPractice ? grammarAudioUnitPrefix(unit.id) : "";

                          return (
                            <article
                              key={unit.id}
                              className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm"
                            >
                              <div className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-stone-50 sm:px-5">
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                  <div className="flex shrink-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
                                    {canPractice ? (
                                      <button
                                        type="button"
                                        onClick={() => setActiveQuiz({ type: "unit", unit })}
                                        className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                                      >
                                        选择题 · 500 题
                                      </button>
                                    ) : (
                                      <span className="inline-flex items-center rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-500">
                                        仅学习笔记
                                      </span>
                                    )}
                                    <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                                      {unit.id}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => toggleUnit(unit.id)}
                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <h3 className="text-base font-semibold text-slate-900 sm:text-lg">
                                      {unit.title}
                                    </h3>
                                    <p className="mt-1 text-sm leading-6 text-stone-500">
                                      {unit.summary}
                                    </p>
                                    <p className="mt-2 text-xs text-stone-400">
                                      {canPractice
                                        ? "小学 1200 词内，选完立即判分和解析"
                                        : "这个 unit 暂不出题"}
                                    </p>
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => toggleUnit(unit.id)}
                                  className="shrink-0 text-sm font-medium text-stone-400"
                                >
                                  {isUnitOpen ? "收起" : "展开"}
                                </button>
                              </div>

                              {isUnitOpen && (
                                <div className="border-t border-stone-100 bg-white px-4 py-4 sm:px-5">
                                  <div className="space-y-4">
                                    <div className="rounded-[24px] border border-amber-100 bg-amber-50/80 p-4">
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                                            学习讲解
                                          </p>
                                          <h4 className="mt-2 text-base font-semibold text-slate-950">
                                            {learningGuide.headline}
                                          </h4>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            playSpeechAudio(
                                              `unit-${unit.id}-guide`,
                                              learningGuide.teacherScript,
                                              "zh-CN",
                                              unitAudioPrefix ? `${unitAudioPrefix}-guide.mp3` : undefined
                                            );
                                          }}
                                          disabled={!speechAvailable && !unitAudioPrefix}
                                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                            playingSpeechId === `unit-${unit.id}-guide`
                                              ? "bg-amber-600 text-white shadow-sm shadow-amber-200"
                                              : "bg-white text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                                          } disabled:cursor-not-allowed disabled:opacity-50`}
                                        >
                                          {playingSpeechId === `unit-${unit.id}-guide` ? "停止" : "听讲解"}
                                        </button>
                                      </div>

                                      <p className="mt-4 text-sm leading-7 text-stone-700">
                                        {learningGuide.learningCopy}
                                      </p>

                                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                        <div className="rounded-[20px] bg-white p-4 shadow-sm ring-1 ring-amber-100">
                                          <p className="text-xs font-semibold text-amber-700">
                                            三步判断
                                          </p>
                                          <ol className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
                                            {learningGuide.keyMoves.map((move, index) => (
                                              <li key={move} className="flex gap-2">
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">
                                                  {index + 1}
                                                </span>
                                                <span>{move}</span>
                                              </li>
                                            ))}
                                          </ol>
                                        </div>

                                        <div className="rounded-[20px] bg-white p-4 shadow-sm ring-1 ring-amber-100">
                                          <p className="text-xs font-semibold text-rose-700">
                                            易错检查
                                          </p>
                                          <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
                                            {learningGuide.checkpoints.map((checkpoint) => (
                                              <li key={checkpoint} className="flex gap-2">
                                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                                                <span>{checkpoint}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        常用句型
                                      </p>
                                      <div className="mt-3 space-y-2">
                                        {unit.patterns.map((pattern, index) => {
                                          const speechId = `unit-${unit.id}-pattern-${index}`;

                                          return (
                                            <div
                                              key={`${unit.id}-${index}-${pattern}`}
                                              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-medium leading-7 text-slate-800 shadow-sm ring-1 ring-stone-200/80"
                                            >
                                              <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
                                                {pattern}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  playSpeechAudio(
                                                    speechId,
                                                    speakableEnglish(pattern),
                                                    "en-US",
                                                    unitAudioPrefix
                                                      ? `${unitAudioPrefix}-pattern-${index + 1}.mp3`
                                                      : undefined
                                                  );
                                                }}
                                                disabled={!speechAvailable && !unitAudioPrefix}
                                                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                                  playingSpeechId === speechId
                                                    ? "bg-emerald-600 text-white"
                                                    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-100"
                                                } disabled:cursor-not-allowed disabled:opacity-50`}
                                              >
                                                {playingSpeechId === speechId ? "停" : "听句型"}
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        句型形式
                                      </p>
                                      <div className="mt-3 space-y-3">
                                        {formCards.map((formCard, index) => {
                                          const speechId = `unit-${unit.id}-form-${index}`;

                                          return (
                                            <div
                                              key={`${unit.id}-${formCard.label}-${formCard.value}`}
                                              className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm"
                                            >
                                              <div className="space-y-3">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                  <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                                                    {formCard.label}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      playSpeechAudio(
                                                        speechId,
                                                        speakableEnglish(formCard.value),
                                                        "en-US",
                                                        unitAudioPrefix
                                                          ? `${unitAudioPrefix}-form-${index + 1}.mp3`
                                                          : undefined
                                                      );
                                                    }}
                                                    disabled={!speechAvailable && !unitAudioPrefix}
                                                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                                      playingSpeechId === speechId
                                                        ? "bg-emerald-600 text-white"
                                                        : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-100"
                                                    } disabled:cursor-not-allowed disabled:opacity-50`}
                                                  >
                                                    {playingSpeechId === speechId ? "停" : "听形式"}
                                                  </button>
                                                </div>
                                                <p className="overflow-x-auto whitespace-nowrap text-sm font-medium leading-7 text-slate-900">
                                                  {formCard.value}
                                                </p>
                                                <p className="text-sm leading-7 text-stone-500">
                                                  {formCard.hint}
                                                </p>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        更多例句
                                      </p>
                                      <div className="mt-3 space-y-3">
                                        {displayExamples.map((example, index) => {
                                          const exampleId = `unit-${unit.id}-example-${index}`;
                                          const isPlaying = playingSpeechId === exampleId;

                                          return (
                                            <div
                                            key={exampleId}
                                            className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm"
                                          >
                                            <div className="space-y-3">
                                              <div className="flex items-start justify-between gap-3">
                                                <span
                                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                                  index < 4
                                                    ? "bg-sky-50 text-sky-700"
                                                    : "bg-emerald-50 text-emerald-700"
                                                }`}
                                              >
                                                {index < 4 ? `进阶 ${index + 1}` : `应用 ${index - 3}`}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  playSpeechAudio(
                                                    exampleId,
                                                    example.english,
                                                    "en-US",
                                                    unitAudioPrefix
                                                      ? `${unitAudioPrefix}-example-${index + 1}.mp3`
                                                      : undefined
                                                  );
                                                }}
                                                disabled={!speechAvailable && !unitAudioPrefix}
                                                className={`relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                                  isPlaying
                                                    ? "bg-emerald-600 text-white"
                                                    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-100"
                                                } disabled:cursor-not-allowed disabled:opacity-50`}
                                                title={isPlaying ? "停止朗读" : `播放 ${example.english}`}
                                                aria-label={isPlaying ? "停止朗读例句" : `播放例句 ${index + 1}`}
                                              >
                                                {isPlaying ? "■" : "▶"}
                                                <span>{isPlaying ? "停" : "听例句"}</span>
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
                                        变式练习
                                      </p>
                                      <div className="mt-3 space-y-3">
                                        {practiceCards.map((practiceCard, index) => {
                                          const speechId = `unit-${unit.id}-practice-${index}`;

                                          return (
                                            <div
                                              key={`${unit.id}-${practiceCard.label}-${practiceCard.sample}`}
                                              className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm"
                                            >
                                              <div className="space-y-3">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                  <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                                                    {practiceCard.label}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      playSpeechAudio(
                                                        speechId,
                                                        speakableEnglish(practiceCard.sample),
                                                        "en-US",
                                                        unitAudioPrefix
                                                          ? `${unitAudioPrefix}-practice-${index + 1}.mp3`
                                                          : undefined
                                                      );
                                                    }}
                                                    disabled={!speechAvailable && !unitAudioPrefix}
                                                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                                      playingSpeechId === speechId
                                                        ? "bg-emerald-600 text-white"
                                                        : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-100"
                                                    } disabled:cursor-not-allowed disabled:opacity-50`}
                                                  >
                                                    {playingSpeechId === speechId ? "停" : "听样例"}
                                                  </button>
                                                </div>
                                                <p className="text-sm font-medium leading-7 text-slate-900">
                                                  {practiceCard.task}
                                                </p>
                                                <p className="overflow-x-auto whitespace-nowrap text-sm leading-7 text-stone-500">
                                                  {practiceCard.sample}
                                                </p>
                                                <p className="text-xs leading-6 text-stone-400">
                                                  {practiceCard.hint}
                                                </p>
                                              </div>
                                            </div>
                                          );
                                        })}
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
              <p className="text-lg font-medium text-stone-500">没有找到匹配的语法点</p>
              <p className="mt-2 text-sm text-stone-400">
                试试搜索：一般过去时、because、介词、比较级、情态动词
              </p>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 right-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_12px_30px_rgba(16,185,129,0.35)] transition hover:bg-emerald-700 active:scale-90"
        title="回到顶部"
        aria-label="回到顶部"
      >
        ↑
      </button>
    </div>
  );
}
