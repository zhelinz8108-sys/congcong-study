import type {
  HolidayAnswerKey,
  HolidayGrade,
  HolidayItemResult,
  HolidayNode,
  HolidayQuestion,
} from "./holiday-math-700-types";

type Rational = { n: bigint; d: bigint };
const ZERO = BigInt(0),
  ONE = BigInt(1),
  TEN = BigInt(10),
  TWELVE = BigInt(12);
function gcd(a: bigint, b: bigint): bigint {
  a = a < ZERO ? -a : a;
  b = b < ZERO ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}
function rational(n: bigint, d = ONE): Rational {
  if (!d) throw new Error("除数不能为0");
  const g = gcd(n, d);
  return { n: (d < ZERO ? -n : n) / g, d: (d < ZERO ? -d : d) / g };
}
function operation(a: Rational, b: Rational, op: string): Rational {
  if (op === "+") return rational(a.n * b.d + b.n * a.d, a.d * b.d);
  if (op === "-") return rational(a.n * b.d - b.n * a.d, a.d * b.d);
  if (op === "*") return rational(a.n * b.n, a.d * b.d);
  return rational(a.n * b.d, a.d * b.n);
}
export function normalizeHolidayText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, "$1又$2/$3")
    .replace(/\s+/g, "")
    .replace(/[−﹣]/g, "-")
    .replace(/[∶：]/g, ":")
    .replace(/[，、]/g, ",")
    .replace(/度/g, "°")
    .replace(/[。;；]+$/, "");
}

/** Bounded arithmetic grammar. No eval, Function, identifiers or implicit code. */
export function parseHolidayNumber(raw: string): Rational {
  let text = normalizeHolidayText(raw)
    .replace(/^(?:约|≈)/, "")
    .replace(/[×·]/g, "*")
    .replace(/[÷]/g, "/");
  text = text.replace(
    /([+-]?\d+)又(\d+)\/(\d+)/g,
    (_, whole: string, n: string, d: string) =>
      whole.startsWith("-")
        ? `-(${whole.slice(1)}+${n}/${d})`
        : `(${whole}+${n}/${d})`,
  );
  if (text.length > 200 || !/^[\d.+\-*/^()]+$/.test(text))
    throw new Error("请输入数值、分数或普通算式");
  const tokens = text.match(/\d+(?:\.\d*)?|\.\d+|[+\-*/^()]/g) ?? [];
  if (tokens.join("") !== text || tokens.length > 120)
    throw new Error("算式格式不正确");
  let at = 0,
    depth = 0;
  function atom(): Rational {
    if (++depth > 20) throw new Error("括号层数过多");
    let value: Rational;
    const token = tokens[at++];
    if (token === "+" || token === "-") {
      value = atom();
      if (token === "-") value = { n: -value.n, d: value.d };
    } else if (token === "(") {
      value = sum();
      if (tokens[at++] !== ")") throw new Error("括号不完整");
    } else if (token && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      const [whole, decimal = ""] = token.split(".");
      if (whole.length + decimal.length > 30) throw new Error("数值过长");
      value = rational(
        BigInt((whole || "0") + decimal),
        TEN ** BigInt(decimal.length),
      );
    } else throw new Error("算式格式不正确");
    depth--;
    if (tokens[at] === "^") {
      at++;
      const exponent = atom();
      if (exponent.d !== ONE || exponent.n > TWELVE || exponent.n < -TWELVE)
        throw new Error("指数只能是-12至12的整数");
      const power = exponent.n < ZERO ? -exponent.n : exponent.n;
      value =
        exponent.n < ZERO
          ? rational(value.d ** power, value.n ** power)
          : rational(value.n ** power, value.d ** power);
    }
    return value;
  }
  function product() {
    let value = atom();
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++];
      value = operation(value, atom(), op);
    }
    return value;
  }
  function sum() {
    let value = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++];
      value = operation(value, product(), op);
    }
    return value;
  }
  const value = sum();
  if (at !== tokens.length) throw new Error("算式含多余内容");
  return value;
}
const unitDefs: Record<string, { dimension: string; factor: Rational }> = {};
function addUnits(names: string[], dimension: string, factor: string) {
  for (const name of names)
    unitDefs[name] = { dimension, factor: parseHolidayNumber(factor) };
}
addUnits(["毫米", "mm"], "length", "1/1000");
addUnits(["厘米", "cm"], "length", "1/100");
addUnits(["分米", "dm"], "length", "1/10");
addUnits(["米", "m"], "length", "1");
addUnits(["千米", "公里", "km"], "length", "1000");
addUnits(["平方厘米", "cm²", "cm2", "cm^2"], "area", "1/10000");
addUnits(["平方分米", "dm²", "dm2", "dm^2"], "area", "1/100");
addUnits(["平方米", "m²", "m2", "m^2"], "area", "1");
addUnits(["公顷"], "area", "10000");
addUnits(["平方千米", "km²", "km2", "km^2"], "area", "1000000");
addUnits(
  ["毫升", "立方厘米", "ml", "cm³", "cm3", "cm^3"],
  "volume",
  "1/1000000",
);
addUnits(["升", "立方分米", "l", "dm³", "dm3", "dm^3"], "volume", "1/1000");
addUnits(["立方米", "m³", "m3", "m^3"], "volume", "1");
addUnits(["克", "g"], "mass", "1");
addUnits(["千克", "公斤", "kg"], "mass", "1000");
addUnits(["吨"], "mass", "1000000");
addUnits(["秒", "s"], "time", "1");
addUnits(["分钟", "分", "min"], "time", "60");
addUnits(["小时", "时", "h"], "time", "3600");
addUnits(["天"], "time", "86400");
addUnits(["元"], "money", "1");
addUnits(["角"], "money", "1/10");
addUnits(["°", "度"], "angle", "1");
for (const name of [
  "个",
  "根",
  "次",
  "段",
  "页",
  "箱",
  "本",
  "棵",
  "人",
  "名",
  "岁",
  "杯",
  "袋",
  "盆",
  "场",
  "格",
  "列",
  "行",
  "面",
  "种",
])
  addUnits(
    [name],
    ["人", "名"].includes(name) ? "count:person" : `count:${name}`,
    "1",
  );
