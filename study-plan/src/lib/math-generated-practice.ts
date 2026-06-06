export type MathGeneratedDifficulty = "medium" | "hard" | "super";
export type MathGeneratedQuestionType = "choice" | "fill_blank";

export type MathGeneratedUnit = {
  id: string;
  order: number;
  title: string;
  shortTitle: string;
  focus: string;
  sourceRange: string;
  styleNotes: string[];
};

export type MathGeneratedQuestion = {
  id: string;
  unitId: string;
  unitTitle: string;
  difficulty: MathGeneratedDifficulty;
  difficultyLabel: string;
  index: number;
  type: MathGeneratedQuestionType;
  prompt: string;
  options?: string[];
  answer: string;
  acceptableAnswers?: string[];
  explanation: string;
  wrongReasons?: Record<string, string>;
  tags: string[];
};

type Fraction = {
  n: number;
  d: number;
};

const DIFFICULTY_META: Record<
  MathGeneratedDifficulty,
  { label: string; desc: string; offset: number }
> = {
  medium: { label: "中等", desc: "基础迁移，稳住概念和常规计算。", offset: 0 },
  hard: { label: "困难", desc: "多一步条件，要求先判断再计算。", offset: 1000 },
  super: { label: "超级困难", desc: "综合陷阱题，接近拓展和探究题。", offset: 2000 },
};

export const MATH_GENERATED_DIFFICULTIES = [
  { key: "medium", ...DIFFICULTY_META.medium },
  { key: "hard", ...DIFFICULTY_META.hard },
  { key: "super", ...DIFFICULTY_META.super },
] satisfies Array<{ key: MathGeneratedDifficulty; label: string; desc: string; offset: number }>;

export const PDF_MATH_SOURCE_SUMMARY = {
  fileName: "辅侨五数下（自主学习单）2026.2.14.pdf",
  pages: 106,
  scannedLocalMaterials: "数学资料目录：382 个 docx、7 个 doc、1 个 pdf。",
  questionStyle:
    "每课按“乐学基础、乐学拓展、乐学探究”组织，常见题型是填空、选择、判断、计算、看图列式和应用题。新题保留这种思路，但统一改成可自动判分的选择题和填空题。",
};

export const MATH_GENERATED_UNITS: MathGeneratedUnit[] = [
  {
    id: "unit-1",
    order: 1,
    title: "第一单元：简易方程",
    shortTitle: "简易方程",
    focus: "等式、方程、解方程、列方程解决实际问题。",
    sourceRange: "PDF P1-P16",
    styleNotes: ["判断等式和方程", "根据数量关系列方程", "解方程并检验", "用方程处理差倍、盈亏、行程问题"],
  },
  {
    id: "unit-2",
    order: 2,
    title: "第二单元：折线统计图",
    shortTitle: "折线统计图",
    focus: "读单式、复式折线统计图，判断趋势和变化快慢。",
    sourceRange: "PDF P17-P22",
    styleNotes: ["从数据表抽象成折线趋势", "判断最高、最低、上升和下降", "用变化量解释现象"],
  },
  {
    id: "unit-3",
    order: 3,
    title: "第三单元：因数与倍数",
    shortTitle: "因数与倍数",
    focus: "因数、倍数、2/3/5 的倍数特征、质数合数、公因数和公倍数。",
    sourceRange: "PDF P23-P41",
    styleNotes: ["成对找因数", "用倍数特征排除", "最大公因数和最小公倍数", "联系实际分组和周期问题"],
  },
  {
    id: "unit-4",
    order: 4,
    title: "第四单元：分数的意义和性质",
    shortTitle: "分数的意义和性质",
    focus: "分数意义、分数与除法、真分数假分数、约分通分和大小比较。",
    sourceRange: "PDF P42-P60",
    styleNotes: ["找单位“1”", "分数单位和分数个数", "假分数和带分数互化", "约分通分比较大小"],
  },
  {
    id: "unit-5",
    order: 5,
    title: "第五单元：分数加法和减法",
    shortTitle: "分数加法和减法",
    focus: "异分母分数加减、连加连减、加减混合和简单方程。",
    sourceRange: "PDF P61-P68",
    styleNotes: ["先通分再计算", "结果要约成最简分数", "分数加减应用题", "分数方程"],
  },
  {
    id: "unit-6",
    order: 6,
    title: "第六单元：长方体和正方体",
    shortTitle: "长方体和正方体",
    focus: "棱、面、表面积、体积、容积、单位换算和涂色正方体。",
    sourceRange: "PDF P69-P84",
    styleNotes: ["从长宽高判断面和棱", "表面积与体积公式", "容积和体积单位换算", "涂色正方体分类计数"],
  },
  {
    id: "unit-7",
    order: 7,
    title: "第七单元：分数乘法",
    shortTitle: "分数乘法",
    focus: "分数乘整数、求一个数的几分之几、分数乘分数、倒数。",
    sourceRange: "PDF P85-P97",
    styleNotes: ["分数乘法意义", "单位量乘分率", "连续求几分之几", "倒数判断"],
  },
  {
    id: "unit-8",
    order: 8,
    title: "第八单元：整理与复习",
    shortTitle: "整理与复习",
    focus: "数的世界、图形王国和应用广角的综合复习。",
    sourceRange: "PDF P98-P106",
    styleNotes: ["多单元混合", "先判断知识点再计算", "综合应用和易错点回炉"],
  },
];

const getUnit = (unitId: string) =>
  MATH_GENERATED_UNITS.find((unit) => unit.id === unitId) ?? MATH_GENERATED_UNITS[0];

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
};

const lcm = (a: number, b: number) => Math.abs(a * b) / gcd(a, b);

const fraction = (n: number, d: number): Fraction => {
  if (d === 0) throw new Error("Fraction denominator cannot be zero.");
  const sign = d < 0 ? -1 : 1;
  const divisor = gcd(n, d);
  return { n: (n / divisor) * sign, d: Math.abs(d / divisor) };
};

const addFraction = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const subFraction = (a: Fraction, b: Fraction) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const mulFraction = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);

const fractionText = (value: Fraction) => (value.d === 1 ? String(value.n) : `${value.n}/${value.d}`);

const mixedFractionText = (value: Fraction) => {
  if (Math.abs(value.n) < value.d || value.d === 1) return fractionText(value);
  const whole = Math.trunc(value.n / value.d);
  const rest = Math.abs(value.n % value.d);
  return rest === 0 ? String(whole) : `${whole}又${rest}/${value.d}`;
};

const divisors = (value: number) => {
  const result: number[] = [];
  for (let n = 1; n <= value; n += 1) {
    if (value % n === 0) result.push(n);
  }
  return result;
};

const isPrime = (value: number) => value > 1 && divisors(value).length === 2;

const primeFactorText = (value: number) => {
  const factors: number[] = [];
  let rest = value;
  for (let n = 2; n <= rest; n += 1) {
    while (rest % n === 0) {
      factors.push(n);
      rest /= n;
    }
  }
  return factors.join("×");
};

const seededOrder = (value: string, seed: number) =>
  [...value].reduce((sum, char) => sum + char.charCodeAt(0), seed * 31);

const uniqueOptions = (correct: string, distractors: string[], seed: number) => {
  const options = Array.from(new Set([correct, ...distractors].filter(Boolean)));
  const fallbackOptions = ["无法确定", "以上都不对", "0", "1", "2", "3"];
  let fallbackIndex = 0;
  while (options.length < 4) {
    const fallback = fallbackOptions[fallbackIndex] ?? `选项${fallbackIndex + 1}`;
    fallbackIndex += 1;
    if (!options.includes(fallback)) options.push(fallback);
  }
  return options
    .slice(0, 4)
    .sort((a, b) => seededOrder(a, seed) - seededOrder(b, seed));
};

const questionBase = (
  unitId: string,
  difficulty: MathGeneratedDifficulty,
  index: number,
  type: MathGeneratedQuestionType,
  prompt: string,
  answer: string,
  explanation: string,
  tags: string[],
  extra: Partial<MathGeneratedQuestion> = {}
): MathGeneratedQuestion => {
  const unit = getUnit(unitId);
  return {
    id: `${unitId}-${difficulty}-${index + 1}`,
    unitId,
    unitTitle: unit.title,
    difficulty,
    difficultyLabel: DIFFICULTY_META[difficulty].label,
    index: index + 1,
    type,
    prompt,
    answer,
    explanation,
    tags,
    ...extra,
  };
};

const choiceQuestion = (
  unitId: string,
  difficulty: MathGeneratedDifficulty,
  index: number,
  prompt: string,
  correct: string,
  distractors: string[],
  explanation: string,
  tags: string[],
  wrongReasons: Record<string, string> = {}
) => {
  const options = uniqueOptions(correct, distractors, index + DIFFICULTY_META[difficulty].offset);
  return questionBase(unitId, difficulty, index, "choice", prompt, correct, explanation, tags, {
    options,
    wrongReasons,
  });
};

const fillQuestion = (
  unitId: string,
  difficulty: MathGeneratedDifficulty,
  index: number,
  prompt: string,
  answer: string,
  explanation: string,
  tags: string[],
  acceptableAnswers: string[] = []
) =>
  questionBase(unitId, difficulty, index, "fill_blank", prompt, answer, explanation, tags, {
    acceptableAnswers,
  });

const levelOf = (difficulty: MathGeneratedDifficulty) =>
  difficulty === "medium" ? 0 : difficulty === "hard" ? 1 : 2;

const decimal = (value: number) => Number(value.toFixed(2)).toString();

