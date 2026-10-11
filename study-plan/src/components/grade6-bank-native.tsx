"use client";

import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { BankAnswers, BankInput, BankFeedback } from "@/lib/grade6-bank-types";
import { BANK_DRAWING_MAX_ITEMS, BANK_DRAWING_MAX_POINTS, type BankDrawingAnswer, type BankDrawingItem, type BankDrawingPoint, type BankNativeContent, type BankNativeInline, type SafeSvgShape } from "@/lib/grade6-bank-native-types";
import { assertBankDrawing } from "@/lib/grade6-bank-native-validation";
import styles from "./grade6-bank-native.module.css";

function Formula({ tex }: { tex: string }) {
  let html: string | null = null;
  try {
    html = katex.renderToString(tex, { throwOnError: true, trust: false, strict: "ignore", maxExpand: 1000, maxSize: 8, minRuleThickness: 0.06 });
  } catch { /* A malformed source formula remains literal, never executable. */ }
  return html === null ? <span className={styles.mathFallback}>{tex}</span> : <span className={styles.math} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Shape({ shape }: { shape: SafeSvgShape }) {
  const shared = { fill: shape.fill ?? "none", stroke: shape.stroke, strokeWidth: shape.strokeWidth, strokeDasharray: shape.strokeDasharray };
  switch (shape.type) {
    case "line": return <line {...shared} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />;
    case "rect": return <rect {...shared} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />;
    case "circle": return <circle {...shared} cx={shape.cx} cy={shape.cy} r={shape.r} />;
    case "ellipse": return <ellipse {...shared} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />;
    case "path": return <path {...shared} d={shape.d} />;
    case "polyline": return <polyline {...shared} points={shape.points} />;
    case "text": return <text x={shape.x} y={shape.y} fill={shape.fill ?? "currentColor"} fontSize={shape.fontSize ?? 16} textAnchor={shape.textAnchor}>{shape.value}</text>;
  }
}

function readableFigureWidth(viewBox: [number, number, number, number], shapes: SafeSvgShape[]) {
  const sizes = shapes.filter((shape) => shape.type === "text").map((shape) => shape.type === "text" ? shape.fontSize ?? 16 : 16);
  // Keep original geometry and equal grid units. Small phones scroll a large
  // coordinate board instead of reducing its labels to unreadable tiny text.
  return sizes.length ? Math.ceil(viewBox[2] * 14 / Math.min(...sizes)) : 0;
}
function Diagram({ viewBox, label, shapes }: { viewBox: [number, number, number, number]; label: string; shapes: SafeSvgShape[] }) {
  const titleId = useId();
  return <figure className={styles.diagram} style={{ width: Math.min(viewBox[2], 560), maxWidth: "100%" }}><svg style={{ minWidth: readableFigureWidth(viewBox, shapes) }} viewBox={viewBox.join(" ")} role="img" aria-labelledby={titleId} focusable="false"><title id={titleId}>{label}</title>{shapes.map((shape, index) => <Shape key={index} shape={shape} />)}</svg></figure>;
}

function drawingValue(value: string, viewBox?: number[]): BankDrawingAnswer | null {
  try { assertBankDrawing(value, viewBox); return JSON.parse(value) as BankDrawingAnswer; } catch { return null; }
}
export function bankDrawingCompleted(value: string, viewBox?: number[]) { return drawingValue(value, viewBox) !== null; }
const drawingTools = [{ value: "line", label: "直线" }, { value: "circle", label: "圆" }, { value: "rect", label: "矩形" }, { value: "pen", label: "笔" }, { value: "shade", label: "涂色" }, { value: "fill", label: "填格" }, { value: "text", label: "标注" }] as const;
type DrawingTool = (typeof drawingTools)[number]["value"];
function Ink({ item }: { item: BankDrawingItem }) {
  switch (item.type) {
    case "line": return <line x1={item.from[0]} y1={item.from[1]} x2={item.to[0]} y2={item.to[1]} />;
    case "rect": return <rect x={Math.min(item.from[0], item.to[0])} y={Math.min(item.from[1], item.to[1])} width={Math.abs(item.to[0] - item.from[0])} height={Math.abs(item.to[1] - item.from[1])} />;
    case "circle": return <circle cx={item.center[0]} cy={item.center[1]} r={item.radius} />;
    case "pen": return <polyline points={item.points.map((point) => point.join(",")).join(" ")} />;
    case "shade": return <polygon points={item.points.map((point) => point.join(",")).join(" ")} fill="currentColor" fillOpacity="0.3" stroke="none" />;
    case "text": return <text x={item.at[0]} y={item.at[1]} fill="currentColor" stroke="none">{item.value}</text>;
  }
}

function Drawing({ field, value, onChange, disabled, viewBox, label, shapes, result }: {
  field: BankInput; value: string; onChange: (fieldId: string, value: string) => void; disabled: boolean;
  viewBox: [number, number, number, number]; label: string; shapes: SafeSvgShape[]; result?: boolean | null;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ from: BankDrawingPoint; points: BankDrawingPoint[] } | null>(null);
  const [tool, setTool] = useState<DrawingTool>("line");
  const [annotation, setAnnotation] = useState("");
  const [cursor, setCursor] = useState<BankDrawingPoint>([viewBox[0] + viewBox[2] / 2, viewBox[1] + viewBox[3] / 2]);
  const [preview, setPreview] = useState<BankDrawingItem | null>(null);
  const [notice, setNotice] = useState("");
  const helpId = useId();
  const items = drawingValue(value, viewBox)?.items ?? [];
  const fillRegions = shapes.filter((shape): shape is SafeSvgShape & { type: "rect" } => shape.type === "rect" && !!shape.fill && shape.fill !== "none" && shape.width > 0 && shape.height > 0);
  const scale = Math.max(viewBox[2], viewBox[3]);
  const round = (number: number) => Math.round(number * 10) / 10;
  const bounded = (point: BankDrawingPoint): BankDrawingPoint => [Math.max(viewBox[0], Math.min(viewBox[0] + viewBox[2], round(point[0]))), Math.max(viewBox[1], Math.min(viewBox[1] + viewBox[3], round(point[1])))];
  function position(event: PointerEvent<SVGSVGElement>): BankDrawingPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return bounded([viewBox[0] + (event.clientX - bounds.left) / bounds.width * viewBox[2], viewBox[1] + (event.clientY - bounds.top) / bounds.height * viewBox[3]]);
  }
  function candidate(to: BankDrawingPoint): BankDrawingItem | null {
    const current = drag.current;
    if (!current) return null;
    if (tool === "line") return Math.hypot(to[0] - current.from[0], to[1] - current.from[1]) > 0.1 ? { type: "line", from: current.from, to } : null;
    if (tool === "rect") return Math.abs(to[0] - current.from[0]) > 0.1 && Math.abs(to[1] - current.from[1]) > 0.1 ? { type: "rect", from: current.from, to } : null;
    if (tool === "circle") {
      const radius = Math.floor(Math.min(Math.hypot(to[0] - current.from[0], to[1] - current.from[1]), current.from[0] - viewBox[0], viewBox[0] + viewBox[2] - current.from[0], current.from[1] - viewBox[1], viewBox[1] + viewBox[3] - current.from[1]) * 10) / 10;
      return radius > 0 ? { type: "circle", center: current.from, radius } : null;
    }
    if (tool === "pen" || tool === "shade") {
      const last = current.points.at(-1)!;
      if (Math.hypot(to[0] - last[0], to[1] - last[1]) > 0.1) current.points.push(to);
      if (current.points.length > BANK_DRAWING_MAX_POINTS) current.points = current.points.filter((_, index) => index % 2 === 0 || index === current.points.length - 1);
      if (tool === "pen") return current.points.length > 1 ? { type: "pen", points: [...current.points] } : null;
      const area = current.points.reduce((sum, point, index) => { const next = current.points[(index + 1) % current.points.length]; return sum + point[0] * next[1] - next[0] * point[1]; }, 0);
      return current.points.length >= 3 && Math.abs(area) > 0.1 ? { type: "shade", points: [...current.points] } : null;
    }
    return null;
  }
  function commit(next: BankDrawingItem[]) {
    if (disabled) return;
    if (!next.length) { onChange(field.id, ""); setNotice(""); return; }
    if (next.length > BANK_DRAWING_MAX_ITEMS) { setNotice("画板已满，请撤销部分图形。"); return; }
    const serialized = JSON.stringify({ version: 1, viewBox, items: next });
    try { assertBankDrawing(serialized, viewBox); onChange(field.id, serialized); setNotice(""); }
    catch { setNotice("画板已满，请撤销部分笔画。"); }
  }
  function cancel() { drag.current = null; setPreview(null); }
  function addLabel(at: BankDrawingPoint) {
    if (!annotation.trim()) { setNotice("先填写标注。"); return; }
    commit([...items, { type: "text", at, value: annotation.trim().slice(0, 24) }]);
  }
  function fillCell(at: BankDrawingPoint) {
    // Only existing, public SVG cells are eligible; never guess a figure's
    // correct region. A repeated click toggles just the selected cell.
    const region = fillRegions.filter((shape) => at[0] >= shape.x && at[0] < shape.x + shape.width && at[1] >= shape.y && at[1] < shape.y + shape.height).sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (!region) { setNotice("点选图中的格子。"); return; }
    const corners: BankDrawingPoint[] = [[region.x, region.y], [region.x + region.width, region.y], [region.x + region.width, region.y + region.height], [region.x, region.y + region.height]];
    const points = corners.map(bounded);
    const matching = items.findIndex((item) => item.type === "shade" && item.points.length === 4 && item.points.every((point, index) => point[0] === points[index][0] && point[1] === points[index][1]));
    commit(matching >= 0 ? items.filter((_, index) => index !== matching) : [...items, { type: "shade", points }]);
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (disabled || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    svg.current?.focus();
    const point = position(event); setCursor(point);
    if (tool === "text") { addLabel(point); return; }
    if (tool === "fill") { fillCell(point); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { from: point, points: [point] }; setPreview(null);
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (disabled || !drag.current) return;
    const point = position(event); setCursor(point); setPreview(candidate(point));
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const item = disabled ? null : candidate(position(event));
    if (item) commit([...items, item]);
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (disabled) { cancel(); return; }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const step = Math.min(viewBox[2], viewBox[3]) / (event.shiftKey ? 100 : 20);
      const next = bounded([cursor[0] + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), cursor[1] + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)]);
      setCursor(next); if (drag.current) setPreview(candidate(next));
    } else if (event.key === "Enter" && !event.repeat) {
      event.preventDefault();
      if (tool === "text") { addLabel(cursor); return; }
      if (tool === "fill") { fillCell(cursor); return; }
      if (!drag.current) { drag.current = { from: cursor, points: [cursor] }; setNotice(""); }
      else { const item = candidate(cursor); if (item) commit([...items, item]); cancel(); }
    } else if (event.key === "Escape") { event.preventDefault(); cancel(); }
  }
  return <section className={styles.drawing} data-drawing-field={field.id} data-result={result === true ? "correct" : result === false ? "incorrect" : undefined} aria-label={field.label}>
    <div className={styles.drawingToolbar} role="group" aria-label="绘图工具">{drawingTools.filter((entry) => entry.value !== "fill" || fillRegions.length > 0).map((entry) => <button key={entry.value} type="button" aria-pressed={tool === entry.value} disabled={disabled} onClick={() => { cancel(); setTool(entry.value); setNotice(""); svg.current?.focus(); }}>{entry.label}</button>)}<button type="button" disabled={disabled || !items.length} onClick={() => { cancel(); commit(items.slice(0, -1)); }}>撤销</button><button type="button" disabled={disabled || !items.length} onClick={() => { cancel(); commit([]); }}>清空</button></div>
    {tool === "text" && <label className={styles.annotation}>标注<input type="text" aria-label="图形标注" maxLength={24} value={annotation} disabled={disabled} onChange={(event) => setAnnotation(event.target.value)} /></label>}
    <div className={styles.drawingScroll}><svg ref={svg} className={styles.drawingCanvas} style={{ minWidth: readableFigureWidth(viewBox, shapes) }} viewBox={viewBox.join(" ")} tabIndex={disabled ? -1 : 0} role="application" aria-label={label} aria-describedby={helpId} aria-disabled={disabled} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancel} onKeyDown={keyboard}>
      <title>{label}</title>{shapes.map((shape, index) => <Shape key={index} shape={shape} />)}
      <g className={styles.ink} fill="none" stroke="currentColor" strokeWidth={scale / 250} strokeLinecap="round" strokeLinejoin="round" fontSize={scale / 30}>{items.map((item, index) => <Ink key={index} item={item} />)}{preview && !disabled && <g opacity="0.5"><Ink item={preview} /></g>}</g>
      {!disabled && <g className={styles.cursor} stroke="currentColor" strokeWidth={scale / 500} pointerEvents="none"><line x1={cursor[0] - scale / 100} y1={cursor[1]} x2={cursor[0] + scale / 100} y2={cursor[1]} /><line x1={cursor[0]} y1={cursor[1] - scale / 100} x2={cursor[0]} y2={cursor[1] + scale / 100} /></g>}
    </svg></div>
    <p id={helpId} className={styles.drawingHelp}>{tool === "fill" ? "点选格子涂色，再点取消；方向键移动，Enter 选格。" : tool === "shade" ? "拖动围住涂色区域；方向键移动，Enter 开始 / 完成。" : "拖动绘图；方向键移动，Enter 落笔。"}</p>{notice && <p className={styles.drawingNotice} role="status">{notice}</p>}
  </section>;
}

