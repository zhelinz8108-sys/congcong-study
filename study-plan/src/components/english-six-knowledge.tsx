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
import { KnowledgeAudioProvider, KnowledgeAudioControls, KnowledgeAudioButton, KnowledgeAudioPlaylistButton, knowledgeSpeechBlockId, useKnowledgeAudioActiveItem } from "./english-six-knowledge-audio";
import { layoutKnowledgePhonetics, phoneticOnlyRuns, type KnowledgePhoneticRun } from "@/lib/english-six-knowledge-phonetics";

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

function TextRuns({ runs }: { runs: KnowledgePhoneticRun[] }) {
  return runs.map((run, index) => {
    let content: ReactNode = run.text;
    if (run.underline) content = <u>{content}</u>;
    if (run.italic) content = <em>{content}</em>;
    if (run.bold) content = <strong>{content}</strong>;
    const ipa = run.ipa || run.inferredIpa;
    return <span key={index} className={ipa ? styles.ipa : undefined} data-ipa={ipa ? true : undefined} lang={ipa ? "en-fonipa" : undefined}>{content}</span>;
  });
}

function InlineText({ runs }: { runs: EnglishSixKnowledgeInline[] }) {
  return layoutKnowledgePhonetics(runs).map((part, index) => part.kind === "text"
    ? <span key={index} data-phonetic-text><TextRuns runs={part.runs} /></span>
    : part.kind === "paired"
      ? <ruby key={index} className={styles.phoneticEntry} data-phonetic-entry><span data-phonetic-word><TextRuns runs={part.wordRuns} /></span><rt data-phonetic-sound><TextRuns runs={part.ipaRuns} /></rt></ruby>
      : <span key={index} className={styles.standaloneIpa} data-phonetic-standalone><TextRuns runs={part.ipaRuns} /></span>);
}

const plainText = (runs: EnglishSixKnowledgeInline[]) => runs.map(run => run.text).join("");
const vocabularyCellClasses = [styles.phoneticWordCell, styles.phoneticPosCell, styles.phoneticIpaCell, styles.phoneticMeaningCell];
function pastReadHint(row: EnglishSixKnowledgeInline[][]) {
  return row.length === 3 && plainText(row[1]).trim().toLowerCase() === "read"
    && /过去式/.test(plainText(row[2])) && /\/red\//.test(plainText(row[2]));
}

function KnowledgeBlock({ block, sectionTitle, blockId = "" }: { block: EnglishSixKnowledgeBlock; sectionTitle: string; blockId?: string }) {
  const activeItem = useKnowledgeAudioActiveItem();
  if (block.kind === "heading") {
    const Heading = block.level === 4 ? "h4" : "h3";
    return <Heading className={styles.subheading}>{block.text}</Heading>;
  }
  if (block.kind === "paragraph") return <p className={block.tone === "note" ? styles.note : styles.paragraph} data-speech-active={activeItem === `${blockId}-p` || undefined}><KnowledgeAudioButton itemId={`${blockId}-p`} /><InlineText runs={block.runs} /></p>;
  if (block.kind === "callout") return <aside className={styles.callout} role="note">{block.paragraphs.map((paragraph, index) => <p key={index} data-speech-active={activeItem === `${blockId}-note-${index}` || undefined}><KnowledgeAudioButton itemId={`${blockId}-note-${index}`} /><InlineText runs={paragraph} /></p>)}</aside>;
  const vocabulary = block.rows.length > 0 && block.rows.every(row => row.length === 4 && phoneticOnlyRuns(row[2]));
  const hasPastReadHint = !vocabulary && block.rows.some(pastReadHint);
  return <div className={styles.tableWrap}>
    <div className={styles.tableAudio}><KnowledgeAudioPlaylistButton blockIds={[blockId]} label="播放本表英文" /></div>
    <table className={`${styles.table} ${vocabulary ? styles.phoneticTable : hasPastReadHint ? styles.phoneticHintTable : ""}`} aria-label={sectionTitle} role="table">
      {block.headers?.length ? <thead role="rowgroup"><tr role="row">{block.headers.map((header, index) => <th key={index} scope="col" role="columnheader" className={vocabulary ? vocabularyCellClasses[index] : undefined}><InlineText runs={header} /></th>)}</tr></thead> : null}
      <tbody role="rowgroup">{block.rows.map((row, rowIndex) => {
        const hint = hasPastReadHint && pastReadHint(row);
        return <tr key={rowIndex} role="row" className={hint ? styles.phoneticHintRow : undefined} data-phonetic-row={vocabulary ? "vocabulary" : hint ? "past-read" : undefined}>{row.map((cell, cellIndex) => <td key={cellIndex} role="cell" className={vocabulary ? vocabularyCellClasses[cellIndex] : hint ? [styles.phoneticHintFirstCell, styles.phoneticHintWordCell, styles.phoneticHintMeaningCell][cellIndex] : undefined} data-phonetic-ipa-cell={vocabulary && cellIndex === 2 || undefined}>
        {block.headers?.[cellIndex]?.some(run => run.text.trim()) && <span className={styles.mobileCellLabel} aria-hidden="true"><InlineText runs={block.headers[cellIndex]} /></span>}
        <span className={styles.cellContent} data-knowledge-cell data-phonetic-word={(vocabulary && cellIndex === 0 || hint && cellIndex === 1) || undefined} data-speech-active={activeItem === `${blockId}-r${rowIndex}-c${cellIndex}` || undefined}><KnowledgeAudioButton itemId={`${blockId}-r${rowIndex}-c${cellIndex}`} /><InlineText runs={cell} /></span>
      </td>)}</tr>;
      })}</tbody>
    </table>
  </div>;
}