const makeUnit1Question = (index: number, difficulty: MathGeneratedDifficulty): MathGeneratedQuestion => {
  const level = levelOf(difficulty);
  const variant = index % 8;
  const a = 2 + ((index + level) % 7);
  const x = 3 + ((index * 2 + level) % 12);
  const b = 5 + ((index * 3 + level) % 18);
  const c = a * x + b;

  if (variant === 0) {
    return choiceQuestion(
      "unit-1",
      difficulty,
      index,
      `方程 ${a}x + ${b} = ${c} 的解是（ ）。`,
      `x=${x}`,
      [`x=${x + 1}`, `x=${Math.max(1, x - 1)}`, `x=${a + b}`],
      `两边先减 ${b}，得 ${a}x=${a * x}；再除以 ${a}，所以 x=${x}。`,
      ["解方程", "等式性质"],
      {
        [`x=${x + 1}`]: `代入左边得到 ${a * (x + 1) + b}，不等于 ${c}。`,
        [`x=${Math.max(1, x - 1)}`]: `代入左边得到 ${a * Math.max(1, x - 1) + b}，不等于 ${c}。`,
        [`x=${a + b}`]: "把系数和常数直接相加了，没有按等式性质解。",
      }
    );
  }

  if (variant === 1) {
    const divisor = 2 + ((index + level) % 5);
    const total = x * divisor - b;
    const answer = (total + b) * divisor;
    return fillQuestion(
      "unit-1",
      difficulty,
      index,
      `解方程：x ÷ ${divisor} - ${b} = ${total}。x = ____。`,
      String(answer),
      `两边先加 ${b}，得 x÷${divisor}=${total + b}；再乘 ${divisor}，所以 x=${answer}。`,
      ["解方程", "逆运算"],
      [`x=${answer}`]
    );
  }

  if (variant === 2) {
    const total = c + 30 + level * 12;
    const used = total - x;
    return choiceQuestion(
      "unit-1",
      difficulty,
      index,
      `仓库原有 x 箱牛奶，运走 ${used} 箱后还剩 ${x} 箱。能正确表示数量关系的方程是（ ）。`,
      `x-${used}=${x}`,
      [`x+${used}=${x}`, `${used}-x=${x}`, `x÷${used}=${x}`],
      `原有数量 - 运走数量 = 剩下数量，所以方程是 x-${used}=${x}。`,
      ["列方程", "数量关系"]
    );
  }

  if (variant === 3) {
    const price = 6 + ((index + level) % 9);
    const count = 4 + level + (index % 4);
    const money = price * count + b;
    return fillQuestion(
      "unit-1",
      difficulty,
      index,
      `每本练习本 ${price} 元，买 ${count} 本后还剩 ${b} 元，原来有 ${money} 元。设每本练习本单价为 x 元，方程 ${count}x+${b}=${money} 中 x = ____。`,
      String(price),
      `先算 ${money}-${b}=${price * count}，再除以 ${count}，x=${price}。`,
      ["列方程", "应用题"],
      [`x=${price}`]
    );
  }

  if (variant === 4) {
    return choiceQuestion(
      "unit-1",
      difficulty,
      index,
      `下面式子中，方程是（ ）。`,
      `${a}x+${b}=${c}`,
      [`${a}+${b}=${a + b}`, `${a}x+${b}`, `${a + b}>${a}`],
      `方程必须同时有未知数和等号。${a}x+${b}=${c} 同时满足这两个条件。`,
      ["方程概念", "等式"]
    );
  }

  if (variant === 5) {
    const older = 8 + index + level;
    const multiple = 2 + level;
    const child = older;
    const adult = multiple * child + b;
    return fillQuestion(
      "unit-1",
      difficulty,
      index,
      `妈妈年龄比聪聪年龄的 ${multiple} 倍多 ${b} 岁，妈妈 ${adult} 岁。聪聪 ____ 岁。`,
      String(child),
      `设聪聪 x 岁，${multiple}x+${b}=${adult}，${multiple}x=${adult - b}，x=${child}。`,
      ["列方程", "倍数关系"]
    );
  }

  if (variant === 6) {
    const y = decimal(1.5 + ((index + level) % 9) * 0.4);
    const multiplier = 3 + level;
    const total = decimal(Number(y) * multiplier + b / 10);
    return choiceQuestion(
      "unit-1",
      difficulty,
      index,
      `方程 ${multiplier}x + ${decimal(b / 10)} = ${total} 的解是（ ）。`,
      `x=${y}`,
      [`x=${decimal(Number(y) + 0.4)}`, `x=${decimal(Number(y) - 0.4)}`, `x=${total}`],
      `先减 ${decimal(b / 10)}，再除以 ${multiplier}，得到 x=${y}。`,
      ["小数方程", "等式性质"]
    );
  }

  const sum = 40 + index + level * 8;
  const diff = 6 + ((index + level) % 9);
  const small = (sum - diff) / 2;
  const adjustedSmall = Number.isInteger(small) ? small : small + 0.5;
  const adjustedSum = adjustedSmall * 2 + diff;
  return fillQuestion(
    "unit-1",
    difficulty,
    index,
    `甲乙两数和是 ${adjustedSum}，甲比乙多 ${diff}。设乙为 x，则 x + (x+${diff}) = ${adjustedSum}，乙是 ____。`,
    String(adjustedSmall),
    `两个乙再加差 ${diff} 等于总和，2x=${adjustedSum - diff}，x=${adjustedSmall}。`,
    ["差倍问题", "列方程"]
  );
};

const makeUnit2Question = (index: number, difficulty: MathGeneratedDifficulty): MathGeneratedQuestion => {
  const level = levelOf(difficulty);
  const days = ["周一", "周二", "周三", "周四", "周五"];
  const base = 18 + (index % 7) * 3 + level * 4;
  const data = days.map((_, i) => base + ((index * (i + 2) + i * 7 + level * 5) % 24));
  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const maxDay = days[data.indexOf(maxValue)];
  const minDay = days[data.indexOf(minValue)];
  const changes = data.slice(1).map((value, i) => value - data[i]);
  const fastestRise = Math.max(...changes);
  const fastestIndex = changes.indexOf(fastestRise);
  const table = days.map((day, i) => `${day}${data[i]}`).join("，");

  if (index % 4 === 0) {
    return choiceQuestion(
      "unit-2",
      difficulty,
      index,
      `某小组一周阅读页数如下：${table}。如果画成折线统计图，最高点对应（ ）。`,
      `${maxDay} ${maxValue}页`,
      [`${minDay} ${minValue}页`, `${days[0]} ${data[0]}页`, `${days[4]} ${data[4]}页`],
      `折线统计图最高点表示最大数量。最大值是 ${maxValue} 页，对应 ${maxDay}。`,
      ["折线统计图", "最高点"],
      {
        [`${minDay} ${minValue}页`]: "这是最低点，不是最高点。",
      }
    );
  }

  if (index % 4 === 1) {
    return fillQuestion(
      "unit-2",
      difficulty,
      index,
      `某地 5 天气温为：${table}。最高温和最低温相差 ____ ℃。`,
      String(maxValue - minValue),
      `最大值 ${maxValue}，最小值 ${minValue}，相差 ${maxValue - minValue}。`,
      ["折线统计图", "极差"]
    );
  }

  if (index % 4 === 2) {
    const answer = fastestRise > 0 ? `${days[fastestIndex]}到${days[fastestIndex + 1]}` : "没有上升";
    return choiceQuestion(
      "unit-2",
      difficulty,
      index,
      `一组数据为：${table}。哪一段上升最快？（ ）`,
      answer,
      [
        `${days[0]}到${days[1]}`,
        `${days[1]}到${days[2]}`,
        `${days[3]}到${days[4]}`,
      ],
      fastestRise > 0
        ? `逐段比较变化量，最大上升量是 ${fastestRise}，发生在${answer}。`
        : "每一段都没有比前一天高，所以没有上升。",
      ["折线统计图", "变化趋势"]
    );
  }

  const target = 2 + (index % 3);
  return fillQuestion(
    "unit-2",
    difficulty,
    index,
    `一组折线统计图数据是：${table}。从${days[target - 1]}到${days[target]}变化了 ____。上升写正数，下降写负数。`,
    String(data[target] - data[target - 1]),
    `${days[target]}的数量减去${days[target - 1]}的数量：${data[target]}-${data[target - 1]}=${data[target] - data[target - 1]}。`,
    ["折线统计图", "变化量"]
  );
};

const makeUnit3Question = (index: number, difficulty: MathGeneratedDifficulty): MathGeneratedQuestion => {
  const level = levelOf(difficulty);
  const a = 18 + ((index * 3 + level * 5) % 42);
  const b = 24 + ((index * 5 + level * 7) % 48);
  const commonFactor = gcd(a, b);
  const commonMultiple = lcm(a, b);

  if (index % 7 === 0) {
    return choiceQuestion(
      "unit-3",
      difficulty,
      index,
      `${a} 和 ${b} 的最大公因数是（ ）。`,
      String(commonFactor),
      [String(commonFactor + 1), String(Math.min(a, b)), String(gcd(a + 1, b))],
      `用成对找因数或分解质因数，${a} 和 ${b} 的最大公因数是 ${commonFactor}。`,
      ["最大公因数", "因数"]
    );
  }

  if (index % 7 === 1) {
    return fillQuestion(
      "unit-3",
      difficulty,
      index,
      `${a} 和 ${b} 的最小公倍数是 ____。`,
      String(commonMultiple),
      `最小公倍数 = ${a}×${b}÷最大公因数 ${commonFactor} = ${commonMultiple}。`,
      ["最小公倍数", "倍数"]
    );
  }

  if (index % 7 === 2) {
    const value = 30 + ((index * 7 + level * 11) % 70);
    const ds = divisors(value);
    return fillQuestion(
      "unit-3",
      difficulty,
      index,
      `${value} 一共有 ____ 个因数。`,
      String(ds.length),
      `${value} 的因数是 ${ds.join("、")}，一共有 ${ds.length} 个。`,
      ["因数个数", "成对找因数"]
    );
  }

  if (index % 7 === 3) {
    const prefix = 32 + ((index + level) % 25);
    const choices = [0, 2, 4, 6, 8].filter((digit) => (prefix * 10 + digit) % 3 === 0);
    const answer = choices.join("、");
    return choiceQuestion(
      "unit-3",
      difficulty,
      index,
      `三位数 ${prefix}□ 既是 2 的倍数，又是 3 的倍数，□里可以填（ ）。`,
      answer || "无",
      ["0、2、4", "2、5、8", "1、4、7"],
      `是 2 的倍数，个位只能是 0、2、4、6、8；再让各位数字和是 3 的倍数，得到 ${answer || "没有符合的数字"}。`,
      ["2 的倍数", "3 的倍数"]
    );
  }

  if (index % 7 === 4) {
    const value = 20 + ((index * 4 + level) % 55);
    const answer = isPrime(value) ? "质数" : "合数";
    return choiceQuestion(
      "unit-3",
      difficulty,
      index,
      `${value} 是（ ）。`,
      answer,
      [answer === "质数" ? "合数" : "质数", "既不是质数也不是合数", "无法判断"],
      isPrime(value)
        ? `${value} 只有 1 和它本身两个因数，所以是质数。`
        : `${value} 除了 1 和它本身还有其他因数，所以是合数。`,
      ["质数", "合数"]
    );
  }

  if (index % 7 === 5) {
    const value = 36 + ((index + level * 3) % 36);
    return fillQuestion(
      "unit-3",
      difficulty,
      index,
      `把 ${value} 分解质因数：${value}=____。`,
      primeFactorText(value),
      `从最小质数开始试除，直到所有因数都是质数，得到 ${value}=${primeFactorText(value)}。`,
      ["分解质因数", "质因数"]
    );
  }

  const peopleChoices = [72, 84, 90, 96, 108, 120];
  const people = peopleChoices[(index + level) % peopleChoices.length];
  const team = divisors(people).filter((n) => n > 5 && n < 20);
  return choiceQuestion(
    "unit-3",
    difficulty,
    index,
    `${people} 名同学平均分队，每队人数多于 5 人少于 20 人，每队人数不可能是（ ）。`,
    String(17),
    [String(team[0]), String(team[1]), String(team[2])],
    `每队人数必须是 ${people} 的因数，且在 5 到 20 之间。17 不是 ${people} 的因数。`,
    ["因数应用", "分组"]
  );
};

