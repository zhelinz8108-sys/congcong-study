export type GrammarTopic = {
  number: number;
  name: string;
  english: string;
  formula: string;
  summary: string;
  example: string;
  tip: string;
};

export type GrammarModule = {
  id: string;
  letter: string;
  title: string;
  subtitle: string;
  stage: string;
  accent: string;
  topics: GrammarTopic[];
};

export const GRAMMAR_MODULES: GrammarModule[] = [
  {
    id: "words",
    letter: "A",
    title: "词法基础",
    subtitle: "先认识每个词在句子里做什么",
    stage: "六年级—初一",
    accent: "sky",
    topics: [
      { number: 1, name: "名词", english: "Noun", formula: "可数 / 不可数 · 单数 / 复数 · 所有格", summary: "名词表示人、物、地点、事件或概念，是主语和宾语最常见的来源。", example: "one student · two students · a piece of advice", tip: "information、advice、homework 是不可数名词，不能直接加 -s。" },
      { number: 2, name: "冠词与限定词", english: "Article & Determiner", formula: "a / an · the · 零冠词", summary: "a/an 表示第一次提到或泛指一个；the 表示特指或双方都知道。", example: "I saw a dog. The dog was black.", tip: "a/an 看发音，不看字母：an hour，a university。" },
      { number: 3, name: "代词", english: "Pronoun", formula: "主格 · 宾格 · 物主 · 反身 · 不定代词", summary: "代词替代名词；先判断它在句中作主语、宾语，还是表达所属。", example: "She likes him. This book is mine.", tip: "everyone、everything 作主语通常看作单数。" },
      { number: 4, name: "数词", english: "Numeral", formula: "基数词 · 序数词 · 分数", summary: "基数词表示数量，序数词表示顺序；日期和楼层常用序数概念。", example: "the twenty-first century · the third floor", tip: "分子大于 1 时，分母通常用复数：two thirds。" },
      { number: 5, name: "形容词", english: "Adjective", formula: "原级 · 比较级 + than · the + 最高级", summary: "形容词修饰名词，或放在系动词后说明主语的性质和状态。", example: "Tom is taller than Jack.", tip: "不要写 more better；最高级通常不能漏掉 the。" },
      { number: 6, name: "副词", english: "Adverb", formula: "方式 · 频率 · 程度 · 时间 · 地点", summary: "副词常修饰动词、形容词或另一个副词，为动作增加方式和频率等信息。", example: "He is always late. He always gets up late.", tip: "频率副词通常放在 be 后、实义动词前。" },
      { number: 7, name: "介词", english: "Preposition", formula: "at / on / in · 方位 · 方向 · 方式", summary: "介词给句子补上时间、地点、方位、方向或方式坐标。", example: "at 7:00 · on Monday · in 2026", tip: "介词后接名词、代词宾格或 V-ing：good at reading。" },
      { number: 8, name: "连词", english: "Conjunction", formula: "and · but · or · so · because · although · if", summary: "连词负责说明两个词、短语或句子之间的逻辑关系。", example: "Although he was tired, he kept working.", tip: "because 不与 so 重复；although/though 不与 but 重复。" },
    ],
  },
  {
    id: "verbs",
    letter: "B",
    title: "动词系统",
    subtitle: "找到英语句子的发动机",
    stage: "六年级—初一",
    accent: "rose",
    topics: [
      { number: 9, name: "be 动词", english: "Be Verbs", formula: "am / is / are · was / were", summary: "be 动词表达身份、性质或状态，自己就能完成否定和疑问变化。", example: "She is happy. → Is she happy?", tip: "否定在 be 后加 not；疑问把 be 提到主语前。" },
      { number: 10, name: "have / has / had", english: "Have", formula: "拥有 / 完成时助动词", summary: "have 可以表示“拥有”，也可以与过去分词一起构成完成时。", example: "I have a bike. She has finished her homework.", tip: "先看 have 后面是名词还是过去分词，判断它的身份。" },
      { number: 11, name: "do / does / did", english: "Do Helpers", formula: "普通动词的否定与疑问助手", summary: "普通动词需要 do/does/did 帮忙变否定和一般疑问句。", example: "Does he like music? Did they go home?", tip: "does/did 出现后，后面的实义动词必须回到原形。" },
      { number: 12, name: "实义动词的形式", english: "Verb Forms", formula: "原形 · 三单 · 过去式 · 过去分词 · V-ing", summary: "动词形式会随主语、时间、完成、进行或被动关系变化。", example: "go · goes · went · gone · going", tip: "先判断句子需要哪一种形式，再处理规则或不规则变化。" },
      { number: 13, name: "情态动词", english: "Modal Verbs", formula: "can / may / must / should + 动词原形", summary: "情态动词表达能力、可能、许可、义务或建议。", example: "You should exercise more.", tip: "mustn't 是“禁止”；don't have to / needn't 是“不必”。" },
    ],
  },
  {
    id: "tenses",
    letter: "C",
    title: "六大核心时态",
    subtitle: "把动作放进正确的时间轴",
    stage: "六年级—初二",
    accent: "amber",
    topics: [
      { number: 14, name: "一般现在时", english: "Simple Present", formula: "do / does · am / is / are", summary: "表达习惯、事实、规律、长期状态或时间表。", example: "The Earth goes around the Sun.", tip: "只有一般现在时中的 he/she/it 或单数主语需要三单变化。" },
      { number: 15, name: "现在进行时", english: "Present Continuous", formula: "am / is / are + V-ing", summary: "表达此刻正在发生、现阶段暂时进行或已安排的近期计划。", example: "She is reading now.", tip: "know、like、want 等状态动词通常不用进行时。" },
      { number: 16, name: "一般过去时", english: "Simple Past", formula: "did · was / were", summary: "表达过去明确时间发生并已经结束的动作或状态。", example: "I visited Shanghai last year.", tip: "Did you go? 不能写 Did you went?" },
      { number: 17, name: "一般将来时", english: "Simple Future", formula: "will do · be going to do", summary: "will 常用于临时决定、预测、承诺；be going to 常用于已有计划或迹象。", example: "I am going to visit Beijing.", tip: "时间/条件从句表未来常用一般现在时：If it rains, we will stay。" },
      { number: 18, name: "过去进行时", english: "Past Continuous", formula: "was / were + V-ing", summary: "表达过去某个时刻或一段时间正在进行的动作。", example: "I was walking home when it started to rain.", tip: "过去进行时常作背景，一般过去时表示插入的短动作。" },
      { number: 19, name: "现在完成时", english: "Present Perfect", formula: "have / has + 过去分词", summary: "表达过去动作与现在的结果、经历或持续联系。", example: "I have lived here for five years.", tip: "since 接起点，for 接时长；been to 已回来，gone to 尚未回来。" },
    ],
  },
  {
    id: "voice",
    letter: "D",
    title: "语态与非谓语",
    subtitle: "多个动词相遇时怎样安排",
    stage: "初二—初三",
    accent: "violet",
    topics: [
      { number: 20, name: "被动语态", english: "Passive Voice", formula: "be + 过去分词", summary: "主动句关注“谁做”，被动句关注“谁或什么被做”。", example: "The bridge was built in 2010.", tip: "先确定时态来选择 be，再把实义动词变成过去分词。" },
      { number: 21, name: "动词不定式", english: "To-infinitive", formula: "to + 动词原形", summary: "to do 可作宾语、宾补、目的状语，也常出现在形式主语结构里。", example: "It is important to exercise.", tip: "want/hope/plan + to do；ask/tell + sb + to do。" },
      { number: 22, name: "V-ing", english: "Gerund & Present Participle", formula: "be + doing / doing 作名词", summary: "V-ing 可以构成进行时，也可以像名词一样作主语或宾语。", example: "Reading is fun. I enjoy reading.", tip: "介词后通常接 V-ing；enjoy/finish/practice 只接 doing。" },
      { number: 23, name: "过去分词", english: "Past Participle", formula: "have + done · be + done · 分词形容词", summary: "过去分词用于完成时、被动语态，也能变成描述感受的形容词。", example: "I am interested in the interesting book.", tip: "-ed 常描述人的感受；-ing 常描述事物带来的感受。" },
      { number: 24, name: "非谓语搭配", english: "Verb Patterns", formula: "do / to do / doing", summary: "不同动词决定后一个动词使用原形、to do 还是 doing。", example: "stop doing ≠ stop to do", tip: "remember doing 是“记得做过”；remember to do 是“记得要做”。" },
    ],
  },
  {
    id: "sentences",
    letter: "E",
    title: "简单句",
    subtitle: "从会单词到会造完整句子",
    stage: "六年级—初一",
    accent: "emerald",
    topics: [
      { number: 25, name: "句子成分", english: "Sentence Parts", formula: "S · V · O · P · 定语 · 状语 · 补语", summary: "句子成分说明一个词或短语在句子中承担什么任务。", example: "Tom likes music. → S + V + O", tip: "先找谓语，再找主语，最后看谓语后面还缺什么。" },
      { number: 26, name: "六大核心句型", english: "Core Patterns", formula: "SV · SVC · SVO · SVOO · SVOC · There be", summary: "六个骨架可以搭出绝大多数初中阶段的英语简单句。", example: "The news made me happy. → SVOC", tip: "句型由谓语动词决定，不由中文词序猜。" },
      { number: 27, name: "肯定、否定、一般疑问", english: "Transformations", formula: "be / 普通动词 / 情态动词三套系统", summary: "句型变化要先判断谓语属于哪套动词系统。", example: "She likes dogs. → Does she like dogs?", tip: "不要让 be 和 do 同时帮助同一个普通谓语。" },
      { number: 28, name: "特殊疑问句", english: "Wh- Questions", formula: "疑问词 + 一般疑问语序", summary: "what、who、where、when、why、how 分别追问不同信息。", example: "Where do you live?", tip: "Who likes you? 中 who 本身作主语，不需要 do。" },
      { number: 29, name: "祈使、感叹、选择疑问", english: "Special Sentences", formula: "Do... / Don't... · What...! / How...!", summary: "祈使句发出指令；感叹句表达强烈感受；选择问句要求在选项中回答。", example: "What a beautiful day!", tip: "What 后核心是名词，How 后核心是形容词或副词。" },
      { number: 30, name: "There be", english: "Existential There", formula: "There + be + 存在物 + 地点/时间", summary: "There be 表示某处存在某物；have 表示某人拥有某物。", example: "There are two books on the desk.", tip: "be 的单复数通常看后面离它最近的主语。" },
    ],
  },
  {
    id: "clauses",
    letter: "F",
    title: "复合句",
    subtitle: "把多个句子连成完整思想",
    stage: "初二—初三",
    accent: "cyan",
    topics: [
      { number: 31, name: "并列句", english: "Compound Sentence", formula: "简单句 + and / but / or / so + 简单句", summary: "两个地位相对独立的简单句通过并列连词连接。", example: "It was raining, so we stayed home.", tip: "先说清楚两个分句之间是并列、转折、选择还是结果。" },
      { number: 32, name: "状语从句", english: "Adverbial Clause", formula: "时间 · 条件 · 原因 · 让步 · 目的 · 结果", summary: "状语从句给主句补充时间、条件、原因等背景。", example: "If he comes, I will tell him.", tip: "表未来的 if/when 从句常用一般现在时，主句用 will。" },
      { number: 33, name: "宾语从句", english: "Object Clause", formula: "动词 + that / whether / 疑问词 + 陈述语序", summary: "把一个完整小句放在动词后面，作为“知道、认为、问”的内容。", example: "Do you know where he lives?", tip: "宾语从句内部必须使用陈述语序，不用一般疑问语序。" },
      { number: 34, name: "定语从句", english: "Relative Clause", formula: "先行词 + who / which / that / whose + 从句", summary: "定语从句像放在名词后面的说明书，继续说明人或物。", example: "The boy who is running is my brother.", tip: "阅读时先找先行词，再判断从句到哪里结束。" },
    ],
  },
  {
    id: "structures",
    letter: "G",
    title: "高频特殊结构",
    subtitle: "中考常见结构与主谓一致",
    stage: "初一—初三",
    accent: "indigo",
    topics: [
      { number: 35, name: "系动词与感官动词", english: "Linking Verbs", formula: "look / sound / smell / taste / feel + 形容词", summary: "系动词连接主语和表语，后面通常用形容词说明主语。", example: "The soup tastes good.", tip: "表示“汤很好吃”不能写 tastes well。" },
      { number: 36, name: "程度与结果结构", english: "Degree & Result", formula: "too...to · enough to · so...that · such...that", summary: "这些结构描述程度能否达到某个动作或产生某个结果。", example: "He is old enough to drive.", tip: "so 后接形容词/副词；such 的核心是名词。" },
      { number: 37, name: "It 作形式主语", english: "Dummy It", formula: "It is + adj + (for sb) + to do", summary: "用 it 占据主语位置，把较长的真正主语放到句尾。", example: "It is difficult for me to get up early.", tip: "还要掌握 It takes sb + 时间 + to do。" },
      { number: 38, name: "spend / take / cost / pay", english: "Cost Expressions", formula: "人 spend/pay · it takes · 物 costs", summary: "四个词都可谈时间或金钱，但主语和搭配完全不同。", example: "I spent two hours reading.", tip: "先看句子的主语是人、it 还是物，再选动词。" },
      { number: 39, name: "used to 三兄弟", english: "Used To", formula: "used to do · be used to doing · be used to do", summary: "分别表示过去常常、习惯于、被用来做。", example: "I am used to getting up early.", tip: "be used to 中的 to 是介词，后面接名词或 V-ing。" },
      { number: 40, name: "both / either / neither / all / none", english: "Scope Words", formula: "两者 / 三者及以上", summary: "先判断范围是两个还是三个及以上，再判断全部、任一或全不。", example: "Neither answer is correct.", tip: "both/either/neither 谈两者；all/none 常谈三者及以上。" },
      { number: 41, name: "another / other 系列", english: "Other Words", formula: "another · other + 名词 · others · the other(s)", summary: "是否特指、后面有没有名词、范围是不是两者，决定具体形式。", example: "One is red; the other is blue.", tip: "others 后不再接名词；the others 指某范围内剩下的全部。" },
      { number: 42, name: "主谓一致", english: "Subject-Verb Agreement", formula: "主语的人称和数 → 谓语形式", summary: "谓语必须与真正的主语在人称和单复数上保持一致。", example: "One of the boys is absent.", tip: "there be、either...or、neither...nor 常使用就近原则。" },
      { number: 43, name: "数量表达", english: "Quantity", formula: "many/much · a few/few · a little/little", summary: "先区分可数和不可数，再看表达偏肯定还是偏否定。", example: "a few books · a little water", tip: "a few/a little 是“有一些”；few/little 是“几乎没有”。" },
      { number: 44, name: "some / any / no", english: "Determiners", formula: "肯定 · 疑问/否定 · 完全否定", summary: "some 常见于肯定句，any 常见于疑问和否定句，no 本身已是否定。", example: "Would you like some tea?", tip: "表示邀请或请求并期待肯定回答时，疑问句也常用 some。" },
      { number: 45, name: "because / although 对比", english: "Clause vs Phrase", formula: "because/although + 句子 · because of/despite + 名词", summary: "相似意义的连接词对后面成分有不同要求。", example: "because it rained · because of the rain", tip: "判断后面有没有完整主语和谓语，再选连接结构。" },
    ],
  },
  {
    id: "mistakes",
    letter: "H",
    title: "易混与纠错",
    subtitle: "把最容易丢分的地方成组攻克",
    stage: "初二—初三",
    accent: "pink",
    topics: [
      { number: 46, name: "since / for / ago / before", english: "Time Markers", formula: "起点 · 时长 · 距今多久 · 以前", summary: "四个时间词表达不同坐标，并与不同的时态倾向搭配。", example: "since 2022 · for three years · three years ago", tip: "ago 常和一般过去时；since/for 常提示现在完成时。" },
      { number: 47, name: "when / while", english: "Time Clauses", formula: "when 可长可短 · while 强调持续", summary: "when 能连接短动作或长动作；while 常描写两件持续动作同时发生。", example: "While I was reading, he was cooking.", tip: "短动作突然插入背景动作时，常用 when。" },
      { number: 48, name: "if / whether", english: "If or Whether", formula: "是否 / 如果", summary: "表示“是否”时多可互换；表达条件“如果”时只能用 if。", example: "I don't know whether he will come.", tip: "whether...or not、介词后、to do 前优先用 whether。" },
      { number: 49, name: "say / speak / tell / talk", english: "Speaking Verbs", formula: "say sth · speak a language · tell sb · talk with sb", summary: "四个“说”字关注的对象和固定搭配不同。", example: "Tell me the truth. She speaks English.", tip: "tell 后常直接接人；say 后接内容，接人要加 to。" },
      { number: 50, name: "borrow / lend / keep", english: "Borrowing", formula: "借入 · 借出 · 保留", summary: "borrow 和 lend 表示动作方向，keep 才能与一段时间连用。", example: "You can keep the book for a week.", tip: "how long 提问时通常不能用瞬间动词 borrow。" },
      { number: 51, name: "arrive / reach / get to", english: "Arrival", formula: "arrive in/at · reach + 地点 · get to", summary: "三个词都表示到达，但地点前是否需要介词不同。", example: "arrive in Beijing · reach Beijing", tip: "reach 后直接接地点；arrive 需要 in 或 at。" },
      { number: 52, name: "make / do", english: "Make or Do", formula: "制造/结果 · 活动/任务", summary: "make 更强调制造或产生结果，do 更强调完成活动或任务。", example: "make a decision · do homework", tip: "固定搭配要连成词块记忆，不要逐字翻译。" },
      { number: 53, name: "高频错误扫描", english: "Error Scan", formula: "谓语 → 形式 → 语序 → 搭配", summary: "按固定顺序扫描句子，比凭语感寻找错误更可靠。", example: "Did you went? ✗ → Did you go? ✓", tip: "优先检查 be/do 混用、助动后未还原、从句语序和介词后形式。" },
    ],
  },
];

