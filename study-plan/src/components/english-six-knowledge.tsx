"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import type {
  EnglishSixKnowledgeBlock,
  EnglishSixKnowledgeBookSummary,
  EnglishSixKnowledgeInline,
  EnglishSixKnowledgeUnit,
  EnglishSixKnowledgeUnitSummary,
} from "@/lib/english-six-knowledge";
import styles from "./english-six-knowledge.module.css";

function ReadingFrame({ children, subjectId, readerUnit }: { children: ReactNode; subjectId: string; readerUnit?: number }) {
  const [fontScale, setFontScale] = useState(100);
  return <main
    className={styles.page}
    style={{ "--reading-scale": fontScale / 100 } as CSSProperties}
    data-knowledge-hub={readerUnit === undefined ? true : undefined}
    data-knowledge-reader={readerUnit !== undefined ? true : undefined}
    data-unit={readerUnit}
  >
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <Link href={`/subjects/${subjectId}`} className={styles.back}>← 返回英语主页</Link>
        <div className={styles.fontControls} role="group" aria-label="阅读字号">
          <button type="button" onClick={() => setFontScale(value => Math.max(70, value - 10))} disabled={fontScale === 70} aria-label="减小字号">A−</button>
          <output aria-live="polite" aria-label="当前字号">{fontScale}%</output>
          <button type="button" onClick={() => setFontScale(value => Math.min(150, value + 10))} disabled={fontScale === 150} aria-label="增大字号">A+</button>
        </div>
      </div>
      {children}
    </div>
  </main>;
}

function InlineText({ runs }: { runs: EnglishSixKnowledgeInline[] }) {
  return runs.map((run, index) => {
    let content: ReactNode = run.text;
    if (run.underline) content = <u>{content}</u>;
    if (run.italic) content = <em>{content}</em>;
    if (run.bold) content = <strong>{content}</strong>;
    return <span key={index} className={run.ipa ? styles.ipa : undefined} data-ipa={run.ipa ? true : undefined} lang={run.ipa ? "en-fonipa" : undefined}>{content}</span>;
  });
}

function KnowledgeBlock({ block, sectionTitle }: { block: EnglishSixKnowledgeBlock; sectionTitle: string }) {
  if (block.kind === "heading") {
    const Heading = block.level === 4 ? "h4" : "h3";
    return <Heading className={styles.subheading}>{block.text}</Heading>;
  }
  if (block.kind === "paragraph") return <p className={block.tone === "note" ? styles.note : styles.paragraph}><InlineText runs={block.runs} /></p>;
  if (block.kind === "callout") return <aside className={styles.callout} role="note">{block.paragraphs.map((paragraph, index) => <p key={index}><InlineText runs={paragraph} /></p>)}</aside>;
  return <div className={styles.tableWrap}>
    <table className={styles.table} aria-label={sectionTitle} role="table">
      {block.headers?.length ? <thead role="rowgroup"><tr role="row">{block.headers.map((header, index) => <th key={index} scope="col" role="columnheader"><InlineText runs={header} /></th>)}</tr></thead> : null}
      <tbody role="rowgroup">{block.rows.map((row, rowIndex) => <tr key={rowIndex} role="row">{row.map((cell, cellIndex) => <td key={cellIndex} role="cell">
        {block.headers?.[cellIndex]?.some(run => run.text.trim()) && <span className={styles.mobileCellLabel} aria-hidden="true"><InlineText runs={block.headers[cellIndex]} /></span>}
        <span className={styles.cellContent} data-knowledge-cell><InlineText runs={cell} /></span>
      </td>)}</tr>)}</tbody>
    </table>
  </div>;
}