const makeUnit4Question = (index: number, difficulty: MathGeneratedDifficulty): MathGeneratedQuestion => {
  const level = levelOf(difficulty);
  const denominator = 5 + ((index + level) % 10);
  const numerator = 1 + ((index * 2 + level) % (denominator - 1));
  const frac = fraction(numerator, denominator);

  if (index % 7 === 0) {
    return fillQuestion(
      "unit-4",
      difficulty,
      index,
      `${fractionText(frac)} 的分数单位是 ____。`,
      `1/${frac.d}`,
      `分母是 ${frac.d}，所以分数单位是 1/${frac.d}。`,
      ["分数单位", "分数意义"]
    );
  }

  if (index % 7 === 1) {
    const total = denominator * (3 + level);
    const part = numerator * (3 + level);
    return choiceQuestion(
      "unit-4",
      difficulty,
      index,
      `${part} 是 ${total} 的几分之几？（ ）`,
      fractionText(fraction(part, total)),
      [fractionText(fraction(total, part)), `${part}/${total}`, fractionText(fraction(part + 1, total))],
      `求一个数是另一个数的几分之几，用 ${part}÷${total}=${fractionText(fraction(part, total))}。`,
      ["分数与除法", "约分"]
    );
  }

  if (index % 7 === 2) {
    const improper = fraction(denominator + numerator + level, denominator);
    return fillQuestion(
      "unit-4",
      difficulty,
      index,
      `把假分数 ${fractionText(improper)} 化成带分数或整数：____。`,
      mixedFractionText(improper),
      `${improper.n}÷${improper.d}，商是 ${Math.trunc(improper.n / improper.d)}，余数是 ${improper.n % improper.d}，所以是 ${mixedFractionText(improper)}。`,
      ["假分数", "带分数"]
    );
  }

  if (index % 7 === 3) {
    const f1 = fraction(numerator, denominator);
    const f2 = fraction(numerator + 1, denominator + 2 + level);
    const compare = f1.n * f2.d > f2.n * f1.d ? ">" : f1.n * f2.d < f2.n * f1.d ? "<" : "=";
    return choiceQuestion(
      "unit-4",
      difficulty,
      index,
      `比较大小：${fractionText(f1)} ○ ${fractionText(f2)}，○里应填（ ）。`,
      compare,
      [">", "<", "="],
      `通分比较：${f1.n}×${f2.d}=${f1.n * f2.d}，${f2.n}×${f1.d}=${f2.n * f1.d}，所以填 ${compare}。`,
      ["通分", "分数大小比较"]
    );
  }

  if (index % 7 === 4) {
    const raw = fraction(numerator * 3, denominator * 3);
    return fillQuestion(
      "unit-4",
      difficulty,
      index,
      `把 ${raw.n}/${raw.d} 约成最简分数：____。`,
      fractionText(fraction(raw.n, raw.d)),
      `${raw.n} 和 ${raw.d} 的最大公因数是 ${gcd(raw.n, raw.d)}，同时除以它得到 ${fractionText(fraction(raw.n, raw.d))}。`,
      ["约分", "最简分数"]
    );
  }

  if (index % 7 === 5) {
    const people = 7 * (6 + ((index + level) % 7));
    const calligraphy = fraction(2, 7);
    return choiceQuestion(
      "unit-4",
      difficulty,
      index,
      `五年级某班有 ${people} 人，其中 ${fractionText(calligraphy)} 参加书法社，参加书法社的有（ ）人。`,
      String((people * calligraphy.n) / calligraphy.d),
      [String(people - 7), String(Math.floor(people / 2)), String(people + 2)],
      `把全班人数看作单位“1”，${people}×${fractionText(calligraphy)}=${(people * calligraphy.n) / calligraphy.d}。`,
      ["单位1", "分数意义"]
    );
  }

  const decimalValue = numerator / denominator;
  return fillQuestion(
    "unit-4",
    difficulty,
    index,
    `把 ${fractionText(frac)} 化成小数，保留两位小数是 ____。`,
    decimal(decimalValue),
    `${fractionText(frac)}=${frac.n}÷${frac.d}≈${decimal(decimalValue)}。`,
    ["分数与小数互化", "近似数"]
  );
};

const makeUnit5Question = (index: number, difficulty: MathGeneratedDifficulty): MathGeneratedQuestion => {
  const level = levelOf(difficulty);
  const d1 = 5 + ((index + level) % 7);
  const d2 = 6 + ((index * 2 + level) % 8);
  const f1 = fraction(1 + (index % (d1 - 1)), d1);
  const f2 = fraction(1 + ((index + 2 + level) % (d2 - 1)), d2);
  const sum = addFraction(f1, f2);
  const difference = f1.n * f2.d >= f2.n * f1.d ? subFraction(f1, f2) : subFraction(f2, f1);

  if (index % 6 === 0) {
    return choiceQuestion(
      "unit-5",
      difficulty,
      index,
      `${fractionText(f1)} + ${fractionText(f2)} =（ ）。`,
      fractionText(sum),
      [fractionText(fraction(f1.n + f2.n, f1.d + f2.d)), fractionText(fraction(sum.n + 1, sum.d)), mixedFractionText(sum)],
      `异分母分数先通分，再相加，结果约分为 ${fractionText(sum)}。`,
      ["异分母加法", "通分"]
    );
  }

  if (index % 6 === 1) {
    return fillQuestion(
      "unit-5",
      difficulty,
      index,
      `计算：较大的一个分数减较小的一个分数，${fractionText(f1)} 和 ${fractionText(f2)} 的差是 ____。`,
      fractionText(difference),
      `先比较大小，再通分相减，差是 ${fractionText(difference)}。`,
      ["异分母减法", "比较大小"]
    );
  }

  if (index % 6 === 2) {
    const third = fraction(1, 10 + (index % 5) + level);
    const result = addFraction(subFraction(sum, third), fraction(0, 1));
    return fillQuestion(
      "unit-5",
      difficulty,
      index,
      `计算：${fractionText(f1)} + ${fractionText(f2)} - ${fractionText(third)} = ____。`,
      fractionText(result),
      `先算前两个分数的和 ${fractionText(sum)}，再减 ${fractionText(third)}，结果是 ${fractionText(result)}。`,
      ["分数加减混合", "通分"]
    );
  }

  if (index % 6 === 3) {
    const x = fractionText(f1);
    const target = addFraction(f1, f2);
    return choiceQuestion(
      "unit-5",
      difficulty,
      index,
      `方程 x + ${fractionText(f2)} = ${fractionText(target)} 的解是（ ）。`,
      x,
      [fractionText(f2), fractionText(target), fractionText(addFraction(target, f2))],
      `两边同时减 ${fractionText(f2)}，x=${fractionText(target)}-${fractionText(f2)}=${x}。`,
      ["分数方程", "等式性质"]
    );
  }

  if (index % 6 === 4) {
    const used = addFraction(f1, f2);
    const less = f2;
    const second = subFraction(used, less);
    return fillQuestion(
      "unit-5",
      difficulty,
      index,
      `第一周用煤 ${fractionText(used)} 吨，第二周比第一周少 ${fractionText(less)} 吨，第二周用煤 ____ 吨。`,
      fractionText(second),
      `第二周 = 第一周 - 少用的量，${fractionText(used)}-${fractionText(less)}=${fractionText(second)}。`,
      ["分数应用题", "异分母减法"]
    );
  }

  const total = addFraction(f1, f2);
  return choiceQuestion(
    "unit-5",
    difficulty,
    index,
    `一根彩带第一次用去 ${fractionText(f1)} 米，第二次用去 ${fractionText(f2)} 米，两次共用去（ ）米。`,
    fractionText(total),
    [fractionText(fraction(f1.n + f2.n, f1.d + f2.d)), fractionText(difference), fractionText(fraction(total.n, total.d + 1))],
    `题目问“两次共用”，用加法。异分母先通分，结果是 ${fractionText(total)} 米。`,
    ["分数加法", "实际问题"]
  );
};

const makeUnit6Question = (index: number, difficulty: MathGeneratedDifficulty): MathGeneratedQuestion => {
  const level = levelOf(difficulty);
  const length = 6 + ((index + level) % 9);
  const width = 3 + ((index * 2 + level) % 6);
  const height = 2 + ((index * 3 + level) % 5);
  const edgeSum = 4 * (length + width + height);
  const surface = 2 * (length * width + length * height + width * height);
  const volume = length * width * height;

  if (index % 7 === 0) {
    return choiceQuestion(
      "unit-6",
      difficulty,
      index,
      `一个长方体长 ${length} cm、宽 ${width} cm、高 ${height} cm，棱长总和是（ ）cm。`,
      String(edgeSum),
      [String(length + width + height), String(2 * (length + width + height)), String(surface)],
      `长方体棱长总和是 4×(长+宽+高)=4×(${length}+${width}+${height})=${edgeSum}。`,
      ["长方体棱长", "公式"]
    );
  }

  if (index % 7 === 1) {
    return fillQuestion(
      "unit-6",
      difficulty,
      index,
      `一个长方体长 ${length} cm、宽 ${width} cm、高 ${height} cm，体积是 ____ 立方厘米。`,
      String(volume),
      `长方体体积 = 长×宽×高 = ${length}×${width}×${height}=${volume}。`,
      ["长方体体积", "公式"]
    );
  }

  if (index % 7 === 2) {
    return choiceQuestion(
      "unit-6",
      difficulty,
      index,
      `一个无盖长方体盒子长 ${length} cm、宽 ${width} cm、高 ${height} cm，做这个盒子至少需要（ ）平方厘米材料。`,
      String(length * width + 2 * length * height + 2 * width * height),
      [String(surface), String(length * width + length * height + width * height), String(volume)],
      `无盖盒子少上面，只算底面和四个侧面：${length * width}+2×${length}×${height}+2×${width}×${height}=${length * width + 2 * length * height + 2 * width * height}。`,
      ["表面积", "无盖盒子"]
    );
  }

  if (index % 7 === 3) {
    const cube = 3 + ((index + level) % 7);
    return fillQuestion(
      "unit-6",
      difficulty,
      index,
      `棱长 ${cube} cm 的正方体表面积是 ____ 平方厘米。`,
      String(6 * cube * cube),
      `正方体 6 个面完全相同，表面积 = 6×${cube}×${cube}=${6 * cube * cube}。`,
      ["正方体表面积", "公式"]
    );
  }

  if (index % 7 === 4) {
    const liters = 2 + ((index + level) % 8);
    return choiceQuestion(
      "unit-6",
      difficulty,
      index,
      `${liters} 升 =（ ）立方厘米。`,
      String(liters * 1000),
      [String(liters * 100), String(liters * 10), String(liters * 10000)],
      `1 升 = 1000 立方厘米，所以 ${liters} 升 = ${liters * 1000} 立方厘米。`,
      ["体积单位", "容积"]
    );
  }

  if (index % 7 === 5) {
    const n = 4 + ((index + level) % 5);
    return fillQuestion(
      "unit-6",
      difficulty,
      index,
      `把棱长为 ${n} 的大正方体表面涂色，再切成棱长 1 的小正方体，恰有两个面涂色的小正方体有 ____ 个。`,
      String(12 * (n - 2)),
      `两个面涂色的小正方体在 12 条棱上，每条棱中间有 ${n - 2} 个，共 12×${n - 2}=${12 * (n - 2)}。`,
      ["涂色正方体", "分类计数"]
    );
  }

  return choiceQuestion(
    "unit-6",
    difficulty,
    index,
    `一个长方体体积是 ${volume} 立方厘米，长 ${length} cm，宽 ${width} cm，高是（ ）cm。`,
    String(height),
    [String(height + 1), String(width), String(length + width)],
    `高 = 体积÷长÷宽 = ${volume}÷${length}÷${width}=${height}。`,
    ["体积反推", "长方体"]
  );
};