export const VERB_SYSTEMS = [
  { id: "be", name: "be 动词", label: "状态系统", color: "sky", forms: "am / is / are / was / were", positive: "She is happy.", negative: "She is not happy.", question: "Is she happy?", rule: "be 自己移动：否定在后面加 not，疑问把 be 放到主语前。" },
  { id: "ordinary", name: "普通动词", label: "动作系统", color: "rose", forms: "play / like / go ...", positive: "She likes dogs.", negative: "She doesn't like dogs.", question: "Does she like dogs?", rule: "请 do / does / did 来帮忙；助手出现后，实义动词恢复原形。" },
  { id: "modal", name: "情态动词", label: "态度系统", color: "violet", forms: "can / should / must + V", positive: "She can swim.", negative: "She cannot swim.", question: "Can she swim?", rule: "情态动词后永远接动词原形；它自己承担否定和疑问变化。" },
] as const;

export const TENSES = [
  { id: "present", name: "一般现在时", stage: "习惯 / 事实", position: 50, structure: "do / does；am / is / are", signal: "every day · usually · often", example: "I go to school every day.", color: "emerald" },
  { id: "present-continuous", name: "现在进行时", stage: "此刻正在", position: 53, structure: "am / is / are + V-ing", signal: "now · look · listen", example: "She is reading now.", color: "cyan" },
  { id: "past", name: "一般过去时", stage: "过去并结束", position: 18, structure: "did；was / were", signal: "yesterday · last... · ...ago", example: "I visited Shanghai last year.", color: "amber" },
  { id: "future", name: "一般将来时", stage: "计划 / 预测", position: 84, structure: "will do / be going to do", signal: "tomorrow · next...", example: "I will call you tomorrow.", color: "violet" },
  { id: "past-continuous", name: "过去进行时", stage: "过去某时正在", position: 28, structure: "was / were + V-ing", signal: "at 8 yesterday · while", example: "I was reading when he called.", color: "rose" },
  { id: "present-perfect", name: "现在完成时", stage: "过去连到现在", position: 45, structure: "have / has + done", signal: "already · yet · since · for", example: "I have finished my homework.", color: "indigo" },
] as const;

