/** Public, answer-free content. No raw HTML, image nodes or executable SVG. */
export type BankNativeInline =
  | { type: "text"; value: string }
  | { type: "math"; tex: string }
  | { type: "fraction"; numerator: BankNativeInline[]; denominator: BankNativeInline[] }
  | { type: "blank"; fieldId: string };

type SvgPaint = { fill?: string; stroke?: string; strokeWidth?: number; strokeDasharray?: string };
export type SafeSvgShape = SvgPaint & (
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "rect"; x: number; y: number; width: number; height: number; rx?: number }
  | { type: "circle"; cx: number; cy: number; r: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { type: "path"; d: string }
  | { type: "polyline"; points: string }
  | { type: "text"; x: number; y: number; value: string; fontSize?: number; textAnchor?: "start" | "middle" | "end" }
);
export type BankDrawingPoint = [number, number];
export type BankDrawingItem =
  | { type: "line"; from: BankDrawingPoint; to: BankDrawingPoint }
  | { type: "circle"; center: BankDrawingPoint; radius: number }
  | { type: "rect"; from: BankDrawingPoint; to: BankDrawingPoint }
  | { type: "pen"; points: BankDrawingPoint[] }
  | { type: "shade"; points: BankDrawingPoint[] }
  | { type: "text"; at: BankDrawingPoint; value: string };
/** Stored as a validated <=3000-character string in one drawing response field. */
export type BankDrawingAnswer = { version: 1; viewBox: [number, number, number, number]; items: BankDrawingItem[] };
export const BANK_DRAWING_MAX_ITEMS = 24;
export const BANK_DRAWING_MAX_POINTS = 24;
export type BankNativeBlock =
  | { type: "paragraph"; content: BankNativeInline[] }
  | { type: "heading"; text: string }
  | { type: "table"; rows: BankNativeInline[][][]; presentation?: "arithmetic" }
  | { type: "diagram"; viewBox: [number, number, number, number]; label: string; shapes: SafeSvgShape[] }
  | { type: "drawing"; fieldId: string; viewBox: [number, number, number, number]; label: string; shapes: SafeSvgShape[] }
  | { type: "response"; fieldId: string; multiline?: boolean };
export type BankNativeContent = { version: 1; blocks: BankNativeBlock[] };
