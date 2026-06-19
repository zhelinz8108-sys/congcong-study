import fs from "node:fs";
import path from "node:path";

export type TheWeekArticle = {
  id: string;
  source: string;
  issue_date: string;
  source_pdf: string;
  pages: number[];
  section: string;
  title: string;
  body: string;
  word_count: number;
  extraction_method: string;
  confidence: number;
  review_status: "ready" | "needs_review";
  review_reason: string;
};

export type TheWeekPdfReport = {
  file: string;
  issue_date: string;
  pages: number;
  text_pages: number;
  text_chars: number;
  status: "text_layer" | "needs_ocr" | "failed" | "unknown";
  article_count: number;
  ready_count: number;
  needs_review_count: number;
  notes: string[];
};

export type TheWeekExtractionReport = {
  source_dir: string;
  output_dir: string;
  pdf_count: number;
  article_count: number;
  ready_count: number;
  needs_review_count: number;
  text_layer_pdf_count: number;
  needs_ocr_pdf_count: number;
  failed_pdf_count: number;
  pdfs: TheWeekPdfReport[];
};

const defaultExtractDir = path.resolve(
  process.cwd(),
  "..",
  "英语",
  "阅读",
  "reading",
  "the week",
  "extracted",
  "2024"
);

function extractDir() {
  return process.env.THE_WEEK_2024_EXTRACT_DIR || defaultExtractDir;
}

function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export function loadTheWeekArticles(): TheWeekArticle[] {
  return readJsonl<TheWeekArticle>(path.join(extractDir(), "articles.jsonl"));
}

export function loadTheWeekReport(): TheWeekExtractionReport | null {
  const reportPath = path.join(extractDir(), "extraction-report.json");
  if (!fs.existsSync(reportPath)) return null;
  return JSON.parse(fs.readFileSync(reportPath, "utf8")) as TheWeekExtractionReport;
}

function hasScrambledLetters(value: string) {
  return /\b[A-Z]\s+[A-Z]\s+[A-Z]\b/.test(value) || /\(cid:/.test(value);
}

function isUsefulArticle(article: TheWeekArticle) {
  if (article.word_count < 120) return false;
  if (article.confidence < 0.7) return false;
  if (hasScrambledLetters(article.title) || hasScrambledLetters(article.body)) return false;
  if (/^(contents|this week's big news|this week’s big news)$/i.test(article.title.trim())) {
    return false;
  }
  if (/the week junior|making sense of the world/i.test(article.title)) return false;
  return true;
}

export function loadTheWeekLibraryArticles(): TheWeekArticle[] {
  return loadTheWeekArticles()
    .filter(isUsefulArticle)
    .sort((a, b) => {
      const dateOrder = a.issue_date.localeCompare(b.issue_date);
      if (dateOrder !== 0) return dateOrder;
      return (a.pages[0] ?? 0) - (b.pages[0] ?? 0);
    });
}

export function getTheWeekArticle(articleId: string) {
  return loadTheWeekArticles().find((article) => article.id === articleId) ?? null;
}

export function theWeekIssues(articles: TheWeekArticle[]) {
  return Array.from(new Set(articles.map((article) => article.issue_date))).sort();
}

export function articleMatchesQuery(article: TheWeekArticle, query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return `${article.title} ${article.section} ${article.body}`.toLowerCase().includes(keyword);
}

export function getTheWeekDataPath() {
  return extractDir();
}
