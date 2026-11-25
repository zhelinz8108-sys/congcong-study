"use client";

import { useRef, useState } from "react";
import type { ClipboardEvent, MouseEvent, ReactNode } from "react";

function copyMath(event: ClipboardEvent<HTMLElement>) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer;
  const parent = common instanceof Element ? common : common.parentElement;
  const formula = parent?.closest("math");
  const selectionCopy = range.cloneContents();
  if (!formula && !selectionCopy.querySelector("math")) return;

  // A selection within a single fraction may start below the MathML root.
  let selected: Node = selectionCopy;
  for (let node = parent; formula && node && formula.contains(node); node = node.parentElement) {
    const wrapper = node.cloneNode(false);
    wrapper.appendChild(selected);
    selected = wrapper;
  }
  const copy = document.createElement("div");
  copy.append(selected);
  const richText = copy.innerHTML;
  for (const fraction of copy.querySelectorAll("mfrac")) {
    fraction.replaceWith(Array.from(fraction.children, part => part.textContent).join("/"));
  }
  for (const operator of copy.querySelectorAll("math mo")) operator.replaceWith(` ${operator.textContent} `);
  for (const math of copy.querySelectorAll("math")) math.replaceWith((math.textContent ?? "").trim());
  copy.querySelectorAll('svg, button, [aria-hidden="true"]').forEach(node => node.remove());

  // innerText keeps paragraph breaks when a selection spans examples.
  copy.className = "atlas-clipboard";
  copy.setAttribute("aria-hidden", "true");
  event.currentTarget.append(copy);
  try {
    event.clipboardData.setData("text/plain", copy.innerText);
    event.clipboardData.setData("text/html", richText);
    event.preventDefault();
  } finally {
    copy.remove();
  }
}

export function MathAtlasArticle({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const enlarged = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("");

  function enlargeDiagram(event: MouseEvent<HTMLElement>) {
    if (!(event.target instanceof Element) || !dialog.current || !enlarged.current) return;
    const button = event.target.closest<HTMLButtonElement>("button.atlas-zoom");
    const original = button?.closest<HTMLElement>(".atlas-diagram");
    const svg = original?.querySelector("svg");
    if (!original || !svg) return;

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
    drawing.style.width = Math.max(680, svg.viewBox.baseVal.width * 1.35) + "px";
    enlarged.current.replaceChildren(drawing);
    setTitle(original.getAttribute("aria-label") ?? "数学图解");
    dialog.current.showModal();
  }

  return (
    <>
      <article className="atlas-article" aria-label="图册正文" onClick={enlargeDiagram} onCopy={copyMath}>{children}</article>
      <dialog ref={dialog} className="atlas-detail" aria-label="放大图解" onClose={() => enlarged.current?.replaceChildren()}>
        <div className="atlas-detail-heading">
          <p>{title}</p><button type="button" onClick={() => dialog.current?.close()}>关闭</button>
        </div>
        <div ref={enlarged} className="atlas-detail-image" tabIndex={0} role="region" aria-label="图解细节" />
      </dialog>
    </>
  );
}
