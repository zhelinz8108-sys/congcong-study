/** A null result means that this answer needs comparison and self assessment. */
export type NationalDayMathAnswerResult = boolean | null;

export function normalizeNationalDayMathAnswer(value: string) {
  return value
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[−﹣－]/g, "-")
    .replace(/[∶：]/g, ":")
    .replace(/[／⁄]/g, "/")
    .replace(/[，、]/g, ",")
    .replace(/[；]/g, ";")
    .replace(/[＝]/g, "=")
    .replace(/\s+/g, " ")
    .replace(/\s*([/:=,;])\s*/g, "$1")
    .trim()
    .replace(/^(?:答案|答|结果)(?:是|为)?[:：]?\s*/u, "")
    .replace(/[。.!！?？;；]+$/u, "")
    .trim();
}

type Quantity = { value: number; dimension: string; unit: boolean };
type Unit = { dimension: string; factor: number };

const UNITS: Record<string, Unit> = {};
function units(aliases: string[], dimension: string, factor: number) {
  for (const alias of aliases) UNITS[alias] = { dimension, factor };
}

units(["毫米", "mm"], "length", 0.001);
units(["厘米", "cm"], "length", 0.01);
units(["分米", "dm"], "length", 0.1);
units(["米", "m"], "length", 1);
units(["千米", "公里", "km"], "length", 1000);
units(["平方毫米", "mm^2", "mm2"], "area", 0.000001);
units(["平方厘米", "cm^2", "cm2"], "area", 0.0001);
units(["平方分米", "dm^2", "dm2"], "area", 0.01);
units(["平方米", "m^2", "m2"], "area", 1);
units(["公顷", "ha"], "area", 10000);
units(["平方千米", "平方公里", "km^2", "km2"], "area", 1000000);
units(["立方毫米", "mm^3", "mm3"], "volume", 0.000000001);
units(["立方厘米", "cm^3", "cm3", "毫升", "ml"], "volume", 0.000001);
units(["立方分米", "dm^3", "dm3", "升", "l"], "volume", 0.001);
units(["立方米", "m^3", "m3"], "volume", 1);
units(["克", "g"], "mass", 1);
units(["千克", "公斤", "kg"], "mass", 1000);
units(["吨", "t"], "mass", 1000000);
units(["秒", "秒钟", "s"], "time", 1);
units(["分钟", "min"], "time", 60);
units(["小时", "时", "h"], "time", 3600);
units(["天", "日"], "time", 86400);
units(["元", "yuan"], "money", 1);
units(["角"], "money", 0.1);
units(["度", "°"], "angle", 1);
for (const unit of ["棵", "个", "本", "份", "次", "圈", "场", "人", "件", "支", "块", "页", "局", "队", "格", "台"]) {
  units([unit], `count:${unit}`, 1);
}
units(["%", "百分比"], "number", 0.01);

function parseUnit(value: string): Unit | null {
  const text = value.replace(/\s+/g, "");
  if (!text) return { dimension: "number", factor: 1 };
  if (Object.prototype.hasOwnProperty.call(UNITS, text)) return UNITS[text];
  const rate = text.split("/");
  if (rate.length !== 2 || !rate[0] || !rate[1]) return null;
  const numerator = UNITS[rate[0]];
  // In a rate denominator ‘分’ means minutes; alone it can also mean money.
  const denominator = rate[1] === "分" ? { dimension: "time", factor: 60 } : UNITS[rate[1]];
  if (!numerator || !denominator) return null;
  return {
    dimension: `${numerator.dimension}/${denominator.dimension}`,
    factor: numerator.factor / denominator.factor,
  };
}

const NUMBER = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const SCALAR = `[+-]?(?:${NUMBER}(?:又${NUMBER}/${NUMBER}|/[+-]?${NUMBER})?)`;
const QUANTITY = new RegExp(`^(${SCALAR})\\s*(.*)$`, "u");

