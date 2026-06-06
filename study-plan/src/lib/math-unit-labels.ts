const UNIT_TOPICS: Record<number, string> = {
  1: "简易方程",
  2: "折线统计图",
  3: "因数与倍数",
  4: "分数的意义和性质",
  5: "分数的加法和减法",
  6: "圆",
  7: "解决问题的策略",
};

const CHINESE_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const UNIT_NAMES: Record<number, string> = {
  1: "第一",
  2: "第二",
  3: "第三",
  4: "第四",
  5: "第五",
  6: "第六",
  7: "第七",
};

function uniqueSorted(values: number[]) {
  return [...new Set(values)].filter((value) => UNIT_TOPICS[value]).sort((a, b) => a - b);
}

function parseChineseUnitNumbers(value: string) {
  return uniqueSorted(
    [...value]
      .map((char) => CHINESE_DIGITS[char])
      .filter((number): number is number => Boolean(number))
  );
}

function parseNumericUnitNumbers(value: string) {
  if (value.length > 1 && [...value].every((char) => Number(char) >= 1 && Number(char) <= 7)) {
    return uniqueSorted([...value].map((char) => Number(char)));
  }
  return uniqueSorted([Number(value)]);
}

export function getMathUnitNumbers(unitLabel?: string | null) {
  const label = String(unitLabel ?? "").replace(/\s+/g, "");
  if (label.startsWith("units:")) {
    return uniqueSorted(
      label
        .replace("units:", "")
        .split(",")
        .map(Number)
    );
  }
  const match = label.match(/第([一二三四五六七八九0-9]+)[单元章]/);
  if (!match) return [];

  const raw = match[1];
  if (/^\d+$/.test(raw)) return parseNumericUnitNumbers(raw);
  return parseChineseUnitNumbers(raw);
}

function formatUnitName(numbers: number[]) {
  if (numbers.length === 0) return "未标单元";
  if (numbers.length === 1) return `${UNIT_NAMES[numbers[0]]}单元`;
  return `${numbers.map((number, index) => (index === 0 ? UNIT_NAMES[number] : UNIT_NAMES[number].replace("第", ""))).join("、")}单元`;
}

function formatTopic(numbers: number[]) {
  return numbers.map((number) => UNIT_TOPICS[number]).filter(Boolean).join("、");
}

export function getMathUnitKey(unitLabel?: string | null) {
  const label = String(unitLabel ?? "");
  if (label.startsWith("units:") || label.startsWith("special:")) return label;
  const numbers = getMathUnitNumbers(label);
  if (numbers.length > 0) return `units:${numbers.join(",")}`;
  if (label.includes("期中")) return "special:midterm";
  if (label.includes("期末")) return "special:final";
  if (label.includes("月考")) return "special:monthly";
  if (label.includes("专项")) return "special:topic";
  return "special:unknown";
}

export function getMathUnitDisplay(unitLabel?: string | null) {
  const label = String(unitLabel ?? "");
  const numbers = getMathUnitNumbers(label);
  if (numbers.length > 0) return `${formatUnitName(numbers)}｜${formatTopic(numbers)}`;
  if (label === "special:midterm") return "期中｜阶段综合复习";
  if (label === "special:final") return "期末｜全册综合复习";
  if (label === "special:monthly") return "月考｜阶段检测";
  if (label === "special:topic") return "专项｜专题训练";
  if (label === "special:unknown") return "未标单元｜综合资料";
  if (label.includes("期中")) return "期中｜阶段综合复习";
  if (label.includes("期末")) return "期末｜全册综合复习";
  if (label.includes("月考")) return "月考｜阶段检测";
  if (label.includes("专项")) return "专项｜专题训练";
  return "未标单元｜综合资料";
}

export function compareMathUnitKeys(left: string, right: string) {
  const leftNumbers = left.startsWith("units:")
    ? left
        .replace("units:", "")
        .split(",")
        .map(Number)
    : [];
  const rightNumbers = right.startsWith("units:")
    ? right
        .replace("units:", "")
        .split(",")
        .map(Number)
    : [];

  if (leftNumbers.length && rightNumbers.length) {
    return leftNumbers[0] - rightNumbers[0] || leftNumbers.length - rightNumbers.length;
  }
  if (leftNumbers.length) return -1;
  if (rightNumbers.length) return 1;
  return left.localeCompare(right, "zh-Hans-CN");
}
