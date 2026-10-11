import type { BankNativeContent } from "./grade6-bank-native-types";
import type { BankInput } from "./grade6-bank-types";

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid native object");
  return value as ObjectValue;
}
function keys(value: ObjectValue, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Unexpected native field");
}
function string(value: unknown, maximum = 10000) {
  if (typeof value !== "string" || !value.length || value.length > maximum || /[\uE000-\uF8FF\uFFFD]/u.test(value)) throw new Error("Invalid native text");
  return value;
}
function number(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 100000) throw new Error("Invalid native coordinate");
  return value;
}
function viewBox(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error("Invalid viewBox");
  value.forEach(number);
  if (value[2] <= 0 || value[3] <= 0) throw new Error("Invalid viewBox size");
  return value;
}
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
function id(value: unknown) {
  const name = string(value, 80);
  if (!idPattern.test(name) || ["constructor", "prototype", "__proto__"].includes(name)) throw new Error("Invalid native input id");
  return name;
}
function shape(value: unknown) {
  const s = object(value);
  const coordinates: Record<string, string[]> = {
    line: ["x1", "y1", "x2", "y2"], rect: ["x", "y", "width", "height"], circle: ["cx", "cy", "r"],
    ellipse: ["cx", "cy", "rx", "ry"], path: [], polyline: [], text: ["x", "y"],
  };
  const kind = string(s.type, 20), required = coordinates[kind];
  if (!required) throw new Error("Unsupported SVG shape");
  const extra = kind === "path" ? ["d"] : kind === "polyline" ? ["points"] : kind === "text" ? ["value", "fontSize", "textAnchor"] : kind === "rect" ? ["rx"] : [];
  keys(s, ["type", "fill", "stroke", "strokeWidth", "strokeDasharray", ...required, ...extra]);
  required.forEach((key) => number(s[key]));
  for (const key of ["fill", "stroke"]) if (s[key] !== undefined && !/^(?:none|currentColor|#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(string(s[key], 32))) throw new Error("Unsafe SVG paint");
  for (const key of ["strokeWidth", "fontSize", "r", "rx", "ry", "width", "height"]) if (s[key] !== undefined && number(s[key]) < 0) throw new Error("Invalid SVG size");
  if (s.strokeDasharray !== undefined && !/^[\d. ,]+$/.test(string(s.strokeDasharray, 100))) throw new Error("Invalid SVG dashes");
  if (kind === "path") {
    const d = string(s.d, 100000);
    if (!/^[MmZzLlHhVvCcSsQqTtAa\d+., eE-]+$/.test(d)) throw new Error("Unsafe SVG path");
    for (const match of d.matchAll(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi)) number(Number(match[0]));
  }
  if (kind === "polyline") {
    const points = string(s.points, 100000);
    if (!/^[\d+., eE-]+$/.test(points)) throw new Error("Unsafe SVG points");
    const values = points.trim().split(/[\s,]+/).map(Number);
    if (values.length < 4 || values.length % 2) throw new Error("Invalid SVG points");
    values.forEach(number);
  }
  if (kind === "text") {
    string(s.value, 2000);
    if (s.textAnchor !== undefined && !["start", "middle", "end"].includes(String(s.textAnchor))) throw new Error("Invalid SVG text anchor");
  }
}

/** Strict authoring/runtime public schema: no HTML, bitmap, href, event or answer fields. */
export function assertBankNative(inputs: BankInput[], content: BankNativeContent): void {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 200) throw new Error("Invalid native inputs");
  const fields = new Map<string, string>();
  for (const item of inputs) {
    const field = object(item);
    keys(field, ["id", "label", "kind", "choices"]);
    const name = id(field.id); string(field.label, 200);
    if (fields.has(name) || ![undefined, "text", "choice", "drawing"].includes(field.kind as string)) throw new Error("Invalid native input");
    if (field.kind === "choice") {
      if (!Array.isArray(field.choices) || !field.choices.length || field.choices.length > 30) throw new Error("Invalid native choices");
      field.choices.forEach((value) => string(value, 200));
      if (new Set(field.choices).size !== field.choices.length) throw new Error("Repeated native choice");
    } else if (field.choices !== undefined) throw new Error("Unexpected choices");
    fields.set(name, String(field.kind ?? "text"));
  }
  const body = object(content); keys(body, ["version", "blocks"]);
  if (body.version !== 1 || !Array.isArray(body.blocks) || !body.blocks.length || body.blocks.length > 500) throw new Error("Invalid native blocks");
  const counts = new Map<string, number>();
  const fieldReference = (value: unknown, drawing = false) => {
    const name = id(value);
    if (!fields.has(name) || (fields.get(name) === "drawing") !== drawing) throw new Error("Native field type mismatch");
    counts.set(name, (counts.get(name) ?? 0) + 1);
  };
  const inline = (values: unknown, depth = 0) => {
    if (!Array.isArray(values) || depth > 4) throw new Error("Invalid native inline");
    for (const value of values) {
      const node = object(value);
      if (node.type === "text") { keys(node, ["type", "value"]); if (node.value !== "") string(node.value); }
      else if (node.type === "math") {
        keys(node, ["type", "tex"]); const tex = string(node.tex);
        if (/\\(?:href|url|includegraphics|html\w*|def|gdef|newcommand|renewcommand|input|require)\b/.test(tex)) throw new Error("Unsafe math command");
      } else if (node.type === "fraction") {
        keys(node, ["type", "numerator", "denominator"]);
        if (!Array.isArray(node.numerator) || !node.numerator.length || !Array.isArray(node.denominator) || !node.denominator.length) throw new Error("Invalid native fraction");
        inline(node.numerator, depth + 1); inline(node.denominator, depth + 1);
      } else if (node.type === "blank") { keys(node, ["type", "fieldId"]); fieldReference(node.fieldId); }
      else throw new Error("Unsupported native inline");
    }
  };
  for (const value of body.blocks) {
    const block = object(value);
    switch (block.type) {
      case "heading": keys(block, ["type", "text"]); string(block.text); break;
      case "paragraph": keys(block, ["type", "content"]); inline(block.content); break;
      case "table": {
        keys(block, ["type", "rows", "presentation"]);
        if (block.presentation !== undefined && block.presentation !== "arithmetic") throw new Error("Invalid native table presentation");
        if (!Array.isArray(block.rows) || !block.rows.length) throw new Error("Invalid native table");
        let width: number | null = null;
        for (const row of block.rows) {
          if (!Array.isArray(row) || !row.length || (width !== null && width !== row.length)) throw new Error("Invalid native table row");
          width = row.length; row.forEach(cell => inline(cell));
        }
        break;
      }
      case "diagram": case "drawing": {
        keys(block, ["type", "viewBox", "label", "shapes", ...(block.type === "drawing" ? ["fieldId"] : [])]);
        viewBox(block.viewBox); string(block.label, 2000);
        if (!Array.isArray(block.shapes) || block.shapes.length > 10000) throw new Error("Invalid SVG shapes");
        block.shapes.forEach(shape);
        if (block.type === "drawing") fieldReference(block.fieldId, true);
        break;
      }
      case "response": keys(block, ["type", "fieldId", "multiline"]); fieldReference(block.fieldId); if (block.multiline !== undefined && typeof block.multiline !== "boolean") throw new Error("Invalid response size"); break;
      default: throw new Error("Unsupported native block");
    }
  }
  if ([...fields.keys()].some((name) => counts.get(name) !== 1)) throw new Error("Native inputs must each appear exactly once");
}

/** Learner diagrams are data, never SVG markup. The normal 3000-character limit remains. */
export function assertBankDrawing(value: string, expectedViewBox?: number[]): void {
  if (value.length > 3000) throw new Error("绘图太复杂，请减少笔画");
  const drawing = object(JSON.parse(value)); keys(drawing, ["version", "viewBox", "items"]);
  const box = viewBox(drawing.viewBox);
  if (drawing.version !== 1 || (expectedViewBox && box.some((v, i) => v !== expectedViewBox[i]))) throw new Error("Invalid drawing version");
  const point = (value: unknown): number[] => {
    if (!Array.isArray(value) || value.length !== 2) throw new Error("Invalid drawing point");
    value.forEach(number);
    if (value[0] < box[0] || value[0] > box[0] + box[2] || value[1] < box[1] || value[1] > box[1] + box[3]) throw new Error("Drawing point outside canvas");
    return value;
  };
  if (!Array.isArray(drawing.items) || !drawing.items.length || drawing.items.length > 24) throw new Error("Invalid drawing items");
  for (const value of drawing.items) {
    const item = object(value);
    switch (item.type) {
      case "line": case "rect": keys(item, ["type", "from", "to"]); point(item.from); point(item.to); break;
      case "circle": {
        keys(item, ["type", "center", "radius"]); const center = point(item.center), radius = number(item.radius);
        if (radius <= 0 || center[0] - radius < box[0] || center[0] + radius > box[0] + box[2] || center[1] - radius < box[1] || center[1] + radius > box[1] + box[3]) throw new Error("Invalid drawing circle");
        break;
      }
      case "pen": case "shade": keys(item, ["type", "points"]); if (!Array.isArray(item.points) || item.points.length < (item.type === "shade" ? 3 : 2) || item.points.length > 24) throw new Error("Invalid drawing stroke"); item.points.forEach(point); break;
      case "text": keys(item, ["type", "at", "value"]); point(item.at); string(item.value, 24); break;
      default: throw new Error("Unsupported drawing item");
    }
  }
}
