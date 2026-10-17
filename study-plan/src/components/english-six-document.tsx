"use client";

import type { ReactNode } from "react";
import type { SixBlock, SixPage } from "@/lib/english-six";
import { sixDocumentPlan, type ReaderNode } from "@/lib/english-six-document";
import styles from "./english-six-document.module.css";
import shared from "./english-six.module.css";

function Emphasis({ text }: { text: string }) {
  const parts = text.split(/(\bdidn't\b|\bwon't\b|\bshouldn't\b|\bDid\b|\bwill\b|\bshould\b|\bwas\b|\bwere\b|-ed\b|-d\b|\bied\b|动词原形|动词过去式|不规则动词|一般过去时|一般将来时|一般现在时)/gi);
  return <>{parts.map((part, i) => i % 2 ? <strong key={i}>{part}</strong> : part)}</>;
}

function RuleTable({ rows }: { rows: string[][] }) {
  const [headers, ...body] = rows;
  return <div className={styles.ruleTable}>
    <table className={styles.desktopTable}><thead><tr>{headers.map((text, i) => <th scope="col" key={i}>{text}</th>)}</tr></thead><tbody>{body.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}><Emphasis text={cell} /></td>)}</tr>)}</tbody></table>
    <div className={styles.mobileTable}>{body.map((row, i) => <div className={styles.mobileRow} key={i}>
      <h5><Emphasis text={row[0]} /></h5><dl>{row.slice(1).map((cell, j) => <div key={j}><dt>{headers[j + 1]}</dt><dd><Emphasis text={cell} /></dd></div>)}</dl>
    </div>)}</div>
  </div>;
}

function Node({ node, renderBlock, renderQuestion }: { node: ReaderNode; renderBlock: (block: SixBlock) => ReactNode; renderQuestion?: (node: ReaderNode) => ReactNode }) {
  if (!node.text && node.kind !== "block" && node.kind !== "table") return null;
  const exercise = renderQuestion?.(node);
  if (exercise) return node.kind === "question" ? exercise : <><p className={styles.prose}><Emphasis text={node.text} /></p>{exercise}</>;
  if (node.kind === "block") return renderBlock(node.block!);
  if (node.kind === "table") return <RuleTable rows={node.rows!} />;
  if (node.kind === "subheading") return <h4 className={styles.subheading} data-warning={/易错点提示/.test(node.text)}>{node.text}</h4>;
  if (node.kind === "mistake") return <div className={styles.mistake}>
    <p className={styles.wrong}><span>错误</span>{node.text}</p>
    {node.correct && <p className={styles.correct}><span>正确</span><Emphasis text={node.correct} /></p>}
    {node.explanation && <p className={styles.reason}><b>解析</b><Emphasis text={node.explanation} /></p>}
  </div>;
  if (node.kind === "options") {
    const options = [...node.text.matchAll(/(?:^|\s)([A-F])[.．]\s*(.*?)(?=\s+[A-F][.．]\s|$)/g)];
    if (options.length) return <ul className={styles.sourceOptions}>{options.map((m, i) => <li key={i}><b>{m[1]}</b><span>{m[2]}</span></li>)}</ul>;
  }
  if (["core", "note", "mnemonic", "explanation"].includes(node.kind)) return <div className={styles.callout} data-kind={node.kind}>
    {node.label && <strong className={styles.calloutLabel}>{node.label}</strong>}<p><Emphasis text={node.text} /></p>
  </div>;
  return <p className={node.kind === "caption" ? styles.caption : node.kind === "question" ? styles.question : styles.prose}><Emphasis text={node.text} /></p>;
}

export default function EnglishSixDocument({ resourceId, pageNumber, content, focusTopic, onPage, renderBlock, renderQuestion }: {
  resourceId: string; pageNumber: number; content: SixPage; focusTopic: number | null; onPage: (page: number, topic?: number) => void; renderBlock: (block: SixBlock) => ReactNode;
  renderQuestion?: (node: ReaderNode) => ReactNode;
}) {
  const plan = sixDocumentPlan(resourceId, pageNumber, content);
  const current = focusTopic ?? plan.sections.find(s => s.topic && s.nodes.length)?.topic?.number;
  if (!plan.structured) return <article className={shared.document}>
    <h2>{content.title}</h2>
    {content.ocr && <p className={shared.sourceNote}>扫描资料文字识别，遇到识别异常请核对原资料。</p>}
    {content.blocks.map((block, i) => <div key={i}>{renderBlock(block)}</div>)}
    {!content.blocks.length && <p className={shared.empty}>此页暂无已提取内容。</p>}
  </article>;
  function openTopic(number: number, destination: number) {
    onPage(destination, number);
  }
  return <>
    {!!plan.outline.length && <nav className={styles.topicNav} aria-label="知识点导航">{plan.outline.map(topic => <button key={topic.number} data-tone={(topic.number - 1) % 6} aria-pressed={current === topic.number} aria-label={`知识点 ${topic.number}：${topic.title}`} title={topic.title} onClick={() => openTopic(topic.number, topic.destination)}>
      <strong>知识点 {topic.number}</strong><span>{topic.title}</span>
    </button>)}</nav>}
    <article className={plan.structured ? styles.document : shared.document}>
      <h2 className={styles.pageTitle}>{content.title}</h2>
      {content.ocr && <p className={shared.sourceNote}>扫描资料文字识别，遇到识别异常请核对原资料。</p>}
      {plan.sections.map((section, i) => {
        const topic = section.topic;
        if (!topic && section.nodes.every(n => n.kind === "caption")) return <details className={styles.sourceInfo} key={i}><summary>资料信息</summary>{section.nodes.map((node, n) => <Node key={n} node={node} renderBlock={renderBlock} />)}</details>;
        const title = topic && <><span className={styles.topicNumber}>{String(topic.number).padStart(2, "0")}</span><span>{topic.title}</span></>;
        if (topic && !section.nodes.length) return <button key={i} className={styles.nextTopic} data-tone={(topic.number - 1) % 6} onClick={() => openTopic(topic.number, topic.destination)}>{title}<span aria-hidden="true">→</span></button>;
        return <section className={styles.knowledgeSection} key={i} id={topic ? `six-topic-${resourceId}-${topic.number}` : undefined} data-tone={topic ? (topic.number - 1) % 6 : 0}>
          {topic && <header className={styles.topicHeading}><p>知识点 {topic.number}{pageNumber > topic.destination ? " · 续" : ""}</p><h3>{title}</h3></header>}
          {section.nodes.map((node, n) => <Node key={n} node={node} renderBlock={renderBlock} renderQuestion={renderQuestion} />)}
        </section>;
      })}
      {!content.blocks.length && <p className={shared.empty}>此页暂无已提取内容。</p>}
    </article>
  </>;
}