function parseNumber(value: string): number | null {
  const sign = value.startsWith("-") ? -1 : 1;
  const unsigned = value.replace(/^[+-]/, "");
  const mixed = unsigned.split("又");
  const fractionText = mixed.length === 2 ? mixed[1] : mixed[0];
  const fraction = fractionText.split("/");
  let magnitude: number;
  if (fraction.length === 2) {
    const numerator = Number(fraction[0]);
    const denominator = Number(fraction[1]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    magnitude = numerator / denominator;
  } else if (fraction.length === 1) {
    magnitude = Number(fraction[0]);
  } else return null;
  if (mixed.length === 2) magnitude += Number(mixed[0]);
  else if (mixed.length !== 1) return null;
  const result = sign * magnitude;
  return Number.isFinite(result) ? result : null;
}

function parseQuantity(value: string): Quantity | null {
  const text = value
    .replace(/^(?:约|大约|≈)\s*/u, "")
    .replace(/([+-]?\d+)\s+(\d+\/\d+)/g, "$1又$2")
    .replace(/(?<=\d),(?=\d{3}(?:,\d{3})*(?:\.|[^\d]|$))/g, "");
  const match = text.match(QUANTITY);
  if (!match) return null;
  const number = parseNumber(match[1]);
  let unitText = match[2].trim();
  if (unitText.startsWith("(") && unitText.endsWith(")")) unitText = unitText.slice(1, -1);
  const unit = parseUnit(unitText);
  if (number === null || !unit) return null;
  return { value: number * unit.factor, dimension: unit.dimension, unit: unitText.length > 0 };
}

function closeNumbers(left: number, right: number) {
  // This only absorbs floating-point arithmetic noise, not arbitrary rounding.
  return Math.abs(left - right) <= Number.EPSILON * 32 * Math.max(1, Math.abs(left), Math.abs(right));
}

function booleanAnswer(value: string) {
  if (["√", "✓", "正确", "对", "是", "true", "t"].includes(value)) return true;
  if (["×", "✗", "错误", "错", "否", "false", "f"].includes(value)) return false;
  return null;
}

function isRatio(value: string) {
  return /^[+-]?\d+(?:\.\d+)?(?::[+-]?\d+(?:\.\d+)?)+$/u.test(value);
}

function isSimpleText(value: string) {
  return /^[a-z\u3400-\u9fff]{1,24}$/u.test(value);
}

/**
 * accepted must be authored explicitly; never extract it from worked solutions.
 * Only short, unambiguous answers are automatically marked wrong. Missing keys,
 * multiple-part explanations, radical expressions, coordinates and formulas
 * fall back to self assessment instead of pretending to be a symbolic grader.
 * Unitless alternatives must be explicit: this function never drops a unit.
 */
export function checkMathAnswer(
  value: string,
  accepted?: readonly string[] | null,
): NationalDayMathAnswerResult {
  const alternatives = (accepted ?? [])
    .filter((answer): answer is string => typeof answer === "string")
    .map(normalizeNationalDayMathAnswer)
    .filter(Boolean);
  if (!alternatives.length) return null;
  const response = normalizeNationalDayMathAnswer(value);
  if (!response) return false;
  if (alternatives.includes(response)) return true;

  const responseQuantity = parseQuantity(response);
  const responseBoolean = booleanAnswer(response);
  if (!responseQuantity && responseBoolean === null && !isRatio(response) && !isSimpleText(response) && /[\d√=(),;]/u.test(response)) {
    const scalar = response.match(QUANTITY);
    // A bare zero-denominator fraction is invalid, not an open-ended response.
    if (scalar && !scalar[2]) return false;
    return null;
  }
  let hasComparableAnswer = false;
  let needsSelfAssessment = false;

  for (const answer of alternatives) {
    const referenceBoolean = booleanAnswer(answer);
    if (referenceBoolean !== null) {
      hasComparableAnswer = true;
      if (responseBoolean === referenceBoolean) return true;
      continue;
    }
    const reference = parseQuantity(answer);
    if (reference) {
      hasComparableAnswer = true;
      if (!responseQuantity) continue;
      if (reference.dimension !== responseQuantity.dimension) {
        // An added unit cannot be validated against a dimensionless key.
        if (reference.dimension === "number" && responseQuantity.unit) needsSelfAssessment = true;
        continue;
      }
      if (closeNumbers(reference.value, responseQuantity.value)) return true;
      continue;
    }
    if (isRatio(answer)) {
      // A simplest integer ratio is not interchangeable with its scalar value.
      hasComparableAnswer = true;
      continue;
    }
    if (isSimpleText(answer)) {
      hasComparableAnswer = true;
      continue;
    }
    needsSelfAssessment = true;
  }
  return hasComparableAnswer && !needsSelfAssessment ? false : null;
}