export function Grade6BankNative({ content, inputs, answers, disabled, onChange, results }: {
  content: BankNativeContent;
  inputs: BankInput[];
  answers: BankAnswers;
  disabled: boolean;
  onChange: (fieldId: string, value: string) => void;
  results?: BankFeedback["fields"];
}) {
  const fields = new Map(inputs.map((field) => [field.id, field]));
  const outcomes = new Map((results ?? []).map((field) => [field.id, field.correct]));
  function control(fieldId: string, multiline = false): ReactNode {
    const field = fields.get(fieldId);
    if (!field) return <span role="alert" className={styles.missing}>作答位置暂不可用</span>;
    const result = outcomes.get(fieldId);
    if (field.kind === "drawing") return <Drawing field={field} value={answers[field.id] ?? ""} onChange={onChange} disabled={disabled} viewBox={[0, 0, 600, 360]} label={field.label} shapes={[]} result={result} />;
    const common = { "aria-label": field.label, "aria-invalid": result === false ? true as const : undefined, "data-field": field.id, "data-result": result === true ? "correct" : result === false ? "incorrect" : undefined, disabled, value: answers[field.id] ?? "", onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(field.id, event.target.value) };
    if (field.kind === "choice" && field.choices?.length) return <select className={styles.blank} {...common}><option value="">—</option>{field.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select>;
    if (multiline) return <textarea className={styles.response} rows={3} {...common} />;
    return <input className={styles.blank} type="text" autoComplete="off" spellCheck={false} style={{ width: `${Math.min(16, Math.max(7, (answers[field.id]?.length ?? 0) + 2))}ch` }} {...common} />;
  }
  function inline(nodes: BankNativeInline[], key: string): ReactNode[] {
    return nodes.map((node, index) => <span key={`${key}-${index}`}>{node.type === "text" ? node.value : node.type === "math" ? <Formula tex={node.tex} /> : node.type === "fraction" ? <span className={styles.fraction} data-native-fraction="true"><span className={styles.numerator}>{inline(node.numerator, `${key}-${index}-numerator`)}</span><span className={styles.denominator}>{inline(node.denominator, `${key}-${index}-denominator`)}</span></span> : control(node.fieldId)}</span>);
  }
  return <div className={styles.content} data-native-question="true">{content.blocks.map((block, index) => {
    const key = `block-${index}`;
    switch (block.type) {
      case "heading": return <h3 key={key} className={styles.heading}>{block.text}</h3>;
      case "paragraph": return <p key={key} className={styles.paragraph}>{inline(block.content, key)}</p>;
      case "table": {
        const arithmetic = block.presentation === "arithmetic";
        // Decimal points occupy a narrow alignment column, not a digit-width
        // cell. Never shrink a column that also contains a digit or input.
        const decimalColumns = new Set(arithmetic ? block.rows[0].flatMap((_, c) => {
          const cells = block.rows.map(row => row[c]);
          return cells.some(cell => cell.some(node => node.type === "text" && node.value === ".")) && cells.every(cell => cell.length === 0 || cell.every(node => node.type === "text" && /^(?:\.|[─━]+)$/.test(node.value))) ? [c] : [];
        }) : []);
        return <div key={key} className={styles.tableScroll}><table className={`${styles.table}${arithmetic ? ` ${styles.arithmetic}` : ""}`}><tbody>{block.rows.map((row, r) => {
          const separator = arithmetic && row.some(cell => cell.length > 0) && row.every(cell => cell.length === 0 || cell.every(node => node.type === "text" && /^[─━]+$/.test(node.value)));
          return <tr key={r} data-separator={separator || undefined}>{row.map((cell, c) => <td key={c} data-decimal={decimalColumns.has(c) || undefined} data-bar={separator && cell.length > 0 || undefined} aria-hidden={separator || undefined}>{separator ? null : inline(cell, `${key}-${r}-${c}`)}</td>)}</tr>;
        })}</tbody></table></div>;
      }
      case "diagram": return <Diagram key={key} viewBox={block.viewBox} label={block.label} shapes={block.shapes} />;
      case "drawing": {
        const field = fields.get(block.fieldId);
        return field ? <Drawing key={key} field={field} value={answers[field.id] ?? ""} onChange={onChange} disabled={disabled} viewBox={block.viewBox} label={block.label} shapes={block.shapes} result={outcomes.get(field.id)} /> : <p key={key} role="alert" className={styles.missing}>画板暂不可用</p>;
      }
      case "response": return <div key={key} className={styles.responseField}><label>{fields.get(block.fieldId)?.label}{control(block.fieldId, block.multiline)}</label></div>;
    }
  })}</div>;
}