const makeUnit7Question = (index: number, difficulty: MathGeneratedDifficulty): MathGeneratedQuestion => {
  const level = levelOf(difficulty);
  const d1 = 5 + ((index + level) % 8);
  const f1 = fraction(1 + ((index * 2 + level) % (d1 - 1)), d1);
  const integer = 6 + ((index + level) % 12);
  const product = mulFraction(f1, fraction(integer, 1));

  if (index % 7 === 0) {
    return choiceQuestion(
      "unit-7",
      difficulty,
      index,
      `${fractionText(f1)} × ${integer} =（ ）。`,
      fractionText(product),
      [fractionText(fraction(f1.n + integer, f1.d)), fractionText(fraction(f1.n, f1.d * integer)), mixedFractionText(product)],
      `分数乘整数，用分子和整数相乘，分母不变，再约分，结果是 ${fractionText(product)}。`,
      ["分数乘整数", "约分"]
    );
  }

  if (index % 7 === 1) {
    const total = d1 * (4 + level);
    const answer = (total * f1.n) / f1.d;
    return fillQuestion(
      "unit-7",
      difficulty,
      index,
      `${total} 千克的 ${fractionText(f1)} 是 ____ 千克。`,
      String(answer),
      `求一个数的几分之几，用乘法：${total}×${fractionText(f1)}=${answer}。`,
      ["求几分之几", "分数乘法"]
    );
  }

  if (index % 7 === 2) {
    const f2 = fraction(1 + ((index + 2) % 5), 7 + ((index + level) % 5));
    const answer = mulFraction(f1, f2);
    return fillQuestion(
      "unit-7",
      difficulty,
      index,
      `计算：${fractionText(f1)} × ${fractionText(f2)} = ____。`,
      fractionText(answer),
      `分子乘分子、分母乘分母，再约分：${fractionText(f1)}×${fractionText(f2)}=${fractionText(answer)}。`,
      ["分数乘分数", "约分"]
    );
  }

  if (index % 7 === 3) {
    return choiceQuestion(
      "unit-7",
      difficulty,
      index,
      `${fractionText(f1)} 的倒数是（ ）。`,
      fractionText(fraction(f1.d, f1.n)),
      [fractionText(f1), `${f1.n}/${f1.d + 1}`, String(f1.d - f1.n)],
      `乘积是 1 的两个数互为倒数，把分子分母调换，${fractionText(f1)} 的倒数是 ${fractionText(fraction(f1.d, f1.n))}。`,
      ["倒数", "分数"]
    );
  }

  if (index % 7 === 4) {
    const days = level + 2;
    const daily = fraction(1 + (index % 2), 8 + level * 4 + (index % 4));
    const remain = subFraction(fraction(1, 1), mulFraction(daily, fraction(days, 1)));
    return fillQuestion(
      "unit-7",
      difficulty,
      index,
      `一条路每天修全长的 ${fractionText(daily)}，修 ${days} 天后还剩全长的 ____。`,
      fractionText(remain),
      `已修 ${fractionText(daily)}×${days}，还剩 1-已修部分，结果是 ${fractionText(remain)}。`,
      ["分数乘法应用", "剩余问题"]
    );
  }

  if (index % 7 === 5) {
    const second = fraction(2 + level, 5 + level);
    const first = second.d * (6 + ((index + level) % 8));
    const answer = (first * second.n) / second.d;
    return choiceQuestion(
      "unit-7",
      difficulty,
      index,
      `果园有苹果树 ${first} 棵，梨树是苹果树的 ${fractionText(second)}，梨树有（ ）棵。`,
      String(answer),
      [String(first + answer), String(first - answer), String(first)],
      `“梨树是苹果树的 ${fractionText(second)}”表示用苹果树棵数乘这个分率，${first}×${fractionText(second)}=${answer}。`,
      ["分数应用题", "单位量"]
    );
  }

  const f2 = fraction(2 + (index % 4), 9 + level);
  const result = mulFraction(mulFraction(f1, f2), fraction(integer, 1));
  return fillQuestion(
    "unit-7",
    difficulty,
    index,
    `计算：${integer} × ${fractionText(f1)} × ${fractionText(f2)} = ____。`,
    fractionText(result),
    `连乘可以先约分再乘，结果是 ${fractionText(result)}。`,
    ["分数连乘", "约分"]
  );
};

const makeUnit8Question = (index: number, difficulty: MathGeneratedDifficulty): MathGeneratedQuestion => {
  const unitMakers = [
    makeUnit1Question,
    makeUnit3Question,
    makeUnit4Question,
    makeUnit5Question,
    makeUnit6Question,
    makeUnit7Question,
    makeUnit2Question,
  ];
  const source = unitMakers[index % unitMakers.length](index + 17, difficulty);
  const unit = getUnit("unit-8");
  return {
    ...source,
    id: `unit-8-${difficulty}-${index + 1}`,
    unitId: "unit-8",
    unitTitle: unit.title,
    prompt: `【综合复习】${source.prompt}`,
    tags: ["整理复习", ...source.tags],
  };
};

const makeUnit1SuperQuestion = (index: number): MathGeneratedQuestion => {
  const variant = index % 8;
  const x = 8 + ((index * 5) % 23);

  if (variant === 0) {
    const a = 5 + (index % 5);
    const b = 3 + (index % 4);
    const c = 2 + (index % 3);
    const d = 4 + (index % 6);
    const e = 9 + (index % 7);
    const total = a * (x + b) - c * (x - d) + e;
    return fillQuestion(
      "unit-1",
      "super",
      index,
      `解方程：${a}(x + ${b}) - ${c}(x - ${d}) + ${e} = ${total}。x = ____。`,
      String(x),
      `先去括号并合并：${a - c}x+${a * b + c * d + e}=${total}；移项得 ${a - c}x=${(a - c) * x}，所以 x=${x}。`,
      ["超级困难", "多步方程", "去括号"]
    );
  }

  if (variant === 1) {
    const multiple = 3 + (index % 3);
    const adjust = 7 + (index % 8);
    const small = 12 + (index % 18);
    const sum = small + multiple * small - adjust;
    return choiceQuestion(
      "unit-1",
      "super",
      index,
      `甲、乙两数的和是 ${sum}，甲比乙的 ${multiple} 倍少 ${adjust}。乙是（ ）。`,
      String(small),
      [String(small + adjust), String(Math.floor(sum / 2)), String(multiple * small - adjust)],
      `设乙为 x，则甲是 ${multiple}x-${adjust}，列方程 x+${multiple}x-${adjust}=${sum}，解得 x=${small}。`,
      ["超级困难", "列方程", "和倍问题"]
    );
  }

  if (variant === 2) {
    const days = 18 + (index % 5) * 2;
    const early = 3 + (index % 3);
    const extra = early;
    const planned = (extra * (days - early)) / early;
    const total = planned * days;
    return fillQuestion(
      "unit-1",
      "super",
      index,
      `一本书计划 ${days} 天看完，实际每天比计划多看 ${extra} 页，结果提前 ${early} 天看完。这本书共有 ____ 页。`,
      String(total),
      `设计划每天看 x 页，${days}x=(${days}-${early})(x+${extra})，解得 x=${planned}，总页数 ${days}×${planned}=${total}。`,
      ["超级困难", "列方程", "提前完成"]
    );
  }

  if (variant === 3) {
    const a = decimal(2.4 + (index % 4) * 0.3);
    const b = decimal(0.6 + (index % 3) * 0.2);
    const add = decimal(1.5 + (index % 5) * 0.4);
    const total = decimal((Number(a) - Number(b)) * x + Number(add));
    return choiceQuestion(
      "unit-1",
      "super",
      index,
      `方程 ${a}x - ${b}x + ${add} = ${total} 的解是（ ）。`,
      `x=${x}`,
      [`x=${x + 2}`, `x=${Math.max(1, x - 2)}`, `x=${total}`],
      `先合并同类项：(${a}-${b})x+${add}=${total}；再解得 x=${x}。`,
      ["超级困难", "小数方程", "合并同类项"]
    );
  }

  if (variant === 4) {
    const diff = 120 + (index % 7) * 20;
    const secondBoys = diff * 5;
    const secondGirls = Math.round(secondBoys * 1.2);
    return fillQuestion(
      "unit-1",
      "super",
      index,
      `第一小学男生比女生多 ${diff} 人。第二小学女生人数是男生的 1.2 倍，把两个学校合在一起后男、女生人数相等。第二小学共有学生 ____ 人。`,
      String(secondBoys + secondGirls),
      `设第二小学男生 x 人，女生 1.2x 人。第二小学女生要比男生多 ${diff} 人，所以 1.2x-x=${diff}，x=${secondBoys}，总人数 ${secondBoys}+${secondGirls}=${secondBoys + secondGirls}。`,
      ["超级困难", "列方程", "人数问题"]
    );
  }

  if (variant === 6) {
    const slow = 42 + (index % 5) * 4;
    const fast = slow + 18 + (index % 4) * 3;
    const restHours = 2 + (index % 3);
    const movingHours = 5 + (index % 4);
    const distance = slow * movingHours + fast * (movingHours - restHours);
    return fillQuestion(
      "unit-1",
      "super",
      index,
      `甲、乙两车从两地同时相向而行。甲每小时 ${slow} 千米，乙每小时 ${fast} 千米；乙中途休息 ${restHours} 小时，甲一直行驶。两车 ${movingHours} 小时后相遇，两地相距 ____ 千米。`,
      String(distance),
      `甲走 ${slow}×${movingHours}，乙实际走 ${movingHours}-${restHours} 小时；总路程=${slow * movingHours}+${fast}×${movingHours - restHours}=${distance}。`,
      ["超级困难", "列方程", "行程问题", "分段条件"]
    );
  }

  if (variant === 7) {
    const pen = 9 + (index % 6);
    const book = 3 + (index % 4);
    const totalItems = 28 + (index % 7) * 2;
    const penCount = 8 + (index % 8);
    const money = pen * penCount + book * (totalItems - penCount);
    return choiceQuestion(
      "unit-1",
      "super",
      index,
      `买钢笔和练习本共 ${totalItems} 件，共花 ${money} 元。钢笔每支 ${pen} 元，练习本每本 ${book} 元。钢笔买了（ ）支。`,
      String(penCount),
      [String(penCount + 2), String(Math.max(1, penCount - 2)), String(totalItems - penCount)],
      `设钢笔 x 支，则练习本 ${totalItems}-x 本，${pen}x+${book}(${totalItems}-x)=${money}，解得 x=${penCount}。`,
      ["超级困难", "列方程", "鸡兔同笼"]
    );
  }

  const totalDays = 12 + (index % 5);
  const sunnyRate = 32 + (index % 4) * 3;
  const rainyRate = 18 + (index % 3) * 2;
  const rainyDays = 3 + (index % 4);
  const distance = sunnyRate * (totalDays - rainyDays) + rainyRate * rainyDays;
  return choiceQuestion(
    "unit-1",
    "super",
    index,
    `研学队伍晴天每天走 ${sunnyRate} km，雨天每天走 ${rainyRate} km，${totalDays} 天共走 ${distance} km。雨天有（ ）天。`,
    String(rainyDays),
    [String(rainyDays + 1), String(Math.max(0, rainyDays - 1)), String(totalDays - rainyDays)],
    `设雨天 x 天，${rainyRate}x+${sunnyRate}(${totalDays}-x)=${distance}，解得 x=${rainyDays}。`,
    ["超级困难", "列方程", "行程问题"]
  );
};

