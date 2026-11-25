"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MouseEvent } from "react";
import index from "@/data/math-atlas-index.json";
import "./math-atlas.css";

const titles = index.flatMap(group => group.titles);
const total = titles.length;
let start = 1;
const chapters = index.map(group => {
  const first = start;
  start += group.titles.length;
  return { ...group, first };
});

function readPage() {
  const match = /^#atlas-([1-9]\d*)$/.exec(window.location.hash);
  const number = match ? Number(match[1]) : 1;
  return number <= total ? number : 1;
}

function onHashChange(change: () => void) {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}

function goTo(number: number) {
  window.location.hash = "atlas-" + number;
}

type PageContent = { number: number; html: string } | { number: number; error: true };
type Illustration = { src: string; title: string; width: number };

export function MathAtlas() {
  const number = useSyncExternalStore(onHashChange, readPage, () => 1);
  const [result, setResult] = useState<PageContent | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [illustration, setIllustration] = useState<Illustration | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = result?.number === number ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    if (viewport.current) viewport.current.scrollTop = 0;
    (async () => {
      const response = await fetch("/api/grade-six-reviews/math/pages/" + number, { signal: controller.signal });
      if (!response.ok) throw new Error("Atlas page unavailable");
      const data = await response.json();
      if (data.number !== number || typeof data.html !== "string") throw new Error("Invalid atlas page");
      if (!controller.signal.aborted) setResult({ number, html: data.html });
    })().catch(() => {
      if (!controller.signal.aborted) setResult({ number, error: true });
    });
    return () => controller.abort();
  }, [number, attempt]);

  useEffect(() => {
    if (illustration && !dialog.current?.open) dialog.current?.showModal();
  }, [illustration]);

  function clickPage(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("a")) {
      viewport.current?.focus({ preventScroll: true });
      return;
    }
    const button = event.target.closest("button.atlas-diagram");
    const svg = button?.querySelector("svg");
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("font-family", "system-ui, sans-serif");
    const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(copy));
    const title = button?.getAttribute("aria-label")?.replace(/^放大图解：/, "") || "图解";
    setIllustration({ src, title, width: Math.max(660, svg.viewBox.baseVal.width * 1.25) });
  }

  return (
    <section className="math-atlas" aria-label="六上数学全知识点图解">
      <header className="atlas-heading">
        <h2>六上数学全知识点图解</h2>
        <a href="/api/grade-six-reviews/math?download=1" download>下载 PDF</a>
      </header>
      <nav className="atlas-nav" aria-label="图册翻页">
        <button type="button" disabled={number === 1} onClick={() => goTo(number - 1)} aria-label="上一页">←</button>
        <select aria-label="按章节或知识点跳页" value={number} onChange={e => goTo(Number(e.target.value))}>
          {chapters.map(group => (
            <optgroup key={group.first} label={group.label}>
              {group.titles.map((title, offset) => (
                <option key={title} value={group.first + offset}>{group.first + offset} · {title}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="atlas-counter" aria-live="polite" aria-atomic="true">{number} / {total}</span>
        <button type="button" disabled={number === total} onClick={() => goTo(number + 1)} aria-label="下一页">→</button>
      </nav>
      <div className="atlas-viewport" ref={viewport} tabIndex={0} role="region" aria-label="图册正文" aria-busy={!current} onClick={clickPage}>
        {current && "html" in current ? (
          // The authenticated service verifies the authored page bundle against its pinned edition digest.
          <div className="atlas-sheet" dangerouslySetInnerHTML={{ __html: current.html }} />
        ) : current ? (
          <div className="atlas-status" role="alert">
            <p>这页暂时没能载入。</p>
            <button type="button" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>重新载入</button>
          </div>
        ) : <p className="atlas-status" role="status">正在载入第 {number} 页…</p>}
      </div>
      <dialog ref={dialog} className="atlas-detail" aria-label="图解放大阅读" onClose={() => setIllustration(null)}>
        {illustration && <>
          <div className="atlas-detail-head"><p>{illustration.title}</p><button type="button" onClick={() => dialog.current?.close()}>收起大图</button></div>
          <div className="atlas-detail-scroll" tabIndex={0} role="region" aria-label="放大的图解，可左右滑动">
            {/* The SVG is a self-contained image from the verified page currently on screen. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={illustration.src} alt={illustration.title} width={illustration.width} style={{ width: illustration.width }} />
          </div>
        </>}
      </dialog>
    </section>
  );
}
