"use client";

import { useRef, useState } from "react";
import type { ClipboardEvent, MouseEvent, ReactNode } from "react";

function clipboardContents(range: Range, host: HTMLElement) {
  const common = range.commonAncestorContainer;
  const parent = common instanceof Element ? common : common.parentElement;
  const context = parent?.closest("math, .atlas-label, .atlas-strip, .atlas-model");
  const selectionCopy = range.cloneContents();
  if (!context && !selectionCopy.querySelector("math, .atlas-label, .atlas-strip")) return;

  // cloneContents omits ancestors when only part of a label or fraction is selected.
  let selected: Node = selectionCopy;
  for (let node = parent; context && node && context.contains(node); node = node.parentElement) {
    const wrapper = node.cloneNode(false);
    wrapper.appendChild(selected);
    selected = wrapper;
  }
  const copy = document.createElement("div");
  copy.append(selected);
  // Coordinates belong to the diagram. Pasted labels follow the editor's text flow.
  copy.querySelectorAll('svg, button, [aria-hidden="true"]').forEach(node => node.remove());
  for (const label of copy.querySelectorAll<HTMLElement>(".atlas-label")) {
    const span = document.createElement("span");
    span.style.color = label.style.color;
    span.style.fontWeight = label.style.fontWeight;
    span.textContent = label.textContent;
    label.replaceWith(span);
  }
  for (const layer of copy.querySelectorAll(".atlas-labels")) layer.replaceWith(...layer.childNodes);
  const strips = new Map<HTMLTableElement, string>();
  for (const table of copy.querySelectorAll<HTMLTableElement>("table.atlas-strip")) {
    const colors = new Map<string, string>();
    const marks: string[] = [];
    table.style.cssText = `width:${Number(table.dataset.width)}px;max-width:100%;table-layout:fixed;border-collapse:collapse;margin:.25em auto`;
    table.removeAttribute("class");
    for (const cell of table.querySelectorAll("td")) {
      const { backgroundColor, width } = cell.style;
      const edge = cell.style.getPropertyValue("--edge") || "#45362c";
      if (!cell.getAttribute("aria-label")?.includes("未涂色") && !colors.has(backgroundColor)) {
        colors.set(backgroundColor, ["■", "▧", "▨"][colors.size] ?? "■");
      }
      marks.push(colors.get(backgroundColor) ?? "□");
      cell.style.cssText = `width:${width};height:${Number(table.dataset.height)}px;padding:0;border:1px solid ${edge}`;
      cell.style.backgroundColor = backgroundColor;
      cell.textContent = "\u00a0";
    }
    strips.set(table, marks.join(""));
  }
  for (const drawing of copy.querySelectorAll<HTMLElement>(".atlas-diagram, .atlas-model")) {
    const block = document.createElement("div");
    if (drawing.matches(".atlas-model")) {
      block.style.cssText = `width:${Number(drawing.dataset.width)}px;max-width:100%;text-align:center`;
    }
    block.append(...drawing.childNodes);
    drawing.replaceWith(block);
  }
  const richText = copy.innerHTML;
  for (const [table, marks] of strips) {
    const row = document.createElement("div");
    row.textContent = marks;
    table.replaceWith(row);
  }
  for (const fraction of copy.querySelectorAll("mfrac")) {
    fraction.replaceWith(Array.from(fraction.children, part => part.textContent).join("/"));
  }
  for (const operator of copy.querySelectorAll("math mo")) operator.replaceWith(` ${operator.textContent} `);
  for (const math of copy.querySelectorAll("math")) math.replaceWith((math.textContent ?? "").trim());

  // innerText keeps paragraph breaks when a selection spans examples.
  copy.className = "atlas-clipboard";
  copy.setAttribute("aria-hidden", "true");
  host.append(copy);
  try {
    return { text: copy.innerText, html: richText };
  } finally {
    copy.remove();
  }
}

function copyAtlasText(event: ClipboardEvent<HTMLElement>) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const contents = clipboardContents(selection.getRangeAt(0), event.currentTarget);
  if (!contents) return;
  event.clipboardData.setData("text/plain", contents.text);
  event.clipboardData.setData("text/html", contents.html);
  event.preventDefault();
}

export function MathAtlasArticle({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const enlarged = useRef<HTMLDivElement>(null);
  const [figure, setFigure] = useState({ title: "", hasBars: false });
  const [copyLabel, setCopyLabel] = useState("复制图解");

  function enlargeDiagram(event: MouseEvent<HTMLElement>) {
    if (!(event.target instanceof Element) || !dialog.current || !enlarged.current) return;
    const control = event.target.closest("button.atlas-zoom, table.atlas-strip");
    if (control?.matches("table") && !window.getSelection()?.isCollapsed) return;
    const original = control?.closest<HTMLElement>(".atlas-diagram");
    if (!original) return;
    const model = original.querySelector<HTMLElement>(".atlas-model");
    const width = model ? Number(model.dataset.width) : original.querySelector("svg")?.viewBox.baseVal.width;
    if (!width) return;

    const drawing = original.cloneNode(true) as HTMLElement;
    drawing.querySelector("button")?.remove();
    // Keep the enlarged arrows, patterns and clips scoped to their own drawing.
    for (const element of drawing.querySelectorAll("[id]")) element.id = "atlas-detail-" + element.id;
    for (const element of drawing.querySelectorAll('[fill^="url("], [marker-end], [clip-path]')) {
      for (const attr of ["fill", "marker-end", "clip-path"]) {
        const value = element.getAttribute(attr);
        if (value?.startsWith("url(#")) element.setAttribute(attr, value.replace("url(#", "url(#atlas-detail-"));
      }
    }
    drawing.style.width = Math.max(680, width * 1.35) + "px";
    enlarged.current.replaceChildren(drawing);
    setFigure({ title: original.getAttribute("aria-label") ?? "数学图解", hasBars: !!model });
    setCopyLabel("复制图解");
    original.querySelector<HTMLButtonElement>("button.atlas-zoom")?.focus({ preventScroll: true });
    dialog.current.showModal();
  }

  async function copyOpenDiagram() {
    const model = enlarged.current?.querySelector<HTMLElement>(".atlas-model");
    if (!model || !dialog.current) return;
    const range = document.createRange();
    range.selectNodeContents(model);
    const contents = clipboardContents(range, dialog.current);
    if (!contents) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([contents.html], { type: "text/html" }),
        "text/plain": new Blob([contents.text], { type: "text/plain" }),
      })]);
    } catch {
      if (!enlarged.current?.contains(model)) return;
      const selection = window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand("copy")) {
        setCopyLabel("请用系统复制");
        return;
      }
      selection.removeAllRanges();
    }
    if (enlarged.current?.contains(model)) setCopyLabel("已复制");
  }

  return (
    <>
      <article className="atlas-article" aria-label="图册正文" onClick={enlargeDiagram} onCopy={copyAtlasText}>{children}</article>
      <dialog ref={dialog} className="atlas-detail" aria-label="放大图解" onCopy={copyAtlasText} onClose={() => enlarged.current?.replaceChildren()}>
        <div className="atlas-detail-heading">
          <p>{figure.title}</p>
          {figure.hasBars && <button type="button" onClick={copyOpenDiagram} aria-live="polite">{copyLabel}</button>}
          <button type="button" onClick={() => dialog.current?.close()}>关闭</button>
        </div>
        <div ref={enlarged} className="atlas-detail-image" tabIndex={0} role="region" aria-label="图解细节" />
      </dialog>
    </>
  );
}