const makeUnit2SuperQuestion = (index: number): MathGeneratedQuestion => {
  const variant = index % 7;
  const months = ["1月", "2月", "3月", "4月", "5月", "6月"];
  const start = 24 + (index % 8) * 3;
  const data = months.map((_, i) => start + i * (4 + (index % 3)) + ((i % 2) * (index % 5)));
  const table = months.map((month, i) => `${month}${data[i]}`).join("，");

  if (variant === 0) {
    const answer = decimal((data[5] - data[0]) / 5);
    return fillQuestion(
      "unit-2",
      "super",
      index,
      `某校 1-6 月社团作品数量为：${table}。若按首尾平均变化量继续增长，7月预计 ____ 件。`,
      String(Number((data[5] + Number(answer)).toFixed(2))),
      `先用首尾差求平均变化量：(${data[5]}-${data[0]})÷5=${answer}；7月预计 ${data[5]}+${answer}=${Number((data[5] + Number(answer)).toFixed(2))} 件。`,
      ["超级困难", "折线统计图", "平均变化量"]
    );
  }

  if (variant === 1) {
    const avg = Math.round(data.reduce((sum, value) => sum + value, 0) / data.length);
    const missingIndex = 2 + (index % 3);
    const knownSum = data.reduce((sum, value, i) => (i === missingIndex ? sum : sum + value), 0);
    const missing = avg * data.length - knownSum;
    return fillQuestion(
      "unit-2",
      "super",
      index,
      `六个月数据的平均数是 ${avg}，其中${months[missingIndex]}数据被遮住。已知其余月份为：${months.map((month, i) => (i === missingIndex ? `${month}?` : `${month}${data[i]}`)).join("，")}。遮住的数据是 ____。`,
      String(missing),
      `总量是 ${avg}×6=${avg * 6}，已知五个月合计 ${knownSum}，所以遮住的数据是 ${avg * 6}-${knownSum}=${missing}。`,
      ["超级困难", "统计图", "反推数据"]
    );
  }

  if (variant === 2) {
    const changes = data.slice(1).map((value, i) => value - data[i]);
    const maxChange = Math.max(...changes);
    const minChange = Math.min(...changes);
    return choiceQuestion(
      "unit-2",
      "super",
      index,
      `一组折线统计图数据为：${table}。下列说法错误的是（ ）。`,
      `最大上升量和最小上升量相差 ${maxChange + minChange}`,
      [
        `最大上升量是 ${maxChange}`,
        `最小上升量是 ${minChange}`,
        `最后一个月比第一个月多 ${data[5] - data[0]}`,
      ],
      `最大上升量和最小上升量应相差 ${maxChange - minChange}，不是 ${maxChange + minChange}。`,
      ["超级困难", "折线统计图", "真假判断"]
    );
  }

  if (variant === 3) {
    const classA = data;
    const classB = data.map((value, i) => value + ((i % 3) - 1) * (3 + (index % 4)));
    const gaps = classA.map((value, i) => Math.abs(value - classB[i]));
    const maxGap = Math.max(...gaps);
    const maxMonth = months[gaps.indexOf(maxGap)];
    return choiceQuestion(
      "unit-2",
      "super",
      index,
      `甲班数据：${months.map((month, i) => `${month}${classA[i]}`).join("，")}；乙班数据：${months.map((month, i) => `${month}${classB[i]}`).join("，")}。两班差距最大的是（ ）。`,
      `${maxMonth}，相差 ${maxGap}`,
      [`${months[0]}，相差 ${gaps[0]}`, `${months[2]}，相差 ${gaps[2]}`, `${months[5]}，相差 ${gaps[5]}`],
      `逐月求差，最大差距是 ${maxGap}，对应 ${maxMonth}。`,
      ["超级困难", "复式折线统计图", "比较"]
    );
  }

  if (variant === 5) {
    const days = ["周一", "周二", "周三", "周四", "周五", "周六"];
    const base = 38 + (index % 6) * 2;
    const scores = days.map((_, i) => base + i * (2 + (index % 3)) - (i % 2) * (index % 4));
    const targetAverage = Math.ceil((scores.reduce((sum, value) => sum + value, 0) + 45) / 7);
    const needed = targetAverage * 7 - scores.reduce((sum, value) => sum + value, 0);
    return fillQuestion(
      "unit-2",
      "super",
      index,
      `跳绳记录前六天为：${days.map((day, i) => `${day}${scores[i]}个`).join("，")}。若七天平均数至少达到 ${targetAverage} 个，周日至少要跳 ____ 个。`,
      String(needed),
      `七天总数至少 ${targetAverage}×7=${targetAverage * 7}，前六天合计 ${scores.reduce((sum, value) => sum + value, 0)}，所以周日至少 ${needed} 个。`,
      ["超级困难", "平均数", "反推数据"]
    );
  }

  if (variant === 6) {
    const classA = data;
    const classB = data.map((value, i) => value + 5 + (i % 2) * (2 + (index % 3)) - (i % 3));
    const totalA = classA.reduce((sum, value) => sum + value, 0);
    const totalB = classB.reduce((sum, value) => sum + value, 0);
    const answer = totalA > totalB ? `甲班多 ${totalA - totalB}` : `乙班多 ${totalB - totalA}`;
    return choiceQuestion(
      "unit-2",
      "super",
      index,
      `甲班 1-6 月阅读量：${months.map((month, i) => `${month}${classA[i]}`).join("，")}；乙班 1-6 月阅读量：${months.map((month, i) => `${month}${classB[i]}`).join("，")}。六个月合计比较，正确的是（ ）。`,
      answer,
      [
        totalA > totalB ? `乙班多 ${totalA - totalB}` : `甲班多 ${totalB - totalA}`,
        `甲班多 ${Math.abs(classA[5] - classB[5])}`,
        `乙班多 ${Math.abs(classA[0] - classB[0])}`,
      ],
      `甲班合计 ${totalA}，乙班合计 ${totalB}，两者相差 ${Math.abs(totalA - totalB)}。`,
      ["超级困难", "复式折线统计图", "合计比较"]
    );
  }

  const targetIndex = 4;
  const before = data[targetIndex - 1];
  const after = data[targetIndex + 1];
  const middle = Math.round((before + after) / 2);
  return fillQuestion(
    "unit-2",
    "super",
    index,
    `某折线统计图中，${months[targetIndex - 1]}为 ${before}，${months[targetIndex + 1]}为 ${after}。若${months[targetIndex]}正好在这两点的中间高度，${months[targetIndex]}是 ____。`,
    String(middle),
    `中间高度取平均数：(${before}+${after})÷2=${middle}。`,
    ["超级困难", "折线统计图", "估计数据"]
  );
};

