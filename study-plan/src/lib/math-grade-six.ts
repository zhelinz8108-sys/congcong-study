export type GradeSixDifficulty = "medium" | "hard" | "super";

export type GradeSixUnit = {
  key: string;
  order: number;
  title: string;
  pdfTitle: string;
  sourceRange: string;
  pdfPages: string;
  description: string;
  tags: string[];
  questionCount?: number;
};

export type GradeSixQuestion = {
  id: string;
  difficulty: GradeSixDifficulty;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  tags: string[];
};

export const GRADE_SIX_DIFFICULTY_META: Record<
  GradeSixDifficulty,
  { label: string; tone: string; description: string }
> = {
  medium: {
    label: "中等",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    description: "直接计算和基础概念，稳住小数点。",
  },
  hard: {
    label: "困难",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
    description: "多一步判断，结合估算、单位和取近似值。",
  },
  super: {
    label: "超级困难",
    tone: "border-rose-200 bg-rose-50 text-rose-700",
    description: "综合应用，重点检查取整、比较和实际意义。",
  },
};

export const MATH_GRADE_SIX_UNITS: GradeSixUnit[] = [
  {
    key: "unit-1",
    order: 1,
    title: "小数乘法与除法",
    pdfTitle: "小数乘法和除法（二）",
    sourceRange: "教材 P1-P13",
    pdfPages: "PDF 第 3-16 页",
    description: "一个数乘小数、一个数除以小数、积和商的近似值，以及实际问题中的取整。",
    tags: ["小数乘法", "小数除法", "近似值", "实际问题"],
    questionCount: 90,
  },
  {
    key: "unit-2",
    order: 2,
    title: "混合运算与数量关系",
    pdfTitle: "混合运算与数量关系（三）",
    sourceRange: "教材 P14-P25",
    pdfPages: "PDF 第 17-28 页",
    description: "小数四则混合运算、数量关系分析和含有多步条件的应用题。",
    tags: ["混合运算", "数量关系", "应用题"],
    questionCount: 90,
  },
  {
    key: "practice-1",
    order: 3,
    title: "生活中的分段计费",
    pdfTitle: "生活中的分段计费",
    sourceRange: "教材 P26-P29",
    pdfPages: "PDF 第 29-32 页",
    description: "水电费、停车费、打车费等分段计费模型。",
    tags: ["分段计费", "建模", "生活应用"],
    questionCount: 90,
  },
  {
    key: "unit-3",
    order: 4,
    title: "数与运算的再认识",
    pdfTitle: "数与运算的再认识",
    sourceRange: "教材 P30-P41",
    pdfPages: "PDF 第 33-44 页",
    description: "复习数的意义、运算关系、运算律和估算策略。",
    tags: ["数的认识", "运算律", "估算"],
    questionCount: 90,
  },
  {
    key: "practice-2",
    order: 5,
    title: "二进制的秘密",
    pdfTitle: "二进制的秘密",
    sourceRange: "教材 P42-P43",
    pdfPages: "PDF 第 45-46 页",
    description: "用二进制理解计数方式和信息表示。",
    tags: ["二进制", "规律", "拓展"],
    questionCount: 90,
  },
  {
    key: "unit-4",
    order: 6,
    title: "比和比例",
    pdfTitle: "比和比例",
    sourceRange: "教材 P44-P63",
    pdfPages: "PDF 第 47-66 页",
    description: "比、比例、正比例、反比例和比例尺。",
    tags: ["比", "比例", "比例尺"],
    questionCount: 90,
  },
  {
    key: "practice-3",
    order: 7,
    title: "神奇的黄金比",
    pdfTitle: "神奇的黄金比",
    sourceRange: "教材 P64-P67",
    pdfPages: "PDF 第 67-70 页",
    description: "在图形、艺术和生活中认识黄金比。",
    tags: ["黄金比", "综合实践"],
    questionCount: 90,
  },
  {
    key: "unit-5",
    order: 8,
    title: "圆",
    pdfTitle: "圆",
    sourceRange: "教材 P68-P87",
    pdfPages: "PDF 第 71-90 页",
    description: "圆的认识、周长、面积和相关实际问题。",
    tags: ["圆周率", "周长", "面积"],
    questionCount: 90,
  },
  {
    key: "practice-4",
    order: 9,
    title: "体育中的数学",
    pdfTitle: "体育中的数学",
    sourceRange: "教材 P88-P91",
    pdfPages: "PDF 第 91-94 页",
    description: "用数学分析运动成绩、场地和规则。",
    tags: ["统计", "测量", "综合实践"],
    questionCount: 90,
  },
  {
    key: "unit-6",
    order: 10,
    title: "放大与缩小",
    pdfTitle: "放大与缩小",
    sourceRange: "教材 P92-P102",
    pdfPages: "PDF 第 95-105 页",
    description: "图形按比例放大、缩小，理解相似与比例关系。",
    tags: ["放大", "缩小", "比例"],
    questionCount: 90,
  },
  {
    key: "unit-7",
    order: 11,
    title: "确定位置",
    pdfTitle: "确定位置",
    sourceRange: "教材 P103-P111",
    pdfPages: "PDF 第 106-114 页",
    description: "用方向、距离和数对确定位置。",
    tags: ["方向", "距离", "数对"],
    questionCount: 90,
  },
  {
    key: "review",
    order: 12,
    title: "期末复习",
    pdfTitle: "期末复习",
    sourceRange: "教材 P112-P121",
    pdfPages: "PDF 第 115-121 页",
    description: "整理六上重点知识，进行综合复习。",
    tags: ["复习", "综合"],
    questionCount: 90,
  },
];

