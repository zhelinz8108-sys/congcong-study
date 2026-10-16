import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { EnglishSixIndex, SixFeedback, SixPage, SixPaper, SixQuestion, SixResource } from "@/lib/english-six";
import { sixAnswerValues, sixQuestionInputCount } from "@/lib/english-six-answer";

export const englishSixRoot = path.join(process.cwd(), "content", "english-six");
type PrivateQuestion = SixQuestion & { answer: string; explanation: string };
type PrivatePaper = Omit<SixPaper, "questions"> & { questions: PrivateQuestion[] };
type PrivateResource = { id: string; meta: SixResource; pages: SixPage[]; asset: string | null; reference: boolean };
type Asset = { file: string; extension: string; size: number };

function parse<T>(raw: string): T { return JSON.parse(raw) as T; }
let index: EnglishSixIndex | undefined;
let assets: Record<string, Asset> | undefined;
export function englishSixIndex() {
  if (process.env.NODE_ENV === "production" && index) return index;
  return index = parse<EnglishSixIndex>(readFileSync(path.join(englishSixRoot, "index.json"), "utf8"));
}
export function englishSixPaper(unit: number): PrivatePaper | undefined {
  if (!Number.isInteger(unit) || unit < 1 || unit > 8) return;
  return parse<PrivatePaper>(readFileSync(path.join(englishSixRoot, "practice", `${unit}.json`), "utf8"));
}
export function englishSixPublicPaper(unit: number): SixPaper | undefined {
  const paper = englishSixPaper(unit);
  return paper && { ...paper, questions: paper.questions.map(({ answer: _answer, explanation: _explanation, ...q }) => {
    void _answer; void _explanation; return { ...q, inputCount: sixQuestionInputCount(q) };
  }) };
}
export function englishSixGrade(unit: number, id: string, response: string): SixFeedback | undefined {
  const q = englishSixPaper(unit)?.questions.find(q => q.id === id);
  if (!q || !response.trim() || response.length > 10000) return;
  if (q.options.length && !q.options.some(o => o.id === response)) return;
  if (!q.options.length && sixAnswerValues(sixQuestionInputCount(q), response).some(value => !value.trim())) return;
  // Full-sentence answers and writing are reviewed against a reference, not falsely marked wrong by exact matching.
  const correct = q.grading !== "reference" && (q.kind === "choice" || q.kind === "judgment") ? q.answer === response : null;
  return { id: q.id, answer: q.answer, explanation: q.explanation, correct, response };
}
export function englishSixResource(id: string): PrivateResource | undefined {
  if (!/^[a-f0-9]{12}$/.test(id) || !englishSixIndex().resources.some(r => r.id === id)) return;
  return parse<PrivateResource>(readFileSync(path.join(englishSixRoot, "resources", `${id}.json`), "utf8"));
}
export function englishSixAsset(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) return;
  const manifest = process.env.NODE_ENV === "production" && assets ? assets : assets = parse<Record<string, Asset>>(readFileSync(path.join(englishSixRoot, "assets.private.json"), "utf8"));
  const asset = manifest[id];
  if (!asset) return;
  if (!/^\.[a-z0-9]+$/.test(asset.extension) || asset.file !== `assets/${id}${asset.extension}`) return;
  const file = path.resolve(englishSixRoot, "assets", `${id}${asset.extension}`);
  return { ...asset, file };
}
export function englishSixResourcePage(id: string, page: number) {
  const resource = englishSixResource(id);
  if (!resource || !Number.isInteger(page) || page < 1 || page > Math.max(1, resource.pages.length)) return;
  let content = resource.pages[page - 1];
  // The eight interactive unit papers never expose their appended keys in the source reader.
  if (resource.meta.paths.some(p => p.includes("单元测试\\")) && content) {
    const boundary = resource.pages.findIndex(p => p.blocks.some(b => b.kind === "text" && b.text.replace(/\s+/g, "").includes("参考答案及详细解析")));
    if (boundary >= 0 && page - 1 >= boundary) {
      const marker = content.blocks.findIndex(b => b.kind === "text" && b.text.replace(/\s+/g, "").includes("参考答案及详细解析"));
      content = { ...content, blocks: page - 1 > boundary ? [] : content.blocks.slice(0, marker) };
    }
  }
  return { meta: resource.meta, content: content ?? null, asset: resource.asset, reference: resource.reference };
}
