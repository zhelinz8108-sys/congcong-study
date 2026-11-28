"use client";
import { useRef, useState } from "react";
import { readPath, readPoint, type ExamQuestion, type ExamValues, type GridPoint } from "@/lib/math-final-exams";

export default function ExamDrawing({ question, values, locked, change }: {
  question: ExamQuestion; values: ExamValues; locked: boolean; change: (id: string, value: string) => void;
}) {
  const grid = question.grid!;
  const fields = question.fields.filter(f => f.kind === "point" || f.kind === "path");
  const [active, setActive] = useState(0);
  const ref = useRef<SVGSVGElement>(null);
  const points = { ...grid.points };
  for (const field of fields) {
    const coord = readPoint(values[field.id] ?? "");
    if (coord) points[field.label] = coord;
  }
  const routeField = fields[0];
  const route = readPath(values[routeField.id] ?? "") ?? [grid.points.P].filter(Boolean);
  function select(point: GridPoint) {
    if (locked) return;
    if (grid.route) {
      const next = [...route, point];
      if (next.length <= 32) change(routeField.id, next.map(p => p.join(",")).join(";"));
    } else {
      change(fields[active].id, point.join(","));
      setActive(Math.min(active + 1, fields.length - 1));
    }
  }
  function coords([x, y]: GridPoint) { return [36 + 17 * x, 151 - 17 * y]; }
  const lines: [GridPoint, GridPoint][] = grid.route
    ? route.slice(1).map((p, i) => [route[i], p])
    : grid.edges.filter(([a,b]) => points[a] && points[b]).map(([a,b]) => [points[a], points[b]]);
  return <div className="exam-drawing">
    {!locked && <div className="draw-controls">
      {grid.route ? <><span>从 P 起，点转弯点和终点连线。</span>
        <button type="button" disabled={route.length < 2} onClick={() => change(routeField.id, route.length <= 2 ? "" : route.slice(0,-1).map(p => p.join(",")).join(";"))}>撤回一点</button></>
        : <><span>点选格点放置</span>{fields.map((f, i) => <button type="button" key={f.id} aria-pressed={active === i} onClick={() => setActive(i)}>{f.label}</button>)}</>}
    </div>}
    <div className="draw-surface">
      <div className="draw-base" dangerouslySetInnerHTML={{ __html: question.figure! }} />
      <svg ref={ref} viewBox="0 0 205 171" className="draw-layer" aria-label="作答方格，可点格点，也可在下方输入坐标"
        onClick={event => {
          const matrix = ref.current?.getScreenCTM();
          if (!matrix || locked) return;
          const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
          const x = Math.round((p.x - 36) / 17), y = Math.round((151 - p.y) / 17);
          if (x >= 0 && x <= 8 && y >= 0 && y <= 8) select([x, y]);
        }}>
        <g fill="none" stroke="#ae542e" strokeWidth="2" strokeLinejoin="round">
          {lines.map(([a, b], i) => { const [x1,y1] = coords(a), [x2,y2] = coords(b); return <line key={i} {...{x1,y1,x2,y2}} />; })}
          {grid.circle && points.O && points.N && <circle cx={coords(points.O)[0]} cy={coords(points.O)[1]} r={17 * Math.hypot(points.N[0]-points.O[0], points.N[1]-points.O[1])}/>}
        </g>
        {Object.entries(points).filter(([name]) => !grid.points[name]).map(([name, point]) => {
          const [x,y] = coords(point);
          return <g key={name} fill="#973d23"><circle cx={x} cy={y} r="2.7"/><text x={x+3} y={y-3} fontSize="9">{name}</text></g>;
        })}
      </svg>
    </div>
  </div>;
}
