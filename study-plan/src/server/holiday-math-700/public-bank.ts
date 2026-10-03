import "server-only";
import source from "./questions.public.json";
import knowledge from "./knowledge.public.json";
import type {
  HolidayQuestion,
  HolidayChapter,
} from "@/lib/holiday-math-700-types";

const questions = source as HolidayQuestion[];
const byId = new Map(questions.map((question) => [question.id, question]));
const knowledgeNames = new Map(
  knowledge.map((point) => [point.id, point.name]),
);
const studentQuestion = (question: HolidayQuestion) => ({
  ...question,
  knowledge_point_names: question.knowledge_points.map(
    (id) => knowledgeNames.get(id) ?? id,
  ),
});
export const HOLIDAY_CHAPTERS: HolidayChapter[] = [
  ...new Set(questions.map((question) => question.chapter_id)),
].map((id) => {
  const rows = questions.filter((question) => question.chapter_id === id);
  return {
    chapter_id: id,
    chapter_title: rows[0].chapter_title,
    count: rows.length,
  };
});
export function holidayQuestion(id: string) {
  return byId.get(id);
}
export function listHolidayQuestions(query: {
  chapter?: string;
  difficulty?: string;
  type?: string;
  page?: number;
  id?: string;
  ids?: string[];
}) {
  if (query.id) {
    const question = byId.get(query.id);
    if (!question) throw new Error("题目不存在");
    return {
      questions: [studentQuestion(question)],
      total: 1,
      page: 1,
      pages: 1,
    };
  }
  if (
    query.chapter &&
    !HOLIDAY_CHAPTERS.some((c) => c.chapter_id === query.chapter)
  )
    throw new Error("章节不存在");
  if (
    query.difficulty &&
    !["easy", "hard", "extreme"].includes(query.difficulty)
  )
    throw new Error("难度选项不正确");
  if (query.type && !questions.some((q) => q.type === query.type))
    throw new Error("题型选项不正确");
  if (
    query.ids &&
    (query.ids.length > 700 || query.ids.some((id) => !byId.has(id)))
  )
    throw new Error("错题编号不正确");
  const selected = query.ids ? new Set(query.ids) : null;
  const rows = questions.filter(
    (q) =>
      (!selected || selected.has(q.id)) &&
      (!query.chapter || q.chapter_id === query.chapter) &&
      (!query.difficulty || q.difficulty === query.difficulty) &&
      (!query.type || q.type === query.type),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const page = Math.max(1, Math.min(pages, query.page ?? 1));
  return {
    questions: rows.slice((page - 1) * 10, page * 10).map(studentQuestion),
    total: rows.length,
    page,
    pages,
  };
}