const makeUnit3SuperQuestion = (index: number): MathGeneratedQuestion => {
  const variant = index % 8;

  if (variant === 0) {
    const giftA = 72 + (index % 5) * 12;
    const giftB = 96 + (index % 6) * 12;
    const giftC = 120 + (index % 4) * 24;
    const people = gcd(gcd(giftA, giftB), giftC);
    const perStudent = giftA / people + giftB / people + giftC / people;
    return fillQuestion(
      "unit-3",
      "super",
      index,
      `有 ${giftA} 支铅笔、${giftB} 本练习本和 ${giftC} 张卡片，平均奖给尽可能多的学生且都没有剩余。此时每名学生一共得到 ____ 件奖品。`,
      String(perStudent),
      `先求最多学生数：${giftA}、${giftB}、${giftC} 的最大公因数是 ${people}；每人得到 ${giftA / people}+${giftB / people}+${giftC / people}=${perStudent} 件。`,
      ["超级困难", "最大公因数", "分配应用"]
    );
  }

  if (variant === 1) {
    const p = 6 + (index % 5);
    const q = 8 + (index % 4) * 2;
    const r = 9 + (index % 3) * 3;
    const period = lcm(lcm(p, q), r);
    const cycles = 2 + (index % 4);
    const seconds = period * cycles + Math.floor(period / 2);
    const count = Math.floor(seconds / period) + 1;
    return choiceQuestion(
      "unit-3",
      "super",
      index,
      `三盏灯分别每 ${p} 秒、${q} 秒、${r} 秒闪一次，从同时闪开始计时，到 ${seconds} 秒结束，一共同时闪了（ ）次。`,
      String(count),
      [String(Math.max(1, count - 1)), String(count + 1), String(period)],
      `共同周期是 ${period} 秒，包含开始那一次，所以次数是 ⌊${seconds}÷${period}⌋+1=${count}。`,
      ["超级困难", "最小公倍数", "周期问题"]
    );
  }

  if (variant === 2) {
    const step = lcm(4 + (index % 4), 6 + (index % 5));
    const remainder = 2 + (index % 3);
    const base = step * (5 + (index % 7)) + remainder;
    return fillQuestion(
      "unit-3",
      "super",
      index,
      `一个数除以 ${4 + (index % 4)} 和 ${6 + (index % 5)} 都余 ${remainder}，且大于 ${base - step}。这样的最小数是 ____。`,
      String(base),
      `先找两个除数的最小公倍数 ${step}，这个数应是 ${step} 的倍数再加 ${remainder}，大于 ${base - step} 的最小值是 ${base}。`,
      ["超级困难", "最小公倍数", "同余"]
    );
  }

  if (variant === 3) {
    const tens = 4 + (index % 5);
    const valid = [0, 2, 4, 6, 8].filter((digit) => ((tens * 10 + digit) % 3 === 0));
    return choiceQuestion(
      "unit-3",
      "super",
      index,
      `两位数 ${tens}□ 同时是 2 和 3 的倍数，但不是 5 的倍数。□里可以填（ ）。`,
      valid.filter((digit) => digit !== 0).join("、"),
      [valid.join("、"), "0、5", "2、4、6、8"],
      `同时是 2 和 3 的倍数，个位要是偶数且数字和能被 3 整除；又不能是 5 的倍数，所以个位不能是 0。`,
      ["超级困难", "倍数特征", "排除"]
    );
  }

  if (variant === 4) {
    const value = 72 + (index % 6) * 12;
    return fillQuestion(
      "unit-3",
      "super",
      index,
      `${value} 的质因数分解是 ${primeFactorText(value)}。它的不同质因数有 ____ 个。`,
      String(new Set(primeFactorText(value).split("×")).size),
      `分解结果中去掉重复质因数后再计数。`,
      ["超级困难", "质因数", "计数"]
    );
  }

  if (variant === 6) {
    const x = 72 + (index % 5) * 12;
    const y = 96 + (index % 6) * 12;
    const z = 120 + (index % 4) * 24;
    const cut = gcd(gcd(x, y), z);
    const pieces = x / cut + y / cut + z / cut;
    return fillQuestion(
      "unit-3",
      "super",
      index,
      `三根彩带分别长 ${x} cm、${y} cm、${z} cm，要剪成同样长的小段且没有剩余。若每段尽量长，一共能剪成 ____ 段。`,
      String(pieces),
      `每段最长是三数的最大公因数 ${cut} cm；段数为 ${x}÷${cut}+${y}÷${cut}+${z}÷${cut}=${pieces}。`,
      ["超级困难", "最大公因数", "分段应用"]
    );
  }

  if (variant === 7) {
    const step = lcm(lcm(6, 8), 9);
    const rawMultiplier = 2 + (index % 5);
    const answer = step * (rawMultiplier === 5 ? 6 : rawMultiplier);
    const low = answer - 35;
    const high = answer + 40;
    return choiceQuestion(
      "unit-3",
      "super",
      index,
      `一个数在 ${low} 到 ${high} 之间，同时是 6、8、9 的倍数，但不是 5 的倍数。这个数是（ ）。`,
      String(answer),
      [String(answer + step), String(answer - step), String(answer + 5)],
      `同时是 6、8、9 的倍数，必须是它们最小公倍数 ${step} 的倍数；范围内符合且不是 5 的倍数的是 ${answer}。`,
      ["超级困难", "最小公倍数", "范围筛选"]
    );
  }

  const x = 18 + (index % 8) * 3;
  const y = 24 + (index % 6) * 4;
  return choiceQuestion(
    "unit-3",
    "super",
    index,
    `${x} 和 ${y} 的最大公因数与最小公倍数的乘积是（ ）。`,
    String(x * y),
    [String(gcd(x, y) + lcm(x, y)), String(lcm(x, y)), String(gcd(x, y))],
    `两个数的最大公因数×最小公倍数=两个数的乘积，所以是 ${x}×${y}=${x * y}。`,
    ["超级困难", "最大公因数", "最小公倍数"]
  );
};

const makeUnit4SuperQuestion = (index: number): MathGeneratedQuestion => {
  const variant = index % 8;

  if (variant === 0) {
    const value = 42 + (index % 3) * 42;
    return fillQuestion(
      "unit-4",
      "super",
      index,
      `五年级某班人数在 ${value - 5} 到 ${value + 5} 之间，其中 2/7 的同学参加书法社，1/6 的同学参加围棋社。这个班有 ____ 人。`,
      String(value),
      `人数必须同时是 7 和 6 的倍数，即 42 的倍数；在这个范围内只有 ${value}。`,
      ["超级困难", "单位1", "倍数"]
    );
  }

  if (variant === 1) {
    const f1 = fraction(7 + (index % 4), 9 + (index % 5));
    const f2 = fraction(5 + (index % 5), 7 + (index % 4));
    const compare = f1.n * f2.d > f2.n * f1.d ? ">" : f1.n * f2.d < f2.n * f1.d ? "<" : "=";
    return choiceQuestion(
      "unit-4",
      "super",
      index,
      `不化成小数，比较 ${fractionText(f1)} 和 ${fractionText(f2)}，中间应填（ ）。`,
      compare,
      [">", "<", "="],
      `交叉相乘：${f1.n}×${f2.d}=${f1.n * f2.d}，${f2.n}×${f1.d}=${f2.n * f1.d}，所以填 ${compare}。`,
      ["超级困难", "分数大小", "交叉相乘"]
    );
  }

  if (variant === 2) {
    const d = 8 + (index % 7);
    const n = d * 2 - 3 - (index % 3);
    const need = d - (n % d);
    return fillQuestion(
      "unit-4",
      "super",
      index,
      `${n}/${d} 至少再添上 ____ 个 1/${d}，就能成为下一个整数。`,
      String(need),
      `${n}/${d} 距离下一个整数还差 ${need}/${d}，所以要添 ${need} 个 1/${d}。`,
      ["超级困难", "分数单位", "假分数"]
    );
  }

  if (variant === 3) {
    const f = fraction(3 + (index % 5), 8 + (index % 4));
    const targetD = f.d * (3 + (index % 4));
    const targetN = f.n * (targetD / f.d);
    return choiceQuestion(
      "unit-4",
      "super",
      index,
      `${fractionText(f)} = □/${targetD}，□里应填（ ）。`,
      String(targetN),
      [String(targetN + f.n), String(f.n + f.d), String(targetD - targetN)],
      `分母从 ${f.d} 变成 ${targetD}，扩大 ${targetD / f.d} 倍，分子也扩大同样倍数：${f.n}×${targetD / f.d}=${targetN}。`,
      ["超级困难", "分数基本性质", "等值分数"]
    );
  }

  if (variant === 4) {
    const whole = 2 + (index % 5);
    const part = fraction(3 + (index % 3), 7 + (index % 4));
    const improper = fraction(whole * part.d + part.n, part.d);
    return fillQuestion(
      "unit-4",
      "super",
      index,
      `把 ${whole}又${part.n}/${part.d} 化成假分数：____。`,
      fractionText(improper),
      `整数部分化成 ${whole * part.d}/${part.d}，再加 ${part.n}/${part.d}，得到 ${fractionText(improper)}。`,
      ["超级困难", "带分数", "假分数"]
    );
  }

  if (variant === 6) {
    const f1 = fraction(3 + (index % 4), 10 + (index % 5));
    const f2 = fraction(5 + (index % 4), 12 + (index % 5));
    const commonD = lcm(f1.d, f2.d);
    const n1 = f1.n * (commonD / f1.d);
    const n2 = f2.n * (commonD / f2.d);
    return fillQuestion(
      "unit-4",
      "super",
      index,
      `把 ${fractionText(f1)} 和 ${fractionText(f2)} 通分成分母最小相同的两个分数，两个新分子的和是 ____。`,
      String(n1 + n2),
      `最小公分母是 ${commonD}；两个分子分别是 ${n1} 和 ${n2}，和为 ${n1 + n2}。`,
      ["超级困难", "通分", "最小公倍数"]
    );
  }

  if (variant === 7) {
    const d = 24 + (index % 4) * 6;
    const lower = fraction(2, 3);
    const upper = fraction(3, 4);
    const values = Array.from({ length: d - 1 }, (_, i) => i + 1).filter(
      (n) => n * lower.d > lower.n * d && n * upper.d < upper.n * d
    );
    return choiceQuestion(
      "unit-4",
      "super",
      index,
      `分母为 ${d} 的真分数中，比 ${fractionText(lower)} 大、比 ${fractionText(upper)} 小的分数有（ ）个。`,
      String(values.length),
      [String(values.length + 1), String(Math.max(0, values.length - 1)), String(d / 4)],
      `只数满足 ${fractionText(lower)} < n/${d} < ${fractionText(upper)} 的分子 n，符合的是 ${values.join("、")}，共 ${values.length} 个。`,
      ["超级困难", "分数大小", "范围计数"]
    );
  }

  const total = 8 * (9 + (index % 6) * 2);
  const part = fraction(3, 8);
  return choiceQuestion(
    "unit-4",
    "super",
    index,
    `一根绳子长 ${total} 米，第一次用去全长的 ${fractionText(part)}，还剩（ ）米。`,
    String(total - (total * part.n) / part.d),
    [String((total * part.n) / part.d), String(total - part.n), String(total / part.d)],
    `用去 ${total}×${fractionText(part)}=${(total * part.n) / part.d} 米，还剩 ${total}-${(total * part.n) / part.d}=${total - (total * part.n) / part.d} 米。`,
    ["超级困难", "单位1", "实际问题"]
  );
};