type KnowledgeTone = "blue" | "teal" | "violet" | "amber" | "rose" | "indigo" | "sky";

function knowledgeTone(title: string, fallback: KnowledgeTone = "teal"): KnowledgeTone {
  if (/易错|纠错|错误|陷阱/.test(title)) return "rose";
  if (/语音|发音|音标|文化/.test(title)) return "sky";
  if (/语法|过去时|现在时|将来时|疑问|感叹句/.test(title)) return "amber";
  if (/写作|作文|范文|素材|话题|审题/.test(title)) return "indigo";
  if (/句型|好句|例句|句子|对话|表达/.test(title)) return "violet";
  if (/词汇|单词|词义|词性/.test(title)) return "blue";
  if (/短语|词组|搭配/.test(title)) return "teal";
  return fallback;
}

function KnowledgeContent({ blocks, sectionTitle, sectionId }: { blocks: EnglishSixKnowledgeBlock[]; sectionTitle: string; sectionId: string }) {
  type Heading = Extract<EnglishSixKnowledgeBlock, { kind: "heading" }>;
  const groups: { heading?: Heading; blocks: { block: EnglishSixKnowledgeBlock; index: number }[]; tone: KnowledgeTone }[] = [];
  const sectionTone = knowledgeTone(sectionTitle);
  let parentTone = sectionTone;
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.kind === "heading") {
      const tone = knowledgeTone(block.text, block.level === 3 ? sectionTone : parentTone);
      if (block.level === 3) parentTone = tone;
      groups.push({ heading: block, blocks: [], tone });
    } else {
      if (!groups.length) groups.push({ blocks: [], tone: sectionTone });
      groups[groups.length - 1].blocks.push({ block, index: blockIndex });
    }
  }
  return groups.map((group, index) => {
    if (!group.heading) return <div key={index} className={styles.sectionIntro}>{group.blocks.map(({ block, index: blockIndex }) => <KnowledgeBlock key={blockIndex} block={block} sectionTitle={sectionTitle} blockId={knowledgeSpeechBlockId(sectionId, blockIndex)} />)}</div>;
    if (!group.blocks.length) return <div key={index} className={styles.topicDivider} data-knowledge-tone={group.tone}><KnowledgeBlock block={group.heading} sectionTitle={sectionTitle} /></div>;
    return <div key={index} className={styles.topicGroup} data-knowledge-group data-knowledge-tone={group.tone}>
      <header className={styles.topicHeading}><KnowledgeBlock block={group.heading} sectionTitle={sectionTitle} /><KnowledgeAudioPlaylistButton blockIds={group.blocks.map(({ index: blockIndex }) => knowledgeSpeechBlockId(sectionId, blockIndex))} /></header>
      <div className={styles.topicBody}>{group.blocks.map(({ block, index: blockIndex }) => <KnowledgeBlock key={blockIndex} block={block} sectionTitle={sectionTitle} blockId={knowledgeSpeechBlockId(sectionId, blockIndex)} />)}</div>
    </div>;
  });
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
    <KnowledgeAudioProvider unit={unit}>
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
        <ol>{unit.sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`} data-knowledge-tone={knowledgeTone(section.title)}><span className={styles.chapterNumber}>{String(index + 1).padStart(2, "0")}</span><span>{section.title}</span><span className={styles.anchorArrow} aria-hidden="true">↓</span></a></li>)}</ol>
      </details>
    </nav>
    <KnowledgeAudioControls />
    <article className={styles.article} aria-label={`Unit ${unit.number} 知识点正文`}>
      {unit.sections.map((section, index) => <section className={styles.section} id={section.id} key={section.id} data-knowledge-section data-knowledge-tone={knowledgeTone(section.title)}>
        <header className={styles.sectionHeading}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><h2>{section.title}</h2><KnowledgeAudioPlaylistButton sectionId={section.id} label="整节播放" /></header>
        <div className={styles.sectionContent}><KnowledgeContent blocks={section.blocks} sectionTitle={section.title} sectionId={section.id} /></div>
        <a href="#" className={styles.backToDirectory}>返回页首 ↑</a>
      </section>)}
    </article>
    <nav className={styles.previousNext} aria-label="前后单元">
      {previous && <Link href={`${base}/${previous.number}`} prefetch={false} rel="prev" className={styles.neighbor}><span>← 上一单元</span><strong>Unit {previous.number} · {previous.title}</strong></Link>}
      <Link href={base} className={styles.allUnits}>全部单元</Link>
      {next && <Link href={`${base}/${next.number}`} prefetch={false} rel="next" className={styles.neighbor}><span>下一单元 →</span><strong>Unit {next.number} · {next.title}</strong></Link>}
    </nav>
    </KnowledgeAudioProvider>
  </ReadingFrame>;
}
