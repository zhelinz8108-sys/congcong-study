import book from "@/data/national-day-math.json";

export type NationalDayMathQuestion = {
  type: "example" | "quiz";
  id: string;
  label: string;
  title: string;
  question: string;
  steps: string[];
  answer: string;
  pitfall?: string;
  category?: "example" | "diagnostic" | "unit" | "comprehensive";
  accepted?: string[];
  pdfPage: number;
};

export type NationalDayMathDiagramId = "decimals" | "whole" | "ratio" | "circle" | "scale" | "coordinates" | "bearing";

export type NationalDayMathBlock =
  | { type: "text"; text: string; pdfPage: number }
  | { type: "heading"; text: string; level: 2 | 3; pdfPage: number }
  | NationalDayMathQuestion
  | { type: "formula"; title: string; formula: string; note: string; pdfPage: number }
  | { type: "diagram"; id: NationalDayMathDiagramId; title: string; pdfPage: number };

export type NationalDayMathSection = {
  id: string;
  title: string;
  day?: 1 | 2 | 3;
  kind: "overview" | "plan" | "prerequisite" | "diagnostic" | "chapter" | "comprehensive" | "review";
  sourcePages: number[];
  blocks: NationalDayMathBlock[];
};

export const NATIONAL_DAY_MATH_SECTIONS = book.sections as NationalDayMathSection[];
export const NATIONAL_DAY_MATH_STATS = book.stats;
