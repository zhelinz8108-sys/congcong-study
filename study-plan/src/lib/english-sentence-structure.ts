export type SentenceToken = {
  role: string;
  label: string;
  text: string;
};

export type SentencePattern = {
  id: string;
  code: string;
  title: string;
  formula: string;
  explanation: string;
  exampleZh: string;
  tokens: SentenceToken[];
  tip: string;
};

export const SENTENCE_COMPONENTS = [
  {
    code: "S",
    name: "主语",
    english: "Subject",
    question: "谁 / 什么",
    description: "执行动作，或处于某种状态的人或事物。",
    example: "Tom likes basketball.",
  },
  {
    code: "V",
    name: "谓语",
    english: "Verb / Predicate",
    question: "做什么 / 怎么样",
    description: "句子的发动机，表达核心动作或状态。",
    example: "Birds fly. / She is reading.",
  },
  {
    code: "O",
    name: "宾语",
    english: "Object",
    question: "动作对谁 / 什么",
    description: "动作涉及的对象，通常跟在及物动词后。",
    example: "I read books.",
  },
  {
    code: "P",
    name: "表语",
    english: "Predicative",
    question: "是什么 / 怎么样",
    description: "跟在系动词后，说明主语的身份、性质或状态。",
    example: "She looks tired.",
  },
  {
    code: "Attr.",
    name: "定语",
    english: "Attribute",
    question: "什么样的 / 哪一个",
    description: "修饰名词，可以放在名词前，也可以放在名词后。",
    example: "a beautiful girl",
  },
  {
    code: "Adv.",
    name: "状语",
    english: "Adverbial",
    question: "何时 / 何地 / 如何 / 为什么",
    description: "给动作补充时间、地点、方式、原因或条件。",
    example: "He runs quickly.",
  },
  {
    code: "C",
    name: "补语",
    english: "Complement",
    question: "补充说明谁 / 什么",
    description: "继续说明主语或宾语，让句意完整。",
    example: "The news made me happy.",
  },
] as const;

export const SENTENCE_PATTERNS: SentencePattern[] = [
  {
    id: "sv",
    code: "S + V",
    title: "主谓",
    formula: "谁 / 什么 + 做什么",
    explanation: "不及物动词自己就能完成句意，后面不需要宾语。",
    exampleZh: "鸟会飞。",
    tokens: [
      { role: "S", label: "主语", text: "Birds" },
      { role: "V", label: "谓语", text: "fly." },
    ],
    tip: "先问：这个动词后面还缺一个动作对象吗？不缺，就是 SV。",
  },
  {
    id: "svp",
    code: "S + Linking V + P",
    title: "主系表",
    formula: "谁 / 什么 + 是 / 感觉 / 变得 + 怎么样",
    explanation: "系动词像一座桥，把主语和说明主语的表语连起来。",
    exampleZh: "这碗汤尝起来很好。",
    tokens: [
      { role: "S", label: "主语", text: "The soup" },
      { role: "LV", label: "系动词", text: "tastes" },
      { role: "P", label: "表语", text: "good." },
    ],
    tip: "be、look、sound、smell、taste、feel、become、get、turn 都可能是系动词。",
  },
  {
    id: "svo",
    code: "S + V + O",
    title: "主谓宾",
    formula: "谁 / 什么 + 做 + 对象",
    explanation: "及物动词后面要接动作对象，宾语回答“对谁 / 什么”。",
    exampleZh: "汤姆打篮球。",
    tokens: [
      { role: "S", label: "主语", text: "Tom" },
      { role: "V", label: "谓语", text: "plays" },
      { role: "O", label: "宾语", text: "basketball." },
    ],
    tip: "read what? books；like what? dogs。能这样追问，通常就能找到宾语。",
  },
  {
    id: "svoo",
    code: "S + V + IO + DO",
    title: "主谓双宾",
    formula: "谁 + 给 / 告诉 + 某人 + 某物",
    explanation: "间接宾语通常是“人”，直接宾语通常是“物”。",
    exampleZh: "她给了我一本书。",
    tokens: [
      { role: "S", label: "主语", text: "She" },
      { role: "V", label: "谓语", text: "gave" },
      { role: "IO", label: "间接宾语", text: "me" },
      { role: "DO", label: "直接宾语", text: "a book." },
    ],
    tip: "give / tell / show / send 常用 to；buy 常用 for：She gave a book to me.",
  },
  {
    id: "svoc",
    code: "S + V + O + C",
    title: "主谓宾补",
    formula: "谁 + 做 + 对象 + 对象怎么样",
    explanation: "宾语补足语继续说明宾语；拿掉它，句意往往不完整。",
    exampleZh: "这个消息使我开心。",
    tokens: [
      { role: "S", label: "主语", text: "The news" },
      { role: "V", label: "谓语", text: "made" },
      { role: "O", label: "宾语", text: "me" },
      { role: "C", label: "宾补", text: "happy." },
    ],
    tip: "make + O + 形容词 / 动词原形；ask / tell + O + to do。",
  },
  {
    id: "there-be",
    code: "There + be + N + Place / Time",
    title: "There be",
    formula: "某处 + 有 + 某物",
    explanation: "表达“某处存在某物”，不是表达某人“拥有”某物。",
    exampleZh: "桌上有一本书。",
    tokens: [
      { role: "TH", label: "引导词", text: "There" },
      { role: "BE", label: "be", text: "is" },
      { role: "N", label: "存在物", text: "a book" },
      { role: "ADV", label: "地点", text: "on the desk." },
    ],
    tip: "There is a book. = 某处有书；I have a book. = 我拥有书。",
  },
];