function getUnit(raw: string) {
  const text = normalizeHolidayText(raw).toLowerCase();
  if (unitDefs[text]) return unitDefs[text];
  const pieces = text.split("/");
  if (pieces.length === 2 && unitDefs[pieces[0]] && unitDefs[pieces[1]])
    return {
      dimension: `${unitDefs[pieces[0]].dimension}/${unitDefs[pieces[1]].dimension}`,
      factor: operation(
        unitDefs[pieces[0]].factor,
        unitDefs[pieces[1]].factor,
        "/",
      ),
    };
  return undefined;
}
function quantity(raw: string, expectedUnit: string | null) {
  const text = normalizeHolidayText(raw).toLowerCase();
  let numeric = text,
    unit: string | null = null;
  // Longest suffix first, so area/volume/rate units cannot become length units.
  const candidates = [
    ...Object.keys(unitDefs),
    ...(expectedUnit ? [expectedUnit] : []),
    "米/秒",
    "千米/时",
    "升/分",
  ].sort((a, b) => b.length - a.length);
  for (const suffix of candidates) {
    const token = normalizeHolidayText(suffix).toLowerCase();
    if (text.endsWith(`(${token})`)) {
      numeric = text.slice(0, -token.length - 2);
      unit = token;
      break;
    }
    if (text.endsWith(token)) {
      numeric = text.slice(0, -token.length);
      unit = token;
      break;
    }
  }
  const value = parseHolidayNumber(numeric);
  if (unit) {
    const actual = getUnit(unit),
      expected = expectedUnit ? getUnit(expectedUnit) : undefined;
    if (!actual || !expected || actual.dimension !== expected.dimension)
      throw new Error("单位或数量维度不正确");
    return {
      value: operation(
        operation(value, actual.factor, "*"),
        expected.factor,
        "/",
      ),
      numeric,
      hasUnit: true,
    };
  }
  return { value, numeric, hasUnit: false };
}
function same(
  a: Rational,
  b: Rational,
  tolerance: HolidayAnswerKey["tolerance"],
) {
  if (tolerance !== null) {
    const t = parseHolidayNumber(String(tolerance));
    const delta = operation(a, b, "-");
    return (delta.n < ZERO ? -delta.n : delta.n) * t.d <= t.n * delta.d;
  }
  return a.n === b.n && a.d === b.d;
}
function coordinate(raw: string) {
  const text = normalizeHolidayText(raw).replace(/^\(/, "").replace(/\)$/, "");
  const p = text.split(",");
  if (p.length !== 2) return null;
  try {
    return p.map(parseHolidayNumber);
  } catch {
    return null;
  }
}
function scalarMatches(
  value: string,
  key: HolidayAnswerKey,
  node: HolidayNode,
  stem: string,
) {
  const references = [
    String(key.value),
    ...key.accepted_answers.filter((v): v is string => typeof v === "string"),
  ];
  const normalized = normalizeHolidayText(value);
  if (key.kind === "choice" || key.kind === "text")
    return references.some((ref) => normalizeHolidayText(ref) === normalized);
  if (references.some((ref) => normalizeHolidayText(ref).includes(":"))) {
    if (/最简(?:整数)?比/.test(stem)) {
      const pair = normalized.match(/^([+-]?\d+):(\d+)$/);
      if (!pair || gcd(BigInt(pair[1]), BigInt(pair[2])) !== ONE) return false;
    }
    return references.some((ref) => normalizeHolidayText(ref) === normalized);
  }
  if (
    references.some((ref) =>
      /^\(?[+-]?\d+[,，][+-]?\d+\)?$/.test(normalizeHolidayText(ref)),
    )
  ) {
    const actual = coordinate(value);
    return (
      !!actual &&
      references.some((ref) => {
        const expected = coordinate(ref);
        return expected && actual.every((v, i) => same(v, expected[i], null));
      })
    );
  }
  const unit =
    typeof key.unit === "string"
      ? key.unit
      : (node.input?.blanks[0]?.unit ?? null);
  try {
    const actual = quantity(value, unit);
    if (key.unit_required && !actual.hasUnit) return false;
    if (/二进制/.test(stem) && !/^\d+$/.test(actual.numeric)) return false;
    // A requirement to fill a fraction is stronger than an equivalent decimal.
    if (
      /填(?:最简)?分数|填分数/.test(stem) &&
      !/^[-+]?\d+(?:又\d+)?\/\d+$/.test(actual.numeric)
    )
      return false;
    if (/最简分数/.test(stem)) {
      const match = actual.numeric.match(/^[-+]?(\d+)\/(\d+)$/);
      if (!match || gcd(BigInt(match[1]), BigInt(match[2])) !== ONE)
        return false;
    }
    const precision = stem.match(/保留(?:到)?([一二三两1-3])位小数/);
    if (precision && !["blanks", "parts"].includes(key.kind)) {
      const digits = (
        { 一: 1, 二: 2, 两: 2, 三: 3, "1": 1, "2": 2, "3": 3 } as Record<
          string,
          number
        >
      )[precision[1]];
      if (!new RegExp(`^[+-]?\\d+\\.\\d{${digits}}$`).test(actual.numeric))
        return false;
    }
    return references.some((ref) => {
      try {
        return same(actual.value, quantity(ref, unit).value, key.tolerance);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("请完成所有答案后提交");
  if (value.length > 200) throw new Error("单项答案最多200个字符");
}
function exactKeys(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (
    !object(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k))
  )
    throw new Error("请完成所有小问或项目，且不要添加额外字段");
}
function strings(value: unknown, count?: number): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    (count !== undefined && value.length !== count)
  )
    throw new Error("请完成全部答案");
  value.forEach(text);
}

/** A format mentioned for one blank must never be applied to other blanks. */
function blankContext(node: HolidayNode, index: number) {
  const slots = [...node.stem.matchAll(/[（(][\s　]*[）)]|_{2,}/g)];
  if (slots.length !== node.input?.blanks.length) return "";
  const at = slots[index].index!,
    start = index ? slots[index - 1].index! + slots[index - 1][0].length : 0;
  const before =
    node.stem
      .slice(start, at)
      .split(/[。；;\n]/)
      .at(-1) ?? "";
  const after =
    node.stem
      .slice(at + slots[index][0].length)
      .match(
        /^[^（(。；;\n]*[（(](填(?:最简)?分数|保留[^）)]*小数)[）)]/,
      )?.[1] ?? "";
  return `${before}\n${after}`;
}
function inlineBlankUnit(node: HolidayNode, index: number): string | null {
  const slots = [...node.stem.matchAll(/[（(][\s　]*[）)]|_{2,}/g)];
  if (slots.length !== node.input?.blanks.length) return null;
  const after = node.stem
    .slice(slots[index].index! + slots[index][0].length)
    .trimStart();
  return (
    [
      "千米/时",
      "米/秒",
      ...Object.keys(unitDefs).filter((unit) =>
        /^[\u4e00-\u9fff]+$/.test(unit),
      ),
      "°",
    ]
      .sort((a, b) => b.length - a.length)
      .find((unit) => after.startsWith(unit)) ?? null
  );
}

/** The private key determines grading; the public shape determines valid inputs. */
export function gradeHolidayQuestion(
  question: HolidayQuestion,
  key: HolidayAnswerKey,
  student: unknown,
): HolidayGrade {
  const items: HolidayItemResult[] = [];
  function visit(
    node: HolidayNode,
    answer: HolidayAnswerKey,
    value: unknown,
    path: string,
    parentStem: string,
  ) {
    const context = `${parentStem}\n${node.stem}`;
    const emit = (
      suffix: string,
      label: string,
      correct: boolean,
      expected: string,
    ) =>
      items.push({
        path: [path, suffix].filter(Boolean).join("."),
        label,
        correct,
        expected,
      });
    if (answer.kind === "parts") {
      const parts = node.parts ?? [];
      exactKeys(
        value,
        parts.map((p) => p.part_id),
      );
      for (const part of parts)
        visit(
          part,
          (answer.value as Record<string, HolidayAnswerKey>)[part.part_id],
          value[part.part_id],
          [path, part.part_id].filter(Boolean).join("."),
          node.stem,
        );
    } else if (answer.kind === "blanks") {
      const expected = answer.value as string[];
      strings(value, expected.length);
      if (node.input?.blanks.length !== expected.length)
        throw new Error("多空题数据不完整");
      expected.forEach((reference, i) => {
        const unit =
          (Array.isArray(answer.unit) ? answer.unit[i] : answer.unit) ??
          node.input!.blanks[i].unit ??
          inlineBlankUnit(node, i);
        const aliases = Array.isArray(answer.accepted_answers[i])
          ? (answer.accepted_answers[i] as unknown[])
          : [reference];
        let kind: HolidayAnswerKey["kind"] = "number";
        if (/[:∶]/.test(reference)) kind = "expression";
        else {
          try {
            quantity(reference, unit ?? null);
          } catch {
            kind = "text";
          }
        }
        const label = node.input!.blanks[i].label;
        emit(
          String(i),
          `${path ? `小题${path} · ` : ""}第${label}空`,
          scalarMatches(
            value[i],
            {
              ...answer,
              kind,
              value: reference,
              accepted_answers: aliases,
              unit,
            },
            { ...node, input: { blanks: [node.input!.blanks[i]] } },
            blankContext(node, i),
          ),
          reference + (unit ? ` ${unit}` : ""),
        );
      });
    } else if (answer.kind === "mapping") {
      const left = node.interaction?.left ?? node.interaction?.items ?? [];
      const right =
        node.interaction?.right ?? node.interaction?.categories ?? [];
      exactKeys(
        value,
        left.map((item) => item.id),
      );
      for (const item of left) {
        text(value[item.id]);
        if (!right.some((r) => r.id === value[item.id]))
          throw new Error("请选择有效的匹配或分类项");
        const target = (answer.value as Record<string, string>)[item.id];
        emit(
          item.id,
          item.text,
          value[item.id] === target,
          right.find((r) => r.id === target)!.text,
        );
      }
    } else if (answer.kind === "sequence") {
      const list = node.interaction?.items ?? [];
      strings(value, list.length);
      if (
        new Set(value).size !== value.length ||
        value.some((v) => !list.some((item) => item.id === v))
      )
        throw new Error("排序不得重复或使用未知项目");
      (answer.value as string[]).forEach((expected, i) =>
        emit(
          String(i),
          `第${i + 1}位`,
          value[i] === expected,
          list.find((item) => item.id === expected)!.text,
        ),
      );
    } else if (answer.kind === "choices") {
      strings(value);
      if (
        new Set(value).size !== value.length ||
        value.some((v) => !node.choices?.some((c) => c.id === v))
      )
        throw new Error("多选不得重复或使用未知选项");
      const expected = answer.value as string[];
      // Each checkbox is one scoring item; missed and extra selections matter.
      for (const choice of node.choices ?? [])
        emit(
          choice.id,
          `选项${choice.id}`,
          value.includes(choice.id) === expected.includes(choice.id),
          expected.includes(choice.id) ? "应选择" : "不应选择",
        );
    } else {
      text(value);
      if (
        answer.kind === "choice" &&
        !node.choices?.some((c) => c.id === value)
      )
        throw new Error("请选择有效选项");
      const unit = typeof answer.unit === "string" ? answer.unit : null;
      const expected =
        answer.kind === "choice"
          ? `${answer.value} · ${node.choices!.find((c) => c.id === answer.value)!.text}`
          : String(answer.value) + (unit ? ` ${unit}` : "");
      emit(
        "",
        path ? `小题${path}` : "本题答案",
        scalarMatches(value, answer, node, context),
        expected,
      );
    }
  }
  visit(question, key, student, "", "");
  if (!items.length) throw new Error("题目没有可判分项目");
  return {
    correct: items.every((item) => item.correct),
    score: items.filter((item) => item.correct).length,
    maxScore: items.length,
    items,
  };
}