const makeUnit5SuperQuestion = (index: number): MathGeneratedQuestion => {
  const variant = index % 8;
  const f1 = fraction(2 + (index % 5), 7 + (index % 6));
  const f2 = fraction(1 + (index % 4), 8 + (index % 5));

  if (variant === 0) {
    const f3 = fraction(1, 10 + (index % 6));
    const second = addFraction(f1, f2);
    const third = subFraction(second, f3);
    const result = addFraction(addFraction(f1, second), third);
    return fillQuestion(
      "unit-5",
      "super",
      index,
      `修一条路，第一天修 ${fractionText(f1)} 千米；第二天比第一天多修 ${fractionText(f2)} 千米；第三天比第二天少修 ${fractionText(f3)} 千米。三天共修 ____ 千米。`,
      fractionText(result),
      `第二天修 ${fractionText(second)} 千米，第三天修 ${fractionText(third)} 千米；三天共 ${fractionText(f1)}+${fractionText(second)}+${fractionText(third)}=${fractionText(result)} 千米。`,
      ["超级困难", "分数加减应用", "多步反推"]
    );
  }

  if (variant === 1) {
    const total = fraction(1, 1);
    const remaining = subFraction(subFraction(total, f1), f2);
    return choiceQuestion(
      "unit-5",
      "super",
      index,
      `一项工程第一天完成 ${fractionText(f1)}，第二天完成 ${fractionText(f2)}，还剩（ ）。`,
      fractionText(remaining),
      [fractionText(addFraction(f1, f2)), fractionText(subFraction(f1, f2)), fractionText(f1)],
      `还剩 1-${fractionText(f1)}-${fractionText(f2)}=${fractionText(remaining)}。`,
      ["超级困难", "分数应用题", "剩余"]
    );
  }

  if (variant === 2) {
    const target = addFraction(f1, f2);
    return fillQuestion(
      "unit-5",
      "super",
      index,
      `解方程：x - ${fractionText(f2)} = ${fractionText(f1)}。x = ____。`,
      fractionText(target),
      `两边同时加 ${fractionText(f2)}，x=${fractionText(f1)}+${fractionText(f2)}=${fractionText(target)}。`,
      ["超级困难", "分数方程", "逆运算"]
    );
  }

  if (variant === 3) {
    const routeA = addFraction(f1, fraction(1, 6 + (index % 5)));
    const routeB = addFraction(f2, fraction(1, 5 + (index % 4)));
    const answer =
      routeA.n * routeB.d > routeB.n * routeA.d
        ? "甲路远"
        : routeA.n * routeB.d < routeB.n * routeA.d
          ? "乙路远"
          : "一样远";
    return choiceQuestion(
      "unit-5",
      "super",
      index,
      `甲路长 ${fractionText(routeA)} 千米，乙路长 ${fractionText(routeB)} 千米。比较两条路，（ ）。`,
      answer,
      [answer === "甲路远" ? "乙路远" : "甲路远", "一样远", "无法比较"],
      `通分比较 ${fractionText(routeA)} 和 ${fractionText(routeB)}，可知${answer}。`,
      ["超级困难", "分数大小", "应用比较"]
    );
  }

  if (variant === 5) {
    const f3 = fraction(3 + (index % 4), 11 + (index % 5));
    const total = addFraction(addFraction(f1, f2), f3);
    return fillQuestion(
      "unit-5",
      "super",
      index,
      `一根彩带先剪去 ${fractionText(f1)} 米，又剪去 ${fractionText(f2)} 米，还剩 ${fractionText(f3)} 米。这根彩带原来长 ____ 米。`,
      fractionText(total),
      `原长=两次剪去+剩下，${fractionText(f1)}+${fractionText(f2)}+${fractionText(f3)}=${fractionText(total)} 米。`,
      ["超级困难", "分数加法", "原量反推"]
    );
  }

  if (variant === 6) {
    const f3 = fraction(1 + (index % 3), 9 + (index % 4));
    const result = addFraction(subFraction(fraction(1, 1), addFraction(f1, f2)), f3);
    return choiceQuestion(
      "unit-5",
      "super",
      index,
      `计算 1 - (${fractionText(f1)} + ${fractionText(f2)}) + ${fractionText(f3)} 的结果是（ ）。`,
      fractionText(result),
      [
        fractionText(subFraction(fraction(1, 1), addFraction(f1, f2))),
        fractionText(addFraction(addFraction(f1, f2), f3)),
        fractionText(subFraction(fraction(1, 1), f1)),
      ],
      `先算括号，再加减：1-${fractionText(addFraction(f1, f2))}+${fractionText(f3)}=${fractionText(result)}。`,
      ["超级困难", "分数加减混合", "括号"]
    );
  }

  if (variant === 7) {
    const gap = fraction(1 + (index % 4), 10 + (index % 5));
    const friend = addFraction(f1, gap);
    const total = addFraction(f1, friend);
    return fillQuestion(
      "unit-5",
      "super",
      index,
      `小明走了 ${fractionText(f1)} 千米，比小华少走 ${fractionText(gap)} 千米。两人一共走了 ____ 千米。`,
      fractionText(total),
      `小华走 ${fractionText(f1)}+${fractionText(gap)}=${fractionText(friend)} 千米；两人共 ${fractionText(f1)}+${fractionText(friend)}=${fractionText(total)} 千米。`,
      ["超级困难", "分数加减应用", "比较反推"]
    );
  }

  const first = addFraction(f1, f2);
  const second = subFraction(first, f2);
  return fillQuestion(
    "unit-5",
    "super",
    index,
    `第一周用煤 ${fractionText(first)} 吨，第二周比第一周少 ${fractionText(f2)} 吨，两周共用煤 ____ 吨。`,
    fractionText(addFraction(first, second)),
    `第二周用 ${fractionText(first)}-${fractionText(f2)}=${fractionText(second)} 吨；两周共 ${fractionText(first)}+${fractionText(second)}=${fractionText(addFraction(first, second))} 吨。`,
    ["超级困难", "分数加减应用", "两步计算"]
  );
};

const makeUnit6SuperQuestion = (index: number): MathGeneratedQuestion => {
  const variant = index % 8;

  if (variant === 0) {
    const length = 18 + (index % 6) * 3;
    const width = 5 + (index % 4);
    const height = 4 + (index % 3);
    const oldSurface = 2 * (length * width + length * height + width * height);
    const newSurface = oldSurface + 6 * width * height;
    return fillQuestion(
      "unit-6",
      "super",
      index,
      `一个长方体长 ${length} cm、宽 ${width} cm、高 ${height} cm，沿垂直于长的方向切成 4 段。切开后所有小长方体表面积总和是 ____ 平方厘米。`,
      String(newSurface),
      `切成 4 段要切 3 刀，增加 6 个宽×高的面；总表面积 ${oldSurface}+6×${width}×${height}=${newSurface}。`,
      ["超级困难", "切割表面积", "长方体"]
    );
  }

  if (variant === 1) {
    const k = 2 + (index % 5);
    const edgeSum = 24 * k;
    const volume = 6 * k * k * k;
    return choiceQuestion(
      "unit-6",
      "super",
      index,
      `一个长方体长、宽、高的比是 3:2:1，棱长总和是 ${edgeSum} cm，体积是（ ）立方厘米。`,
      String(volume),
      [String(edgeSum), String(6 * k * k), String(4 * (3 + 2 + 1) * k)],
      `长宽高分别是 ${3 * k}、${2 * k}、${k}，体积是 ${3 * k}×${2 * k}×${k}=${volume}。`,
      ["超级困难", "棱长总和", "体积"]
    );
  }

  if (variant === 2) {
    const n = 5 + (index % 4);
    const noPaint = Math.pow(n - 2, 3);
    return fillQuestion(
      "unit-6",
      "super",
      index,
      `把棱长为 ${n} 的大正方体表面涂色并切成棱长 1 的小正方体，没有面涂色的小正方体有 ____ 个。`,
      String(noPaint),
      `没有面涂色的是内部小正方体，数量为 (${n}-2)^3=${noPaint}。`,
      ["超级困难", "涂色正方体", "分类计数"]
    );
  }

  if (variant === 3) {
    const length = 20 + (index % 5) * 5;
    const width = 12 + (index % 4) * 3;
    const height = 8 + (index % 3) * 2;
    const waterHeight = 3 + (index % 4);
    const volume = length * width * waterHeight;
    return choiceQuestion(
      "unit-6",
      "super",
      index,
      `一个长方体水箱长 ${length} cm、宽 ${width} cm，水深 ${waterHeight} cm。水的体积是（ ）毫升。`,
      String(volume),
      [String(length * width * height), String(length + width + waterHeight), String(2 * (length * width + length * waterHeight + width * waterHeight))],
      `水的体积只看底面积和水深：${length}×${width}×${waterHeight}=${volume} 立方厘米，也就是 ${volume} 毫升。`,
      ["超级困难", "容积", "体积"]
    );
  }

  if (variant === 4) {
    const cube = 4 + (index % 5);
    const edge = 12 * cube;
    return fillQuestion(
      "unit-6",
      "super",
      index,
      `用铁丝做一个正方体框架共用 ${edge} cm，给这个正方体所有面贴纸，至少需要 ____ 平方厘米纸。`,
      String(6 * cube * cube),
      `正方体有 12 条棱，棱长 ${edge}÷12=${cube} cm；表面积 6×${cube}×${cube}=${6 * cube * cube}。`,
      ["超级困难", "正方体", "棱长与表面积"]
    );
  }

  if (variant === 6) {
    const length = 18 + (index % 5) * 3;
    const width = 6 + (index % 4);
    const height = 5 + (index % 3);
    const oldSurface = 2 * (length * width + length * height + width * height);
    const newSurface = oldSurface + 4 * width * height;
    return fillQuestion(
      "unit-6",
      "super",
      index,
      `一个长方体长 ${length} cm、宽 ${width} cm、高 ${height} cm，沿垂直于长的方向平均切成 3 段。切开后 3 段表面积总和是 ____ 平方厘米。`,
      String(newSurface),
      `切成 3 段要切 2 刀，增加 4 个宽×高的面；总表面积 ${oldSurface}+4×${width}×${height}=${newSurface}。`,
      ["超级困难", "切割表面积", "长方体"]
    );
  }

  if (variant === 7) {
    const length = 24 + (index % 4) * 6;
    const width = 12 + (index % 3) * 4;
    const cube = 6 + (index % 4);
    const rise = decimal((cube * cube * cube) / (length * width));
    return choiceQuestion(
      "unit-6",
      "super",
      index,
      `一个长方体水槽底面长 ${length} cm、宽 ${width} cm，把一个棱长 ${cube} cm 的正方体完全浸入水中且不溢出，水面上升（ ）cm。`,
      rise,
      [decimal((cube * cube) / (length * width)), decimal((6 * cube * cube) / (length * width)), String(cube)],
      `水面上升高度=排开水的体积÷底面积，${cube}³÷(${length}×${width})=${rise} cm。`,
      ["超级困难", "体积", "水面上升"]
    );
  }

  const length = 10 + (index % 7);
  const width = 6 + (index % 5);
  const height = 4 + (index % 4);
  const openArea = length * width + 2 * length * height + 2 * width * height;
  return choiceQuestion(
    "unit-6",
    "super",
    index,
    `做一个无盖长方体鱼缸，长 ${length} dm、宽 ${width} dm、高 ${height} dm，玻璃面积至少是（ ）平方分米。`,
    String(openArea),
    [String(2 * (length * width + length * height + width * height)), String(length * width * height), String(length * width + length * height + width * height)],
    `无盖鱼缸少一个上面，面积为底面+四个侧面：${openArea}。`,
    ["超级困难", "无盖表面积", "鱼缸"]
  );
};