export const VERB_SYSTEMS = [
  {
    id: "be",
    name: "be 动词系统",
    forms: "am / is / are / was / were",
    positive: "She is happy.",
    negative: "She is not happy.",
    question: "Is she happy?",
    rule: "变否定：be 后加 not；变疑问：把 be 提到主语前。",
  },
  {
    id: "ordinary",
    name: "普通动词系统",
    forms: "play / like / go ...",
    positive: "Tom likes dogs.",
    negative: "Tom does not like dogs.",
    question: "Does Tom like dogs?",
    rule: "变否定或疑问：请 do / does / did 帮忙，实义动词还原。",
  },
  {
    id: "modal",
    name: "情态动词系统",
    forms: "can / should / must + 动词原形",
    positive: "He can swim.",
    negative: "He cannot swim.",
    question: "Can he swim?",
    rule: "变否定：情态动词后加 not；变疑问：把情态动词提到主语前。",
  },
] as const;

export const CORE_TENSES = [
  {
    id: "present",
    name: "一般现在时",
    meaning: "习惯 · 事实 · 经常发生",
    structure: "do / does；be",
    signal: "every day / usually",
    example: "I go to school every day.",
    stage: "六年级",
  },
  {
    id: "continuous",
    name: "现在进行时",
    meaning: "现在正在发生",
    structure: "am / is / are + V-ing",
    signal: "now / look / listen",
    example: "I am reading now.",
    stage: "六年级",
  },
  {
    id: "past",
    name: "一般过去时",
    meaning: "已经结束的过去",
    structure: "V-ed / 不规则过去式；was / were",
    signal: "yesterday / last ...",
    example: "I visited Shanghai yesterday.",
    stage: "六年级—初一",
  },
  {
    id: "future",
    name: "一般将来时",
    meaning: "未来计划 · 预测 · 决定",
    structure: "will + V；be going to + V",
    signal: "tomorrow / next ...",
    example: "I will go tomorrow.",
    stage: "初一",
  },
  {
    id: "past-continuous",
    name: "过去进行时",
    meaning: "过去某时正在进行",
    structure: "was / were + V-ing",
    signal: "at 8 p.m. / while",
    example: "I was studying at 8 p.m.",
    stage: "初二",
  },
  {
    id: "perfect",
    name: "现在完成时",
    meaning: "过去与现在有关联",
    structure: "have / has + 过去分词",
    signal: "already / yet / ever / since",
    example: "I have finished my homework.",
    stage: "初二",
  },
] as const;

export const EXPANSION_TOOLS = [
  {
    id: "noun",
    name: "名词词组",
    headline: "让名词变“大”",
    ladder: ["dog", "a dog", "a cute dog", "a cute little dog in the park"],
    note: "限定词 + 数量 + 形容词 + 名词 + 后置修饰",
  },
  {
    id: "pronoun",
    name: "代词系统",
    headline: "让表达不重复",
    ladder: ["Tom likes Amy.", "He likes her.", "This is my book.", "This book is mine."],
    note: "先判断代词在句中作主语、宾语，还是表示所属。",
  },
  {
    id: "comparison",
    name: "比较结构",
    headline: "把事物放在一起看",
    ladder: ["Tom is tall.", "Tom is taller than Jack.", "Tom is the tallest boy."],
    note: "原级 → 比较级 → 最高级；还要掌握 as ... as。",
  },
  {
    id: "preposition",
    name: "介词短语",
    headline: "给句子补充坐标",
    ladder: ["Tom is reading.", "Tom is reading in his room.", "Tom is reading after dinner."],
    note: "地点、时间、方向短语让句子信息更完整。",
  },
] as const;

