import book from "@/data/national-day-english.json";

export type NationalDayBlock =
  | { type: "text" | "heading"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export type NationalDayQuestion = {
  id: string;
  prompt: string;
  reference: string;
  mode: "auto" | "self";
  accepted: string[][];
  options?: string[];
  labels?: string[];
};

export type NationalDaySection = {
  id: string;
  title: string;
  page: number;
  category: "lesson" | "practice" | "reference";
  topic: string | null;
  blocks: NationalDayBlock[];
  questions: NationalDayQuestion[];
  oralQuestions?: NationalDayQuestion[];
  listeningBlocks?: NationalDayBlock[];
  audioText?: string;
  writing?: {
    label: string;
    prompt: string;
    minWords: number;
    referenceBlocks?: NationalDayBlock[];
  };
};

export type NationalDaySectionSummary = Pick<NationalDaySection, "id" | "title" | "page" | "category" | "topic"> & {
  questionIds: string[];
};

export const NATIONAL_DAY_PDF_URL = book.pdfUrl;
export const NATIONAL_DAY_SECTIONS = book.sections as NationalDaySection[];
export const NATIONAL_DAY_SUMMARIES: NationalDaySectionSummary[] = NATIONAL_DAY_SECTIONS.map((section) => ({
  id: section.id,
  title: section.title,
  page: section.page,
  category: section.category,
  topic: section.topic,
  questionIds: [...section.questions, ...(section.oralQuestions ?? [])].map((question) => question.id),
}));
export const NATIONAL_DAY_QUESTION_COUNT = NATIONAL_DAY_SECTIONS.reduce((total, section) => total + section.questions.length, 0);
