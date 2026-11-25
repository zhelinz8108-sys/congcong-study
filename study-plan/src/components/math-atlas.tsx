"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

type Illustration = { src: string; title: string; width: number };

export function MathAtlasArticle({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [figure, setFigure] = useState<Illustration | null>(null);

  useEffect(() => {
    if (figure && !dialog.current?.open) dialog.current?.showModal();
  }, [figure]);

  function enlargeDiagram(event: MouseEvent<HTMLElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button.atlas-diagram");
    const svg = button?.querySelector("svg");
    if (!button || !svg) return;
    const image = svg.cloneNode(true) as SVGSVGElement;
    image.setAttribute("font-family", "system-ui, sans-serif");
    const source = new XMLSerializer().serializeToString(image);
    setFigure({
      src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source),
      title: button.getAttribute("aria-label")?.replace(/^放大图解：/, "") || "数学图解",
      width: Math.max(680, svg.viewBox.baseVal.width * 1.35),
    });
  }

  return (
    <>
      <article className="atlas-article" aria-label="图册正文" onClick={enlargeDiagram}>{children}</article>
      <dialog ref={dialog} className="atlas-detail" aria-label="放大图解" onClose={() => setFigure(null)}>
        {figure && <>
          <div className="atlas-detail-heading">
            <p>{figure.title}</p><button type="button" onClick={() => dialog.current?.close()}>关闭</button>
          </div>
          <div className="atlas-detail-image" tabIndex={0} role="region" aria-label="图解细节">
            {/* The enlarged illustration is the same local inline SVG as the one in the article. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={figure.src} alt={figure.title} width={figure.width} />
          </div>
        </>}
      </dialog>
    </>
  );
}