export const CLAUSE_CARDS = [
  {
    name: "并列句",
    connectors: "and / but / or / so",
    logic: "并列 · 转折 · 选择 · 结果",
    example: "Tom is young, but he is very smart.",
  },
  {
    name: "状语从句",
    connectors: "because / when / if / although",
    logic: "原因 · 时间 · 条件 · 让步",
    example: "If it rains, we will stay home.",
  },
  {
    name: "宾语从句",
    connectors: "that / whether / if / 疑问词",
    logic: "把一个句子放在动词后作内容",
    example: "Do you know where he lives?",
  },
  {
    name: "定语从句",
    connectors: "who / which / that / whose",
    logic: "用一个句子修饰前面的名词",
    example: "The girl who sits next to me is my friend.",
  },
] as const;

export const ADVANCED_STRUCTURES = [
  {
    name: "情态动词",
    formula: "can / should / must + 动词原形",
    example: "You should exercise.",
    contrast: "mustn't = 禁止；don't have to = 不必。",
  },
  {
    name: "非谓语",
    formula: "to do / doing / done",
    example: "I want to go. / I enjoy reading.",
    contrast: "多个动词相遇时，后面的动词常需要变形。",
  },
  {
    name: "被动语态",
    formula: "be + 过去分词",
    example: "The room was cleaned by Tom.",
    contrast: "be 随时态变化，过去分词表达“被做”。",
  },
  {
    name: "主谓一致",
    formula: "主语的人称和数决定谓语形式",
    example: "Every student has a book.",
    contrast: "There be、either ... or、neither ... nor 常按就近原则。",
  },
] as const;

export const LEARNING_STAGES = [
  {
    stage: "第一阶段",
    grade: "六年级上",
    title: "句子骨架",
    count: 10,
    focus: "完整句、主语、谓语、宾语、表语、三大动词系统、SV / SVO / 主系表 / There be",
  },
  {
    stage: "第二阶段",
    grade: "六年级",
    title: "句子变形",
    count: 9,
    focus: "肯定、否定、一般疑问、特殊疑问、do / does、be、can、三单、主谓一致",
  },
  {
    stage: "第三阶段",
    grade: "六年级下—初一",
    title: "时间系统",
    count: 5,
    focus: "一般现在、现在进行、一般过去、一般将来、四时态对比",
  },
  {
    stage: "第四阶段",
    grade: "初一",
    title: "扩充简单句",
    count: 13,
    focus: "名词词组、冠词、代词、形副词、介词、比较、情态、祈使、SVOO、SVOC",
  },
  {
    stage: "第五阶段",
    grade: "初二",
    title: "动词进阶与从句入门",
    count: 13,
    focus: "过去进行、现在完成、非谓语、宾补、条件 / 时间 / 原因状语从句、too / enough",
  },
  {
    stage: "第六阶段",
    grade: "初三",
    title: "复杂句与综合应用",
    count: 10,
    focus: "被动、并列句、三大从句、主谓一致、长难句拆解、多时态与段落应用",
  },
] as const;

export const ABILITY_LEVELS = [
  ["Level 1", "词", "noun / verb / adjective / adverb"],
  ["Level 2", "词组", "a beautiful dog / in the room / very quickly"],
  ["Level 3", "句子成分", "主语 / 谓语 / 宾语 / 表语 / 定语 / 状语 / 补语"],
  ["Level 4", "六大简单句", "SV / 主系表 / SVO / SVOO / SVOC / There be"],
  ["Level 5", "句子变形", "肯定 / 否定 / 疑问 / 祈使 / 感叹"],
  ["Level 6", "动词系统", "be / do / 情态动词"],
  ["Level 7", "六大时态", "现在、过去、将来及进行 / 完成"],
  ["Level 8", "非谓语", "to do / doing / done"],
  ["Level 9", "被动", "be + done"],
  ["Level 10", "连接句子", "and / but / or / so"],
  ["Level 11", "从句", "状语从句 / 宾语从句 / 定语从句"],
  ["Level 12", "长句和段落", "拆句、改写、组合、段落句型变化"],
] as const;

export const QUICK_CHALLENGES = [
  {
    prompt: "The news made me happy.",
    question: "这个句子的核心结构是什么？",
    choices: ["S + V + O", "S + V + O + C", "S + V + IO + DO"],
    answer: 1,
    explanation: "me 是宾语，happy 继续说明 me，因此 happy 是宾语补足语。",
  },
  {
    prompt: "Does Tom like dogs?",
    question: "为什么 like 不加 -s？",
    choices: ["dogs 是复数", "does 已承担三单变化", "疑问句永远用原形"],
    answer: 1,
    explanation: "普通动词疑问句由 does 帮忙，实义动词必须恢复原形。",
  },
  {
    prompt: "Do you know where he lives?",
    question: "为什么不是 where does he live？",
    choices: ["宾语从句用陈述语序", "where 后不能用 does", "he 不是第三人称"],
    answer: 0,
    explanation: "where he lives 整体是 know 的宾语，从句内部要使用陈述语序。",
  },
] as const;