const letters = ["A", "B", "C", "D"];

function stripZeros(value: string) {
  return value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function formatNumber(value: number, digits = 6) {
  const fixed = value.toFixed(digits);
  return stripZeros(fixed);
}

function formatRounded(value: number, places: number) {
  const factor = 10 ** places;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded.toFixed(places);
}

function formatMoney(value: number) {
  return `${formatRounded(value, 2)}元`;
}

function rotateOptions(correct: string, wrong: string[], seed: number) {
  const values = [correct];
  for (const item of wrong) {
    if (!values.includes(item)) values.push(item);
    if (values.length === 4) break;
  }

  let guard = 1;
  while (values.length < 4) {
    const fallback = formatNumber(Number.parseFloat(correct) + guard);
    if (!values.includes(fallback)) values.push(fallback);
    guard += 1;
  }

  const answerIndex = seed % 4;
  const options = values.slice(1, 4);
  options.splice(answerIndex, 0, correct);
  return { options, answerIndex };
}

function numericChoices(
  correctValue: number,
  seed: number,
  formatter: (value: number) => string = formatNumber
) {
  const base = Math.abs(correctValue) < 1 ? 0.1 : 1;
  const candidates = [
    correctValue * 10,
    correctValue / 10,
    correctValue + base,
    Math.max(0, correctValue - base),
    correctValue * 100,
    Math.max(0, correctValue / 100),
  ].map(formatter);
  return rotateOptions(formatter(correctValue), candidates, seed);
}

function makeQuestion(
  id: string,
  difficulty: GradeSixDifficulty,
  prompt: string,
  correct: string,
  wrong: string[],
  explanation: string,
  tags: string[],
  seed: number
): GradeSixQuestion {
  const { options, answerIndex } = rotateOptions(correct, wrong, seed);
  return { id, difficulty, prompt, options, answerIndex, explanation, tags };
}

function makeComputedQuestion(
  id: string,
  difficulty: GradeSixDifficulty,
  prompt: string,
  correctValue: number,
  explanation: string,
  tags: string[],
  seed: number,
  formatter: (value: number) => string = formatNumber
): GradeSixQuestion {
  const { options, answerIndex } = numericChoices(correctValue, seed, formatter);
  return { id, difficulty, prompt, options, answerIndex, explanation, tags };
}

const mediumMultiplication = [
  ["4", "0.9"],
  ["0.6", "0.4"],
  ["2.4", "1.6"],
  ["4.6", "2.8"],
  ["0.64", "7.5"],
  ["2.05", "0.08"],
  ["7.2", "0.09"],
  ["0.86", "3.2"],
  ["1.5", "0.74"],
  ["5.89", "3.6"],
].map(([a, b], index) => {
  const correct = Number(a) * Number(b);
  return makeComputedQuestion(
    `m-mul-${index + 1}`,
    "medium",
    `${a} × ${b} = ?`,
    correct,
    `先按整数乘法计算，再看因数中一共有几位小数，积就点出几位小数：${a} × ${b} = ${formatNumber(correct)}。`,
    ["小数乘法", "直接计算"],
    index
  );
});

const mediumDivision = [
  ["0.6", "0.3"],
  ["1.2", "0.24"],
  ["0.21", "0.3"],
  ["0.34", "0.017"],
  ["4.2", "0.7"],
  ["19.6", "0.56"],
  ["7.56", "1.8"],
  ["6", "0.25"],
  ["18", "0.24"],
  ["1.69", "2.6"],
].map(([a, b], index) => {
  const correct = Number(a) / Number(b);
  return makeComputedQuestion(
    `m-div-${index + 1}`,
    "medium",
    `${a} ÷ ${b} = ?`,
    correct,
    `除数是小数时，把被除数和除数的小数点同时向右移动相同位数，使除数变成整数，再计算。${a} ÷ ${b} = ${formatNumber(correct)}。`,
    ["小数除法", "直接计算"],
    index + 10
  );
});

const mediumRounding = [
  ["3.5", "1.1", 1],
  ["16", "23", 2],
  ["2.7", "0.46", 2],
  ["40", "60", 2],
  ["50", "60", 2],
  ["35", "60", 2],
  ["6.48", "0.8", 1],
  ["0.9", "0.045", 0],
  ["6.72", "4.2", 1],
  ["0.13", "2.5", 2],
].map(([a, b, places], index) => {
  const value = Number(a) / Number(b);
  const correct = formatRounded(value, Number(places));
  const wrong = [
    formatRounded(value, Math.max(0, Number(places) - 1)),
    formatRounded(value, Number(places) + 1),
    formatNumber(Math.floor(value)),
    formatNumber(Math.ceil(value)),
  ];
  return makeQuestion(
    `m-round-${index + 1}`,
    "medium",
    `${a} ÷ ${b} 的商按“四舍五入”保留${places}位小数约是？`,
    correct,
    wrong,
    `先算 ${a} ÷ ${b} = ${formatNumber(value, 8)}，再看要保留位数的下一位，按“四舍五入”得到 ${correct}。`,
    ["近似值", "小数除法"],
    index + 20
  );
});

const hardQuestions: GradeSixQuestion[] = [
  (() => {
    const value = 6.25 * 1.5;
    return makeComputedQuestion(
      "h-1",
      "hard",
      "苹果单价是 6.25 元/千克，买 1.5 千克苹果，应付多少元？",
      value,
      `总价 = 单价 × 数量，6.25 × 1.5 = ${formatNumber(value)}，钱数保留到分是 ${formatMoney(value)}。`,
      ["小数乘法", "总价问题"],
      1,
      formatMoney
    );
  })(),
  (() => {
    const value = 2.4 * 1.6;
    return makeComputedQuestion(
      "h-2",
      "hard",
      "一块长方形菜地长 2.4 米、宽 1.6 米，面积是多少平方米？",
      value,
      `长方形面积 = 长 × 宽，2.4 × 1.6 = ${formatNumber(value)}，所以面积是 ${formatNumber(value)} 平方米。`,
      ["小数乘法", "面积"],
      2,
      (v) => `${formatNumber(v)}平方米`
    );
  })(),
  (() => {
    const value = 0.6 / 0.3;
    return makeComputedQuestion(
      "h-3",
      "hard",
      "红彩带长 0.6 米，每段剪 0.3 米，可以剪成多少段？",
      value,
      `段数 = 总长 ÷ 每段长度，0.6 ÷ 0.3 = 2，可以剪成 2 段。`,
      ["小数除法", "包含除"],
      3,
      (v) => `${formatNumber(v)}段`
    );
  })(),
  (() => {
    const value = 1.2 / 0.24;
    return makeComputedQuestion(
      "h-4",
      "hard",
      "绿彩带长 1.2 米，每段剪 0.24 米，可以剪成多少段？",
      value,
      `1.2 ÷ 0.24，把小数点同时右移两位，变成 120 ÷ 24 = 5。`,
      ["小数除法", "包含除"],
      4,
      (v) => `${formatNumber(v)}段`
    );
  })(),
  (() => {
    const value = 40 * 1000 / 60;
    return makeQuestion(
      "h-5",
      "hard",
      "海狮游速约 40 千米/时，换算成米/分并保留两位小数，约是多少？",
      `${formatRounded(value, 2)}米/分`,
      ["66.67米/分", "6666.67米/分", "666.6米/分", "667米/分"],
      `40 千米 = 40000 米，1 时 = 60 分，所以 40000 ÷ 60 = ${formatNumber(value, 8)}，保留两位小数是 ${formatRounded(value, 2)} 米/分。`,
      ["单位换算", "近似值"],
      5
    );
  })(),
  (() => {
    const value = Math.floor(300 / 3.5);
    return makeQuestion(
      "h-6",
      "hard",
      "每支自动铅笔 3.5 元，300 元最多可以买多少支？",
      String(value),
      ["86", "85.7", "84", "90"],
      `300 ÷ 3.5 = ${formatNumber(300 / 3.5, 8)}。买东西不能买小数支，且钱不能超，所以向下取整，最多买 ${value} 支。`,
      ["小数除法", "实际取整"],
      6
    );
  })(),
  (() => {
    const value = Math.ceil(13.6 / 4);
    return makeQuestion(
      "h-7",
      "hard",
      "庄稼收了 13.6 吨橘子，一辆卡车每次运 4 吨，至少需要几次运完？",
      String(value),
      ["3", "3.4", "5", "2"],
      `13.6 ÷ 4 = 3.4。运货次数必须是整数，3 次不够，所以要向上取整，至少 ${value} 次。`,
      ["小数除法", "实际取整"],
      7
    );
  })(),
  (() => {
    const value = Math.floor(40 / 4.5);
    return makeQuestion(
      "h-8",
      "hard",
      "一个羽毛球 4.5 元，李老师有 40 元，最多可以买多少个？",
      String(value),
      ["9", "8.9", "7", "10"],
      `40 ÷ 4.5 = ${formatNumber(40 / 4.5, 8)}。最多买多少个要向下取整，所以最多买 ${value} 个。`,
      ["小数除法", "实际取整"],
      8
    );
  })(),
  (() => {
    const value = 7.2 * 0.09;
    return makeQuestion(
      "h-9",
      "hard",
      "7.2 × 0.09 的积应有几位小数？",
      "三位小数",
      ["一位小数", "两位小数", "四位小数", "整数"],
      `7.2 有 1 位小数，0.09 有 2 位小数，一共 3 位小数。积是 ${formatNumber(value)}，确实是三位小数。`,
      ["小数乘法", "小数位数"],
      9
    );
  })(),
  makeQuestion(
    "h-10",
    "hard",
    "计算 0.21 ÷ 0.3 时，下面哪种转化正确？",
    "2.1 ÷ 3",
    ["21 ÷ 3", "0.21 ÷ 3", "21 ÷ 30", "2.1 ÷ 0.3"],
    "除数 0.3 要变成整数 3，小数点向右移一位；被除数 0.21 也向右移一位，变成 2.1，所以是 2.1 ÷ 3。",
    ["小数除法", "小数点移动"],
    10
  ),
  makeQuestion(
    "h-11",
    "hard",
    "计算 0.34 ÷ 0.017 时，下面哪种转化正确？",
    "340 ÷ 17",
    ["34 ÷ 17", "3.4 ÷ 17", "340 ÷ 170", "0.34 ÷ 17"],
    "除数 0.017 要变成整数 17，小数点向右移三位；被除数 0.34 也向右移三位，变成 340，所以是 340 ÷ 17。",
    ["小数除法", "小数点移动"],
    11
  ),
  (() => {
    const value = 3.5 / 1.1;
    return makeQuestion(
      "h-12",
      "hard",
      "3.5 ÷ 1.1 保留两位小数约是？",
      formatRounded(value, 2),
      [formatRounded(value, 1), formatRounded(value, 3), "3.18", "3.19"],
      `3.5 ÷ 1.1 = ${formatNumber(value, 8)}，保留两位小数看第三位，结果是 ${formatRounded(value, 2)}。`,
      ["近似值", "小数除法"],
      12
    );
  })(),
];

const hardGenerated = [
  { a: 0.28, b: 0.7, context: "每瓶饮料 0.7 升，0.28 升相当于一瓶的几分之几？" },
  { a: 6.4, b: 4, context: "6.4 千克糖平均分成 4 袋，每袋多少千克？" },
  { a: 0.8, b: 0.05, context: "0.8 米彩绳每 0.05 米剪一段，可以剪多少段？" },
  { a: 5.89, b: 3.6, context: "每千克 5.89 元，买 3.6 千克，应付多少元？", multiply: true, money: true },
  { a: 0.74, b: 0.4, context: "长 0.74 米、宽 0.4 米的长方形面积是多少平方米？", multiply: true, unit: "平方米" },
  { a: 18, b: 0.24, context: "18 米布每 0.24 米剪一段，可以剪多少段？" },
  { a: 6.48, b: 0.8, context: "6.48 千克水果平均装入每袋 0.8 千克的袋子，能装满多少袋？", floor: true },
  { a: 0.13, b: 2.5, context: "0.13 千米平均分成 2.5 份，每份多少千米？" },
  { a: 0.9, b: 0.045, context: "0.9 升油每 0.045 升装一小瓶，可以装多少瓶？" },
  { a: 6.72, b: 4.2, context: "6.72 平方米平均分成 4.2 份，每份是多少？" },
  { a: 3.7, b: 0.04, context: "3.7 ÷ 0.04 的商是多少？" },
  { a: 42, b: 0.35, context: "42 ÷ 0.35 的商是多少？" },
  { a: 4.2, b: 0.35, context: "4.2 ÷ 0.35 的商是多少？" },
  { a: 0.42, b: 0.35, context: "0.42 ÷ 0.35 的商是多少？" },
  { a: 2.05, b: 0.08, context: "2.05 × 0.08 的积是多少？", multiply: true },
  { a: 0.64, b: 7.5, context: "0.64 × 7.5 的积是多少？", multiply: true },
  { a: 2.7, b: 0.46, context: "2.7 ÷ 0.46 保留两位小数是多少？", round: 2 },
  { a: 16, b: 23, context: "16 ÷ 23 保留三位小数是多少？", round: 3 },
].map((item, index) => {
  const raw = item.multiply ? item.a * item.b : item.a / item.b;
  const correct = item.floor ? Math.floor(raw) : raw;
  const formatter = item.money
    ? formatMoney
    : item.unit
      ? (v: number) => `${formatNumber(v)}${item.unit}`
      : item.floor
        ? (v: number) => String(Math.floor(v))
        : item.round !== undefined
          ? (v: number) => formatRounded(v, item.round!)
          : formatNumber;
  const operation = item.multiply ? "乘法" : "除法";
  const resultText = formatter(correct);
  return makeComputedQuestion(
    `h-gen-${index + 1}`,
    "hard",
    item.context,
    correct,
    `${operation}关系：${item.a} ${item.multiply ? "×" : "÷"} ${item.b} = ${formatNumber(raw, 8)}。${
      item.floor ? "实际装满多少袋要向下取整。" : item.round !== undefined ? `按要求保留 ${item.round} 位小数。` : ""
    } 所以答案是 ${resultText}。`,
    item.multiply ? ["小数乘法", "应用题"] : ["小数除法", "应用题"],
    index + 13,
    formatter
  );
});

const superGenerated = [
  { total: 34, minutes: 3, target: 178, targetMinutes: 7, label: "蜗牛在干地每 3 分钟爬 34 厘米，在湿地 7 分钟爬 178 厘米，湿地速度是干地的多少倍？", places: 2 },
  { total: 11, days: 3, target: 14, targetDays: 3, label: "平台 3 天卖出特价童装 11 万件、非特价 14 万件，非特价平均每天比特价多多少万件？", places: 2, diff: true },
  { total: 40, each: 2.2, label: "每套衣服用布 2.2 米，40 米布最多能做多少套？", floor: true },
  { total: 30, each: 2.2, label: "每套衣服用布 2.2 米，30 米布最多能做多少套？", floor: true },
  { total: 13.6, each: 4, label: "13.6 吨橘子，每车运 4 吨，至少几车运完？", ceil: true },
  { total: 58.5, each: 4.5, label: "58.5 千克苹果，每箱装 4.5 千克，正好能装多少箱？" },
  { total: 76.8, each: 2.4, label: "76.8 米彩带每 2.4 米做一个装饰，可以做多少个？" },
  { total: 12.5, each: 0.8, label: "12.5 升油，每瓶装 0.8 升，至少需要多少个瓶子？", ceil: true },
  { total: 9.6, each: 0.32, label: "9.6 米绳子每 0.32 米剪一段，可以剪多少段？" },
  { total: 45, each: 2.8, label: "45 元买单价 2.8 元的练习本，最多可以买多少本？", floor: true },
].map((item, index) => {
  let value: number;
  let formatter: (value: number) => string = formatNumber;
  let reasoning: string;
  if ("target" in item && item.target !== undefined && "targetDays" in item && item.targetDays !== undefined && "days" in item && item.days !== undefined && "diff" in item && item.diff) {
    value = item.target / item.targetDays - item.total / item.days;
    formatter = (v) => `${formatRounded(v, item.places)}万件`;
    reasoning = `${item.target} ÷ ${item.targetDays} - ${item.total} ÷ ${item.days} = ${formatNumber(value, 8)}，保留${item.places}位小数。`;
  } else if ("target" in item && item.target !== undefined && "targetMinutes" in item && item.targetMinutes !== undefined && "minutes" in item && item.minutes !== undefined) {
    value = (item.target / item.targetMinutes) / (item.total / item.minutes);
    formatter = (v) => `${formatRounded(v, item.places)}倍`;
    reasoning = `先分别求速度：${item.target} ÷ ${item.targetMinutes} 和 ${item.total} ÷ ${item.minutes}，再相除，结果约为 ${formatRounded(value, item.places)} 倍。`;
  } else {
    const divisionItem = item as { total: number; each: number; ceil?: boolean; floor?: boolean };
    const raw = divisionItem.total / divisionItem.each;
    value = divisionItem.ceil ? Math.ceil(raw) : divisionItem.floor ? Math.floor(raw) : raw;
    formatter = divisionItem.ceil || divisionItem.floor ? (v) => String(v) : formatNumber;
    reasoning = `${divisionItem.total} ÷ ${divisionItem.each} = ${formatNumber(raw, 8)}。${
      divisionItem.ceil ? "“至少需要”要向上取整。" : divisionItem.floor ? "“最多可以买/做”要向下取整。" : "能整除时直接取商。"
    }`;
  }
  return makeComputedQuestion(
    `s-gen-a-${index + 1}`,
    "super",
    item.label,
    value,
    `${reasoning} 所以答案是 ${formatter(value)}。`,
    ["综合应用", "实际取整"],
    index + 1,
    formatter
  );
});

const superCompare = [
  { a: 0.12, b1: 0.03, b2: 0.3 },
  { a: 0.425, b1: 0.005, b2: 0.05 },
  { a: 3.7, b1: 0.4, b2: 0.04 },
  { a: 42, b1: 0.35, b2: 3.5 },
  { a: 6.48, b1: 0.8, b2: 0.08 },
  { a: 0.9, b1: 0.045, b2: 0.45 },
  { a: 18, b1: 0.24, b2: 2.4 },
  { a: 1.69, b1: 2.6, b2: 0.26 },
  { a: 7.56, b1: 1.8, b2: 0.18 },
  { a: 0.34, b1: 0.017, b2: 0.17 },
].map((item, index) => {
  const q1 = item.a / item.b1;
  const q2 = item.a / item.b2;
  const correct = q1 > q2 ? "第一道大" : q1 < q2 ? "第二道大" : "一样大";
  return makeQuestion(
    `s-compare-${index + 1}`,
    "super",
    `比较 ${item.a} ÷ ${item.b1} 和 ${item.a} ÷ ${item.b2} 的商，哪个更大？`,
    correct,
    ["第一道大", "第二道大", "一样大", "无法比较"].filter((item) => item !== correct),
    `${item.a} ÷ ${item.b1} = ${formatNumber(q1)}，${item.a} ÷ ${item.b2} = ${formatNumber(q2)}，所以${correct}。除数越小，商通常越大，但这里仍要算清楚。`,
    ["比较", "小数除法"],
    index + 11
  );
});

const superRounding = [
  { value: 5 / 11, places: 2 },
  { value: 6 / 11, places: 2 },
  { value: 7 / 11, places: 2 },
  { value: 8 / 11, places: 2 },
  { value: 1 / 11, places: 3 },
  { value: 2 / 11, places: 3 },
  { value: 3 / 11, places: 3 },
  { value: 4 / 11, places: 3 },
  { value: 25 / 22, places: 3 },
  { value: 10 / 6, places: 2 },
].map((item, index) => {
  const correct = formatRounded(item.value, item.places);
  return makeQuestion(
    `s-round-${index + 1}`,
    "super",
    `${index < 8 ? `${index + 1} ÷ 11` : index === 8 ? "25 ÷ 22" : "10 ÷ 6"} 保留${item.places}位小数约是？`,
    correct,
    [
      formatRounded(item.value, Math.max(0, item.places - 1)),
      formatRounded(item.value, item.places + 1),
      formatNumber(Math.floor(item.value)),
      formatNumber(Math.ceil(item.value)),
    ],
    `先得到商 ${formatNumber(item.value, 8)}，再看保留位数的下一位，按“四舍五入”得到 ${correct}。`,
    ["循环小数", "近似值"],
    index + 21
  );
});

export const MATH_GRADE_SIX_UNIT_ONE_QUESTIONS: GradeSixQuestion[] = [
  ...mediumMultiplication,
  ...mediumDivision,
  ...mediumRounding,
  ...hardQuestions,
  ...hardGenerated,
  ...superGenerated,
  ...superCompare,
  ...superRounding,
].map((question, index) => ({ ...question, id: `g6u1-${index + 1}` }));

export function getGradeSixQuestionCounts() {
  return MATH_GRADE_SIX_UNIT_ONE_QUESTIONS.reduce(
    (counts, question) => {
      counts[question.difficulty] += 1;
      return counts;
    },
    { medium: 0, hard: 0, super: 0 } satisfies Record<GradeSixDifficulty, number>
  );
}

export function getGradeSixUnitOneQuestions(difficulty?: GradeSixDifficulty) {
  return difficulty
    ? MATH_GRADE_SIX_UNIT_ONE_QUESTIONS.filter((question) => question.difficulty === difficulty)
    : MATH_GRADE_SIX_UNIT_ONE_QUESTIONS;
}

export function getQuestionAnswerLabel(question: GradeSixQuestion) {
  return `${letters[question.answerIndex]}. ${question.options[question.answerIndex]}`;
}
