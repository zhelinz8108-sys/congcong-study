import layouts from "@/data/english-six-reader-layouts.public.json";
import type { SixBlock, SixPage } from "./english-six";

export type ReaderTopic = { number: number; title: string; page: number; block: number; end: number; destination: number };
type TableLayout = { start: number; end: number; rows: string[][]; signature: string };
type ReaderLayout = { sourceSha256: string; outline: ReaderTopic[]; pages: Record<string, { tables: TableLayout[] }> };
export type ReaderNode = {
  kind: "paragraph" | "caption" | "subheading" | "core" | "note" | "mnemonic" | "explanation" | "question" | "options" | "mistake" | "table" | "block";
  sources: number[]; text: string; label?: string; rows?: string[][]; block?: SixBlock;
  correct?: string; explanation?: string; phase?: "text" | "correct" | "explanation";
};
export type ReaderSection = { topic?: ReaderTopic; headingSources: number[]; nodes: ReaderNode[] };
export const readerLayout = (id: string) => (layouts as Record<string, ReaderLayout>)[id];
const compact = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
const clean = (s: string) => s.trim().replace(/ {2,}/g, " ");
const unmark = (s: string) => s.replace(/^[\s📌📖⚠️✍📝🔍💬🌟📢]+/u, "").trim();
const join = (a: string, b: string) => a + (/[\u3400-\u9fff]$/.test(a) && /^[\u3400-\u9fff]/.test(b) || /-$/.test(a) && /^[a-z]/.test(b) ? "" : " ") + b;
const continuing = (s: string) => !!s && !/[。！？.!?；;：:]$/.test(s);

export function sixDocumentPlan(resourceId: string, pageNumber: number, page: SixPage) {
  const layout = readerLayout(resourceId);
  const sections: ReaderSection[] = [];
  const carried = layout?.outline.filter(t => t.page < pageNumber).at(-1);
  let section: ReaderSection = { topic: carried, headingSources: [], nodes: [] };
  sections.push(section);
  const tables = layout?.pages[String(pageNumber)]?.tables ?? [];
  for (let i = 0; i < page.blocks.length; i++) {
    const source = page.blocks[i];
    const table = tables.find(t => t.start === i);
    if (table && compact(page.blocks.slice(table.start, table.end).map(b => b.kind === "text" ? b.text : "").join("")) === compact(table.signature)) {
      section.nodes.push({ kind: "table", text: "", rows: table.rows, sources: Array.from({ length: table.end - i }, (_, n) => i + n) });
      i = table.end - 1;
      continue;
    }
    if (source.kind !== "text" || source.runs) {
      section.nodes.push({ kind: "block", text: "", block: source, sources: [i] });
      continue;
    }
    const text = clean(source.text), stripped = unmark(text);
    const knownTopic = layout?.outline.find(t => t.page === pageNumber && t.block === i);
    const genericTopic = stripped.match(/^(?:高频易错点|知识点|考点)\s*(\d+)\s*[：:.、]\s*(.+)/);
    if (knownTopic || genericTopic) {
      const topic = knownTopic ?? { number: Number(genericTopic![1]), title: genericTopic![2], page: pageNumber, block: i, end: i + 1, destination: pageNumber };
      section = { topic, headingSources: Array.from({ length: topic.end - i }, (_, n) => i + n), nodes: [] };
      sections.push(section); i = topic.end - 1;
      continue;
    }
    const node = (kind: ReaderNode["kind"], value = stripped, label?: string) => section.nodes.push({ kind, text: value, label, sources: [i] });
    const last = section.nodes.at(-1);
    const heading = /^(易错精讲|易错点提示|小练笔|综合训练模块|参考答案与逐题解析|详细解析|复习小贴士)(.*)$/.exec(stripped);
    if (heading) { node("subheading", stripped); continue; }
    const labelled = /^(一句话核心|注意|口诀|提示|例句|例如|解析)\s*[：:]\s*(.*)$/.exec(stripped);
    if (/^错误\s*\d*\s*[：:]/.test(stripped)) {
      node("mistake", stripped.replace(/^错误\s*\d*\s*[：:]\s*/, ""));
      continue;
    }
    if (last?.kind === "mistake" && /^(正确|解析)\s*[：:]/.test(stripped)) {
      const field = stripped.startsWith("正确") ? "correct" : "explanation";
      last[field] = stripped.replace(/^(正确|解析)\s*[：:]\s*/, "");
      last.phase = field; last.sources.push(i); continue;
    }
    if (labelled) {
      const kinds: Record<string, ReaderNode["kind"]> = { 一句话核心: "core", 注意: "note", 口诀: "mnemonic", 提示: "note", 例句: "note", 例如: "note", 解析: "explanation" };
      node(kinds[labelled[1]], labelled[2], labelled[1]); continue;
    }
    if (/^[一二三四五六七八九十]+[、．.]/.test(stripped) || /^【.+】$/.test(stripped) || /^对话[一二三四五六七八九十]+[：:]$/.test(stripped)) { node("subheading"); continue; }
    if (/^(?:\(\s*\)\s*)?\d+[.、．)]/.test(stripped)) { node("question", text); continue; }
    if (/^[A-F][.．]\s/.test(stripped)) { node("options", text); continue; }
    if (/^26译林|^Unit\s+[1-8]\s|译林版.+易错语法精讲/.test(stripped)) { node("caption", stripped); continue; }
    if (last?.kind === "mistake" && continuing(last.phase === "correct" ? last.correct ?? "" : last.phase === "explanation" ? last.explanation ?? "" : last.text)) {
      const field = last.phase ?? "text";
      last[field] = join(last[field] ?? "", text); last.sources.push(i); continue;
    }
    if (last && ["paragraph", "core", "note", "mnemonic", "explanation", "options"].includes(last.kind) && continuing(last.text) && !/^[•●]/.test(text)) {
      last.text = join(last.text, text); last.sources.push(i); continue;
    }
    node("paragraph", text);
  }
  const visible = sections.filter(s => s.topic || s.nodes.length);
  return { outline: layout?.outline ?? [], sections: visible, structured: !!layout || visible.some(s => s.topic || s.nodes.some(n => ["core", "mistake", "mnemonic"].includes(n.kind))) };
}
