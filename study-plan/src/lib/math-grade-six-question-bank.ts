import {
  MATH_GRADE_SIX_UNIT_ONE_QUESTIONS,
  MATH_GRADE_SIX_UNITS,
  type GradeSixDifficulty,
  type GradeSixQuestion,
} from "./math-grade-six";

type NumberFormatter = (value: number) => string;
type UnitQuestionGenerator = (difficulty: GradeSixDifficulty, index: number) => GradeSixQuestion;

const DIFFICULTIES: GradeSixDifficulty[] = ["medium", "hard", "super"];

function stripZeros(value: string) {
  return value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function formatNumber(value: number, digits = 6) {
  return stripZeros(value.toFixed(digits));
}

function formatFixed(digits: number): NumberFormatter {
  return (value) => value.toFixed(digits);
}

function formatMoney(value: number) {
  return `${value.toFixed(2)}元`;
}

function formatWithUnit(unit: string, digits = 6): NumberFormatter {
  return (value) => `${formatNumber(value, digits)}${unit}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function lcm(a: number, b: number) {
  return Math.abs(a * b) / gcd(a, b);
}

function formatFraction(numerator: number, denominator: number) {
  if (denominator === 0) return "无意义";
  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator);
  const top = (sign * numerator) / divisor;
  const bottom = Math.abs(denominator) / divisor;
  return bottom === 1 ? String(top) : `${top}/${bottom}`;
}

function isPrime(value: number) {
  if (value < 2 || !Number.isInteger(value)) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor += 1) {
    if (value % divisor === 0) return false;
  }
  return true;
}

function rotateOptions(correct: string, distractors: string[], seed: number) {
  const unique = [correct];
  for (const option of distractors) {
    if (option !== correct && !unique.includes(option)) unique.push(option);
    if (unique.length === 4) break;
  }
  const fallbacks = ["条件不足", "以上都不对", "无法确定", "计算结果不存在"];
  for (const fallback of fallbacks) {
    if (unique.length === 4) break;
    if (!unique.includes(fallback)) unique.push(fallback);
  }
  const answerIndex = ((seed * 7 + 1) % 4 + 4) % 4;
  const options = unique.slice(1, 4);
  options.splice(answerIndex, 0, correct);
  return { options, answerIndex };
}

function choiceQuestion(
  unitKey: string,
  difficulty: GradeSixDifficulty,
  index: number,
  prompt: string,
  correct: string,
  distractors: string[],
  explanation: string,
  tags: string[]
): GradeSixQuestion {
  const { options, answerIndex } = rotateOptions(correct, distractors, index);
  return {
    id: `${unitKey}-${difficulty}-${index + 1}`,
    difficulty,
    prompt,
    options,
    answerIndex,
    explanation,
    tags,
  };
}

function numberQuestion(
  unitKey: string,
  difficulty: GradeSixDifficulty,
  index: number,
  prompt: string,
  value: number,
  explanation: string,
  tags: string[],
  formatter: NumberFormatter = formatNumber,
  distractorValues?: number[]
) {
  const initialCorrect = formatter(value);
  const needsApproximation =
    !/保留|约|近似/.test(prompt) && /^-?\d+\.\d{5,}/.test(initialCorrect);
  const activeFormatter: NumberFormatter = needsApproximation
    ? (candidate) =>
        formatter(candidate).replace(/^-?\d+(?:\.\d+)?/, candidate.toFixed(2))
    : formatter;
  const finalPrompt = needsApproximation ? `${prompt}（结果保留两位小数）` : prompt;
  const finalExplanation = needsApproximation
    ? `${explanation} 按要求保留两位小数，答案为 ${activeFormatter(value)}。`
    : explanation;
  const magnitude = Math.abs(value);
  const step = magnitude >= 100 ? 10 : magnitude >= 10 ? 2 : magnitude >= 1 ? 1 : 0.1;
  const candidates = distractorValues ?? [
    value * 10,
    value / 10,
    value + step,
    value - step,
    value * 2,
    value / 2,
  ];
  return choiceQuestion(
    unitKey,
    difficulty,
    index,
    finalPrompt,
    activeFormatter(value),
    candidates.map(activeFormatter),
    finalExplanation,
    tags
  );
}

function buildUnitQuestions(unitKey: string, generator: UnitQuestionGenerator) {
  return DIFFICULTIES.flatMap((difficulty) =>
    Array.from({ length: 30 }, (_, index) => generator(difficulty, index))
  );
}

function mixedOperationsQuestion(difficulty: GradeSixDifficulty, index: number) {
  const unitKey = "unit-2";
  const kind = index % 10;
  const variant = Math.floor(index / 10);
  const a = 2.4 + variant * 0.8 + (index % 3) * 0.2;
  const b = 1.5 + variant * 0.5;
  const c = 0.4 + (index % 4) * 0.2;

  if (difficulty === "medium") {
    switch (kind) {
      case 0: {
        const value = a + b * c;
        return numberQuestion(unitKey, difficulty, index, `${formatNumber(a)} + ${formatNumber(b)} × ${formatNumber(c)} = ?`, value, `先算乘法：${formatNumber(b)} × ${formatNumber(c)} = ${formatNumber(b * c)}，再加 ${formatNumber(a)}，得到 ${formatNumber(value)}。`, ["混合运算", "运算顺序"]);
      }
      case 1: {
        const value = (a + b) / c;
        return numberQuestion(unitKey, difficulty, index, `(${formatNumber(a)} + ${formatNumber(b)}) ÷ ${formatNumber(c)} = ?`, value, `有括号先算括号：${formatNumber(a + b)} ÷ ${formatNumber(c)} = ${formatNumber(value)}。`, ["混合运算", "括号"]);
      }
      case 2: {
        const factor = 3.2 + variant;
        const value = factor * 0.8 + factor * 0.2;
        return numberQuestion(unitKey, difficulty, index, `${formatNumber(factor)} × 0.8 + ${formatNumber(factor)} × 0.2 = ?`, value, `提取相同因数 ${formatNumber(factor)}，原式 = ${formatNumber(factor)} × (0.8 + 0.2) = ${formatNumber(value)}。`, ["运算律", "简便计算"]);
      }
      case 3: {
        const denominator = 6 + variant * 2;
        const numerator = 1 + variant;
        const value = formatFraction(numerator + 2, denominator);
        return choiceQuestion(unitKey, difficulty, index, `${formatFraction(numerator, denominator)} + ${formatFraction(2, denominator)} = ?`, value, [formatFraction(numerator + 2, denominator * 2), formatFraction(numerator * 2, denominator), formatFraction(numerator + 2, denominator + denominator)], `同分母分数相加，分母不变，分子相加，结果是 ${value}。`, ["分数运算", "同分母加法"]);
      }
      case 4: {
        const price = 19.6 + variant * 2;
        const count = 2 + variant;
        const budget = 120 + variant * 50;
        const remaining = budget - price - 30.4 * count;
        return numberQuestion(unitKey, difficulty, index, `带 ${budget} 元购物，买一盒 ${formatNumber(price)} 元的鸡蛋和 ${count} 箱每箱 30.4 元的牛奶，还剩多少元？`, remaining, `剩余 = ${budget} - ${formatNumber(price)} - 30.4 × ${count} = ${formatNumber(remaining)} 元。`, ["数量关系", "购物"]);
      }
      case 5: {
        const speed = 60 + variant * 10;
        const time = 1.5 + variant * 0.5;
        const distance = speed * time;
        return numberQuestion(unitKey, difficulty, index, `汽车以 ${speed} 千米/时行驶 ${formatNumber(time)} 小时，行驶多少千米？`, distance, `路程 = 速度 × 时间 = ${speed} × ${formatNumber(time)} = ${formatNumber(distance)} 千米。`, ["数量关系", "路程"]);
      }
      case 6: {
        const total = 48 + variant * 12;
        const used = 12 + variant * 3;
        const fraction = 0.5 + variant * 0.1;
        const value = (total - used) * fraction;
        return numberQuestion(unitKey, difficulty, index, `一块地有 ${total} 平方米，先用 ${used} 平方米种茄子，再用剩下的 ${formatNumber(fraction)} 种黄瓜。黄瓜地多少平方米？`, value, `先求剩余 ${total} - ${used} = ${total - used}，再乘 ${formatNumber(fraction)}，得 ${formatNumber(value)} 平方米。`, ["数量关系", "剩余量"]);
      }
      case 7: {
        const total = 20 + variant * 5;
        const parts = 4 + variant;
        const value = total / parts;
        return numberQuestion(unitKey, difficulty, index, `${total} 米彩绳平均分成 ${parts} 份，每份长多少米？`, value, `每份量 = 总量 ÷ 份数 = ${total} ÷ ${parts} = ${formatNumber(value)} 米。`, ["数量关系", "平均分"]);
      }
      case 8: {
        const value = 7.6 * (0.8 + 0.2 + variant * 0.1);
        return numberQuestion(unitKey, difficulty, index, `用简便方法计算：7.6 × ${formatNumber(0.8 + variant * 0.1)} + 7.6 × 0.2 = ?`, value, `运用乘法分配律，原式 = 7.6 × (${formatNumber(0.8 + variant * 0.1)} + 0.2) = ${formatNumber(value)}。`, ["运算律", "乘法分配律"]);
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `算式 ${formatNumber(a)} - ${formatNumber(b)} ÷ ${formatNumber(c)} 的第一步应算什么？`, `${formatNumber(b)} ÷ ${formatNumber(c)}`, [`${formatNumber(a)} - ${formatNumber(b)}`, `${formatNumber(a)} - ${formatNumber(c)}`, `${formatNumber(a - b)} ÷ ${formatNumber(c)}`], "没有括号时，先乘除后加减，所以先算除法。", ["混合运算", "运算顺序"]);
    }
  }

  if (difficulty === "hard") {
    switch (kind) {
      case 0: {
        const value = 0.36 + 9.6 / (3.2 + variant * 0.4);
        return numberQuestion(unitKey, difficulty, index, `0.36 + 9.6 ÷ ${formatNumber(3.2 + variant * 0.4)} = ?`, value, `先算除法，再加 0.36，结果为 ${formatNumber(value)}。`, ["混合运算", "小数"]);
      }
      case 1: {
        const leftTop = 7 + variant;
        const value = (leftTop / 6 - 5 / 9) / (11 / 18);
        return numberQuestion(unitKey, difficulty, index, `(${leftTop}/6 - 5/9) ÷ (11/18) = ?`, value, `先通分算括号，再乘 18/11，结果是 ${formatNumber(value)}。`, ["分数混合运算", "括号"]);
      }
      case 2: {
        const value = 36 / ((17.5 + 0.5 + variant) * 2);
        return numberQuestion(unitKey, difficulty, index, `36 ÷ [(${formatNumber(17.5 + variant)} + 0.5) × 2] = ?`, value, `先算小括号，再算乘法，最后算除法，结果为 ${formatNumber(value)}。`, ["混合运算", "多层括号"]);
      }
      case 3: {
        const high = 16.5 + variant * 2;
        const total = high * (1 + 1.6);
        return numberQuestion(unitKey, difficulty, index, `一条地铁线高架段长 ${formatNumber(high)} 千米，地下段是高架段的 1.6 倍，全长多少千米？`, total, `地下段为 ${formatNumber(high * 1.6)} 千米，全长 = ${formatNumber(high)} × (1 + 1.6) = ${formatNumber(total)} 千米。`, ["数量关系", "倍数"]);
      }
      case 4: {
        const distance = 460 + variant * 70;
        const speedA = 90 + variant * 5;
        const speedB = speedA * 2 / 3;
        const time = 2.8 + variant * 0.2;
        const gap = Math.abs(distance - (speedA + speedB) * time);
        return numberQuestion(unitKey, difficulty, index, `两地相距 ${distance} 千米，两车相向而行，速度分别为 ${speedA} 千米/时和其 2/3，行 ${formatNumber(time)} 小时后相距多少千米？`, gap, `乙车速度 ${formatNumber(speedB)} 千米/时，共行 ${formatNumber((speedA + speedB) * time)} 千米，与总路程相差 ${formatNumber(gap)} 千米。`, ["数量关系", "相遇问题"]);
      }
      case 5: {
        const total = 60 + variant * 15;
        const first = 20 + variant * 5;
        const value = (total - first) * 2 / 5;
        return numberQuestion(unitKey, difficulty, index, `菜地 ${total} 平方米，先用 ${first} 平方米种茄子，再用剩余的 2/5 种黄瓜，黄瓜地多少平方米？`, value, `(${total} - ${first}) × 2/5 = ${formatNumber(value)} 平方米。`, ["数量关系", "分数应用"]);
      }
      case 6: {
        const hours = 4.5 + variant * 0.9;
        const more = 2 / 9 + variant / 18;
        const value = hours * (1 + more);
        return numberQuestion(unitKey, difficulty, index, `小亮阅读 ${formatNumber(hours)} 小时，小斌比小亮多 ${formatFraction(2 + variant, 9)}。小斌阅读多少小时？`, value, `把小亮看作单位“1”，小斌时间 = ${formatNumber(hours)} × (1 + ${formatFraction(2 + variant, 9)}) = ${formatNumber(value)} 小时。`, ["数量关系", "分率"]);
      }
      case 7: {
        const unitPrice = 13.6 + variant * 1.2;
        const mass = 4 + variant;
        const friendMass = mass * 5 / 8;
        const total = unitPrice * (mass + friendMass);
        return numberQuestion(unitKey, difficulty, index, `苹果每千克 ${formatNumber(unitPrice)} 元，小青买 ${mass} 千克，小云买小青的 5/8。两人共付多少元？`, total, `小云买 ${formatNumber(friendMass)} 千克，总质量 ${formatNumber(mass + friendMass)} 千克，总价 ${formatNumber(total)} 元。`, ["数量关系", "总价"]);
      }
      case 8: {
        const numerator = 12 + variant;
        const value = numerator / 7 - (1 / 3 / (7 / 15) + 4 / 5);
        return numberQuestion(unitKey, difficulty, index, `${numerator}/7 - (1/3 ÷ 7/15 + 4/5) = ?`, value, `先算括号内的除法，再算加法，最后相减，结果是 ${formatNumber(value)}。`, ["分数混合运算", "运算顺序"]);
      }
      default: {
        const actual = 19.6 + 30.4 * (2 + variant);
        const lower = 20 + 30 * (2 + variant);
        return choiceQuestion(unitKey, difficulty, index, `估算 ${formatNumber(actual)} 元的购物支出是否少于 100 元，哪种估算最适合？`, `把 19.6 看成 20，把 30.4 看成 30，约 ${lower} 元`, [`都向上估，约 ${20 + 31 * (2 + variant)} 元`, `都向下估，约 ${19 + 30 * (2 + variant)} 元`, "不需要估算，只看单价"], `要判断是否够钱，应选能清楚说明范围的估算。20 + 30 × ${2 + variant} = ${lower}。`, ["估算", "购物"]);
      }
    }
  }

  switch (kind) {
    case 0: {
      const adult = 42 + variant * 3;
      const child = adult * 0.6;
      const groups = 4 + variant;
      const total = 400 + variant * 150;
      const value = total - groups * (adult + child);
      return numberQuestion(unitKey, difficulty, index, `研学活动每组 1 名成人和 1 名儿童，成人票 ${adult} 元，儿童票是成人票的 60%。${groups} 组共带 ${total} 元，还剩多少元？`, value, `儿童票 ${formatNumber(child)} 元，每组 ${formatNumber(adult + child)} 元，剩余 ${total} - ${groups} × ${formatNumber(adult + child)} = ${formatNumber(value)} 元。`, ["综合应用", "数量关系"]);
    }
    case 1: {
      const distance = 520 + variant * 80;
      const speedA = 80 + variant * 5;
      const speedB = 70 + variant * 5;
      const delay = 0.5 + variant * 0.25;
      const value = (distance - speedA * delay) / (speedA + speedB);
      return numberQuestion(unitKey, difficulty, index, `甲先出发 ${formatNumber(delay)} 小时，速度 ${speedA} 千米/时；乙从另一地相向出发，速度 ${speedB} 千米/时。两地相距 ${distance} 千米，乙出发后几小时相遇？`, value, `乙出发时甲已走 ${formatNumber(speedA * delay)} 千米，剩余路程再除以速度和：(${distance} - ${formatNumber(speedA * delay)}) ÷ ${speedA + speedB} = ${formatNumber(value)} 小时。`, ["综合应用", "相遇问题"]);
    }
    case 2: {
      const total = 120 + variant * 30;
      const fractionA = 1 / 3;
      const fractionB = 2 / 5;
      const value = (total * fractionA) / (1 - fractionB);
      return numberQuestion(unitKey, difficulty, index, `甲完成一项任务的 1/3 后，把剩余工作交给乙。乙完成剩余的 2/5，还剩 ${total * (1 - fractionA) * (1 - fractionB)} 个单位。任务总量是多少？`, total, `剩余占总量 (1 - 1/3) × (1 - 2/5) = 2/5，用剩余量除以 2/5，得到总量 ${total}。`, ["逆向推理", "分率"], formatNumber, [value, total * 2 / 5, total * 3 / 5]);
    }
    case 3: {
      const cost = 480 + variant * 120;
      const firstRate = 0.35;
      const secondRate = 0.4;
      const value = cost * (1 - firstRate) * (1 - secondRate);
      return numberQuestion(unitKey, difficulty, index, `一笔 ${cost} 元的经费先用去 35%，再用去余下的 40%，最后剩多少元？`, value, `第一次后剩 ${cost} × 65%，第二次后剩余再乘 60%，所以剩 ${formatNumber(value)} 元。`, ["综合应用", "百分率"]);
    }
    case 4: {
      const a1 = 2 + variant;
      const a2 = 5 + variant;
      const value = (a1 / 3 + a2 / 6) / (7 / 9);
      return numberQuestion(unitKey, difficulty, index, `(${a1}/3 + ${a2}/6) ÷ 7/9 = ?`, value, `先通分求和，再乘 9/7，结果是 ${formatNumber(value)}。`, ["分数混合运算", "综合"]);
    }
    case 5: {
      const capacity = 18 + variant * 6;
      const first = capacity * 5 / 12;
      const second = (capacity - first) * 3 / 7;
      const value = capacity - first - second;
      return numberQuestion(unitKey, difficulty, index, `水箱有 ${capacity} 吨水，先用去 5/12，再用去余下的 3/7，还剩多少吨？`, value, `先剩 ${formatNumber(capacity - first)} 吨，再乘 (1 - 3/7)，得到 ${formatNumber(value)} 吨。`, ["分数应用", "剩余量"]);
    }
    case 6: {
      const target = 240 + variant * 60;
      const completed = 0.4 + variant * 0.05;
      const daily = 36 + variant * 6;
      const value = (target * (1 - completed)) / daily;
      return numberQuestion(unitKey, difficulty, index, `工程共 ${target} 米，已完成 ${formatNumber(completed * 100)}%，剩余部分每天完成 ${daily} 米，还需几天？`, value, `剩余 ${target} × (1 - ${formatNumber(completed)}) = ${formatNumber(target * (1 - completed))} 米，再除以 ${daily}，得到 ${formatNumber(value)} 天。`, ["百分率", "工程问题"]);
    }
    case 7: {
      const price = 80 + variant * 20;
      const discount = 0.85 - variant * 0.05;
      const coupon = 10 + variant * 5;
      const value = price * discount - coupon;
      return numberQuestion(unitKey, difficulty, index, `商品原价 ${price} 元，先按 ${formatNumber(discount * 10)} 折出售，再减 ${coupon} 元优惠券，实付多少元？`, value, `折后价 ${price} × ${formatNumber(discount)} = ${formatNumber(price * discount)} 元，再减优惠券，实付 ${formatNumber(value)} 元。`, ["综合应用", "折扣"]);
    }
    case 8: {
      const sum = 96 + variant * 24;
      const ratio = 3 + variant;
      const smaller = sum / (ratio + 1);
      return numberQuestion(unitKey, difficulty, index, `两个数的和是 ${sum}，大数是小数的 ${ratio} 倍，小数是多少？`, smaller, `把小数看作 1 份，大数是 ${ratio} 份，共 ${ratio + 1} 份；${sum} ÷ ${ratio + 1} = ${formatNumber(smaller)}。`, ["数量关系", "和倍问题"]);
    }
    default:
      return choiceQuestion(unitKey, difficulty, index, `解决“先用去总量的 1/${4 + variant}，再用去余下的 1/${3 + variant}”时，表示最后剩余比例的正确算式是？`, `(1 - 1/${4 + variant}) × (1 - 1/${3 + variant})`, [`1 - 1/${4 + variant} - 1/${3 + variant}`, `1 - 1/${4 + variant} × 1/${3 + variant}`, `(1 - 1/${4 + variant}) ÷ (1 - 1/${3 + variant})`], `第二次的 1/${3 + variant} 是以第一次剩余量为单位“1”，所以两个剩余率要相乘。`, ["数量关系", "易错辨析"]);
  }
}

function segmentedBillingQuestion(difficulty: GradeSixDifficulty, index: number) {
  const unitKey = "practice-1";
  const kind = index % 10;
  const variant = Math.floor(index / 10);
  const taxiFare = (distance: number) => 10 + Math.max(0, Math.ceil(distance - 3 - 1e-9)) * 2.2;
  const parkingFare = (minutes: number) =>
    minutes <= 30 ? 0 : minutes <= 60 ? 3 : minutes <= 120 ? 6 : 6 + Math.ceil((minutes - 120) / 60 - 1e-9) * 5;
  const gasFare = (usage: number) =>
    Math.min(usage, 228) * 3.02 +
    Math.max(0, Math.min(usage - 228, 120)) * 3.62 +
    Math.max(0, usage - 348) * 4.23;

  if (difficulty === "medium") {
    switch (kind) {
      case 0: {
        const distance = 3 + variant * 0.6;
        const value = taxiFare(distance);
        return numberQuestion(unitKey, difficulty, index, `出租车 3 千米内 10 元，超过部分每千米 2.2 元（不足 1 千米按 1 千米）。行驶 ${formatNumber(distance)} 千米应付多少？`, value, `超过 ${formatNumber(distance - 3)} 千米，按 ${Math.ceil(distance - 3 - 1e-9)} 千米计费，总价 ${formatMoney(value)}。`, ["分段计费", "出租车"], formatMoney);
      }
      case 1: {
        const minutes = 30 + variant * 35;
        const value = parkingFare(minutes);
        return numberQuestion(unitKey, difficulty, index, `停车场：30 分钟内免费，1 小时内 3 元，1～2 小时 6 元，超过 2 小时后每小时加 5 元。停车 ${minutes} 分钟收费多少？`, value, `按所在时长区间计费，${minutes} 分钟应付 ${formatMoney(value)}。`, ["分段计费", "停车费"], formatMoney);
      }
      case 2: {
        const day = 120 + variant * 20;
        const night = 80 + variant * 15;
        const value = day * 0.56 + night * 0.36;
        return numberQuestion(unitKey, difficulty, index, `峰时用电 ${day} 千瓦时，单价 0.56 元；谷时 ${night} 千瓦时，单价 0.36 元。共付多少电费？`, value, `分段相乘后相加：${day} × 0.56 + ${night} × 0.36 = ${formatMoney(value)}。`, ["分段计费", "电费"], formatMoney);
      }
      case 3: {
        const usage = 210 + variant * 20;
        const value = gasFare(usage);
        return numberQuestion(unitKey, difficulty, index, `天然气前 228 立方米每立方米 3.02 元，228～348 部分 3.62 元。用气 ${usage} 立方米应付多少？`, value, `按阶梯分别计费后相加，费用为 ${formatMoney(value)}。`, ["分段计费", "燃气费"], formatMoney);
      }
      case 4: {
        const calls = 80 + variant * 30;
        const value = 20 + Math.max(0, calls - 100) * 0.15;
        return numberQuestion(unitKey, difficulty, index, `电话套餐月租 20 元，含 100 分钟，超出每分钟 0.15 元。通话 ${calls} 分钟共付多少？`, value, `套餐内先付 20 元，超出 ${Math.max(0, calls - 100)} 分钟另付 ${formatMoney(Math.max(0, calls - 100) * 0.15)}，共 ${formatMoney(value)}。`, ["分段计费", "套餐"], formatMoney);
      }
      case 5: {
        const weight = 1 + variant * 1.2;
        const value = 8 + Math.max(0, Math.ceil(weight - 1 - 1e-9)) * 3;
        return numberQuestion(unitKey, difficulty, index, `快递首重 1 千克 8 元，续重每千克 3 元（不足 1 千克按 1 千克）。包裹重 ${formatNumber(weight)} 千克，运费多少？`, value, `续重按 ${Math.max(0, Math.ceil(weight - 1 - 1e-9))} 千克计费，运费 ${formatMoney(value)}。`, ["分段计费", "快递"], formatMoney);
      }
      case 6: {
        const water = 15 + variant * 8;
        const value = Math.min(water, 20) * 2.8 + Math.max(0, water - 20) * 4.1;
        return numberQuestion(unitKey, difficulty, index, `月用水 20 吨以内每吨 2.8 元，超过部分每吨 4.1 元。用水 ${water} 吨，应付多少？`, value, `前 ${Math.min(water, 20)} 吨按 2.8 元，超出 ${Math.max(0, water - 20)} 吨按 4.1 元，共 ${formatMoney(value)}。`, ["分段计费", "水费"], formatMoney);
      }
      case 7: {
        const storage = 5 + variant * 5;
        const value = storage <= 10 ? 6 : 6 + Math.ceil((storage - 10) / 5) * 2;
        return numberQuestion(unitKey, difficulty, index, `云盘套餐 10GB 内 6 元，超过后每 5GB 加 2 元（不足 5GB 按 5GB）。使用 ${storage}GB 收费多少？`, value, `先判断所在区间，再把超出部分按 5GB 一档计费，费用 ${formatMoney(value)}。`, ["分段计费", "数据套餐"], formatMoney);
      }
      case 8:
        return choiceQuestion(unitKey, difficulty, index, `分段计费时，第一步最应该做什么？（情境 ${variant + 1}）`, "判断用量落在哪个收费区间", ["把所有用量都乘最高单价", "先把各段单价相加", "直接按平均单价计算"], "分段计费必须先找临界点，判断每一部分分别采用哪一档单价。", ["分段计费", "方法"]);
      default: {
        const distance = 4.2 + variant;
        const billable = Math.ceil(distance - 3 - 1e-9);
        return choiceQuestion(unitKey, difficulty, index, `出租车超过 3 千米的部分不足 1 千米按 1 千米计。行驶 ${formatNumber(distance)} 千米时，超出部分按几千米计费？`, `${billable}千米`, [`${formatNumber(distance - 3)}千米`, `${Math.floor(distance - 3)}千米`, `${billable + 1}千米`], `实际超出 ${formatNumber(distance - 3)} 千米，按“进一法”计为 ${billable} 千米。`, ["分段计费", "进一法"]);
      }
    }
  }

  if (difficulty === "hard") {
    switch (kind) {
      case 0: {
        const distance = 7.4 + variant * 1.3;
        const value = taxiFare(distance);
        return numberQuestion(unitKey, difficulty, index, `按“3 千米内 10 元，超出每千米 2.2 元，不足 1 千米按 1 千米”的标准，${formatNumber(distance)} 千米车费是多少？`, value, `超出 ${formatNumber(distance - 3)} 千米，按 ${Math.ceil(distance - 3 - 1e-9)} 千米收费，合计 ${formatMoney(value)}。`, ["出租车", "进一法"], formatMoney);
      }
      case 1: {
        const minutes = 145 + variant * 65;
        const value = parkingFare(minutes);
        return numberQuestion(unitKey, difficulty, index, `停车 ${minutes} 分钟。前 30 分钟免费，1 小时内 3 元，1～2 小时 6 元，超过 2 小时每不足 1 小时也按 1 小时加 5 元。收费多少？`, value, `超过 2 小时 ${minutes - 120} 分钟，按 ${Math.ceil((minutes - 120) / 60)} 个小时档计费，总计 ${formatMoney(value)}。`, ["停车费", "进一法"], formatMoney);
      }
      case 2: {
        const usage = 240 + variant * 70;
        const value = gasFare(usage);
        return numberQuestion(unitKey, difficulty, index, `燃气阶梯价：前 228 立方米 3.02 元，接着 120 立方米 3.62 元，超过 348 的部分 4.23 元。用气 ${usage} 立方米，费用多少？`, value, `把 ${usage} 立方米拆到各档分别相乘，再相加，费用为 ${formatMoney(value)}。`, ["燃气费", "阶梯价格"], formatMoney);
      }
      case 3: {
        const day = 180 + variant * 30;
        const night = 120 + variant * 20;
        const flat = 0.49;
        const tiered = day * 0.56 + night * 0.36;
        const flatFee = (day + night) * flat;
        const difference = Math.abs(tiered - flatFee);
        return numberQuestion(unitKey, difficulty, index, `用电 ${day + night} 千瓦时，其中峰时 ${day}、谷时 ${night}。分时电价 0.56/0.36 元，统一价 0.49 元。两种方案相差多少？`, difference, `分时价 ${formatMoney(tiered)}，统一价 ${formatMoney(flatFee)}，相差 ${formatMoney(difference)}。`, ["方案比较", "电费"], formatMoney);
      }
      case 4: {
        const usage = 140 + variant * 50;
        const planA = 28 + Math.max(0, usage - 150) * 0.18;
        const planB = 18 + usage * 0.08;
        const value = Math.min(planA, planB);
        return choiceQuestion(unitKey, difficulty, index, `通话 ${usage} 分钟。A 套餐 28 元含 150 分钟，超出 0.18 元/分；B 套餐月租 18 元，另收 0.08 元/分。更省且费用正确的是？`, planA <= planB ? `A，${formatMoney(planA)}` : `B，${formatMoney(planB)}`, [`A，${formatMoney(planB)}`, `B，${formatMoney(planA)}`, `两者相同，${formatMoney(value)}`], `分别算得 A 为 ${formatMoney(planA)}，B 为 ${formatMoney(planB)}，比较后选择较小者。`, ["方案比较", "套餐"]);
      }
      case 5: {
        const budget = 30 + variant * 10;
        const base = 10;
        const steps = Math.floor((budget - base) / 2.2);
        const maxDistance = 3 + steps;
        return numberQuestion(unitKey, difficulty, index, `出租车 3 千米内 10 元，之后每整千米 2.2 元。带 ${budget} 元最多可乘多少千米而不超预算？`, maxDistance, `可付超程费 ${budget - base} 元，最多购买 ${steps} 个 2.2 元的里程档，所以最多 ${maxDistance} 千米。`, ["逆向计费", "出租车"], formatWithUnit("千米"));
      }
      case 6: {
        const bill = 56 + variant * 14;
        const usage = 20 + (bill - 56) / 4.1;
        return numberQuestion(unitKey, difficulty, index, `水费前 20 吨每吨 2.8 元，超出每吨 4.1 元。本月水费 ${formatMoney(bill)}，用水多少吨？`, usage, `前 20 吨费用 56 元，超出用量 = (${bill} - 56) ÷ 4.1，合计 ${formatNumber(usage)} 吨。`, ["逆向计费", "水费"], formatWithUnit("吨"));
      }
      case 7: {
        const weight = 2.2 + variant * 1.7;
        const actual = 8 + Math.ceil(weight - 1 - 1e-9) * 3;
        return choiceQuestion(unitKey, difficulty, index, `包裹 ${formatNumber(weight)} 千克，首重 1 千克 8 元，续重每千克 3 元且不足 1 千克按 1 千克。下面哪种列式正确？`, `8 + ${Math.ceil(weight - 1 - 1e-9)} × 3`, [`8 + ${formatNumber(weight - 1)} × 3`, `${formatNumber(weight)} × 3`, `8 + ${Math.floor(weight - 1)} × 3`], `续重 ${formatNumber(weight - 1)} 千克要按 ${Math.ceil(weight - 1 - 1e-9)} 千克收费，费用为 ${formatMoney(actual)}。`, ["快递", "列式"]);
      }
      case 8: {
        const usage = 348 + 10 + variant * 25;
        const value = gasFare(usage);
        return numberQuestion(unitKey, difficulty, index, `用气 ${usage} 立方米，三档价格依次为 3.02、3.62、4.23 元，分界点 228 和 348。应付多少？`, value, `费用 = 228 × 3.02 + 120 × 3.62 + ${usage - 348} × 4.23 = ${formatMoney(value)}。`, ["燃气费", "三段计费"], formatMoney);
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `制定家庭用水阶梯价时，哪一项最能体现“分段”的依据？（方案 ${variant + 1}）`, "根据月用水量设置临界点，不同区间采用不同单价", ["每个月随机改变单价", "所有家庭统一收固定总价", "只按家庭人数收费而不看用量"], "分段计费的核心是用量达到不同临界点后，对相应区间采用不同标准。", ["建模", "规则设计"]);
    }
  }

  switch (kind) {
    case 0: {
      const trips = [2.8, 5.4, 8.2 + variant];
      const value = trips.reduce((sum, distance) => sum + taxiFare(distance), 0);
      return numberQuestion(unitKey, difficulty, index, `一天乘出租车 ${trips.map(formatNumber).join("、")} 千米，标准为 3 千米内 10 元、超出每千米 2.2 元且不足 1 千米按 1 千米。共付多少？`, value, `三次分别独立分段计费，再相加，合计 ${formatMoney(value)}。`, ["综合计费", "出租车"], formatMoney);
    }
    case 1: {
      const peak = 210 + variant * 30;
      const valley = 90 + variant * 15;
      const current = peak * 0.56 + valley * 0.36;
      const shifted = (peak - 40) * 0.56 + (valley + 40) * 0.36;
      return numberQuestion(unitKey, difficulty, index, `峰时 ${peak}、谷时 ${valley} 千瓦时。若把 40 千瓦时从峰时移到谷时，电费节省多少？`, current - shifted, `每转移 1 千瓦时节省 0.56 - 0.36 = 0.20 元，40 千瓦时共省 ${formatMoney(current - shifted)}。`, ["优化方案", "电费"], formatMoney);
    }
    case 2: {
      const usage = 360 + variant * 60;
      const current = gasFare(usage);
      const saved = gasFare(usage - 30);
      return numberQuestion(unitKey, difficulty, index, `用气 ${usage} 立方米后节约 30 立方米，阶梯价分界点为 228、348，单价 3.02、3.62、4.23 元。节省多少？`, current - saved, `分别计算节约前后总费用。节约量可能跨越档位，费用差为 ${formatMoney(current - saved)}。`, ["阶梯价格", "跨档计算"], formatMoney);
    }
    case 3: {
      const hours = 180 + variant * 55;
      const planA = 32 + Math.max(0, hours - 200) * 0.16;
      const planB = 20 + hours * 0.09;
      const value = Math.abs(planA - planB);
      return numberQuestion(unitKey, difficulty, index, `通话 ${hours} 分钟：A 套餐 32 元含 200 分钟，超出 0.16 元/分；B 套餐 20 元另加 0.09 元/分。两者相差多少？`, value, `A 为 ${formatMoney(planA)}，B 为 ${formatMoney(planB)}，相差 ${formatMoney(value)}。`, ["方案比较", "套餐"], formatMoney);
    }
    case 4: {
      const minutes = 185 + variant * 80;
      const feeOnce = parkingFare(minutes);
      const splitFee = parkingFare(Math.floor(minutes / 2)) * 2;
      return choiceQuestion(unitKey, difficulty, index, `同一停车标准下，连续停 ${minutes} 分钟与分成两次各停约一半，哪种费用更低？`, feeOnce <= splitFee ? `连续停车，${formatMoney(feeOnce)}` : `分两次，${formatMoney(splitFee)}`, [`连续停车，${formatMoney(splitFee)}`, `分两次，${formatMoney(feeOnce)}`, "两者费用一定相同"], `连续停车费用 ${formatMoney(feeOnce)}；分两次各重新计算免费/起步区间，共 ${formatMoney(splitFee)}。`, ["方案比较", "停车费"]);
    }
    case 5: {
      const extraFee = 180 + variant * 60;
      const usage = 228 + extraFee / 3.62;
      return numberQuestion(unitKey, difficulty, index, `燃气前 228 立方米每立方米 3.02 元，之后到 348 为 3.62 元。若总费用比第一档全部费用多 ${extraFee} 元，用气量是多少？`, usage, `增加费用全部来自第二档，用 ${extraFee} ÷ 3.62 求第二档用量，再加 228，合计 ${formatNumber(usage)} 立方米。`, ["逆向计费", "燃气"], formatWithUnit("立方米"));
    }
    case 6: {
      const use = 26 + variant * 7;
      const original = Math.min(use, 20) * 2.8 + Math.max(0, use - 20) * 4.1;
      const newPlan = Math.min(use, 25) * 3 + Math.max(0, use - 25) * 3.6;
      return choiceQuestion(unitKey, difficulty, index, `用水 ${use} 吨。旧方案：20 吨内 2.8 元、超出 4.1 元；新方案：25 吨内 3 元、超出 3.6 元。哪种更省？`, original <= newPlan ? `旧方案，${formatMoney(original)}` : `新方案，${formatMoney(newPlan)}`, [`旧方案，${formatMoney(newPlan)}`, `新方案，${formatMoney(original)}`, `两者相同，${formatMoney(original)}`], `旧方案 ${formatMoney(original)}，新方案 ${formatMoney(newPlan)}，比较总费用即可。`, ["规则比较", "水费"]);
    }
    case 7: {
      const distance = 9.4 + variant * 3.2;
      const night = taxiFare(distance) * 1.2;
      return numberQuestion(unitKey, difficulty, index, `白天出租车按常规标准计费，夜间在白天总价上加收 20%。行驶 ${formatNumber(distance)} 千米，夜间应付多少？`, night, `先按分段规则算白天价 ${formatMoney(taxiFare(distance))}，再乘 1.2，得 ${formatMoney(night)}。`, ["复合计费", "百分率"], formatMoney);
    }
    case 8: {
      const weight = 3.3 + variant * 2.4;
      const standard = 8 + Math.ceil(weight - 1 - 1e-9) * 3;
      const member = standard * 0.9;
      return numberQuestion(unitKey, difficulty, index, `包裹 ${formatNumber(weight)} 千克，首重 8 元、续重每千克 3 元且进一，会员再打九折。实付多少？`, member, `先按进一法算运费 ${formatMoney(standard)}，再乘 0.9，实付 ${formatMoney(member)}。`, ["复合计费", "快递"], formatMoney);
    }
    default:
      return choiceQuestion(unitKey, difficulty, index, `关于分段计费函数的图像，下列说法正确的是？（模型 ${variant + 1}）`, "临界点处计费规则可能改变，图像斜率也可能改变", ["所有分段的单价必须相同", "用量越多总费用一定越少", "临界点与收费规则无关"], "不同区间的单位价格不同，会使总费用随用量变化的速度在临界点发生改变。", ["建模", "函数思想"]);
  }
}

function numberSenseQuestion(difficulty: GradeSixDifficulty, index: number) {
  const unitKey = "unit-3";
  const kind = index % 10;
  const variant = Math.floor(index / 10);
  const base = 24 + variant * 12 + index;

  if (difficulty === "medium") {
    switch (kind) {
      case 0: {
        const examples = [
          { value: 731.42, digit: 2, place: "百分位" },
          { value: 864.51, digit: 5, place: "十分位" },
          { value: 947.63, digit: 9, place: "百位" },
        ];
        const { value, digit, place } = examples[variant];
        return choiceQuestion(unitKey, difficulty, index, `${formatNumber(value)} 中，数字 ${digit} 所在的数位是？`, place, ["个位", "十位", "千分位"], `从小数点向左右依次确定数位，数字 ${digit} 位于${place}。`, ["数位", "计数单位"]);
      }
      case 1: {
        const numerator = 3 + variant;
        const denominator = 20;
        const decimal = numerator / denominator;
        return choiceQuestion(unitKey, difficulty, index, `${formatFraction(numerator, denominator)} 与哪个小数相等？`, formatNumber(decimal), [formatNumber(decimal * 10), formatNumber(decimal / 10), formatNumber((numerator + 1) / denominator)], `分子除以分母：${numerator} ÷ ${denominator} = ${formatNumber(decimal)}。`, ["分数", "小数互化"]);
      }
      case 2: {
        const left = 3.34 + variant * 0.1;
        const right = 3.4 + variant * 0.1;
        return choiceQuestion(unitKey, difficulty, index, `比较 ${formatNumber(left)} 和 ${formatNumber(right)}，正确的是？`, `${formatNumber(left)} < ${formatNumber(right)}`, [`${formatNumber(left)} > ${formatNumber(right)}`, `${formatNumber(left)} = ${formatNumber(right)}`, "无法比较"], `把小数位数补齐，${formatNumber(left)} 可写成 ${left.toFixed(2)}，所以小于 ${right.toFixed(2)}。`, ["大小比较", "小数"]);
      }
      case 3: {
        const value = base % 2 === 0 ? base + 1 : base;
        return choiceQuestion(unitKey, difficulty, index, `${value} 是质数还是合数？`, isPrime(value) ? "质数" : "合数", [isPrime(value) ? "合数" : "质数", "既不是质数也不是合数", "无法判断"], isPrime(value) ? `${value} 只有 1 和它本身两个因数，所以是质数。` : `${value} 除了 1 和它本身还有其他因数，所以是合数。`, ["质数", "合数"]);
      }
      case 4: {
        const a = 12 + variant * 6;
        const b = 18 + variant * 6;
        return numberQuestion(unitKey, difficulty, index, `${a} 和 ${b} 的最大公因数是？`, gcd(a, b), `列出公因数或用短除法，最大公因数是 ${gcd(a, b)}。`, ["公因数", "最大公因数"]);
      }
      case 5: {
        const a = 4 + variant * 2;
        const b = 6 + variant * 3;
        return numberQuestion(unitKey, difficulty, index, `${a} 和 ${b} 的最小公倍数是？`, lcm(a, b), `最小公倍数 = 两数乘积 ÷ 最大公因数 = ${lcm(a, b)}。`, ["公倍数", "最小公倍数"]);
      }
      case 6: {
        const value = 231 + variant * 111;
        const expanded = `${Math.floor(value / 100)} × 100 + ${Math.floor((value % 100) / 10)} × 10 + ${value % 10}`;
        return choiceQuestion(unitKey, difficulty, index, `${value} 按计数单位展开，正确的是？`, expanded, [`${Math.floor(value / 100)} × 10 + ${value % 100}`, `${value} × 1`, `${Math.floor(value / 10)} × 100 + ${value % 10}`], "每一位上的数字乘对应计数单位后相加。", ["计数单位", "数的组成"]);
      }
      case 7:
        return choiceQuestion(unitKey, difficulty, index, `下面哪组运算互为逆运算？（组 ${variant + 1}）`, "加法与减法", ["加法与乘法", "乘法与加法", "减法与乘法"], "减法是加法的逆运算，除法是乘法的逆运算。", ["运算关系", "逆运算"]);
      case 8: {
        const value = 3.36 + variant * 1.01;
        const units = Math.round(value * 100);
        return choiceQuestion(unitKey, difficulty, index, `${formatNumber(value)} 里面有多少个 0.01？`, `${units}个`, [`${Math.round(value * 10)}个`, `${Math.round(value * 1000)}个`, `${Math.floor(value)}个`], `${formatNumber(value)} = ${units} × 0.01，所以有 ${units} 个百分之一。`, ["计数单位", "小数"]);
      }
      default: {
        const value = 42 + variant * 18;
        return choiceQuestion(unitKey, difficulty, index, `下面哪个数一定是 ${value} 的因数？`, "1", [String(value + 1), String(value - 1), String(value * 2)], "任何非零自然数都有因数 1 和它本身。", ["因数", "概念"]);
      }
    }
  }

  if (difficulty === "hard") {
    switch (kind) {
      case 0: {
        const a = 18 + variant * 6;
        const b = 30 + variant * 10;
        const value = gcd(a, b);
        return numberQuestion(unitKey, difficulty, index, `把 ${a} 个红球和 ${b} 个蓝球分别平均装入尽可能多的相同袋中，每袋两种球数量都相同，最多装几袋？`, value, `袋数必须同时是 ${a} 和 ${b} 的因数，取最大公因数 ${value}。`, ["最大公因数", "分组"]);
      }
      case 1: {
        const a = 6 + variant * 2;
        const b = 8 + variant * 2;
        const value = lcm(a, b);
        return numberQuestion(unitKey, difficulty, index, `甲每 ${a} 天活动一次，乙每 ${b} 天活动一次，今天同时活动，至少再过几天又同时活动？`, value, `再次同时出现的间隔是 ${a} 和 ${b} 的最小公倍数 ${value} 天。`, ["最小公倍数", "周期"]);
      }
      case 2: {
        const denominatorA = 8 + variant * 2;
        const denominatorB = 12 + variant * 3;
        const left = (denominatorA - 1) / denominatorA;
        const right = (denominatorB - 1) / denominatorB;
        return choiceQuestion(unitKey, difficulty, index, `比较 ${denominatorA - 1}/${denominatorA} 与 ${denominatorB - 1}/${denominatorB}，正确的是？`, left < right ? "前者小于后者" : "前者大于后者", [left < right ? "前者大于后者" : "前者小于后者", "两者相等", "无法比较"], `两数都接近 1，差分别是 1/${denominatorA} 和 1/${denominatorB}；离 1 更近的更大。`, ["分数比较", "推理"]);
      }
      case 3: {
        const value = 2 ** (5 + variant) * 3 ** (1 + variant);
        const count = (5 + variant + 1) * (1 + variant + 1);
        return numberQuestion(unitKey, difficulty, index, `${value} = 2^${5 + variant} × 3^${1 + variant}，它共有多少个正因数？`, count, `因数中 2 的指数可取 0～${5 + variant}，3 的指数可取 0～${1 + variant}，共有 ${5 + variant + 1} × ${1 + variant + 1} = ${count} 个。`, ["因数", "规律"]);
      }
      case 4: {
        const value = 1000 + variant * 100;
        const estimate = Math.round((value * 0.923) / 10) * 10;
        return numberQuestion(unitKey, difficulty, index, `${value} × 0.923 估算到十位约是多少？`, estimate, `先计算或把 0.923 看作 0.92，再按十位取近似，约为 ${estimate}。`, ["估算", "近似数"]);
      }
      case 5: {
        const n = 72 + variant * 18;
        const candidates = [n / 2, n / 3, n / 4, n / 5].map(Math.floor);
        const correct = candidates.find((item) => n % item !== 0) ?? n - 1;
        return choiceQuestion(unitKey, difficulty, index, `下面哪个数不是 ${n} 的因数？`, String(correct), [String(n / 2), String(n / 3), String(n / 6)], `用 ${n} 分别除以各数，不能整除的 ${correct} 不是因数。`, ["因数", "辨析"]);
      }
      case 6: {
        const numerator = 7 + variant;
        const denominator = 20 + variant * 5;
        const value = numerator / denominator;
        return choiceQuestion(unitKey, difficulty, index, `${formatFraction(numerator, denominator)}、${formatNumber(value + 0.01)}、${formatNumber(value - 0.02)} 中最大的是？`, formatNumber(value + 0.01), [formatFraction(numerator, denominator), formatNumber(value - 0.02), "三者相等"], `把分数化成小数 ${formatNumber(value)}，再比较即可。`, ["数的互化", "大小比较"]);
      }
      case 7: {
        const a = 24 + variant * 12;
        const b = 36 + variant * 18;
        const g = gcd(a, b);
        const value = a / g + b / g;
        return numberQuestion(unitKey, difficulty, index, `${a} 个苹果和 ${b} 个梨平均分成最多的相同份数，每份共有多少个水果？`, value, `最多分 ${g} 份，每份苹果 ${a / g} 个、梨 ${b / g} 个，共 ${value} 个。`, ["最大公因数", "分组"]);
      }
      case 8: {
        const digit = 3 + variant;
        const value = digit * 100 + 5 * 0.1 + 2 * 0.01;
        return numberQuestion(unitKey, difficulty, index, `由 ${digit} 个百、5 个十分之一和 2 个百分之一组成的数是？`, value, `${digit} × 100 + 5 × 0.1 + 2 × 0.01 = ${formatNumber(value)}。`, ["计数单位", "数的组成"]);
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `关于 1 的说法，正确的是？（辨析 ${variant + 1}）`, "1 既不是质数，也不是合数", ["1 是最小质数", "1 是最小合数", "1 没有因数"], "质数有且只有两个正因数，合数有两个以上正因数；1 只有一个正因数。", ["质数", "易错点"]);
    }
  }

  switch (kind) {
    case 0: {
      const a = 84 + variant * 42;
      const b = 126 + variant * 63;
      const g = gcd(a, b);
      const value = (a / g) * (b / g);
      return numberQuestion(unitKey, difficulty, index, `用 ${a} 块绿积木和 ${b} 块黄积木组成尽可能多的相同套装。每套绿、黄积木数量的乘积是多少？`, value, `先求最大公因数 ${g}，每套分别有 ${a / g} 和 ${b / g} 块，乘积为 ${value}。`, ["最大公因数", "综合分组"]);
    }
    case 1: {
      const a = 8 + variant * 4;
      const b = 12 + variant * 6;
      const c = 18 + variant * 6;
      const value = lcm(lcm(a, b), c);
      return numberQuestion(unitKey, difficulty, index, `三盏灯分别每 ${a}、${b}、${c} 秒闪一次，同时闪后至少再过多少秒同时闪？`, value, `求三个周期的最小公倍数，结果是 ${value} 秒。`, ["最小公倍数", "多周期"]);
    }
    case 2: {
      const target = 360 + variant * 180;
      const factors = Array.from({ length: target }, (_, i) => i + 1).filter((n) => target % n === 0);
      return numberQuestion(unitKey, difficulty, index, `${target} 有多少个正因数？`, factors.length, `将 ${target} 分解质因数或成对找因数，可得 ${factors.length} 个正因数。`, ["因数", "系统计数"]);
    }
    case 3: {
      const n = 10 + variant * 3;
      const value = Array.from({ length: n }, (_, i) => i + 1).filter(isPrime).length;
      return numberQuestion(unitKey, difficulty, index, `不大于 ${n} 的质数有多少个？`, value, `逐一判断 2 到 ${n}，共有 ${value} 个质数。`, ["质数", "筛选"]);
    }
    case 4: {
      const a = 12 + variant * 6;
      const b = 18 + variant * 9;
      const g = gcd(a, b);
      const l = lcm(a, b);
      return numberQuestion(unitKey, difficulty, index, `${a} 和 ${b} 的最大公因数与最小公倍数之积是多少？`, g * l, `两数的最大公因数 × 最小公倍数 = 两数之积，所以结果是 ${a} × ${b} = ${a * b}。`, ["公因数", "公倍数规律"]);
    }
    case 5: {
      const value = 0.00045 * 10 ** (variant + 2);
      return numberQuestion(unitKey, difficulty, index, `0.00045 的小数点向右移动 ${variant + 2} 位后是多少？`, value, `小数点向右移动 ${variant + 2} 位，相当于乘 ${10 ** (variant + 2)}，得到 ${formatNumber(value)}。`, ["小数", "数位变化"]);
    }
    case 6: {
      const numerator = 17 + variant * 2;
      const denominator = 24 + variant * 6;
      const value = numerator / denominator;
      return choiceQuestion(unitKey, difficulty, index, `${formatFraction(numerator, denominator)} 与下列哪个数最接近？`, formatFixed(3)(value), [formatFixed(2)(value), formatFixed(3)(1 - value), formatFixed(3)(value + 0.1)], `分子除以分母得到 ${formatNumber(value, 8)}，保留三位小数为 ${formatFixed(3)(value)}。`, ["分数", "近似值"]);
    }
    case 7: {
      const n = 90 + variant * 30;
      const count = Array.from({ length: n }, (_, i) => i + 1).filter((value) => value % 2 === 0 && value % 3 === 0 && value % 5 !== 0).length;
      return numberQuestion(unitKey, difficulty, index, `1～${n} 中，是 2 和 3 的倍数但不是 5 的倍数的数有多少个？`, count, `先数 6 的倍数，再排除同时是 5 的倍数，也就是 30 的倍数，得到 ${count} 个。`, ["倍数", "容斥思想"]);
    }
    case 8: {
      const a = 48 + variant * 24;
      const b = 72 + variant * 36;
      const c = 120 + variant * 60;
      const value = gcd(gcd(a, b), c);
      return numberQuestion(unitKey, difficulty, index, `${a}、${b}、${c} 三种物品平均分成尽可能多的相同礼包，最多分多少包？`, value, `礼包数是三个数量的公因数，取最大公因数 ${value}。`, ["最大公因数", "三数"]);
    }
    default:
      return choiceQuestion(unitKey, difficulty, index, `若 a 和 b 是互质数，下列结论一定正确的是？（组 ${variant + 1}）`, "a 与 b 的最大公因数是 1", ["a 与 b 都是质数", "a + b 一定是质数", "a 与 b 的最小公倍数是 a + b"], "互质只表示最大公因数为 1，不要求两个数本身都是质数。", ["互质", "逻辑判断"]);
  }
}

function binaryQuestion(difficulty: GradeSixDifficulty, index: number) {
  const unitKey = "practice-2";
  const kind = index % 10;
  const variant = Math.floor(index / 10);
  const decimal = 5 + index + variant * 3;
  const binary = decimal.toString(2);

  if (difficulty === "medium") {
    switch (kind) {
      case 0:
        return choiceQuestion(unitKey, difficulty, index, `十进制数 ${decimal} 写成二进制是？`, `${binary}₂`, [`${decimal}₂`, `${(decimal + 1).toString(2)}₂`, `${binary}₁₀`], `不断除以 2 取余并倒序排列，${decimal} = ${binary}₂。`, ["二进制", "十进制转二进制"]);
      case 1: {
        const value = Number.parseInt(binary, 2);
        return numberQuestion(unitKey, difficulty, index, `二进制数 ${binary}₂ 等于十进制多少？`, value, `${binary}₂ 按 1、2、4、8……的位值展开，得到 ${value}。`, ["二进制", "位值"]);
      }
      case 2: {
        const place = 2 ** (variant + 2);
        return choiceQuestion(unitKey, difficulty, index, `二进制从右往左第 ${variant + 3} 位的计数单位是？`, String(place), [String(place / 2), String(place * 2), String(variant + 3)], `二进制各位计数单位依次是 1、2、4、8……，第 ${variant + 3} 位是 ${place}。`, ["二进制", "计数单位"]);
      }
      case 3: {
        const next = (decimal + 1).toString(2);
        return choiceQuestion(unitKey, difficulty, index, `${binary}₂ 的下一个二进制数是？`, `${next}₂`, [`${binary}1₂`, `${(decimal - 1).toString(2)}₂`, `${decimal + 1}₂`], `先转成十进制 ${decimal}，加 1 后是 ${decimal + 1}，写成二进制为 ${next}₂。`, ["二进制", "数列"]);
      }
      case 4:
        return choiceQuestion(unitKey, difficulty, index, `二进制中允许使用哪些数字？（题组 ${variant + 1}）`, "0 和 1", ["0～2", "1 和 2", "0～9"], "二进制是“满二进一”，只使用 0 和 1。", ["二进制", "概念"]);
      case 5: {
        const value = 10 * 2 ** (variant + 1);
        return choiceQuestion(unitKey, difficulty, index, `二进制数 10₂ 的右边添 ${variant + 1} 个 0，十进制值变为原来的多少倍？`, `${2 ** (variant + 1)}倍`, [`${variant + 1}倍`, `${10 ** (variant + 1)}倍`, `${2 ** variant}倍`], `二进制每向左移动一位，数值乘 2；添 ${variant + 1} 个 0 就乘 ${2 ** (variant + 1)}，新值为 ${value}。`, ["二进制", "位值变化"]);
      }
      case 6: {
        const fiveBase = 20 + index;
        return numberQuestion(unitKey, difficulty, index, `五进制数 10₅ 等于十进制多少？（扩展 ${variant + 1}）`, 5, "任何进制的“10”都等于该进制的基数，10₅ = 5。", ["进制", "拓展"]);
      }
      case 7: {
        const left = (decimal + 2).toString(2);
        return choiceQuestion(unitKey, difficulty, index, `比较 ${binary}₂ 和 ${left}₂，正确的是？`, `${binary}₂ < ${left}₂`, [`${binary}₂ > ${left}₂`, `${binary}₂ = ${left}₂`, "无法比较"], `两数分别等于十进制 ${decimal} 和 ${decimal + 2}，所以前者较小。`, ["二进制", "大小比较"]);
      }
      case 8: {
        const ones = binary.split("").filter((digit) => digit === "1").length;
        return numberQuestion(unitKey, difficulty, index, `${binary}₂ 中有几个数位上的数字是 1？`, ones, `逐位统计 ${binary}，共有 ${ones} 个 1。`, ["二进制", "观察"]);
      }
      default: {
        const value = Number.parseInt("10101", 2);
        return choiceQuestion(unitKey, difficulty, index, `10101₂ 的正确展开式是？（组 ${variant + 1}）`, "16 + 4 + 1", ["10 + 10 + 1", "8 + 2 + 1", "16 + 8 + 1"], `10101₂ = 1×16 + 0×8 + 1×4 + 0×2 + 1 = ${value}。`, ["二进制", "展开式"]);
      }
    }
  }

  if (difficulty === "hard") {
    switch (kind) {
      case 0: {
        const a = 9 + variant * 4;
        const b = 6 + variant * 3;
        const value = a + b;
        return choiceQuestion(unitKey, difficulty, index, `${a.toString(2)}₂ + ${b.toString(2)}₂ = ?`, `${value.toString(2)}₂`, [`${(value + 1).toString(2)}₂`, `${(value - 1).toString(2)}₂`, `${a + b}₂`], `可先转成十进制：${a} + ${b} = ${value}，再写成 ${value.toString(2)}₂。`, ["二进制", "加法"]);
      }
      case 1: {
        const a = 20 + variant * 5;
        const b = 7 + variant * 2;
        const value = a - b;
        return choiceQuestion(unitKey, difficulty, index, `${a.toString(2)}₂ - ${b.toString(2)}₂ = ?`, `${value.toString(2)}₂`, [`${(value + 2).toString(2)}₂`, `${(value - 1).toString(2)}₂`, `${a - b}₂`], `转成十进制相减：${a} - ${b} = ${value}，再转回二进制。`, ["二进制", "减法"]);
      }
      case 2: {
        const value = 2 ** (5 + variant) + 2 ** (2 + variant) + 1;
        return choiceQuestion(unitKey, difficulty, index, `${2 ** (5 + variant)} + ${2 ** (2 + variant)} + 1 写成二进制是？`, `${value.toString(2)}₂`, [`${(value + 2).toString(2)}₂`, `${(value - 1).toString(2)}₂`, `${value}₂`], "把对应 2 的幂所在数位写 1，其余数位写 0。", ["二进制", "位值组合"]);
      }
      case 3: {
        const digits = 5 + variant;
        const value = 2 ** digits - 1;
        return numberQuestion(unitKey, difficulty, index, `${digits} 位二进制数能表示的最大十进制数是多少？`, value, `最大数是 ${"1".repeat(digits)}₂ = 2^${digits} - 1 = ${value}。`, ["二进制", "最大值"]);
      }
      case 4: {
        const value = 2 ** (4 + variant);
        return choiceQuestion(unitKey, difficulty, index, `十进制 ${value} 的二进制表示中有几个 1？`, "1个", ["2个", `${variant + 4}个`, "0个"], `${value} 是 2 的整数次幂，二进制写成 1 后面若干个 0，只有一个 1。`, ["二进制", "规律"]);
      }
      case 5: {
        const octal = 17 + variant * 10;
        const value = Number.parseInt(String(octal), 8);
        return numberQuestion(unitKey, difficulty, index, `八进制数 ${octal}₈ 等于十进制多少？`, value, `${octal}₈ = ${Math.floor(octal / 10)} × 8 + ${octal % 10} = ${value}。`, ["八进制", "拓展"]);
      }
      case 6: {
        const value = 31 + variant * 16;
        const base5 = value.toString(5);
        return choiceQuestion(unitKey, difficulty, index, `十进制 ${value} 写成五进制是？`, `${base5}₅`, [`${value}₅`, `${(value + 1).toString(5)}₅`, `${base5}₂`], `不断除以 5 取余，倒序排列，得到 ${base5}₅。`, ["五进制", "拓展"]);
      }
      case 7: {
        const bits = 6 + variant;
        const value = 2 ** bits;
        return numberQuestion(unitKey, difficulty, index, `从 0 开始，${bits} 位二进制一共能表示多少种不同状态？`, value, `每一位有 0、1 两种选择，${bits} 位共有 2^${bits} = ${value} 种。`, ["二进制", "组合"]);
      }
      case 8: {
        const value = Number.parseInt(binary, 2) * 2;
        return choiceQuestion(unitKey, difficulty, index, `${binary}₂ 左移一位（末尾添 0）后等于十进制多少？`, String(value), [String(value / 2), String(value + 2), String(value * 2)], "二进制左移一位相当于乘 2。", ["二进制", "位移"]);
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `二进制加法中 1₂ + 1₂ 的结果是？（辨析 ${variant + 1}）`, "10₂", ["2₂", "11₂", "1₂"], "二进制满二进一，1 + 1 得 0 并向前进 1，所以是 10₂。", ["二进制", "满二进一"]);
    }
  }

  switch (kind) {
    case 0: {
      const a = 27 + variant * 13;
      const b = 19 + variant * 7;
      const value = a * b;
      return choiceQuestion(unitKey, difficulty, index, `${a.toString(2)}₂ × ${b.toString(2)}₂ = ?`, `${value.toString(2)}₂`, [`${(value + a).toString(2)}₂`, `${(value - b).toString(2)}₂`, `${value}₂`], `先按十进制验证 ${a} × ${b} = ${value}，再转为 ${value.toString(2)}₂。`, ["二进制", "乘法"]);
    }
    case 1: {
      const bits = 8 + variant;
      const max = 2 ** bits - 1;
      return numberQuestion(unitKey, difficulty, index, `无符号 ${bits} 位二进制整数的取值范围是 0 到多少？`, max, `共有 2^${bits} 种状态，从 0 编号到 2^${bits} - 1，最大为 ${max}。`, ["二进制", "信息表示"]);
    }
    case 2: {
      const value = 173 + variant * 41;
      const binaryValue = value.toString(2);
      const recovered = Number.parseInt(binaryValue, 2);
      return choiceQuestion(unitKey, difficulty, index, `十进制 ${value} 转成二进制再转回十进制，结果是？`, String(recovered), [String(value + 1), String(value - 1), String(binaryValue)], "进制转换只改变表示方法，不改变数值本身。", ["进制", "等值表示"]);
    }
    case 3: {
      const binaryText = (45 + variant * 13).toString(2);
      const value = Number.parseInt(binaryText, 2);
      return numberQuestion(unitKey, difficulty, index, `二进制数 ${binaryText}₂ 等于十进制多少？`, value, `按 2 的幂展开并相加，得到 ${value}。`, ["二进制", "展开"]);
    }
    case 4: {
      const a = 45 + variant * 10;
      const b = 18 + variant * 5;
      const value = a ^ b;
      return choiceQuestion(unitKey, difficulty, index, `将 ${a} 和 ${b} 分别写成二进制，逐位“相同为 0、不同为 1”，得到的十进制数是？`, String(value), [String(a + b), String(Math.abs(a - b)), String(a & b)], `逐位比较相当于异或运算：${a.toString(2)}₂ 与 ${b.toString(2)}₂ 得 ${(a ^ b).toString(2)}₂，即 ${value}。`, ["二进制", "规律拓展"]);
    }
    case 5: {
      const base = 3 + variant;
      const digits = `12${variant + 1}`;
      const value = Number.parseInt(digits, base + 2);
      return numberQuestion(unitKey, difficulty, index, `${digits}_${base + 2} 等于十进制多少？`, value, `按 ${base + 2} 的幂展开，结果为 ${value}。`, ["进制", "综合转换"]);
    }
    case 6: {
      const value = 255 - variant * 17;
      const ones = value.toString(2).split("").filter((digit) => digit === "1").length;
      return numberQuestion(unitKey, difficulty, index, `${value} 的二进制表示中有几个 1？`, ones, `${value} = ${value.toString(2)}₂，其中共有 ${ones} 个 1。`, ["二进制", "位统计"]);
    }
    case 7: {
      const start = 2 ** (5 + variant) - 2;
      const sequence = [start, start + 1, start + 2].map((value) => `${value.toString(2)}₂`);
      return choiceQuestion(unitKey, difficulty, index, `从 ${start.toString(2)}₂ 开始连续数三个数，正确顺序是？`, sequence.join("、"), [[start, start + 2, start + 1].map((v) => `${v.toString(2)}₂`).join("、"), [start, start + 1, start + 3].map((v) => `${v.toString(2)}₂`).join("、"), [start, start - 1, start - 2].map((v) => `${v.toString(2)}₂`).join("、")], "跨过连续的 1 时要按“满二进一”逐位进位。", ["二进制", "连续进位"]);
    }
    case 8: {
      const n = 10 + variant * 5;
      const value = n.toString(2).length;
      return numberQuestion(unitKey, difficulty, index, `表示十进制 ${n} 至少需要多少个二进制位？`, value, `${n} 介于 2^${value - 1} 和 2^${value} - 1 之间，需要 ${value} 位。`, ["二进制", "位数"]);
    }
    default:
      return choiceQuestion(unitKey, difficulty, index, `关于不同进制，正确的是？（综合 ${variant + 1}）`, "同一个数可以用不同进制表示，但数值不变", ["二进制数一定比十进制数小", "所有进制都只用 0 和 1", "进制改变会改变实际数量"], "进制只是记数方法；转换前后表示形式改变，实际数量不变。", ["进制", "概念"]);
  }
}

function ratioQuestion(difficulty: GradeSixDifficulty, index: number) {
  const unitKey = "unit-4";
  const kind = index % 10;
  const variant = Math.floor(index / 10);
  const a = 3 + variant + (index % 3);
  const b = 2 + variant;

  if (difficulty === "medium") {
    switch (kind) {
      case 0:
        return choiceQuestion(unitKey, difficulty, index, `${a}:${b} 写成分数是？`, formatFraction(a, b), [formatFraction(b, a), formatFraction(a + b, b), formatFraction(a, a + b)], `比的前项相当于分子，后项相当于分母，所以是 ${formatFraction(a, b)}。`, ["比", "比与分数"]);
      case 1: {
        const divisor = gcd(a * 4, b * 4);
        return choiceQuestion(unitKey, difficulty, index, `化简比 ${a * 4}:${b * 4}，结果是？`, `${(a * 4) / divisor}:${(b * 4) / divisor}`, [`${a * 4 - b * 4}:1`, `${a * 4 + b * 4}:${b * 4}`, `${b}:${a}`], `前后项同时除以最大公因数 ${divisor}，得到最简比。`, ["比", "化简比"]);
      }
      case 2: {
        const value = a / b;
        return numberQuestion(unitKey, difficulty, index, `比 ${a}:${b} 的比值是多少？`, value, `比值 = 前项 ÷ 后项 = ${a} ÷ ${b} = ${formatNumber(value)}。`, ["比", "比值"]);
      }
      case 3: {
        const total = (a + b) * (5 + variant);
        const first = total * a / (a + b);
        return numberQuestion(unitKey, difficulty, index, `${total} 千克原料按 ${a}:${b} 分成甲、乙两份，甲有多少千克？`, first, `总份数 ${a + b}，甲占 ${a}/${a + b}，所以甲有 ${formatNumber(first)} 千克。`, ["按比分配", "比"]);
      }
      case 4: {
        const x = a * 4;
        const right = b * 4;
        return numberQuestion(unitKey, difficulty, index, `${a}:${b} = x:${right}，x = ?`, x, `后项扩大 4 倍，前项也扩大 4 倍，x = ${a} × 4 = ${x}。`, ["比例", "求未知项"]);
      }
      case 5: {
        const scale = 100000 * (variant + 1);
        const map = 3 + variant;
        const actualKm = map * scale / 100000;
        return numberQuestion(unitKey, difficulty, index, `地图比例尺 1:${scale}，图上 ${map} 厘米表示实际多少千米？`, actualKm, `实际距离 = ${map} × ${scale} 厘米，再除以 100000 化成千米，得到 ${formatNumber(actualKm)} 千米。`, ["比例尺", "距离"], formatWithUnit("千米"));
      }
      case 6:
        return choiceQuestion(unitKey, difficulty, index, `下列两种量成正比例的是？（组 ${variant + 1}）`, "速度一定时，路程和时间", ["总价一定时，单价和数量", "长方形面积一定时，长和宽", "一个人的年龄和身高"], "速度一定，路程 ÷ 时间 = 速度，比值一定，所以成正比例。", ["正比例", "判断"]);
      case 7:
        return choiceQuestion(unitKey, difficulty, index, `下列两种量成反比例的是？（组 ${variant + 1}）`, "总路程一定时，速度和时间", ["速度一定时，路程和时间", "单价一定时，总价和数量", "圆的半径和直径"], "总路程 = 速度 × 时间，乘积一定，所以速度和时间成反比例。", ["反比例", "判断"]);
      case 8: {
        const flour = 2 * (variant + 1);
        const water = variant + 1;
        const target = flour * 4;
        return numberQuestion(unitKey, difficulty, index, `面粉与水质量比为 ${flour}:${water}。用 ${target} 千克面粉，需要水多少千克？`, target * water / flour, `水量 = 面粉量 × ${water}/${flour} = ${formatNumber(target * water / flour)} 千克。`, ["比", "生活应用"]);
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `在比例 a:b = c:d 中，正确的基本性质是？（题组 ${variant + 1}）`, "a × d = b × c", ["a + d = b + c", "a × b = c × d", "a ÷ d = b ÷ c"], "比例的两内项之积等于两外项之积。", ["比例", "基本性质"]);
    }
  }

  if (difficulty === "hard") {
    switch (kind) {
      case 0: {
        const total = (a + b) * (12 + variant * 4);
        const x = total * a / (a + b);
        return numberQuestion(unitKey, difficulty, index, `甲、乙人数比为 ${a}:${b}，共 ${total} 人，甲比乙多多少人？`, Math.abs(x - (total - x)), `按比分配后，差 = ${total} × |${a}-${b}|/(${a}+${b}) = ${formatNumber(Math.abs(x - (total - x)))}。`, ["按比分配", "差"]);
      }
      case 1: {
        const x = 12 + variant * 6;
        const c = a * x / b;
        return numberQuestion(unitKey, difficulty, index, `${a}:${b} = ${formatNumber(c)}:x，x = ?`, x, `由 ${a} × x = ${b} × ${formatNumber(c)}，解得 x = ${x}。`, ["比例", "求未知项"]);
      }
      case 2: {
        const workers = 12 + variant * 4;
        const days = 18 - variant * 3;
        const newWorkers = 18 + variant * 6;
        const value = workers * days / newWorkers;
        return numberQuestion(unitKey, difficulty, index, `${workers} 人 ${days} 天完成工程，效率相同，${newWorkers} 人需多少天？`, value, `总工作量一定，人数与天数成反比例，${workers} × ${days} = ${newWorkers} × x，x = ${formatNumber(value)}。`, ["反比例", "工程"]);
      }
      case 3: {
        const scale = 250000 + variant * 250000;
        const actual = 30 + variant * 20;
        const map = actual * 100000 / scale;
        return numberQuestion(unitKey, difficulty, index, `比例尺 1:${scale}，实际距离 ${actual} 千米，图上应画多少厘米？`, map, `先把 ${actual} 千米化成 ${actual * 100000} 厘米，再除以 ${scale}，得 ${formatNumber(map)} 厘米。`, ["比例尺", "单位换算"], formatWithUnit("厘米"));
      }
      case 4: {
        const concentration = a / (a + b);
        const total = 50 + variant * 25;
        return numberQuestion(unitKey, difficulty, index, `糖与水质量比 ${a}:${b}，配成 ${total} 千克糖水，糖有多少千克？`, total * concentration, `糖占总质量 ${a}/(${a}+${b})，糖的质量为 ${formatNumber(total * concentration)} 千克。`, ["按比分配", "浓度"]);
      }
      case 5: {
        const oldRatio = 2 + variant;
        const width = 6 + variant * 2;
        const length = width * oldRatio;
        const add = width;
        const newRatio = (length + add) / width;
        return choiceQuestion(unitKey, difficulty, index, `长方形长宽比为 ${oldRatio}:1，长增加 ${add} 厘米、宽不变，新长宽比是？`, `${formatNumber(newRatio)}:1`, [`${oldRatio}:2`, `${oldRatio + add}:1`, `1:${formatNumber(newRatio)}`], `原长 ${length} 厘米，新长 ${length + add} 厘米，除以宽 ${width}，新比为 ${formatNumber(newRatio)}:1。`, ["比", "变化"]);
      }
      case 6: {
        const rate = 60 + variant * 15;
        const time = 2 + variant;
        const distance = rate * time;
        const newRate = rate * 1.2;
        return numberQuestion(unitKey, difficulty, index, `行驶 ${distance} 千米，原速度 ${rate} 千米/时。速度提高 20% 后，时间缩短多少小时？`, time - distance / newRate, `原时间 ${time} 小时，新时间 ${distance} ÷ ${formatNumber(newRate)} = ${formatNumber(distance / newRate)} 小时，相差 ${formatNumber(time - distance / newRate)} 小时。`, ["反比例", "速度"]);
      }
      case 7: {
        const k = 4 + variant;
        return choiceQuestion(unitKey, difficulty, index, `若 y = ${k}x，x 与 y 的关系是？`, "成正比例，比值 y/x = 常数", ["成反比例，乘积 xy = 常数", "不成比例", "只有 x=1 时成比例"], `y/x = ${k}，比值一定，所以成正比例。`, ["正比例", "关系式"]);
      }
      case 8: {
        const k = 48 + variant * 24;
        return choiceQuestion(unitKey, difficulty, index, `若 xy = ${k}，x 与 y 的关系是？`, "成反比例，乘积一定", ["成正比例，比值一定", "不成比例", "两者同时增大"], `x 与 y 的乘积始终是 ${k}，所以成反比例。`, ["反比例", "关系式"]);
      }
      default: {
        const male = 105.07 + variant * 1.5;
        const ratio = male / 100;
        return numberQuestion(unitKey, difficulty, index, `男、女人数比为 ${formatNumber(male)}:100，男性人数约是女性的多少倍？`, ratio, `比值 = ${formatNumber(male)} ÷ 100 = ${formatNumber(ratio)}。`, ["比值", "人口数据"]);
      }
    }
  }

  switch (kind) {
    case 0: {
      const total = 180 + variant * 60;
      const ratioA = 2 + variant;
      const ratioB = 3 + variant;
      const ratioC = 4 + variant;
      const value = total * ratioC / (ratioA + ratioB + ratioC);
      return numberQuestion(unitKey, difficulty, index, `${total} 本书按 ${ratioA}:${ratioB}:${ratioC} 分给三个班，第三班比第一班多多少本？`, value - total * ratioA / (ratioA + ratioB + ratioC), `每份 ${formatNumber(total / (ratioA + ratioB + ratioC))} 本，第三班比第一班多 ${ratioC - ratioA} 份。`, ["按比分配", "三项比"]);
    }
    case 1: {
      const original = 20 + variant * 10;
      const addWater = 10 + variant * 5;
      const sugar = original * 0.2;
      const value = sugar / (original + addWater);
      return numberQuestion(unitKey, difficulty, index, `${original} 千克糖水含糖 20%，再加 ${addWater} 千克水，含糖率是多少？`, value * 100, `糖仍为 ${formatNumber(sugar)} 千克，总质量变为 ${original + addWater} 千克，含糖率 ${formatNumber(value * 100)}%。`, ["比", "浓度变化"], formatWithUnit("%"));
    }
    case 2: {
      const mapA = 4 + variant;
      const mapB = 6 + variant * 2;
      const scaleA = 200000;
      const scaleB = mapA * scaleA / mapB;
      return numberQuestion(unitKey, difficulty, index, `同一实际距离在甲图上 ${mapA} 厘米，比例尺 1:${scaleA}；在乙图上 ${mapB} 厘米，乙图比例尺分母是多少？`, scaleB, `实际距离相同，${mapA} × ${scaleA} = ${mapB} × x，x = ${formatNumber(scaleB)}。`, ["比例尺", "反求"]);
    }
    case 3: {
      const work = 720 + variant * 180;
      const workers = 12 + variant * 3;
      const days = 10 + variant * 2;
      const newWorkers = workers + 6;
      const efficiency = work / (workers * days);
      const value = work / (newWorkers * efficiency);
      return numberQuestion(unitKey, difficulty, index, `${workers} 人 ${days} 天完成 ${work} 件任务。效率不变，增加到 ${newWorkers} 人需几天？`, value, `先求每人每天效率 ${formatNumber(efficiency)}，再用总量除以新人数与效率，得 ${formatNumber(value)} 天。`, ["反比例", "工程"]);
    }
    case 4: {
      const a1 = 3 + variant;
      const b1 = 5 + variant;
      const a2 = 7 + variant;
      const b2 = a2 * b1 / a1;
      return numberQuestion(unitKey, difficulty, index, `${a1}:${b1} = ${a2}:x，求 x。`, b2, `比例基本性质：${a1}x = ${b1} × ${a2}，所以 x = ${formatNumber(b2)}。`, ["比例", "比例方程"]);
    }
    case 5: {
      const old = 40 + variant * 10;
      const ratio = 5 / 4;
      const newValue = old * ratio;
      return numberQuestion(unitKey, difficulty, index, `某量按 4:5 放大后是 ${formatNumber(newValue)}，原来是多少？`, old, `放大后 : 原来 = 5:4，所以原来 = ${formatNumber(newValue)} × 4/5 = ${old}。`, ["比例", "逆向"]);
    }
    case 6: {
      const speedRatioA = 3 + variant;
      const speedRatioB = 4 + variant;
      const timeA = 8 + variant * 2;
      const timeB = timeA * speedRatioA / speedRatioB;
      return numberQuestion(unitKey, difficulty, index, `同走一段路，甲乙速度比 ${speedRatioA}:${speedRatioB}，甲用 ${timeA} 小时，乙用多少小时？`, timeB, `路程一定，速度与时间成反比例，时间比为 ${speedRatioB}:${speedRatioA}，乙用 ${formatNumber(timeB)} 小时。`, ["反比例", "速度时间"]);
    }
    case 7: {
      const total = 90 + variant * 45;
      const first = 2 + variant;
      const second = 3 + variant;
      const third = 4 + variant;
      const value = total * second / (first + second + third);
      return numberQuestion(unitKey, difficulty, index, `甲:乙=${first}:${second}，乙:丙=${second}:${third}，三者共 ${total}，乙是多少？`, value, `两组比中乙的份数已相同，可合并为 ${first}:${second}:${third}，乙占 ${second}/${first + second + third}。`, ["连比", "按比分配"]);
    }
    case 8: {
      const actualArea = 50 + variant * 25;
      const linearScale = 1 / (1000 + variant * 500);
      const mapArea = actualArea * 10_000 * linearScale ** 2;
      return numberQuestion(unitKey, difficulty, index, `平面图比例尺 1:${Math.round(1 / linearScale)}，实际面积 ${actualArea} 平方米，图上面积约多少平方厘米？`, mapArea, `长度缩小 ${Math.round(1 / linearScale)} 倍，面积缩小其平方倍；换算后图上面积 ${formatNumber(mapArea)} 平方厘米。`, ["比例尺", "面积比"]);
    }
    default:
      return choiceQuestion(unitKey, difficulty, index, `比例中把一个内项扩大 3 倍，要保持比例成立，应怎样调整？（组 ${variant + 1}）`, "把另一个内项缩小到原来的 1/3，或把一个外项扩大 3 倍", ["两个外项都缩小 3 倍", "另一个内项也扩大 3 倍且外项不变", "无需调整"], "比例成立要求两内项之积等于两外项之积，必须保持两边乘积同步变化。", ["比例", "变式"]);
  }
}

function goldenRatioQuestion(difficulty: GradeSixDifficulty, index: number) {
  const unitKey = "practice-3";
  const kind = index % 10;
  const variant = Math.floor(index / 10);
  const fibonacci = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377];
  const start = 2 + variant + (index % 4);

  if (difficulty === "medium") {
    switch (kind) {
      case 0:
        return numberQuestion(unitKey, difficulty, index, `数列 ${fibonacci[start - 2]}，${fibonacci[start - 1]}，${fibonacci[start]}，${fibonacci[start + 1]}，下一个数是？`, fibonacci[start + 2], `从第三项起，每一项等于前两项之和，所以是 ${fibonacci[start]} + ${fibonacci[start + 1]} = ${fibonacci[start + 2]}。`, ["斐波那契数列", "规律"]);
      case 1: {
        const value = fibonacci[start] / fibonacci[start + 1];
        return numberQuestion(unitKey, difficulty, index, `${fibonacci[start]}:${fibonacci[start + 1]} 的比值保留三位小数是多少？`, value, `用前项除以后项，得到 ${formatNumber(value, 8)}，保留三位为 ${value.toFixed(3)}。`, ["黄金比", "比值"], formatFixed(3));
      }
      case 2: {
        const whole = 100 + variant * 50;
        return numberQuestion(unitKey, difficulty, index, `一条线段长 ${whole} 厘米，按近似黄金比 0.618 取较长部分，长约多少厘米？`, whole * 0.618, `较长部分 = 整体 × 0.618 = ${formatNumber(whole * 0.618)} 厘米。`, ["黄金分割", "应用"], formatWithUnit("厘米"));
      }
      case 3:
        return choiceQuestion(unitKey, difficulty, index, `下列哪个小数最接近黄金比？（组 ${variant + 1}）`, "0.618", ["0.5", "0.75", "1.618"], "教材中用 0.618 作为黄金比的近似值。", ["黄金比", "概念"]);
      case 4: {
        const total = 80 + variant * 20;
        const long = total * 0.618;
        return numberQuestion(unitKey, difficulty, index, `画面宽 ${total} 厘米，主体放在距左边约宽度 0.618 的位置，距离约是多少？`, long, `位置距离 = ${total} × 0.618 = ${formatNumber(long)} 厘米。`, ["黄金比", "构图"], formatWithUnit("厘米"));
      }
      case 5: {
        const a = fibonacci[start + 1];
        const b = fibonacci[start + 2];
        return choiceQuestion(unitKey, difficulty, index, `${a}:${b} 与 0.618 的关系最接近哪项？`, "比值接近 0.618", ["比值等于 1", "比值大于 2", "没有关系"], `相邻斐波那契数前项除以后项会逐渐接近 0.618。`, ["斐波那契数列", "黄金比"]);
      }
      case 6: {
        const long = 61.8 + variant * 6.18;
        const short = 38.2 + variant * 3.82;
        return numberQuestion(unitKey, difficulty, index, `线段分成长 ${formatNumber(long)}、短 ${formatNumber(short)} 两段，长段占整体的百分之几？`, long / (long + short) * 100, `整体 ${formatNumber(long + short)}，长段占比 ${formatNumber(long / (long + short) * 100)}%。`, ["黄金分割", "百分比"], formatWithUnit("%"));
      }
      case 7:
        return choiceQuestion(unitKey, difficulty, index, `黄金比常见于下面哪类研究？（情境 ${variant + 1}）`, "构图、建筑和自然形态中的比例", ["只用于整数加法", "只用于温度测量", "与比例无关"], "教材从画面构图、植物和建筑等情境认识黄金比。", ["黄金比", "生活应用"]);
      case 8: {
        const next = fibonacci[start] + fibonacci[start + 1];
        return choiceQuestion(unitKey, difficulty, index, `斐波那契数列中相邻两项为 ${fibonacci[start]} 和 ${fibonacci[start + 1]}，后一项之后是？`, String(next), [String(fibonacci[start + 1] * 2), String(fibonacci[start + 1] - fibonacci[start]), String(fibonacci[start] * fibonacci[start + 1])], `下一项等于前两项之和：${fibonacci[start]} + ${fibonacci[start + 1]} = ${next}。`, ["斐波那契数列", "递推"]);
      }
      default: {
        const value = 0.625 + variant * 0.005;
        return choiceQuestion(unitKey, difficulty, index, `某植物叶柄与叶脉长度比为 ${formatNumber(value)}，它与黄金比 0.618 的差是多少？`, formatNumber(Math.abs(value - 0.618), 3), [formatNumber(value + 0.618, 3), formatNumber(1 - value, 3), formatNumber(value / 0.618, 3)], `求绝对差：|${formatNumber(value)} - 0.618| = ${formatNumber(Math.abs(value - 0.618), 3)}。`, ["黄金比", "接近程度"]);
      }
    }
  }

  if (difficulty === "hard") {
    switch (kind) {
      case 0: {
        const whole = 160 + variant * 40;
        const long = whole * 0.618;
        const short = whole - long;
        return numberQuestion(unitKey, difficulty, index, `线段长 ${whole} 厘米，按黄金比分割，较短部分约多少厘米？`, short, `较短部分占 1 - 0.618 = 0.382，所以约 ${whole} × 0.382 = ${formatNumber(short)} 厘米。`, ["黄金分割", "较短部分"], formatWithUnit("厘米"));
      }
      case 1: {
        const pairs = [[8, 13], [13, 21], [21, 34]][variant];
        const value = pairs[0] / pairs[1];
        return numberQuestion(unitKey, difficulty, index, `${pairs[0]}:${pairs[1]} 的比值与 0.618 相差多少？`, Math.abs(value - 0.618), `比值 ${formatNumber(value, 6)}，与 0.618 的差为 ${formatNumber(Math.abs(value - 0.618), 6)}。`, ["黄金比", "误差"], formatFixed(3));
      }
      case 2: {
        const total = 1000 + variant * 500;
        const long = Math.round(total * 0.618);
        return numberQuestion(unitKey, difficulty, index, `版面高 ${total} 像素，黄金分割点距上边约多少像素？（取整数）`, long, `${total} × 0.618 = ${formatNumber(total * 0.618)}，取整为 ${long} 像素。`, ["黄金比", "设计"]);
      }
      case 3: {
        const values = [0.61 + variant * 0.002, 0.63 - variant * 0.002, 0.59 + variant * 0.003];
        const nearest = values.reduce((best, value) => Math.abs(value - 0.618) < Math.abs(best - 0.618) ? value : best);
        return choiceQuestion(unitKey, difficulty, index, `在 ${values.map((value) => formatNumber(value, 3)).join("、")} 中，最接近 0.618 的是？`, formatNumber(nearest, 3), values.filter((v) => v !== nearest).map((v) => formatNumber(v, 3)).concat(["0.700"]), `比较各数与 0.618 的绝对差，${formatNumber(nearest, 3)} 的差最小。`, ["黄金比", "比较"]);
      }
      case 4: {
        const long = 61.8 + variant * 12.36;
        const whole = long / 0.618;
        return numberQuestion(unitKey, difficulty, index, `黄金分割中较长部分约 ${formatNumber(long)} 厘米，整条线段约多长？`, whole, `整体 = 较长部分 ÷ 0.618 = ${formatNumber(whole)} 厘米。`, ["黄金分割", "逆向"], formatWithUnit("厘米"));
      }
      case 5: {
        const n = 6 + variant;
        const fib = [1, 1];
        while (fib.length <= n) fib.push(fib.at(-1)! + fib.at(-2)!);
        return numberQuestion(unitKey, difficulty, index, `从 1，1 开始，斐波那契数列第 ${n + 1} 项是多少？`, fib[n], `逐项用前两项相加，可得第 ${n + 1} 项为 ${fib[n]}。`, ["斐波那契数列", "项数"]);
      }
      case 6: {
        const width = 90 + variant * 30;
        const height = width / 0.618;
        return numberQuestion(unitKey, difficulty, index, `矩形宽与长之比约为 0.618，宽 ${width} 厘米，长约多少厘米？`, height, `宽 ÷ 长 = 0.618，所以长 = ${width} ÷ 0.618 ≈ ${formatNumber(height, 2)} 厘米。`, ["黄金矩形", "比例"], formatFixed(2));
      }
      case 7: {
        const current = fibonacci[start + 2];
        const previous = fibonacci[start + 1];
        const before = current - previous;
        return numberQuestion(unitKey, difficulty, index, `斐波那契数列中某项是 ${current}，前一项是 ${previous}，再前一项是多少？`, before, `某项 = 前两项之和，所以再前一项 = ${current} - ${previous} = ${before}。`, ["斐波那契数列", "逆推"]);
      }
      case 8: {
        const whole = 250 + variant * 50;
        const long = whole * 0.618;
        const ratio = long / (whole - long);
        return numberQuestion(unitKey, difficulty, index, `一条 ${whole} 厘米线段按 0.618 分成长、短两段，长段与短段比值约是多少？`, ratio, `长段 ${formatNumber(long)}，短段 ${formatNumber(whole - long)}，相除约 ${formatNumber(ratio, 3)}。`, ["黄金分割", "比值"], formatFixed(3));
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `黄金比 0.618 是精确值还是近似值？（辨析 ${variant + 1}）`, "近似值，真实比值是无理数", ["精确有限小数", "整数", "循环小数 0.618618…"], "教材说明 0.618 是黄金比的近似值，真实值不能写成有限小数。", ["黄金比", "概念辨析"]);
    }
  }

  switch (kind) {
    case 0: {
      const n = 10 + variant;
      const fib = [1, 1];
      while (fib.length <= n) fib.push(fib.at(-1)! + fib.at(-2)!);
      const value = fib[n - 1] / fib[n];
      return numberQuestion(unitKey, difficulty, index, `斐波那契数列第 ${n} 项与第 ${n + 1} 项的比值保留六位小数是多少？`, value, `两项分别是 ${fib[n - 1]} 和 ${fib[n]}，相除为 ${formatNumber(value, 9)}。`, ["斐波那契数列", "极限趋势"], formatFixed(6));
    }
    case 1: {
      const whole = 420 + variant * 140;
      const long = whole * 0.618;
      const short = whole - long;
      return numberQuestion(unitKey, difficulty, index, `海报高 ${whole} 毫米，标题线设在黄金分割点。若从上边量较短部分，距离约多少毫米？`, short, `从上边取较短部分时用 0.382，${whole} × 0.382 = ${formatNumber(short)} 毫米。`, ["黄金分割", "设计"], formatWithUnit("毫米"));
    }
    case 2: {
      const a = fibonacci[7 + variant];
      const b = fibonacci[8 + variant];
      const c = fibonacci[9 + variant];
      const firstError = Math.abs(a / b - 0.618);
      const secondError = Math.abs(b / c - 0.618);
      return choiceQuestion(unitKey, difficulty, index, `比较 ${a}:${b} 与 ${b}:${c}，哪一个更接近 0.618？`, secondError < firstError ? `${b}:${c}` : `${a}:${b}`, [secondError < firstError ? `${a}:${b}` : `${b}:${c}`, "两者完全相等", "都与 0.618 无关"], `两个误差分别约 ${formatNumber(firstError, 6)} 和 ${formatNumber(secondError, 6)}，误差更小者更接近。`, ["黄金比", "误差比较"]);
    }
    case 3: {
      const long = 200 + variant * 50;
      const short = long / 1.618;
      const whole = long + short;
      return numberQuestion(unitKey, difficulty, index, `黄金分割中长段与短段比约 1.618，长段 ${long} 厘米，整段约多长？`, whole, `短段 ≈ ${long} ÷ 1.618 = ${formatNumber(short, 3)}，整段约 ${formatNumber(whole, 3)} 厘米。`, ["黄金分割", "逆向"], formatFixed(2));
    }
    case 4: {
      const petals = fibonacci[6 + variant];
      const next = fibonacci[7 + variant];
      return choiceQuestion(unitKey, difficulty, index, `某花盘两圈花瓣数为 ${petals} 和 ${next}。若符合斐波那契规律，下一圈可能是？`, String(petals + next), [String(next * 2), String(next - petals), String(petals * next)], `下一项等于前两项之和：${petals} + ${next} = ${petals + next}。`, ["自然中的数学", "斐波那契"]);
    }
    case 5: {
      const length = 1000 + variant * 500;
      const pointA = length * 0.618;
      const pointB = length * 0.382;
      return numberQuestion(unitKey, difficulty, index, `长 ${length} 像素的画面有两个对称黄金分割点，它们之间相距多少像素？`, pointA - pointB, `两个点分别在 0.382 和 0.618 处，间距占 0.236，得到 ${formatNumber(pointA - pointB)} 像素。`, ["黄金分割", "双分割点"]);
    }
    case 6: {
      const ratio = 0.618;
      const area = 10000 + variant * 5000;
      const length = Math.sqrt(area / ratio);
      return numberQuestion(unitKey, difficulty, index, `黄金矩形宽长比 0.618，面积 ${area} 平方厘米，长约多少厘米？`, length, `设长为 L，宽为 0.618L，则 0.618L² = ${area}，L ≈ ${formatNumber(length, 2)}。`, ["黄金矩形", "面积"], formatFixed(2));
    }
    case 7: {
      const n = 8 + variant;
      const fib = [1, 1];
      while (fib.length <= n) fib.push(fib.at(-1)! + fib.at(-2)!);
      const sum = fib.slice(0, n).reduce((total, value) => total + value, 0);
      return numberQuestion(unitKey, difficulty, index, `斐波那契数列前 ${n} 项（从 1，1 开始）的和是多少？`, sum, `逐项相加可得 ${sum}；也可用“前 n 项和 = 第 n+2 项 - 1”验证。`, ["斐波那契数列", "求和"]);
    }
    case 8: {
      const measured = 0.62 + variant * 0.003;
      const relative = Math.abs(measured - 0.618) / 0.618 * 100;
      return numberQuestion(unitKey, difficulty, index, `实测比值 ${formatNumber(measured, 3)} 与 0.618 的相对误差约为百分之几？`, relative, `相对误差 = |${formatNumber(measured, 3)} - 0.618| ÷ 0.618 × 100% ≈ ${formatNumber(relative, 2)}%。`, ["黄金比", "相对误差"], formatFixed(2));
    }
    default:
      return choiceQuestion(unitKey, difficulty, index, `判断一个构图是否“更接近黄金比”，最合理的方法是？（方案 ${variant + 1}）`, "测量相关长度，计算比值并比较它与 0.618 的差", ["只看颜色是否漂亮", "只数图形个数", "要求比值必须恰好是整数"], "黄金比判断应基于可测量的长度比，并用与 0.618 的差衡量接近程度。", ["黄金比", "研究方法"]);
  }
}

function circleQuestion(difficulty: GradeSixDifficulty, index: number) {
  const unitKey = "unit-5";
  const kind = index % 10;
  const variant = Math.floor(index / 10);
  const radius = 2 + variant + (index % 4);
  const pi = 3.14;

  if (difficulty === "medium") {
    switch (kind) {
      case 0:
        return numberQuestion(unitKey, difficulty, index, `圆的半径是 ${radius} 厘米，直径是多少？`, radius * 2, `直径 d = 2r = 2 × ${radius} = ${radius * 2} 厘米。`, ["圆的认识", "半径直径"], formatWithUnit("厘米"));
      case 1:
        return numberQuestion(unitKey, difficulty, index, `圆的直径是 ${radius * 2} 厘米，半径是多少？`, radius, `半径是直径的一半，${radius * 2} ÷ 2 = ${radius} 厘米。`, ["圆的认识", "半径直径"], formatWithUnit("厘米"));
      case 2: {
        const value = 2 * pi * radius;
        return numberQuestion(unitKey, difficulty, index, `半径 ${radius} 厘米的圆，周长是多少？（π 取 3.14）`, value, `C = 2πr = 2 × 3.14 × ${radius} = ${formatNumber(value)} 厘米。`, ["圆周长", "公式"], formatWithUnit("厘米"));
      }
      case 3: {
        const value = pi * radius ** 2;
        return numberQuestion(unitKey, difficulty, index, `半径 ${radius} 厘米的圆，面积是多少？（π 取 3.14）`, value, `S = πr² = 3.14 × ${radius}² = ${formatNumber(value)} 平方厘米。`, ["圆面积", "公式"], formatWithUnit("平方厘米"));
      }
      case 4:
        return choiceQuestion(unitKey, difficulty, index, `同一个圆中，直径与半径的关系是？（组 ${variant + 1}）`, "d = 2r", ["d = r²", "r = 2d", "d = πr"], "同一个圆中直径是半径的 2 倍。", ["圆的认识", "关系"]);
      case 5: {
        const diameter = radius * 2;
        const value = pi * diameter;
        return numberQuestion(unitKey, difficulty, index, `直径 ${diameter} 米的圆形花坛，周长是多少？（π 取 3.14）`, value, `C = πd = 3.14 × ${diameter} = ${formatNumber(value)} 米。`, ["圆周长", "直径"], formatWithUnit("米"));
      }
      case 6: {
        const turns = 10 + variant * 5;
        const value = 2 * pi * radius * turns;
        return numberQuestion(unitKey, difficulty, index, `半径 ${radius} 分米的车轮转 ${turns} 圈，前进多少分米？（不计打滑）`, value, `每圈前进一个周长 ${formatNumber(2 * pi * radius)} 分米，${turns} 圈共 ${formatNumber(value)} 分米。`, ["圆周长", "车轮"], formatWithUnit("分米"));
      }
      case 7:
        return choiceQuestion(unitKey, difficulty, index, `圆有多少条半径？（概念 ${variant + 1}）`, "无数条", ["1条", "2条", "4条"], "连接圆心和圆上任意一点都能得到一条半径，所以有无数条。", ["圆的认识", "概念"]);
      case 8: {
        const value = pi * radius ** 2 / 2;
        return numberQuestion(unitKey, difficulty, index, `半径 ${radius} 厘米的半圆，面积是多少？（π 取 3.14）`, value, `半圆面积是整圆的一半：3.14 × ${radius}² ÷ 2 = ${formatNumber(value)}。`, ["圆面积", "半圆"], formatWithUnit("平方厘米"));
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `用圆规画圆时，圆规两脚间的距离决定什么？（组 ${variant + 1}）`, "半径", ["直径", "周长", "圆周率"], "针尖固定圆心，另一脚到针尖的距离就是半径。", ["圆的认识", "画圆"]);
    }
  }

  if (difficulty === "hard") {
    switch (kind) {
      case 0: {
        const circumference = 2 * pi * radius;
        return numberQuestion(unitKey, difficulty, index, `圆周长是 ${formatNumber(circumference)} 厘米，半径是多少？（π 取 3.14）`, radius, `r = C ÷ (2π) = ${formatNumber(circumference)} ÷ 6.28 = ${radius} 厘米。`, ["圆周长", "反求半径"], formatWithUnit("厘米"));
      }
      case 1: {
        const outer = radius + 2 + variant;
        const area = pi * (outer ** 2 - radius ** 2);
        return numberQuestion(unitKey, difficulty, index, `圆环内半径 ${radius} 厘米，外半径 ${outer} 厘米，面积是多少？（π 取 3.14）`, area, `圆环面积 = π(R² - r²) = 3.14 × (${outer}² - ${radius}²) = ${formatNumber(area)}。`, ["圆面积", "圆环"], formatWithUnit("平方厘米"));
      }
      case 2: {
        const perimeter = pi * radius + 2 * radius;
        return numberQuestion(unitKey, difficulty, index, `半径 ${radius} 厘米的半圆形纸片，周长是多少？（π 取 3.14）`, perimeter, `半圆周长 = 半个圆周长 + 直径 = πr + 2r = ${formatNumber(perimeter)} 厘米。`, ["圆周长", "半圆周长"], formatWithUnit("厘米"));
      }
      case 3: {
        const square = radius * 2;
        const value = square ** 2 - pi * radius ** 2;
        return numberQuestion(unitKey, difficulty, index, `边长 ${square} 厘米的正方形内画最大圆，正方形中未被圆覆盖的面积是多少？`, value, `最大圆直径等于正方形边长，未覆盖面积 = ${square}² - 3.14 × ${radius}² = ${formatNumber(value)}。`, ["圆面积", "组合图形"], formatWithUnit("平方厘米"));
      }
      case 4: {
        const increase = pi * (radius + 1) ** 2 - pi * radius ** 2;
        return numberQuestion(unitKey, difficulty, index, `圆半径从 ${radius} 厘米增加到 ${radius + 1} 厘米，面积增加多少？`, increase, `面积差 = 3.14 × [(${radius + 1})² - ${radius}²] = ${formatNumber(increase)} 平方厘米。`, ["圆面积", "面积差"], formatWithUnit("平方厘米"));
      }
      case 5: {
        const distance = 1000 + variant * 500;
        const diameter = 0.7 + variant * 0.1;
        const turns = distance / (pi * diameter);
        return numberQuestion(unitKey, difficulty, index, `车轮直径 ${formatNumber(diameter)} 米，行驶 ${distance} 米约转多少圈？（π 取 3.14，保留整数）`, Math.round(turns), `每圈前进 3.14 × ${formatNumber(diameter)} 米，圈数约 ${distance} ÷ ${formatNumber(pi * diameter)} = ${formatNumber(turns)}，取整为 ${Math.round(turns)} 圈。`, ["圆周长", "车轮"], formatWithUnit("圈"));
      }
      case 6: {
        const area = pi * radius ** 2;
        const newArea = pi * (radius * 2) ** 2;
        return choiceQuestion(unitKey, difficulty, index, `圆半径扩大到原来的 2 倍，面积变为原来的多少倍？（半径 ${radius}）`, "4倍", ["2倍", "8倍", "π倍"], `面积与半径的平方成正比，(2r)²/r² = 4；原面积 ${formatNumber(area)}，新面积 ${formatNumber(newArea)}。`, ["圆面积", "变化规律"]);
      }
      case 7: {
        const trackRadius = radius + 10;
        const laps = 5 + variant;
        const value = 2 * pi * trackRadius * laps;
        return numberQuestion(unitKey, difficulty, index, `圆形跑道半径 ${trackRadius} 米，跑 ${laps} 圈共多少米？`, value, `一圈长 2 × 3.14 × ${trackRadius}，${laps} 圈共 ${formatNumber(value)} 米。`, ["圆周长", "跑道"], formatWithUnit("米"));
      }
      case 8: {
        const sector = pi * radius ** 2 / 4;
        return numberQuestion(unitKey, difficulty, index, `半径 ${radius} 厘米的四分之一圆，面积是多少？`, sector, `四分之一圆面积 = πr² ÷ 4 = ${formatNumber(sector)} 平方厘米。`, ["圆面积", "扇形"], formatWithUnit("平方厘米"));
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `关于圆周率 π，正确的是？（辨析 ${variant + 1}）`, "同一平面内，任意圆的周长与直径之比都相等", ["π 等于 3.14 的精确值", "圆越大 π 越大", "π 是周长与半径的比"], "π 是圆周长与直径的固定比值，3.14 只是常用近似值。", ["圆周率", "概念"]);
    }
  }

  switch (kind) {
    case 0: {
      const outer = radius + 5 + variant;
      const pathArea = pi * (outer ** 2 - radius ** 2);
      return numberQuestion(unitKey, difficulty, index, `圆形花坛半径 ${radius} 米，外围修宽 ${outer - radius} 米的环形小路，小路面积是多少？`, pathArea, `外半径 ${outer} 米，小路面积 = 3.14 × (${outer}² - ${radius}²) = ${formatNumber(pathArea)} 平方米。`, ["圆环", "实际应用"], formatWithUnit("平方米"));
    }
    case 1: {
      const inner = radius;
      const outer = radius + 3;
      const cost = 45 + variant * 10;
      const value = pi * (outer ** 2 - inner ** 2) * cost;
      return numberQuestion(unitKey, difficulty, index, `内半径 ${inner} 米、外半径 ${outer} 米的环形路面，每平方米铺设费 ${cost} 元，总费用多少？`, value, `先求圆环面积 ${formatNumber(pi * (outer ** 2 - inner ** 2))} 平方米，再乘单价，得 ${formatMoney(value)}。`, ["圆环", "费用"], formatMoney);
    }
    case 2: {
      const rope = 2 * pi * radius + 4 * radius;
      return numberQuestion(unitKey, difficulty, index, `两个相同圆外切，用绳子沿外侧围一圈。每个圆半径 ${radius} 厘米，按“两段半圆弧和两条直径”估算，绳长多少？`, rope, `两段半圆弧合成一个整圆周长 2πr，两条直线共 4r，合计 ${formatNumber(rope)} 厘米。`, ["圆周长", "组合图形"], formatWithUnit("厘米"));
    }
    case 3: {
      const circumference = 62.8 + variant * 31.4;
      const r = circumference / (2 * pi);
      const area = pi * r ** 2;
      return numberQuestion(unitKey, difficulty, index, `圆周长 ${formatNumber(circumference)} 米，面积是多少？（π 取 3.14）`, area, `先求半径 ${formatNumber(circumference)} ÷ 6.28 = ${formatNumber(r)} 米，再算面积 ${formatNumber(area)} 平方米。`, ["圆周长", "圆面积综合"], formatWithUnit("平方米"));
    }
    case 4: {
      const small = radius;
      const big = radius + 2;
      const ratio = big ** 2 / small ** 2;
      return numberQuestion(unitKey, difficulty, index, `两个圆半径分别为 ${small} 和 ${big} 厘米，大圆面积是小圆的多少倍？`, ratio, `面积比等于半径平方比：${big}²:${small}²，比值 ${formatNumber(ratio)}。`, ["圆面积", "面积比"]);
    }
    case 5: {
      const wheelR = 0.35 + variant * 0.05;
      const pedalTurns = 80 + variant * 20;
      const gearRatio = 2.5 + variant * 0.5;
      const distance = pedalTurns * gearRatio * 2 * pi * wheelR;
      return numberQuestion(unitKey, difficulty, index, `自行车脚踏转 ${pedalTurns} 圈，传动比为 ${formatNumber(gearRatio)}，车轮半径 ${formatNumber(wheelR)} 米，约行多少米？`, distance, `车轮转 ${formatNumber(pedalTurns * gearRatio)} 圈，每圈 ${formatNumber(2 * pi * wheelR)} 米，共 ${formatNumber(distance)} 米。`, ["圆周长", "传动"]);
    }
    case 6: {
      const diameterMultiplier = 2 + variant;
      const percent = pi / diameterMultiplier ** 2 * 100;
      return numberQuestion(unitKey, difficulty, index, `正方形边长是圆半径的 ${diameterMultiplier} 倍，圆面积约占正方形面积的百分之几？`, percent, `设半径 r，正方形边长 ${diameterMultiplier}r，占比 πr²/(${diameterMultiplier}r)² ≈ ${formatNumber(percent)}%。`, ["圆面积", "面积占比"], formatFixed(1));
    }
    case 7: {
      const area = pi * radius ** 2 * 3 / 4;
      const arc = 2 * pi * radius * 3 / 4;
      const perimeter = arc + 2 * radius;
      return numberQuestion(unitKey, difficulty, index, `半径 ${radius} 厘米的四分之三圆形纸片，周长是多少？`, perimeter, `弧长是圆周长的 3/4，再加两条半径：${formatNumber(arc)} + ${2 * radius} = ${formatNumber(perimeter)} 厘米。`, ["弧长", "扇形周长"], formatWithUnit("厘米"), [area, arc, perimeter - radius]);
    }
    case 8: {
      const outer = radius + 4;
      const halfRing = pi * (outer ** 2 - radius ** 2) / 2;
      return numberQuestion(unitKey, difficulty, index, `半圆环内半径 ${radius}、外半径 ${outer} 厘米，面积是多少？`, halfRing, `先求整圆环面积，再除以 2：3.14 × (${outer}² - ${radius}²) ÷ 2 = ${formatNumber(halfRing)}。`, ["圆环", "半圆"]);
    }
    default:
      return choiceQuestion(unitKey, difficulty, index, `推导圆面积公式时，把圆平均分成很多小扇形后拼近似长方形，长约等于什么？（组 ${variant + 1}）`, "圆周长的一半 πr", ["直径 2r", "圆周长 2πr", "半径的一半"], "拼成的近似长方形上下两条边合起来是圆周长，每一条长边约为圆周长的一半 πr。", ["圆面积", "公式推导"]);
  }
}

function sportsMathQuestion(difficulty: GradeSixDifficulty, index: number) {
  const unitKey = "practice-4";
  const kind = index % 10;
  const variant = Math.floor(index / 10);
  const teams = 6 + index;

  if (difficulty === "medium") {
    switch (kind) {
      case 0: {
        const games = teams * (teams - 1) / 2;
        return numberQuestion(unitKey, difficulty, index, `${teams} 支球队进行单循环赛，每两队赛一场，共赛多少场？`, games, `每队与其余 ${teams - 1} 队比赛，合计后每场被数两次，所以 ${teams} × ${teams - 1} ÷ 2 = ${games} 场。`, ["体育数学", "单循环"]);
      }
      case 1: {
        const games = teams - 1;
        return numberQuestion(unitKey, difficulty, index, `${teams} 支球队进行单败淘汰赛，决出冠军共需多少场？`, games, `每场淘汰 1 支队伍，要从 ${teams} 支减到 1 支，需淘汰 ${teams - 1} 支，因此 ${games} 场。`, ["体育数学", "淘汰赛"]);
      }
      case 2: {
        const two = 5 + variant;
        const three = 3 + variant;
        const value = two * 2 + three * 3;
        return numberQuestion(unitKey, difficulty, index, `篮球比赛投中 ${two} 个两分球和 ${three} 个三分球，共得多少分？`, value, `${two} × 2 + ${three} × 3 = ${value} 分。`, ["体育数学", "计分"]);
      }
      case 3: {
        const scores = [8 + variant, 9 + variant, 7 + variant, 10 + variant];
        const average = scores.reduce((sum, n) => sum + n, 0) / scores.length;
        return numberQuestion(unitKey, difficulty, index, `运动员四次得分为 ${scores.join("、")}，平均分是多少？`, average, `总分 ${scores.reduce((sum, n) => sum + n, 0)}，除以 4，平均 ${formatNumber(average)} 分。`, ["体育数学", "平均数"]);
      }
      case 4: {
        const laps = 4 + variant;
        const lap = 400;
        return numberQuestion(unitKey, difficulty, index, `标准跑道每圈 400 米，跑 ${laps} 圈是多少千米？`, laps * lap / 1000, `${laps} × 400 = ${laps * lap} 米 = ${formatNumber(laps * lap / 1000)} 千米。`, ["体育数学", "距离"], formatWithUnit("千米"));
      }
      case 5:
        return choiceQuestion(unitKey, difficulty, index, `正式乒乓球单打通常采用哪种获胜规则？（题组 ${variant + 1}）`, "五局三胜或七局四胜", ["一局定胜负", "只比总得分不分局", "九局五胜是唯一规则"], "教材以乒乓球的“五局三胜”等规则说明体育中的数学。", ["体育数学", "比赛规则"]);
      case 6: {
        const wins = 4 + variant;
        const draws = 2 + variant;
        const value = wins * 3 + draws;
        return numberQuestion(unitKey, difficulty, index, `足球联赛胜一场 3 分、平一场 1 分。某队胜 ${wins} 场、平 ${draws} 场，积分多少？`, value, `${wins} × 3 + ${draws} × 1 = ${value} 分。`, ["体育数学", "积分"]);
      }
      case 7: {
        const distance = 100 + variant * 50;
        const time = 12.5 + variant;
        return numberQuestion(unitKey, difficulty, index, `运动员跑 ${distance} 米用 ${formatNumber(time)} 秒，平均速度是多少米/秒？`, distance / time, `速度 = 路程 ÷ 时间 = ${distance} ÷ ${formatNumber(time)} = ${formatNumber(distance / time)} 米/秒。`, ["体育数学", "速度"]);
      }
      case 8: {
        const evenTeams = 8 + variant * 2;
        const value = evenTeams / 2;
        return numberQuestion(unitKey, difficulty, index, `${evenTeams} 支球队同时进行一轮两两比赛，需要多少块场地？`, value, `每场两队，${evenTeams} ÷ 2 = ${value} 块场地。`, ["体育数学", "赛程安排"]);
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `研究体育中的数学问题，最可靠的第一步是？（方案 ${variant + 1}）`, "明确规则并收集准确数据", ["先猜结论", "只看一次比赛", "忽略计分规则"], "体育数学研究需要先明确比赛规则、测量方法和数据来源。", ["体育数学", "研究方法"]);
    }
  }

  if (difficulty === "hard") {
    switch (kind) {
      case 0: {
        const groupTeams = 4 + variant;
        const groups = 4;
        const games = groups * groupTeams * (groupTeams - 1) / 2;
        return numberQuestion(unitKey, difficulty, index, `${groups} 个小组，每组 ${groupTeams} 队进行单循环，小组赛共多少场？`, games, `每组 ${groupTeams} × ${groupTeams - 1} ÷ 2 场，${groups} 组共 ${games} 场。`, ["体育数学", "分组循环"]);
      }
      case 1: {
        const knockouts = 16 + variant * 8;
        const games = knockouts - 1;
        return numberQuestion(unitKey, difficulty, index, `${knockouts} 强开始单败淘汰，直到冠军，共需多少场？`, games, `淘汰 ${knockouts - 1} 支队伍，每场淘汰 1 支，共 ${games} 场。`, ["体育数学", "淘汰赛"]);
      }
      case 2: {
        const scores = [8.6 + variant * 0.1, 9.1, 8.9, 9.4, 8.8];
        const sorted = [...scores].sort((a, b) => a - b);
        const value = sorted.slice(1, -1).reduce((sum, score) => sum + score, 0) / 3;
        return numberQuestion(unitKey, difficulty, index, `五位裁判打分 ${scores.join("、")}，去掉最高和最低后取平均，最后得分是多少？`, value, `去掉 ${sorted[0]} 和 ${sorted.at(-1)}，其余三项平均为 ${formatNumber(value)}。`, ["体育数学", "评分规则"], formatFixed(2));
      }
      case 3: {
        const totalShots = 20 + variant * 5;
        const hits = 14 + variant * 3;
        const rate = hits / totalShots * 100;
        return numberQuestion(unitKey, difficulty, index, `投篮 ${totalShots} 次命中 ${hits} 次，命中率是多少？`, rate, `命中率 = ${hits} ÷ ${totalShots} × 100% = ${formatNumber(rate)}%。`, ["体育数学", "命中率"], formatWithUnit("%"));
      }
      case 4: {
        const laps = 10 + variant * 5;
        const fast = 72 + variant * 3;
        const slow = 80 + variant * 4;
        const average = (fast + slow) / 2;
        return numberQuestion(unitKey, difficulty, index, `两圈等长跑道用时分别 ${fast} 秒和 ${slow} 秒，平均每圈用时多少秒？`, average, `两圈等长，平均每圈用时 = 总用时 ÷ 2 = ${formatNumber(average)} 秒。`, ["体育数学", "平均用时"]);
      }
      case 5: {
        const distance = 400;
        const timeA = 60 + variant * 5;
        const timeB = 64 + variant * 4;
        const gap = distance / timeA - distance / timeB;
        return numberQuestion(unitKey, difficulty, index, `两人都跑 400 米，用时分别 ${timeA} 秒和 ${timeB} 秒，平均速度相差多少米/秒？`, gap, `速度分别为 ${formatNumber(distance / timeA)} 和 ${formatNumber(distance / timeB)}，相差 ${formatNumber(gap)} 米/秒。`, ["体育数学", "速度比较"]);
      }
      case 6: {
        const wins = 6 + variant;
        const losses = 4 + variant;
        const rate = wins / (wins + losses) * 100;
        return numberQuestion(unitKey, difficulty, index, `球队胜 ${wins} 场、负 ${losses} 场，胜率是多少？`, rate, `胜率 = 胜场 ÷ 总场次 × 100% = ${formatNumber(rate)}%。`, ["体育数学", "胜率"], formatFixed(1));
      }
      case 7: {
        const teamsCount = 8 + variant * 4;
        const rounds = Math.ceil(Math.log2(teamsCount));
        return numberQuestion(unitKey, difficulty, index, `${teamsCount} 支队伍采用补齐到 2 的整数次幂的单败淘汰表，赛程需要安排多少轮？`, rounds, `每轮队伍数大约减半，需满足 2^轮数 ≥ ${teamsCount}，赛程需要 ${rounds} 轮。`, ["体育数学", "轮次"]);
      }
      case 8: {
        const attempts = 30 + variant * 10;
        const rate = 0.7 + variant * 0.05;
        const hits = attempts * rate;
        return numberQuestion(unitKey, difficulty, index, `命中率 ${formatNumber(rate * 100)}%，投篮 ${attempts} 次，预计命中多少次？`, hits, `预计命中数 = ${attempts} × ${formatNumber(rate)} = ${formatNumber(hits)} 次。`, ["体育数学", "百分率"]);
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `比较运动员表现时，哪项做法更合理？（组 ${variant + 1}）`, "在比赛次数不同的情况下比较命中率或平均成绩", ["只比较命中总数", "只看最好一次", "忽略样本数量"], "比赛次数不同，使用率或平均数能消除数量差异，更公平。", ["体育数学", "数据分析"]);
    }
  }

  switch (kind) {
    case 0: {
      const groupCount = 8 + variant * 2;
      const teamsCount = groupCount * 4;
      const qualifiers = groupCount * 2;
      const groupGames = groupCount * 4 * 3 / 2;
      const knockoutGames = qualifiers - 1;
      return numberQuestion(unitKey, difficulty, index, `${teamsCount} 队分 ${groupCount} 组、每组 4 队单循环，前两名进入单败淘汰。全部比赛共多少场？`, groupGames + knockoutGames, `小组赛 ${groupCount} × 4 × 3 ÷ 2 = ${groupGames} 场，淘汰赛淘汰 ${qualifiers - 1} 队需 ${knockoutGames} 场，共 ${groupGames + knockoutGames} 场。`, ["体育数学", "综合赛制"]);
    }
    case 1: {
      const judges = [8.5, 8.8, 9.0, 9.2, 9.4, 9.6 + variant * 0.1, 8.7];
      const sorted = [...judges].sort((a, b) => a - b);
      const kept = sorted.slice(1, -1);
      const value = kept.reduce((sum, score) => sum + score, 0) / kept.length;
      return numberQuestion(unitKey, difficulty, index, `七位裁判评分 ${judges.join("、")}，去掉最高最低后平均，得分多少？`, value, `去掉 ${sorted[0]} 和 ${sorted.at(-1)}，其余 ${kept.length} 个分数平均为 ${formatNumber(value, 3)}。`, ["体育数学", "裁判评分"], formatFixed(2));
    }
    case 2: {
      const two = 10 + variant * 2;
      const three = 4 + variant;
      const free = 6 + variant;
      const total = two * 2 + three * 3 + free;
      const percent = three * 3 / total * 100;
      return numberQuestion(unitKey, difficulty, index, `篮球得分：${two} 个两分、${three} 个三分、${free} 个罚球。三分球得分占总分百分之几？`, percent, `总分 ${total}，三分球得分 ${three * 3}，占比 ${formatNumber(percent)}%。`, ["体育数学", "得分结构"], formatFixed(1));
    }
    case 3: {
      const time1 = 58 + variant * 2;
      const time2 = 62 + variant * 2;
      const distance = 400;
      const averageSpeed = distance * 2 / (time1 + time2);
      return numberQuestion(unitKey, difficulty, index, `同一人跑两段各 400 米，用时 ${time1} 秒和 ${time2} 秒，全程平均速度是多少？`, averageSpeed, `总路程 800 米，总时间 ${time1 + time2} 秒，平均速度 ${formatNumber(averageSpeed)} 米/秒。`, ["体育数学", "平均速度"]);
    }
    case 4: {
      const teamsCount = 10 + variant * 2;
      const gamesDouble = teamsCount * (teamsCount - 1);
      return numberQuestion(unitKey, difficulty, index, `${teamsCount} 队进行主客场双循环，每两队赛两场，共多少场？`, gamesDouble, `单循环 ${teamsCount} × ${teamsCount - 1} ÷ 2 场，双循环乘 2，得 ${gamesDouble} 场。`, ["体育数学", "双循环"]);
    }
    case 5: {
      const wins = 12 + variant * 3;
      const draws = 5 + variant;
      const losses = 3 + variant;
      const points = wins * 3 + draws;
      const maxPoints = (wins + draws + losses) * 3;
      return numberQuestion(unitKey, difficulty, index, `足球队胜 ${wins}、平 ${draws}、负 ${losses} 场，实际积分占满分的百分之几？`, points / maxPoints * 100, `实际 ${points} 分，满分 ${maxPoints} 分，占 ${formatNumber(points / maxPoints * 100)}%。`, ["体育数学", "积分率"], formatFixed(1));
    }
    case 6: {
      const attemptsA = 40 + variant * 10;
      const hitsA = 28 + variant * 7;
      const attemptsB = 30 + variant * 10;
      const hitsB = 22 + variant * 7;
      const rateA = hitsA / attemptsA;
      const rateB = hitsB / attemptsB;
      return choiceQuestion(unitKey, difficulty, index, `甲 ${attemptsA} 投 ${hitsA} 中，乙 ${attemptsB} 投 ${hitsB} 中，谁命中率高？`, rateA > rateB ? "甲" : rateB > rateA ? "乙" : "相同", ["只看命中总数，甲高", "只看投篮次数，乙高", "无法比较"], `甲命中率 ${formatNumber(rateA * 100)}%，乙 ${formatNumber(rateB * 100)}%，比较可得答案。`, ["体育数学", "公平比较"]);
    }
    case 7: {
      const eliminatedAfter = 3 + variant;
      const participants = 2 ** (eliminatedAfter + 1);
      const left = participants / 2 ** eliminatedAfter;
      return numberQuestion(unitKey, difficulty, index, `${participants} 人单败淘汰，进行 ${eliminatedAfter} 轮后还剩多少人？`, left, `每轮人数减半，${participants} ÷ 2^${eliminatedAfter} = ${left} 人。`, ["体育数学", "淘汰轮次"]);
    }
    case 8: {
      const lap = 400;
      const speed = 5 + variant * 0.5;
      const minutes = 20 + variant * 4;
      const laps = speed * minutes * 60 / lap;
      return numberQuestion(unitKey, difficulty, index, `以 ${formatNumber(speed)} 米/秒跑 ${minutes} 分钟，在 400 米跑道上约跑多少圈？`, laps, `总路程 ${formatNumber(speed)} × ${minutes * 60} = ${formatNumber(speed * minutes * 60)} 米，除以 400 得 ${formatNumber(laps)} 圈。`, ["体育数学", "速度路程"]);
    }
    default:
      return choiceQuestion(unitKey, difficulty, index, `设计比赛赛制时，若希望每队都与其他队交手，应该采用？（方案 ${variant + 1}）`, "循环赛", ["单败淘汰赛", "抽签直接定名次", "只比一场友谊赛"], "循环赛能保证每支队伍与其他队伍交手，更适合全面比较。", ["体育数学", "赛制选择"]);
  }
}

function scalingQuestion(difficulty: GradeSixDifficulty, index: number) {
  const unitKey = "unit-6";
  const kind = index % 10;
  const variant = Math.floor(index / 10);
  const factor = 2 + variant;
  const length = 3 + (index % 5) + variant;

  if (difficulty === "medium") {
    switch (kind) {
      case 0:
        return numberQuestion(unitKey, difficulty, index, `线段长 ${length} 厘米，按 ${factor}:1 放大后长多少厘米？`, length * factor, `放大后长度 = ${length} × ${factor} = ${length * factor} 厘米。`, ["放大", "长度"], formatWithUnit("厘米"));
      case 1:
        return numberQuestion(unitKey, difficulty, index, `线段长 ${length * factor} 厘米，按 1:${factor} 缩小后长多少厘米？`, length, `缩小后长度 = ${length * factor} ÷ ${factor} = ${length} 厘米。`, ["缩小", "长度"], formatWithUnit("厘米"));
      case 2:
        return choiceQuestion(unitKey, difficulty, index, `图形按 ${factor}:1 放大后，什么不变？`, "形状和对应角", ["周长", "面积", "每条边的长度"], "按相同比例放大只改变大小，不改变形状和对应角。", ["放大缩小", "性质"]);
      case 3: {
        const area = length ** 2;
        return numberQuestion(unitKey, difficulty, index, `正方形边长按 ${factor}:1 放大，面积变为原来的多少倍？`, factor ** 2, `面积随长度比例的平方变化，${factor}² = ${factor ** 2} 倍。`, ["放大", "面积比"], (v) => `${formatNumber(v)}倍`, [factor, factor ** 3, area]);
      }
      case 4: {
        const width = length + 2;
        const height = length;
        return choiceQuestion(unitKey, difficulty, index, `长方形 ${width}×${height} 按 ${factor}:1 放大，新尺寸是？`, `${width * factor}×${height * factor}`, [`${width * factor}×${height}`, `${width + factor}×${height + factor}`, `${width}×${height}`], "长和宽都要乘同一个放大倍数。", ["放大", "对应边"]);
      }
      case 5: {
        const photo = 12 + variant * 4;
        return numberQuestion(unitKey, difficulty, index, `照片宽 ${photo} 厘米，按 1:${factor} 缩小，宽变为多少？`, photo / factor, `${photo} ÷ ${factor} = ${formatNumber(photo / factor)} 厘米。`, ["缩小", "照片"], formatWithUnit("厘米"));
      }
      case 6:
        return choiceQuestion(unitKey, difficulty, index, `下面哪种变化会使图形变形？（组 ${variant + 1}）`, "长放大 2 倍、宽保持不变", ["长宽都放大 2 倍", "长宽都缩小一半", "所有对应边都乘 3"], "长、宽使用不同倍数会改变对应边之比，图形发生变形。", ["放大缩小", "变形判断"]);
      case 7: {
        const x = 2 + variant;
        const y = 3 + variant;
        return choiceQuestion(unitKey, difficulty, index, `点 (${x}, ${y}) 以原点为中心按 ${factor}:1 放大，坐标变为？`, `(${x * factor}, ${y * factor})`, [`(${x + factor}, ${y + factor})`, `(${x * factor}, ${y})`, `(${x}, ${y * factor})`], "以原点为中心放大，横、纵坐标都乘同一倍数。", ["放大", "坐标"]);
      }
      case 8: {
        const perimeter = length * 4;
        return numberQuestion(unitKey, difficulty, index, `正方形按 ${factor}:1 放大，周长变为原来的多少倍？`, factor, `所有边长都乘 ${factor}，周长也乘 ${factor}。`, ["放大", "周长"], (v) => `${v}倍`);
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `“按 1:${factor} 缩小”表示什么？`, `每条对应边变为原来的 1/${factor}`, [`每条边增加 ${factor}`, `面积变为原来的 1/${factor}`, "只缩小宽"], `比例的前项对应新图，后项对应原图，1:${factor} 表示线性尺寸缩为 1/${factor}。`, ["缩小", "比例含义"]);
    }
  }

  if (difficulty === "hard") {
    switch (kind) {
      case 0: {
        const area = length * (length + 2);
        const value = area * factor ** 2;
        return numberQuestion(unitKey, difficulty, index, `长方形面积 ${area} 平方厘米，按 ${factor}:1 放大，新面积多少？`, value, `线性尺寸放大 ${factor} 倍，面积放大 ${factor ** 2} 倍，得 ${value} 平方厘米。`, ["放大", "面积"], formatWithUnit("平方厘米"));
      }
      case 1: {
        const newArea = 144 * factor ** 2;
        return numberQuestion(unitKey, difficulty, index, `正方形按 ${factor}:1 放大后面积为 ${newArea} 平方厘米，原面积是多少？`, 144, `面积放大 ${factor ** 2} 倍，原面积 = ${newArea} ÷ ${factor ** 2} = 144。`, ["放大", "逆向面积"], formatWithUnit("平方厘米"));
      }
      case 2: {
        const original = [4, 6];
        const changed = [original[0] * factor, original[1] * (factor + 1)];
        return choiceQuestion(unitKey, difficulty, index, `原图长宽比 4:6，新图尺寸 ${changed[0]}:${changed[1]}，新图是否为原图的等比例放大？`, "不是，长和宽的倍数不同", ["是，面积变大了", `是，都增加了 ${factor}`, "无法判断"], `长放大 ${factor} 倍，宽放大 ${factor + 1} 倍，倍数不同，所以变形。`, ["放大缩小", "比例判断"]);
      }
      case 3: {
        const x = 3 + variant;
        const y = 5 + variant;
        const centerX = 1;
        const centerY = 1;
        const newX = centerX + (x - centerX) * factor;
        const newY = centerY + (y - centerY) * factor;
        return choiceQuestion(unitKey, difficulty, index, `点 (${x}, ${y}) 以 (1,1) 为中心放大 ${factor} 倍，新坐标是？`, `(${newX}, ${newY})`, [`(${x * factor}, ${y * factor})`, `(${x + factor}, ${y + factor})`, `(${newX}, ${y * factor})`], "先求点到中心的横纵位移，分别乘放大倍数，再加回中心坐标。", ["放大", "中心"]);
      }
      case 4: {
        const scale = 1 / factor;
        const volumeFactor = scale ** 3;
        return choiceQuestion(unitKey, difficulty, index, `一个正方体模型按 1:${factor} 缩小，体积变为原来的多少？`, formatFraction(1, factor ** 3), [formatFraction(1, factor), formatFraction(1, factor ** 2), String(factor ** 3)], `三条棱都缩小到 1/${factor}，体积缩为 (1/${factor})³ = ${formatFraction(1, factor ** 3)}。`, ["缩小", "体积比"]);
      }
      case 5: {
        const originalPerimeter = 36 + variant * 12;
        const newPerimeter = originalPerimeter * factor;
        return numberQuestion(unitKey, difficulty, index, `图形周长 ${originalPerimeter} 厘米，按 ${factor}:1 放大，新周长多少？`, newPerimeter, `周长随长度比例同倍变化，${originalPerimeter} × ${factor} = ${newPerimeter} 厘米。`, ["放大", "周长"], formatWithUnit("厘米"));
      }
      case 6: {
        const originalArea = 180 + variant * 90;
        const newArea = originalArea / factor ** 2;
        return numberQuestion(unitKey, difficulty, index, `图形按 1:${factor} 缩小，原面积 ${originalArea} 平方厘米，新面积多少？`, newArea, `面积缩小为原来的 1/${factor ** 2}，所以是 ${formatNumber(newArea)} 平方厘米。`, ["缩小", "面积"], formatWithUnit("平方厘米"));
      }
      case 7: {
        const display = 15 + variant * 5;
        const source = display / factor;
        return numberQuestion(unitKey, difficulty, index, `图片放大 ${factor} 倍后宽 ${display} 厘米，原宽多少？`, source, `${display} ÷ ${factor} = ${formatNumber(source)} 厘米。`, ["放大", "逆向长度"], formatWithUnit("厘米"));
      }
      case 8: {
        const areaRatio = factor ** 2;
        return choiceQuestion(unitKey, difficulty, index, `两个相似图形对应边比 ${factor}:1，它们的面积比是？`, `${areaRatio}:1`, [`${factor}:1`, `${factor ** 3}:1`, `1:${areaRatio}`], "相似图形面积比等于对应边比的平方。", ["相似", "面积比"]);
      }
      default:
        return choiceQuestion(unitKey, difficulty, index, `把照片从 4:3 拉伸成 16:9 且不裁剪，结果会怎样？（组 ${variant + 1}）`, "长宽使用不同倍数，画面会变形", ["形状完全不变", "只会改变面积不改比例", "一定是等比例放大"], "原比例与目标比例不同，若不裁剪又铺满，长宽倍率必然不同。", ["放大缩小", "图像变形"]);
    }
  }

  switch (kind) {
    case 0: {
      const area = 300 + variant * 150;
      const scale = 1 / factor;
      const newArea = area * scale ** 2;
      return numberQuestion(unitKey, difficulty, index, `图形先按 ${factor}:1 放大，再按 1:${factor + 1} 缩小，原面积 ${area}，最终面积多少？`, area * (factor / (factor + 1)) ** 2, `总长度倍率 ${factor}/${factor + 1}，面积倍率为其平方，最终 ${formatNumber(area * (factor / (factor + 1)) ** 2)}。`, ["复合变换", "面积"], formatNumber, [newArea, area * factor / (factor + 1), area]);
    }
    case 1: {
      const x = 2 + variant;
      const y = 4 + variant;
      const newX = -x * factor;
      const newY = y * factor;
      return choiceQuestion(unitKey, difficulty, index, `点 (${x}, ${y}) 先关于 y 轴对称，再以原点为中心放大 ${factor} 倍，坐标是？`, `(${newX}, ${newY})`, [`(${x * factor}, ${y * factor})`, `(${-x}, ${y})`, `(${newX}, ${y})`], "关于 y 轴对称后为 (-x,y)，再把两坐标都乘放大倍数。", ["复合变换", "坐标"]);
    }
    case 2: {
      const originalArea = 96 + variant * 48;
      const targetArea = originalArea * (factor + 1) ** 2;
      return numberQuestion(unitKey, difficulty, index, `相似图形面积从 ${originalArea} 变为 ${targetArea}，对应边放大了多少倍？`, factor + 1, `面积比 ${targetArea / originalArea} = ${(factor + 1) ** 2}，边长比取平方根为 ${factor + 1}。`, ["相似", "反求比例"], (v) => `${v}倍`);
    }
    case 3: {
      const photoW = 18 + variant * 6;
      const photoH = 12 + variant * 4;
      const frameW = 30 + variant * 5;
      const factorFit = Math.min(frameW / photoW, (frameW * 0.8) / photoH);
      return numberQuestion(unitKey, difficulty, index, `照片 ${photoW}×${photoH} 厘米，要等比例放入 ${frameW}×${formatNumber(frameW * 0.8)} 厘米相框，最大放大倍数是多少？`, factorFit, `分别比较宽、高可用倍数，取较小者才能完整放入，倍数为 ${formatNumber(factorFit)}。`, ["等比例缩放", "适配"]);
    }
    case 4: {
      const side = 5 + variant;
      const factorA = factor;
      const factorB = factor + 1;
      const areaDifference = side ** 2 * (factorB ** 2 - factorA ** 2);
      return numberQuestion(unitKey, difficulty, index, `边长 ${side} 厘米的正方形分别放大 ${factorA} 倍和 ${factorB} 倍，两图面积相差多少？`, areaDifference, `面积分别为 ${side ** 2 * factorA ** 2} 和 ${side ** 2 * factorB ** 2}，相差 ${areaDifference}。`, ["放大", "面积差"], formatWithUnit("平方厘米"));
    }
    case 5: {
      const volume = 1000 + variant * 1000;
      const reduced = volume / factor ** 3;
      return numberQuestion(unitKey, difficulty, index, `立体模型按 1:${factor} 缩小，原体积 ${volume} 立方厘米，新体积多少？`, reduced, `体积倍率为 (1/${factor})³，得到 ${formatNumber(reduced)} 立方厘米。`, ["缩小", "体积"], formatWithUnit("立方厘米"));
    }
    case 6: {
      const originalRatio = 3 / 2;
      const newWidth = 24 + variant * 8;
      const newHeight = newWidth / originalRatio;
      return numberQuestion(unitKey, difficulty, index, `原图长宽比 3:2，等比例放大后长为 ${newWidth} 厘米，宽是多少？`, newHeight, `等比例变化后长宽比不变，宽 = ${newWidth} × 2/3 = ${formatNumber(newHeight)} 厘米。`, ["等比例", "对应边"]);
    }
    case 7: {
      const factorA = factor;
      const factorB = 1 / (factor - 0.5);
      const total = factorA * factorB;
      return numberQuestion(unitKey, difficulty, index, `图形先放大 ${factorA} 倍，再缩小到变化后图形的 1/${formatNumber(factor - 0.5)}，总长度倍率是多少？`, total, `连续变换的倍率相乘：${factorA} × 1/${formatNumber(factor - 0.5)} = ${formatNumber(total)}。`, ["复合变换", "倍率"]);
    }
    case 8: {
      const mapLength = 8 + variant * 2;
      const areaScale = factor ** 2;
      return choiceQuestion(unitKey, difficulty, index, `图形按 ${factor}:1 放大。原图一块面积为 ${mapLength}，新图对应面积是？`, String(mapLength * areaScale), [String(mapLength * factor), String(mapLength + factor), String(mapLength * factor ** 3)], `面积需乘长度倍率的平方 ${areaScale}，结果 ${mapLength * areaScale}。`, ["放大", "面积倍率"]);
    }
    default:
      return choiceQuestion(unitKey, difficulty, index, `判断两图是否按比例缩放，最充分的依据是？（组 ${variant + 1}）`, "所有对应边的比相等且对应角相等", ["面积相等", "周长都变大", "颜色和方向相同"], "等比例缩放要求对应长度使用同一倍率，并保持角度和形状。", ["相似", "判断标准"]);
  }
}

function positionQuestion(difficulty: GradeSixDifficulty, index: number) {
  const unitKey = "unit-7";
  const kind = index % 10;
  const variant = Math.floor(index / 10);
  const x = 2 + variant + (index % 4);
  const y = 3 + variant;

  if (difficulty === "medium") {
    switch (kind) {
      case 0:
        return choiceQuestion(unitKey, difficulty, index, `点在第 ${x} 列、第 ${y} 行，用数对表示是？`, `(${x}, ${y})`, [`(${y}, ${x})`, `(${x + 1}, ${y})`, `(${x}, ${y + 1})`], "数对先写列，再写行。", ["数对", "列与行"]);
      case 1:
        return choiceQuestion(unitKey, difficulty, index, `数对 (${x}, ${y}) 表示？`, `第 ${x} 列第 ${y} 行`, [`第 ${y} 列第 ${x} 行`, `第 ${x} 行第 ${y} 列`, `距离原点 ${x + y} 格`], "数对第一个数表示列，第二个数表示行。", ["数对", "含义"]);
      case 2:
        return choiceQuestion(unitKey, difficulty, index, `点 (${x}, ${y}) 向右移动 ${variant + 2} 格后是？`, `(${x + variant + 2}, ${y})`, [`(${x}, ${y + variant + 2})`, `(${x - variant - 2}, ${y})`, `(${x + variant + 2}, ${y + variant + 2})`], "向右只增加横坐标，纵坐标不变。", ["数对", "平移"]);
      case 3:
        return choiceQuestion(unitKey, difficulty, index, `点 (${x}, ${y}) 向上移动 ${variant + 2} 格后是？`, `(${x}, ${y + variant + 2})`, [`(${x + variant + 2}, ${y})`, `(${x}, ${y - variant - 2})`, `(${x + variant + 2}, ${y + variant + 2})`], "向上只增加纵坐标。", ["数对", "平移"]);
      case 4: {
        const distance = 5 + variant * 2;
        return choiceQuestion(unitKey, difficulty, index, `学校在小明家北偏东 30°、${distance} 千米处。确定学校位置至少需要哪些信息？`, "方向和距离", ["只有方向", "只有距离", "只有时间"], "从一个已知点出发，方向和距离共同确定另一个位置。", ["方向", "距离"]);
      }
      case 5:
        return choiceQuestion(unitKey, difficulty, index, `点 (${x}, ${y}) 与点 (${x}, ${y + 4}) 的位置关系是？`, "在同一列，后者在上方", ["在同一行", "前者在右边", "重合"], "横坐标相同表示同一列，纵坐标较大的点在上方。", ["数对", "位置关系"]);
      case 6:
        return numberQuestion(unitKey, difficulty, index, `点 (${x}, ${y}) 到点 (${x + 5}, ${y}) 的格数距离是多少？`, 5, "两点在同一行，横坐标相差 5，所以距离 5 格。", ["数对", "距离"], formatWithUnit("格"));
      case 7:
        return choiceQuestion(unitKey, difficulty, index, `面向北方时，右手方向是？（组 ${variant + 1}）`, "东方", ["西方", "南方", "北方"], "面向北，右手指向东。", ["方向", "方位"]);
      case 8:
        return choiceQuestion(unitKey, difficulty, index, `“北偏东 ${40 + variant * 10}°”是从哪个方向向哪个方向偏？`, `从北向东偏 ${40 + variant * 10}°`, [`从东向北偏 ${40 + variant * 10}°`, `从南向西偏 ${40 + variant * 10}°`, `从西向北偏 ${40 + variant * 10}°`], "名称先写基准方向“北”，再说明向东偏。", ["方向", "角度"]);
      default:
        return choiceQuestion(unitKey, difficulty, index, `用数对表示位置时，通常先写什么？（组 ${variant + 1}）`, "列数", ["行数", "距离", "角度"], "教材约定先写列，再写行。", ["数对", "规则"]);
    }
  }

  if (difficulty === "hard") {
    switch (kind) {
      case 0: {
        const dx = 3 + variant;
        const dy = 4 + variant;
        const distance = Math.sqrt(dx ** 2 + dy ** 2);
        return numberQuestion(unitKey, difficulty, index, `点 A(${x},${y}) 到 B(${x + dx},${y + dy}) 的直线距离是多少格？`, distance, `横向差 ${dx}、纵向差 ${dy}，用勾股关系得 √(${dx}²+${dy}²) = ${formatNumber(distance)} 格。`, ["数对", "直线距离"]);
      }
      case 1: {
        const newX = x + 4 + variant;
        const newY = y - 2;
        return choiceQuestion(unitKey, difficulty, index, `点 (${x},${y}) 先向右 ${4 + variant} 格，再向下 2 格，终点是？`, `(${newX}, ${newY})`, [`(${x + 2}, ${y + 4 + variant})`, `(${newX}, ${y + 2})`, `(${x - 4 - variant}, ${newY})`], "向右增加横坐标，向下减少纵坐标。", ["数对", "路线"]);
      }
      case 2: {
        const midpointX = x + 3;
        const midpointY = y + 2;
        return choiceQuestion(unitKey, difficulty, index, `A(${x},${y})、B(${x + 6},${y + 4}) 的中点坐标是？`, `(${midpointX}, ${midpointY})`, [`(${x + 6}, ${y + 4})`, `(${x + 3}, ${y + 4})`, `(${x + 6}, ${y + 2})`], "中点横、纵坐标分别取两端点对应坐标的平均数。", ["数对", "中点"]);
      }
      case 3: {
        const scale = 2 + variant;
        const actual = 3 + variant;
        return numberQuestion(unitKey, difficulty, index, `平面图每格表示 ${scale} 千米，两点横差 ${actual} 格、纵差 4 格，沿网格最短路程多少千米？`, (actual + 4) * scale, `沿横纵网格走，需 ${actual + 4} 格，每格 ${scale} 千米，共 ${(actual + 4) * scale} 千米。`, ["位置", "网格路线"], formatWithUnit("千米"));
      }
      case 4:
        return choiceQuestion(unitKey, difficulty, index, `A 在 B 的北偏东 ${30 + variant * 5}°方向，那么 B 在 A 的什么方向？`, `南偏西 ${30 + variant * 5}°`, [`北偏西 ${30 + variant * 5}°`, `东偏北 ${30 + variant * 5}°`, `南偏东 ${30 + variant * 5}°`], "相反方向要把南北、东西同时反向，角度保持不变。", ["方向", "相对位置"]);
      case 5: {
        const east = 6 + variant * 2;
        const north = 8 + variant * 2;
        const distance = Math.sqrt(east ** 2 + north ** 2);
        return numberQuestion(unitKey, difficulty, index, `从起点向东 ${east} 千米、再向北 ${north} 千米，终点到起点直线距离多少？`, distance, `东西与南北路线互相垂直，直线距离 = √(${east}²+${north}²) = ${formatNumber(distance)} 千米。`, ["方向", "直线距离"], formatWithUnit("千米"));
      }
      case 6: {
        const reflectedX = 10 - x;
        return choiceQuestion(unitKey, difficulty, index, `点 (${x},${y}) 关于直线 x=5 对称后的坐标是？`, `(${reflectedX}, ${y})`, [`(${-x}, ${y})`, `(${x}, ${10 - y})`, `(${x + 5}, ${y})`], "对称点到 x=5 的水平距离相等，横坐标和为 10，纵坐标不变。", ["数对", "对称"]);
      }
      case 7: {
        const rows = 8 + variant;
        const columns = 10 + variant;
        return numberQuestion(unitKey, difficulty, index, `${columns} 列、${rows} 行的座位表一共有多少个可用数对位置？`, rows * columns, `每一列可配 ${rows} 个行数，共 ${columns} × ${rows} = ${rows * columns} 个位置。`, ["数对", "组合"]);
      }
      case 8:
        return choiceQuestion(unitKey, difficulty, index, `船向北航行，前方目标在“北偏西 ${25 + variant * 5}°”。转向时应向哪边偏？`, `向左（西）偏 ${25 + variant * 5}°`, [`向右（东）偏 ${25 + variant * 5}°`, `向后转 ${25 + variant * 5}°`, "继续正北不转"], "面向北时西方在左侧，北偏西就是向左偏。", ["方向", "航行"]);
      default:
        return choiceQuestion(unitKey, difficulty, index, `若只知道目标“在东偏北 ${20 + variant * 10}°方向”，能唯一确定位置吗？`, "不能，还需要距离", ["能，方向足够", "不能，还需要颜色", "能，角度就是距离"], "同一方向射线上有无数个点，还需给出距离才能唯一确定。", ["方向", "位置确定"]);
    }
  }

  switch (kind) {
    case 0: {
      const dx = 6 + variant * 2;
      const dy = 8 + variant * 2;
      const distance = Math.sqrt(dx ** 2 + dy ** 2);
      return numberQuestion(unitKey, difficulty, index, `A(${x},${y})、B(${x + dx},${y + dy})，若每格表示 1.5 千米，两地直线距离是多少？`, distance * 1.5, `坐标差构成直角三角形，格数距离 ${formatNumber(distance)}，乘 1.5 得 ${formatNumber(distance * 1.5)} 千米。`, ["数对", "比例距离"], formatWithUnit("千米"));
    }
    case 1: {
      const east = 12 + variant * 3;
      const north = 5 + variant;
      const west = 7 + variant;
      const finalEast = east - west;
      const distance = Math.sqrt(finalEast ** 2 + north ** 2);
      return numberQuestion(unitKey, difficulty, index, `从起点向东 ${east} 千米、向北 ${north} 千米、再向西 ${west} 千米，终点距起点多远？`, distance, `净向东 ${finalEast} 千米、向北 ${north} 千米，直线距离 ${formatNumber(distance)} 千米。`, ["方向", "综合路线"], formatWithUnit("千米"));
    }
    case 2: {
      const ax = x;
      const ay = y;
      const bx = x + 6;
      const by = y;
      const cx = x + 2;
      const cy = y + 5;
      const area = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
      return numberQuestion(unitKey, difficulty, index, `三角形顶点 A(${ax},${ay})、B(${bx},${by})、C(${cx},${cy})，面积是多少平方格？`, area, `AB 水平，底为 ${bx - ax} 格，高为 ${cy - ay} 格，面积 = ${bx - ax} × ${cy - ay} ÷ 2 = ${area}。`, ["数对", "图形面积"]);
    }
    case 3: {
      const points = [`(${x},${y})`, `(${x + 3},${y})`, `(${x + 3},${y + 4})`, `(${x},${y + 4})`];
      return numberQuestion(unitKey, difficulty, index, `四点 ${points.join("、")} 围成长方形，其周长是多少格？`, 14, "长 3 格、宽 4 格，周长 2 × (3 + 4) = 14 格。", ["数对", "长方形"]);
    }
    case 4: {
      const scale = 5 + variant * 5;
      const mapDistance = 4 + variant;
      return numberQuestion(unitKey, difficulty, index, `地图上某地在学校北偏东 40°、${mapDistance} 厘米处，每厘米表示 ${scale} 千米，实际距离多少？`, mapDistance * scale, `方向不影响长度换算，${mapDistance} × ${scale} = ${mapDistance * scale} 千米。`, ["方向", "比例尺"], formatWithUnit("千米"));
    }
    case 5: {
      const px = x + 5;
      const py = y + 7;
      const rotatedX = -py;
      const rotatedY = px;
      return choiceQuestion(unitKey, difficulty, index, `点 (${px},${py}) 绕原点逆时针旋转 90° 后是？`, `(${rotatedX}, ${rotatedY})`, [`(${py}, ${-px})`, `(${-px}, ${-py})`, `(${px}, ${py})`], "绕原点逆时针 90°，坐标变换为 (x,y)→(-y,x)。", ["数对", "旋转"]);
    }
    case 6: {
      const aDistance = 10 + variant * 5;
      const bDistance = 12 + variant * 4;
      const angle = 90;
      const value = Math.sqrt(aDistance ** 2 + bDistance ** 2);
      return numberQuestion(unitKey, difficulty, index, `A 在 O 正东 ${aDistance} 千米，B 在 O 正北 ${bDistance} 千米，A、B 相距多少？`, value, `OA 与 OB 垂直，AB = √(${aDistance}²+${bDistance}²) = ${formatNumber(value)} 千米。`, ["方向", "勾股"], formatWithUnit("千米"), [aDistance + bDistance, Math.abs(aDistance - bDistance), angle]);
    }
    case 7: {
      const minX = 2 + variant;
      const maxX = 8 + variant;
      const minY = 1 + variant;
      const maxY = 6 + variant;
      const count = (maxX - minX + 1) * (maxY - minY + 1);
      return numberQuestion(unitKey, difficulty, index, `横坐标从 ${minX} 到 ${maxX}、纵坐标从 ${minY} 到 ${maxY} 的整数格点共有多少个？`, count, `横坐标有 ${maxX - minX + 1} 种，纵坐标有 ${maxY - minY + 1} 种，共 ${count} 个。`, ["数对", "格点计数"]);
    }
    case 8: {
      const x1 = x;
      const y1 = y;
      const x2 = x + 8;
      const y2 = y + 6;
      return choiceQuestion(unitKey, difficulty, index, `从 A(${x1},${y1}) 到 B(${x2},${y2})，若只能向右或向上走，最短要走多少格？`, "14格", ["10格", "8格", "6格"], `必须向右 ${x2 - x1} 格、向上 ${y2 - y1} 格，共 ${x2 - x1 + y2 - y1} 格。`, ["数对", "最短网格路线"]);
    }
    default:
      return choiceQuestion(unitKey, difficulty, index, `描述海上目标位置时，“北偏东 30°、8 海里”比只给数对更合适的原因是？（组 ${variant + 1}）`, "航行通常以观察点、方向和距离描述", ["海上没有任何坐标", "数对不能表示数字", "角度可以代替距离"], "在以舰艇为观察点的情境中，方位角和距离能直接给出航行方向与路程。", ["方向", "情境选择"]);
  }
}

const SOURCE_GENERATORS: UnitQuestionGenerator[] = [
  mixedOperationsQuestion,
  segmentedBillingQuestion,
  numberSenseQuestion,
  binaryQuestion,
  ratioQuestion,
  goldenRatioQuestion,
  circleQuestion,
  sportsMathQuestion,
  scalingQuestion,
  positionQuestion,
];

function reviewQuestion(difficulty: GradeSixDifficulty, index: number) {
  const source = SOURCE_GENERATORS[index % SOURCE_GENERATORS.length](difficulty, index + 30);
  return {
    ...source,
    id: `review-${difficulty}-${index + 1}`,
    prompt: `期末综合：${source.prompt}`,
    tags: ["期末复习", ...source.tags.slice(0, 2)],
  };
}

const UNIT_QUESTIONS: Record<string, GradeSixQuestion[]> = {
  "unit-1": MATH_GRADE_SIX_UNIT_ONE_QUESTIONS,
  "unit-2": buildUnitQuestions("unit-2", mixedOperationsQuestion),
  "practice-1": buildUnitQuestions("practice-1", segmentedBillingQuestion),
  "unit-3": buildUnitQuestions("unit-3", numberSenseQuestion),
  "practice-2": buildUnitQuestions("practice-2", binaryQuestion),
  "unit-4": buildUnitQuestions("unit-4", ratioQuestion),
  "practice-3": buildUnitQuestions("practice-3", goldenRatioQuestion),
  "unit-5": buildUnitQuestions("unit-5", circleQuestion),
  "practice-4": buildUnitQuestions("practice-4", sportsMathQuestion),
  "unit-6": buildUnitQuestions("unit-6", scalingQuestion),
  "unit-7": buildUnitQuestions("unit-7", positionQuestion),
  review: buildUnitQuestions("review", reviewQuestion),
};

export const MATH_GRADE_SIX_QUESTIONS_BY_UNIT = UNIT_QUESTIONS;

export const MATH_GRADE_SIX_ALL_QUESTIONS = MATH_GRADE_SIX_UNITS.flatMap(
  (unit) => UNIT_QUESTIONS[unit.key] ?? []
);

export const MATH_GRADE_SIX_TOTAL_QUESTIONS = MATH_GRADE_SIX_ALL_QUESTIONS.length;

export function getGradeSixUnitQuestionCounts(unitKey: string) {
  return (UNIT_QUESTIONS[unitKey] ?? []).reduce(
    (counts, question) => {
      counts[question.difficulty] += 1;
      return counts;
    },
    { medium: 0, hard: 0, super: 0 } satisfies Record<GradeSixDifficulty, number>
  );
}

export function validateGradeSixQuestionBank() {
  const issues: string[] = [];
  for (const unit of MATH_GRADE_SIX_UNITS) {
    const questions = UNIT_QUESTIONS[unit.key] ?? [];
    if (questions.length !== 90) issues.push(`${unit.key}: expected 90, got ${questions.length}`);

    const counts = getGradeSixUnitQuestionCounts(unit.key);
    for (const difficulty of DIFFICULTIES) {
      if (counts[difficulty] !== 30) {
        issues.push(`${unit.key}/${difficulty}: expected 30, got ${counts[difficulty]}`);
      }
    }

    const prompts = new Set<string>();
    for (const question of questions) {
      if (prompts.has(question.prompt)) issues.push(`${question.id}: duplicate prompt`);
      prompts.add(question.prompt);
      if (question.options.length !== 4) issues.push(`${question.id}: option count is ${question.options.length}`);
      if (new Set(question.options).size !== 4) issues.push(`${question.id}: duplicate options`);
      if (question.answerIndex < 0 || question.answerIndex > 3) issues.push(`${question.id}: invalid answerIndex`);
      if (!question.explanation.trim()) issues.push(`${question.id}: missing explanation`);
      if (question.options.some((option) => /NaN|Infinity|undefined/.test(option))) {
        issues.push(`${question.id}: invalid numeric option`);
      }
    }
  }
  return issues;
}
