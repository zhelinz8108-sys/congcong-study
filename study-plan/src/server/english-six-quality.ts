import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { EnglishLockedFeedback } from "@/lib/english-locked-types";
import { englishSixPaper, englishSixRoot } from "./english-six";
import { englishSixBankPrivatePaper } from "./english-six-bank";

type Review = { id: string; file: string; historical: "reference" | "regrade" };
type Manifest = { revision: string; changes: Review[] };
let cached: { revision: string; changes: Map<string, Review> } | undefined;
function reviews() {
  if (process.env.NODE_ENV === "production" && cached) return cached;
  const file = path.join(englishSixRoot, "quality-review.private.json");
  const manifest: Manifest = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { revision: "", changes: [] };
  return cached = { revision: manifest.revision, changes: new Map(manifest.changes.map(change => [change.id, change])) };
}

export function englishSixQualityRevision(id: string) {
  const review = reviews();
  return review.changes.has(id) ? review.revision : undefined;
}

// Correct feedback on read, without rewriting or unlocking the student's first response.
export function englishSixReviewedFeedback(id: string, saved: EnglishLockedFeedback,
  grade: () => EnglishLockedFeedback): EnglishLockedFeedback {
  const manifest = reviews(), review = manifest.changes.get(id);
  if (!review || saved.contentRevision === manifest.revision) return saved;
  let current: EnglishLockedFeedback;
  try { current = grade(); } catch {
    // A corrected blank count may no longer accept the original response shape.
    if (!/^(?:practice\/[1-8]|bank\/papers\/[a-f0-9]{12}-[a-f0-9]{8})\.json$/.test(review.file)) throw new Error("题目修订路径不正确");
    const unit = /^practice\/([1-8])\.json$/.exec(review.file);
    const bank = /^bank\/papers\/([a-f0-9]{12}-[a-f0-9]{8})\.json$/.exec(review.file);
    const paper = unit ? englishSixPaper(Number(unit[1])) : bank ? englishSixBankPrivatePaper(bank[1]) : undefined;
    const question = paper?.questions.find(question => question.id === id);
    if (!question) throw new Error("修订题目不存在");
    current = { correct: null, answer: question.answer, explanation: question.explanation };
  }
  const ambiguous = review.historical === "reference";
  return { ...current, contentRevision: manifest.revision, correct: ambiguous ? null : current.correct,
    explanation: `${current.explanation}\n${ambiguous ? "本题提交后补正了题干、条件或选项。保留首次作答，旧记录不计入对错统计。" : "本题参考答案或解析已复核更新；仍保留首次提交的作答内容。"}` };
}
