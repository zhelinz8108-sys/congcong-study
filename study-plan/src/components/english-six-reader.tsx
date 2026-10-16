"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { englishSixResourceScope, englishSixResourceStage, englishSixResourceTitle, type SixBlock, type SixPage, type SixResource } from "@/lib/english-six";
import styles from "./english-six.module.css";
import EnglishSixDocument from "./english-six-document";
import { readerLayout } from "@/lib/english-six-document";
import EnglishSixBankPractice from "./english-six-bank-practice";
import EnglishSixPractice from "./english-six-practice";

const media = (id: string) => `/api/english/six/media/${id}`;
function Block({ block }: { block: SixBlock }) {
  if (block.kind === "text") return <p className={styles.paragraph}>{block.runs ? block.runs.map((r, i) => r.underline ? <u key={i}>{r.text}</u> : <span key={i}>{r.text}</span>) : block.text}</p>;
  if (block.kind === "table") return <div className={styles.tableScroll}><table><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
  if (block.kind === "audio") return <audio controls preload="none" src={media(block.asset)} aria-label="配套音频" />;
  if (block.kind === "video") return <video controls preload="none" src={media(block.asset)} aria-label="配套视频" />;
  if (block.reference) return <details className={styles.passage}><summary>原页核对</summary><Block block={{ ...block, reference: false }} /></details>;
  // Extracted book diagrams retain their original proportions, without a PDF viewer.
  // eslint-disable-next-line @next/next/no-img-element
  return <a href={media(block.asset)} target="_blank" rel="noreferrer"><img className={styles.figure} src={media(block.asset)} alt="原资料插图" loading="lazy" /></a>;
}
type Reader = { meta: SixResource; content: SixPage | null; asset: string | null; reference: boolean; practiceCount?: number };
export default function EnglishSixReader({ subjectId, resourceId }: { subjectId: string; resourceId: string }) {
  const params = useSearchParams();
  const initialUnit = params.get("unit") ?? "";
  const initialPage = Number(params.get("page"));
  const initialPageResolved = useRef(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Reader>();
  const [requestState, setRequestState] = useState<{ key: string; error?: string }>();
  const requestKey = `${resourceId}:${page}`;
  const loading = requestState?.key !== requestKey;
  const error = requestState?.key === requestKey ? requestState.error ?? "" : "";
  const [speed, setSpeed] = useState(1);
  const [focusTopic, setFocusTopic] = useState<number | null>(null);
  const base = `/subjects/${subjectId}/english/six`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/english/six/resource/${resourceId}?page=${page}`, { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error("资料暂时不可用");
      const result = await r.json() as Reader;
      if (!initialPageResolved.current) {
        initialPageResolved.current = true;
        const target = Number.isInteger(initialPage) && initialPage > 0 && initialPage <= result.meta.pageCount ? initialPage : result.meta.unitStarts?.[initialUnit];
        if (target && target !== page) { setPage(target); return; }
      }
      setData(result); setRequestState({ key: requestKey });
    }).catch(e => { if (e.name !== "AbortError") setRequestState({ key: requestKey, error: e.message }); });
    return () => controller.abort();
  }, [resourceId, page, initialUnit, initialPage, requestKey]);
  useEffect(() => {
    if (!loading && focusTopic !== null) document.getElementById(`six-topic-${resourceId}-${focusTopic}`)?.scrollIntoView({ block: "start" });
  }, [loading, page, resourceId, focusTopic]);
  const move = (p: number, topic?: number) => {
    setFocusTopic(topic ?? null); setPage(p);
    if (p === page && topic !== undefined) document.getElementById(`six-topic-${resourceId}-${topic}`)?.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const asset = data?.asset ? media(data.asset) : "";
  const scope = data && englishSixResourceScope(data.meta);
  const chapters = Object.entries(data?.meta.unitStarts ?? {}).filter(([unit]) => !scope?.units.length || scope.units.includes(Number(unit)));
  const lesson = readerLayout(resourceId);
  const title = data && (lesson ? data.meta.title.replace(/^.*?\bUnit\s*/, "Unit ").replace(/^(Unit\s+\d+)\s+/, "$1 · ") : englishSixResourceTitle(data.meta));
  const practice = data?.meta.practice;
  const interactive = data && practice && params.get("mode") !== "source" && (params.get("mode") === "practice" || ["practice", "targeted", "test", "advanced"].includes(englishSixResourceStage(data.meta)));
  if (interactive && practice.type === "assessment") return <EnglishSixPractice key={`${subjectId}:assessment:${practice.unit}`} subjectId={subjectId} unit={practice.unit!} />;
  if (interactive) return <EnglishSixBankPractice key={`${subjectId}:source:${resourceId}`} subjectId={subjectId} paperId={`source-${resourceId}`} resourceId={resourceId} />;
  return <main className={styles.readerPage}>
    <Link href={`${base}?${params.toString()}`} className={styles.back}>← 返回六上目录</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>{data?.meta.edition === "legacy" ? "旧版参考" : "2026 新版"}{scope ? ` · ${scope.label}` : ""}{lesson ? " · 易错语法精讲" : ""}</p><h1 className={styles.readerTitle}>{title ?? "载入资料"}</h1></div></header>
    {error && <p role="alert">{error}</p>}
    {data && <>
      {!!data.practiceCount && <div className={styles.bankEntry}><strong>原资料 · 已匹配互动题 {data.practiceCount} 题</strong><Link className={styles.primary} href={`${base}/resource/${resourceId}?mode=practice&unit=${initialUnit || "all"}`}>开始练习 →</Link></div>}
      {data.meta.status === "needs-ocr" && <p className={styles.warning}>第 {data.meta.missingPages?.join("、")} 页的内容尚待提取，本资料未全部完成。</p>}
      {data.meta.status === "download-only" && <p className={styles.warning}>此旧格式暂不支持网页阅读，保留原文件供查看。</p>}
      {data.meta.status === "import-error" && <p className={styles.warning}>资料导入未完成。</p>}
      {asset && ([".mp3", ".wav"].includes(data.meta.extension) ? <div className={styles.mediaBand}>
        <audio controls preload="metadata" src={asset} onLoadedMetadata={e => { e.currentTarget.playbackRate = speed; }} onRateChange={e => setSpeed(e.currentTarget.playbackRate)} />
        <label>播放速度<select value={speed} onChange={e => { const value = Number(e.target.value); setSpeed(value); document.querySelectorAll("audio").forEach(a => { a.playbackRate = value; }); }}>{[0.75, 1, 1.25].map(s => <option key={s} value={s}>{s}x</option>)}</select></label>
      </div> : data.meta.extension === ".mp4" ? <video controls src={asset} preload="metadata" /> : [".png", ".jpg"].includes(data.meta.extension) ? <Block block={{ kind: "image", asset: data.asset! }} /> : <a className={styles.secondary} href={asset} download>下载原格式文件</a>)}
      {data.meta.pageCount > 0 && <nav className={styles.readerNav} aria-label="资料分页">
        {chapters.length > 1 && <label>Unit<select value={chapters.find(([, start]) => start === page)?.[0] ?? ""} onChange={e => { const target = data.meta.unitStarts?.[e.target.value]; if (target) move(target); }}><option value="">选择单元</option>{chapters.map(([unit, start]) => <option key={unit} value={unit}>Unit {unit} · 第 {start} 页</option>)}</select></label>}
        <button aria-label="上一页" title="上一页" disabled={page === 1 || loading} onClick={() => move(page - 1)}>←</button>
        <label>页码<select value={page} onChange={e => move(Number(e.target.value))}>{Array.from({ length: data.meta.pageCount }, (_, i) => <option key={i} value={i + 1}>{i + 1} / {data.meta.pageCount}</option>)}</select></label>
        <button aria-label="下一页" title="下一页" disabled={page >= data.meta.pageCount || loading} onClick={() => move(page + 1)}>→</button>
      </nav>}
      {loading ? <p role="status">正在载入…</p> : data.content && <EnglishSixDocument resourceId={resourceId} pageNumber={page} content={data.content} focusTopic={focusTopic} onPage={move} renderBlock={block => <Block block={block} />} />}
      {data.meta.pageCount > 1 && <div className={styles.bottomNav}><button className={styles.secondary} disabled={page === 1 || loading} onClick={() => move(page - 1)}>上一页</button><button className={styles.primary} disabled={page >= data.meta.pageCount || loading} onClick={() => move(page + 1)}>下一页 →</button></div>}
    </>}
  </main>;
}