const makeUnit7SuperQuestion = (index: number): MathGeneratedQuestion => {
  const variant = index % 8;
  const f1 = fraction(3 + (index % 3), 8 + (index % 5));
  const f2 = fraction(2 + ((index + 1) % 3), 7 + (index % 4));

  if (variant === 0) {
    const f3 = fraction(1 + (index % 2), 5 + (index % 4));
    const stableTotal = f1.d * f2.d * f3.d * (3 + (index % 4));
    const afterFirst = subFraction(fraction(1, 1), f1);
    const afterSecond = mulFraction(afterFirst, subFraction(fraction(1, 1), f2));
    const remainRate = mulFraction(afterSecond, subFraction(fraction(1, 1), f3));
    const remain = mulFraction(fraction(stableTotal, 1), remainRate);
    return fillQuestion(
      "unit-7",
      "super",
      index,
      `${stableTotal} 千克水果，第一次取出总数的 ${fractionText(f1)}，第二次取出剩下的 ${fractionText(f2)}，第三次又取出剩下的 ${fractionText(f3)}。最后还剩 ____ 千克。`,
      fractionText(remain),
      `最后剩总数的 (1-${fractionText(f1)})×(1-${fractionText(f2)})×(1-${fractionText(f3)})=${fractionText(remainRate)}，所以还剩 ${fractionText(remain)} 千克。`,
      ["超级困难", "连续分率", "分数乘法", "剩余问题"]
    );
  }

  if (variant === 1) {
    const product = mulFraction(f1, f2);
    return choiceQuestion(
      "unit-7",
      "super",
      index,
      `${fractionText(f1)} × ${fractionText(f2)} 的倒数是（ ）。`,
      fractionText(fraction(product.d, product.n)),
      [fractionText(product), `${f1.d}/${f1.n}`, `${f2.d}/${f2.n}`],
      `先算乘积 ${fractionText(product)}，再把分子分母调换，倒数是 ${fractionText(fraction(product.d, product.n))}。`,
      ["超级困难", "倒数", "分数乘法"]
    );
  }

  if (variant === 2) {
    const afterFirst = subFraction(fraction(1, 1), f1);
    const secondUse = mulFraction(afterFirst, f2);
    const remain = subFraction(afterFirst, secondUse);
    return fillQuestion(
      "unit-7",
      "super",
      index,
      `一条路第一天修全长的 ${fractionText(f1)}，第二天修剩下的 ${fractionText(f2)}，还剩全长的 ____。`,
      fractionText(remain),
      `第一天后剩 ${fractionText(afterFirst)}；第二天用剩下的 ${fractionText(f2)}，还剩 ${fractionText(afterFirst)}×(1-${fractionText(f2)})=${fractionText(remain)}。`,
      ["超级困难", "剩余问题", "连续分率"]
    );
  }

  if (variant === 3) {
    const resultA = mulFraction(f1, fraction(10 + (index % 6), 1));
    const resultB = mulFraction(f2, fraction(12 + (index % 6), 1));
    const answer = resultA.n * resultB.d > resultB.n * resultA.d ? "甲大" : "乙大";
    return choiceQuestion(
      "unit-7",
      "super",
      index,
      `甲数是 ${10 + (index % 6)} 的 ${fractionText(f1)}，乙数是 ${12 + (index % 6)} 的 ${fractionText(f2)}。比较甲乙，（ ）。`,
      answer,
      [answer === "甲大" ? "乙大" : "甲大", "一样大", "无法比较"],
      `分别计算或通分比较：甲=${fractionText(resultA)}，乙=${fractionText(resultB)}，所以${answer}。`,
      ["超级困难", "分数乘法", "比较"]
    );
  }

  if (variant === 5) {
    const afterFirst = subFraction(fraction(1, 1), f1);
    const afterSecond = mulFraction(afterFirst, subFraction(fraction(1, 1), f2));
    const total = afterSecond.d * (4 + (index % 5));
    const remaining = (total * afterSecond.n) / afterSecond.d;
    return fillQuestion(
      "unit-7",
      "super",
      index,
      `一批零件先完成总数的 ${fractionText(f1)}，又完成剩下的 ${fractionText(f2)}，最后还剩 ${remaining} 个。这批零件原来有 ____ 个。`,
      String(total),
      `最后剩总数的 (1-${fractionText(f1)})×(1-${fractionText(f2)})=${fractionText(afterSecond)}；${fractionText(afterSecond)} 对应 ${remaining} 个，所以总数是 ${total}。`,
      ["超级困难", "连续分率", "反推总量"]
    );
  }

  if (variant === 6) {
    const totalA = f1.d * (8 + (index % 5));
    const totalB = f2.d * (7 + (index % 4));
    const valueA = mulFraction(fraction(totalA, 1), f1);
    const valueB = mulFraction(fraction(totalB, 1), f2);
    const answer =
      valueA.n * valueB.d > valueB.n * valueA.d
        ? `甲多 ${fractionText(subFraction(valueA, valueB))}`
        : `乙多 ${fractionText(subFraction(valueB, valueA))}`;
    return choiceQuestion(
      "unit-7",
      "super",
      index,
      `甲袋有 ${totalA} 千克，取出它的 ${fractionText(f1)}；乙袋有 ${totalB} 千克，取出它的 ${fractionText(f2)}。比较取出的质量，正确的是（ ）。`,
      answer,
      [
        valueA.n * valueB.d > valueB.n * valueA.d ? `乙多 ${fractionText(subFraction(valueA, valueB))}` : `甲多 ${fractionText(subFraction(valueB, valueA))}`,
        "一样多",
        `甲多 ${Math.abs(totalA - totalB)}`,
      ],
      `甲取 ${fractionText(valueA)} 千克，乙取 ${fractionText(valueB)} 千克，再比较差值。`,
      ["超级困难", "分数乘法", "比较"]
    );
  }

  if (variant === 7) {
    const total = f1.d * f2.d * (5 + (index % 4));
    const morning = mulFraction(fraction(total, 1), f1);
    const afternoon = mulFraction(subFraction(fraction(total, 1), morning), f2);
    const done = addFraction(morning, afternoon);
    return fillQuestion(
      "unit-7",
      "super",
      index,
      `计划加工 ${total} 个零件，上午完成 ${fractionText(f1)}，下午完成剩下的 ${fractionText(f2)}。上午和下午一共完成 ____ 个。`,
      fractionText(done),
      `上午完成 ${fractionText(morning)} 个；剩下 ${fractionText(subFraction(fraction(total, 1), morning))} 个，下午完成 ${fractionText(afternoon)} 个，共 ${fractionText(done)} 个。`,
      ["超级困难", "连续分率", "实际问题"]
    );
  }

  const boxes = 24 + (index % 6) * 6;
  const perBox = fraction(1, 4);
  const usedRate = fraction(3, 5);
  const used = mulFraction(mulFraction(fraction(boxes, 1), perBox), usedRate);
  return fillQuestion(
    "unit-7",
    "super",
    index,
    `一箱酸奶有 ${boxes} 盒，每盒 ${fractionText(perBox)} 升，喝掉总量的 ${fractionText(usedRate)}，喝掉 ____ 升。`,
    fractionText(used),
    `总量 ${boxes}×${fractionText(perBox)}=${fractionText(mulFraction(fraction(boxes, 1), perBox))} 升；喝掉其中 ${fractionText(usedRate)}，即 ${fractionText(used)} 升。`,
    ["超级困难", "分数乘法", "实际问题"]
  );
};

const makeUnit8SuperQuestion = (index: number): MathGeneratedQuestion => {
  const makers = [
    makeUnit1SuperQuestion,
    makeUnit3SuperQuestion,
    makeUnit4SuperQuestion,
    makeUnit5SuperQuestion,
    makeUnit6SuperQuestion,
    makeUnit7SuperQuestion,
    makeUnit2SuperQuestion,
  ];
  const source = makers[index % makers.length](index + 23);
  const unit = getUnit("unit-8");
  return {
    ...source,
    id: `unit-8-super-${index + 1}`,
    unitId: "unit-8",
    unitTitle: unit.title,
    prompt: `【综合压轴】${source.prompt}`,
    tags: ["综合压轴", ...source.tags.filter((tag) => tag !== "超级困难")],
  };
};

const UNIT_MAKERS: Record<
  string,
  (index: number, difficulty: MathGeneratedDifficulty) => MathGeneratedQuestion
> = {
  "unit-1": makeUnit1Question,
  "unit-2": makeUnit2Question,
  "unit-3": makeUnit3Question,
  "unit-4": makeUnit4Question,
  "unit-5": makeUnit5Question,
  "unit-6": makeUnit6Question,
  "unit-7": makeUnit7Question,
  "unit-8": makeUnit8Question,
};

const SUPER_UNIT_MAKERS: Record<string, (index: number) => MathGeneratedQuestion> = {
  "unit-1": makeUnit1SuperQuestion,
  "unit-2": makeUnit2SuperQuestion,
  "unit-3": makeUnit3SuperQuestion,
  "unit-4": makeUnit4SuperQuestion,
  "unit-5": makeUnit5SuperQuestion,
  "unit-6": makeUnit6SuperQuestion,
  "unit-7": makeUnit7SuperQuestion,
  "unit-8": makeUnit8SuperQuestion,
};

export function generateMathQuestions(
  unitId: string,
  difficulty: MathGeneratedDifficulty,
  count = 100
) {
  if (difficulty === "super") {
    const superMaker = SUPER_UNIT_MAKERS[unitId] ?? makeUnit1SuperQuestion;
    return Array.from({ length: count }, (_, index) => superMaker(index));
  }
  const maker = UNIT_MAKERS[unitId] ?? makeUnit1Question;
  return Array.from({ length: count }, (_, index) => maker(index, difficulty));
}

export function getGeneratedUnitTotal() {
  return MATH_GENERATED_DIFFICULTIES.length * 100;
}

export function normalizeGeneratedMathAnswer(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[，,、。；;：:\s]/g, "")
    .replace(/[（）()【】\[\]{}]/g, "")
    .replace(/[＝]/g, "=")
    .replace(/[×]/g, "*")
    .replace(/[＋]/g, "+")
    .replace(/[－]/g, "-")
    .toLowerCase();
}

export function gradeGeneratedMathQuestion(question: MathGeneratedQuestion, value: string) {
  const normalized = normalizeGeneratedMathAnswer(value);
  const answers = [question.answer, ...(question.acceptableAnswers ?? [])].map(
    normalizeGeneratedMathAnswer
  );
  return normalized.length > 0 && answers.includes(normalized);
}
