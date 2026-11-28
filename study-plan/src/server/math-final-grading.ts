import { finalExamQuestionPoints, readPath, readPoint, type ExamField, type ExamQuestion, type ExamValues, type GridPoint } from "@/lib/math-final-exams";

export type PaperKey = { values: string[]; answer: string; explanation: string; figure?: string; rule?: "rectangle" | "shortestPath" | "triangleRow" };
export type ExamPaper = { questions: ExamQuestion[]; keys: PaperKey[] };
export type ExamGrade = { correct: boolean[]; score: number };
export class ExamInputError extends Error {}

export function cleanExamValues(questions: ExamQuestion[], raw: unknown, complete: boolean): ExamValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ExamInputError("作答格式不正确。");
  const data = raw as Record<string, unknown>;
  const allowed = new Set<string>();
  const values: ExamValues = {};
  function read(id: string, limit: number) {
    allowed.add(id);
    const value = data[id] ?? "";
    if (typeof value !== "string" || value.length > limit) throw new ExamInputError("作答过长或格式不正确。");
    if (value.trim()) values[id] = value.trim();
    return value.trim();
  }
  questions.forEach((question, index) => {
    for (const field of question.fields) {
      const value = read(field.id, field.kind === "path" ? 256 : 120);
      if (!value) {
        if (complete) throw new ExamInputError(`第 ${index + 1} 题还有未填写的作答项。`);
        continue;
      }
      if (field.options) {
        const selected = field.kind === "multi" ? value.split(",") : [value];
        if (new Set(selected).size !== selected.length || selected.some(item => !field.options!.some(option => option.value === item))) {
          throw new ExamInputError(`第 ${index + 1} 题的选项无效。`);
        }
      }
      if (complete && (field.kind === "point" && (!readPoint(value) || question.grid && !readPoint(value)!.every(v => v >= 0 && v <= 8)) || field.kind === "path" && !readPath(value)?.every(p => p.every(v => v >= 0 && v <= 8)))) {
        throw new ExamInputError(`请检查第 ${index + 1} 题的坐标格式。`);
      }
    }
    if (index >= 26) read(`work.${index + 1}`, 800);
  });
  if (Object.keys(data).some(id => !allowed.has(id))) throw new ExamInputError("试卷字段不匹配，请刷新试卷。");
  return values;
}

function normalize(value: string) {
  return value.normalize("NFKC").trim().replace(/[−－]/g, "-").replace(/[⁄∕]/g, "/").replace(/∶/g, ":");
}

type Rational = [bigint, bigint];
function numberPair(raw: string): Rational | null {
  const normalized = normalize(raw);
  const mixed = /^(\d+)(?:\s*又\s*|\s+)(\d+)\s*\/\s*(\d+)$/.exec(normalized);
  if (mixed && BigInt(mixed[3]) > BigInt(0)) return [BigInt(mixed[1]) * BigInt(mixed[3]) + BigInt(mixed[2]), BigInt(mixed[3])];
  const s = normalized.replace(/\s/g, "");
  const frac = /^([+-]?\d+)\/([1-9]\d*)$/.exec(s);
  if (frac) return [BigInt(frac[1]), BigInt(frac[2])];
  const decimal = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!decimal || !decimal[2] && !decimal[3]) return null;
  const digits = decimal[2] + (decimal[3] ?? "");
  return [(decimal[1] === "-" ? -BigInt(1) : BigInt(1)) * BigInt(digits), BigInt(10) ** BigInt(decimal[3]?.length ?? 0)];
}
function equalNumber(a: string, b: string) {
  const x = numberPair(a), y = numberPair(b);
  return !!x && !!y && x[0] * y[1] === y[0] * x[1];
}
function piCoefficient(raw: string) {
  const s = raw.toLowerCase().replace(/pi/g, "π").replace(/[\s*×]/g, "");
  if ((s.match(/π/g) ?? []).length !== 1) return "";
  return s.replace(/^π(?=\/|$)/, "1π").replace("π", "").replace(/^\(([^()]+)\)$/, "$1");
}
function samePoint(a: GridPoint, b: GridPoint) { return a[0] === b[0] && a[1] === b[1]; }
function shortestPath(raw: string) {
  const path = readPath(raw);
  if (!path || !samePoint(path[0], [1, 1]) || !samePoint(path[path.length - 1], [7, 2])) return false;
  let len = 0, via = false;
  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i - 1], [a, b] = path[i];
    if (x !== a && y !== b) return false;
    len += Math.abs(x - a) + Math.abs(y - b);
    if (Math.min(x, a) <= 4 && Math.max(x, a) >= 4 && Math.min(y, b) <= 4 && Math.max(y, b) >= 4) via = true;
  }
  return via && len === 11;
}
export function fieldCorrect(field: ExamField, raw: string, expected: string) {
  let v = normalize(raw);
  if (field.unit) {
    const suffix = [field.unit, ...(field.unit === "°" ? ["度"] : field.unit === "度" ? ["°"] : [])].find(unit => v.endsWith(unit));
    if (suffix) v = v.slice(0, -suffix.length).trim();
  }
  if (field.label.trim() === "x") v = v.replace(/^x\s*=\s*/i, "");
  switch (field.kind) {
    case "choice": return raw === expected;
    case "multi": return raw.split(",").sort().join(",") === expected.split(",").sort().join(",");
    case "point": { const a = readPoint(v), b = readPoint(expected); return !!a && !!b && samePoint(a, b); }
    case "path": return shortestPath(v);
    case "binary": return /^[01]+$/.test(v) && v === expected;
    case "pi": return equalNumber(piCoefficient(v), piCoefficient(expected));
    case "simplestRatio":
    case "ratio": {
      const parts = v.replace(/\s/g, "").split(":");
      const [a, b] = expected.split(":");
      if (parts.length !== 2) return false;
      if (field.kind === "simplestRatio") return parts[0] === a && parts[1] === b;
      const x = numberPair(parts[0]), y = numberPair(parts[1]);
      return !!x && !!y && x[0] > BigInt(0) && y[0] > BigInt(0) && x[0] * y[1] * BigInt(b) === y[0] * x[1] * BigInt(a);
    }
    case "simplestFraction": return v.replace(/\s/g, "") === expected;
    default: return equalNumber(v, expected);
  }
}
export function gradeExam(paper: ExamPaper, values: ExamValues): ExamGrade {
  const correct = paper.questions.map((question, n) => {
    const key = paper.keys[n];
    return question.fields.every((field, i) => {
      const raw = values[field.id];
      if (key.rule === "triangleRow" && i === 0) { const p = readPoint(raw); return !!p && p[0] >= 0 && p[0] <= 8 && p[1] === 6; }
      if (key.rule === "rectangle" && i < 2) {
        const other = values[question.fields[1-i].id];
        return fieldCorrect(field, raw, key.values[i]) || (fieldCorrect(field, raw, key.values[1-i]) && fieldCorrect(field, other, key.values[i]));
      }
      return fieldCorrect(field, raw, key.values[i]);
    });
  });
  return { correct, score: correct.filter(Boolean).length * finalExamQuestionPoints };
}