export function EnglishSixKnowledgeHub({ subjectId, bookSummary }: { subjectId: string; bookSummary: EnglishSixKnowledgeBookSummary }) {
  const base = `/subjects/${subjectId}/english/six-knowledge`;
  return <ReadingFrame subjectId={subjectId}>
    <header className={styles.hero}>
      <div className={styles.eyebrow}><span>英语 · 六年级上册</span><span className={styles.edition}>{bookSummary.edition} 新版</span></div>
      <h1>六上知识点</h1>
      <p className={styles.description}>词汇与句型、语法与易错点、语音和写作，按单元一起学。</p>
      <p className={styles.bookTitle}>{bookSummary.title}</p>
    </header>
    <nav className={styles.unitDirectory} aria-label="六上知识点单元目录">
      <div className={styles.directoryHeading}><h2>选择单元</h2><span>{bookSummary.units.length} 个单元</span></div>
      <ol className={styles.unitList}>{bookSummary.units.map(unit => <li key={unit.number}>
        <Link href={`${base}/${unit.number}`} prefetch={false} className={styles.unitCard} data-unit={unit.number}>
          <span className={styles.unitNumber}>Unit {unit.number}</span>
          <h3>{unit.title}</h3>
          <div className={styles.cardBottom}><span>{unit.sectionCount} 节知识讲解</span><span className={styles.enter}>进入单元 <span aria-hidden="true">↗</span></span></div>
        </Link>
      </li>)}</ol>
    </nav>
    <p className={styles.directoryNote}>进入单元后，可以按章节查找，也可以从头向下阅读。</p>
  </ReadingFrame>;
}

export function EnglishSixKnowledgeReader({ subjectId, unit, units }: { subjectId: string; unit: EnglishSixKnowledgeUnit; units: EnglishSixKnowledgeUnitSummary[] }) {
  const base = `/subjects/${subjectId}/english/six-knowledge`;
  const currentIndex = units.findIndex(item => item.number === unit.number);
  const previous = currentIndex > 0 ? units[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 ? units[currentIndex + 1] : undefined;
  return <ReadingFrame subjectId={subjectId} readerUnit={unit.number}>
    <Link href={base} className={styles.directoryBack}>← 六上知识点目录</Link>
    <header className={styles.readerHeader}>
      <p className={styles.readerEyebrow}>六上英语 · 2026 新版</p>
      <span className={styles.readerUnit}>Unit {unit.number}</span>
      <h1>{unit.title}</h1>
    </header>
    <nav className={styles.unitSwitch} aria-label="选择单元">{units.map(item => <Link
      key={item.number}
      href={`${base}/${item.number}`}
      prefetch={false}
      className={styles.unitTab}
      aria-current={item.number === unit.number ? "page" : undefined}
      aria-label={`Unit ${item.number} ${item.title}`}
      title={item.title}
    >Unit {item.number}</Link>)}</nav>
    <nav className={styles.chapterNavigation} aria-label="本单元章节">
      <details open>
        <summary><span>本单元目录</span><span>{unit.sections.length} 节 <span aria-hidden="true">⌄</span></span></summary>
        <ol>{unit.sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`}><span className={styles.chapterNumber}>{String(index + 1).padStart(2, "0")}</span><span>{section.title}</span><span className={styles.anchorArrow} aria-hidden="true">↓</span></a></li>)}</ol>
      </details>
    </nav>
    <article className={styles.article} aria-label={`Unit ${unit.number} 知识点正文`}>
      {unit.sections.map((section, index) => <section className={styles.section} id={section.id} key={section.id} data-knowledge-section>
        <header className={styles.sectionHeading}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><h2>{section.title}</h2></header>
        <div className={styles.sectionContent}>{section.blocks.map((block, blockIndex) => <KnowledgeBlock key={blockIndex} block={block} sectionTitle={section.title} />)}</div>
        <a href="#" className={styles.backToDirectory}>返回页首 ↑</a>
      </section>)}
    </article>
    <nav className={styles.previousNext} aria-label="前后单元">
      {previous && <Link href={`${base}/${previous.number}`} prefetch={false} rel="prev" className={styles.neighbor}><span>← 上一单元</span><strong>Unit {previous.number} · {previous.title}</strong></Link>}
      <Link href={base} className={styles.allUnits}>全部单元</Link>
      {next && <Link href={`${base}/${next.number}`} prefetch={false} rel="next" className={styles.neighbor}><span>下一单元 →</span><strong>Unit {next.number} · {next.title}</strong></Link>}
    </nav>
  </ReadingFrame>;
}