export const CONFUSIONS = [
  { pair: "mustn't / don't have to", left: "mustn't = 禁止，绝对不能做", right: "don't have to = 不必，可以不做", example: "You mustn't swim here. / You don't have to come early." },
  { pair: "have been to / have gone to", left: "been to = 去过，已经回来", right: "gone to = 去了，还没回来", example: "She has been to London. / She has gone to London." },
  { pair: "stop doing / stop to do", left: "stop doing = 停止正在做的事", right: "stop to do = 停下来去做另一件事", example: "Stop talking. / We stopped to rest." },
  { pair: "because / because of", left: "because + 完整句子", right: "because of + 名词 / V-ing", example: "because it rained / because of the rain" },
  { pair: "few / a few", left: "few = 几乎没有，偏否定", right: "a few = 有几个，偏肯定", example: "Few people knew it. / I have a few friends." },
  { pair: "if / whether", left: "if 可表示“是否”或“如果”", right: "whether 只表示“是否”，搭配范围更广", example: "If he comes... / whether or not" },
] as const;

export const ROADMAP = [
  { grade: "六年级", range: "01—18", title: "先把简单句搭稳", color: "sky", topics: "句子与短语区别|主语与谓语|be 动词|实义动词|人称代词|物主代词|名词单复数|可数与不可数|冠词基础|一般现在时|第三人称单数|do/does 否定|do/does 疑问|特殊疑问句|频率副词|现在进行时|过去时 be|一般过去时".split("|") },
  { grade: "初一", range: "19—33", title: "补全简单句体系", color: "emerald", topics: "There be|时间与地点介词|形容词与副词|比较级|最高级|some/any/no|many/much/few/little|情态动词|祈使句|感叹句|SVOO 双宾语|SVOC 宾补|will 将来时|be going to|并列连词".split("|") },
  { grade: "初二", range: "34—48", title: "掌握时间与复杂表达", color: "amber", topics: "过去进行时|when/while|现在完成时|since/for|been to / gone to|to do 基础|doing 基础|动词搭配|too...to / enough to|so...that / such...that|时间状语从句|条件状语从句|原因/让步从句|used to|spend/take/cost/pay".split("|") },
  { grade: "初三", range: "49—60", title: "进入复杂句与综合语法", color: "violet", topics: "一般现在时被动|一般过去时被动|其他被动结构|宾语从句 that|宾语从句 if/whether|宾语从句疑问词|宾语从句时态语序|定语从句 who/which/that|定语从句 whose|主谓一致|非谓语综合|长句拆解与纠错".split("|") },
] as const;

