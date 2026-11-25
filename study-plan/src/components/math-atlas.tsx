"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs";
import index from "@/data/math-atlas-index.json";
import "pdfjs-dist/legacy/web/pdf_viewer.css";
import "./math-atlas.css";

const pdfUrl = "/api/grade-six-reviews/math";
const pages = index.flatMap(chapter => chapter.titles);

function pageFromHash(count: number) {
  const match = /^#(?:atlas-|page=)(\d+)$/.exec(window.location.hash);
  const n = Number(match?.[1]);
  return n >= 1 && n <= count ? n : 1;
}

export function MathAtlas() {
  const container = useRef<HTMLDivElement>(null);
  const sheets = useRef<HTMLDivElement>(null);
  const reader = useRef<PDFViewer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [number, setNumber] = useState(1);
  const [count, setCount] = useState(pages.length);
  const [zoom, setZoom] = useState(100);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const scrollArea = container.current;
    const pageStack = sheets.current;
    if (!scrollArea || !pageStack) return;
    const readerPath = window.location.pathname;
    const lifetime = new AbortController();
    let task: PDFDocumentLoadingTask | undefined;
    let resize: ResizeObserver | undefined;
    let view: PDFViewer | undefined;

    (async () => {
      // The viewer component uses the pdfjsLib global installed by the matching core module.
      const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const { PDFViewer, EventBus, PDFLinkService } = await import("pdfjs-dist/legacy/web/pdf_viewer.mjs");
      if (lifetime.signal.aborted) return;
      pdf.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdf.version}/worker.js`;
      task = pdf.getDocument({ url: pdfUrl, withCredentials: true, isEvalSupported: false });
      const doc = await task.promise;
      if (lifetime.signal.aborted) return;

      const bus = new EventBus();
      const links = new PDFLinkService({ eventBus: bus, ignoreDestinationZoom: true });
      const options = { container: scrollArea, viewer: pageStack, eventBus: bus, linkService: links, abortSignal: lifetime.signal };
      const viewer = new PDFViewer(options);
      view = reader.current = viewer;
      let initialized = false;
      const restorePage = () => { viewer.currentPageNumber = pageFromHash(doc.numPages); };
      bus.on("pagesinit", () => {
        viewer.currentScaleValue = "auto";
        restorePage();
        initialized = true;
        setNumber(viewer.currentPageNumber);
        setCount(doc.numPages);
        setStatus("ready");
      }, { signal: lifetime.signal });
      bus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
        if (!initialized || lifetime.signal.aborted || !scrollArea.isConnected || window.location.pathname !== readerPath) return;
        setNumber(pageNumber);
        const hash = "#atlas-" + pageNumber;
        if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
      }, { signal: lifetime.signal });
      bus.on("scalechanging", ({ scale }: { scale: number }) => setZoom(Math.round(scale * 100)), { signal: lifetime.signal });
      window.addEventListener("hashchange", restorePage, { signal: lifetime.signal });
      let width = scrollArea.clientWidth;
      resize = new ResizeObserver(() => {
        if (width === scrollArea.clientWidth) return;
        width = scrollArea.clientWidth;
        const scale = viewer.currentScaleValue;
        if (scale === "auto" || scale === "page-width") viewer.currentScaleValue = scale;
      });
      resize.observe(scrollArea);
      links.setViewer(viewer);
      links.setDocument(doc);
      viewer.setDocument(doc);
    })().catch(() => {
      if (!lifetime.signal.aborted) setStatus("error");
    });

    return () => {
      lifetime.abort();
      resize?.disconnect();
      // PDF.js uses null to detach a document and release its page layers.
      // @ts-expect-error The upstream declaration only describes attaching a document.
      view?.setDocument(null);
      reader.current = null;
      void task?.destroy();
    };
  }, [attempt]);

  function selectPage(n: number) {
    if (window.location.hash === "#atlas-" + n && reader.current) reader.current.currentPageNumber = n;
    else window.location.hash = "atlas-" + n;
  }

  return (
    <section className="math-atlas-pdf" aria-label="六上数学全知识点图解">
      <header className="atlas-pdf-heading">
        <h1>六上数学全知识点图解</h1>
        <div className="atlas-pdf-files"><a href={pdfUrl}>打开原件</a><a href={pdfUrl + "?download=1"} download>下载 PDF</a></div>
      </header>
      <nav className="atlas-pdf-tools" aria-label="PDF 阅读工具">
        <select aria-label="跳到 PDF 指定页" value={number} onChange={e => selectPage(Number(e.target.value))} disabled={status !== "ready"}>
          {pages.map((title, i) => <option key={i} value={i + 1}>{i + 1} · {title}</option>)}
        </select>
        <span className="atlas-pdf-count" aria-live="off">{number} / {count}</span>
        <div className="atlas-pdf-zoom">
          <button type="button" aria-label="缩小 PDF" disabled={status !== "ready" || zoom <= 10} onClick={() => reader.current?.decreaseScale()}>−</button>
          <button type="button" aria-label="适合页面宽度" title="适合页面宽度" disabled={status !== "ready"} onClick={() => { if (reader.current) reader.current.currentScaleValue = "page-width"; }}>适宽</button>
          <button type="button" aria-label="放大 PDF" disabled={status !== "ready" || zoom >= 1000} onClick={() => reader.current?.increaseScale()}>+</button>
        </div>
      </nav>
      <div className="atlas-pdf-stage">
        <div ref={container} className="atlas-pdf-scroll" role="region" tabIndex={0} aria-label="图册正文" aria-busy={status === "loading"} data-pdf-source={pdfUrl}>
          <div ref={sheets} className="pdfViewer" />
        </div>
        {status === "loading" && <p className="atlas-pdf-message" role="status">正在打开完整 PDF…</p>}
        {status === "error" && <div className="atlas-pdf-message" role="alert">
          <p>这次没能载入图册。</p>
          <button type="button" onClick={() => { setStatus("loading"); setAttempt(n => n + 1); }}>重新载入</button>
          <a href={pdfUrl}>直接打开 PDF 原件</a>
        </div>}
      </div>
    </section>
  );
}
