import "server-only";
import source from "./questions.public.json";
import type {
  EnglishPracticeBlock,
  EnglishPracticeChapter,
  EnglishPracticePage,
} from "@/lib/national-day-english-practice-types";

const chapters = source as {
  chapter: EnglishPracticeChapter;
  blocks: EnglishPracticeBlock[];
}[];
export const ENGLISH_PRACTICE_CHAPTERS = chapters.map((row) => row.chapter);
const byBlock = new Map(chapters.flatMap((row) => row.blocks.map((block) => [block.id, block] as const)));
const byChapter = new Map(chapters.map((row) => [row.chapter.id, row]));

export function englishPracticeBlock(id: string) {
  return byBlock.get(id);
}

/** Ten numbered scoring items per page, preserving each complete cloze passage. */
export function listEnglishPracticeBlocks(query: {
  chapter: string;
  page?: number;
}): EnglishPracticePage {
  const row = byChapter.get(query.chapter);
  if (!row) throw new Error("章节不存在");
  const requested = query.page ?? 1;
  if (!Number.isSafeInteger(requested) || requested < 1)
    throw new Error("页码不正确");
  const pages: EnglishPracticeBlock[][] = [];
  let current: EnglishPracticeBlock[] = [];
  let count = 0;
  for (const block of row.blocks) {
    if (count + block.questions.length > 10) {
      pages.push(current);
      current = [];
      count = 0;
    }
    current.push(block);
    count += block.questions.length;
  }
  if (current.length) pages.push(current);
  const page = Math.min(requested, pages.length);
  return {
    chapter: query.chapter,
    blocks: pages[page - 1],
    page,
    pages: pages.length,
    total: row.chapter.count,
  };
}