export const MOTHER_SENTENCES = [
  ["I like music.", "SVO / 一般现在时"], ["She likes music.", "第三人称单数"], ["She doesn't like music.", "一般现在时否定"], ["Does she like music?", "一般现在时疑问"], ["She is happy.", "主系表"], ["Is she happy?", "be 疑问"], ["There are two books on the desk.", "There be"], ["I am reading now.", "现在进行时"], ["I went home yesterday.", "一般过去时"], ["Did you go home?", "一般过去时疑问"], ["I will call you tomorrow.", "一般将来时"], ["I was reading when he called.", "过去进行 + 一般过去"], ["I have finished my homework.", "现在完成时"], ["You should exercise more.", "情态动词"], ["I want to learn English.", "to do"], ["I enjoy reading.", "doing"], ["The bridge was built in 2010.", "被动语态"], ["If it rains, we will stay home.", "条件状语从句"], ["I know where he lives.", "宾语从句"], ["The boy who is running is my brother.", "定语从句"],
] as const;

export const CHECKLIST = [
  "句子有没有主语和谓语？", "谓语属于 be、普通动词还是情态动词？", "时态与时间词一致吗？", "主语单复数与谓语一致吗？", "否定/疑问是否正确使用 do/does/did？", "助动词或情态动词后是否用了原形？", "进行时是否有 be + doing？", "完成时是否有 have/has + done？", "被动是否有 be + done？", "名词单复数或不可数形式正确吗？", "冠词 a/an/the 是否必要且正确？", "代词的主格、宾格和物主形式正确吗？", "形容词、副词的位置正确吗？", "比较级和最高级结构完整吗？", "介词后是否接名词、宾格或 V-ing？", "to do 与 doing 的搭配正确吗？", "从句有没有自己的主语和谓语？", "宾语从句使用陈述语序了吗？", "if/when 表未来时，从句误用了 will 吗？", "长句能先找主干，再处理修饰部分吗？",
] as const;

export const GRAMMAR_QUIZ = [
  { question: "She ___ English every day.", choices: ["study", "studies", "is study"], answer: 1, explanation: "every day 提示一般现在时；She 是第三人称单数，所以 study 变为 studies。" },
  { question: "Did Tom ___ home early yesterday?", choices: ["went", "go", "going"], answer: 1, explanation: "did 已经承担过去时变化，后面的实义动词必须还原为 go。" },
  { question: "I have lived here ___ three years.", choices: ["since", "for", "ago"], answer: 1, explanation: "three years 是一段时长，用 for；since 后面接时间起点。" },
  { question: "Do you know where he ___?", choices: ["does live", "lives", "is live"], answer: 1, explanation: "宾语从句内部使用陈述语序；一般现在时 he 后用 lives。" },
  { question: "The bridge ___ in 2010.", choices: ["built", "was built", "is building"], answer: 1, explanation: "桥是“被建造”，2010 是过去时间，所以用一般过去时被动 was built。" },
  { question: "If it ___ tomorrow, we will stay home.", choices: ["will rain", "rains", "rained"], answer: 1, explanation: "条件状语从句表未来时遵循“主将从现”，if 从句用一般现在时 rains。" },
] as const;
