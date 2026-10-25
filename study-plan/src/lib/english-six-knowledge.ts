export type EnglishSixKnowledgeInline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  ipa?: boolean;
};

export type EnglishSixKnowledgeBlock =
  | { kind: "heading"; level: 3 | 4; text: string }
  | { kind: "paragraph"; runs: EnglishSixKnowledgeInline[]; tone?: "note" }
  | { kind: "table"; headers?: EnglishSixKnowledgeInline[][]; rows: EnglishSixKnowledgeInline[][][] }
  | { kind: "callout"; paragraphs: EnglishSixKnowledgeInline[][] };

export type EnglishSixKnowledgeSection = { id: string; title: string; blocks: EnglishSixKnowledgeBlock[] };
export type EnglishSixKnowledgeUnit = { number: number; title: string; sections: EnglishSixKnowledgeSection[] };
export type EnglishSixKnowledgeUnitSummary = { number: number; title: string; sectionCount: number; blockCount: number };
export type EnglishSixKnowledgeBook = {
  version: 1;
  title: string;
  edition: "2026";
  units: EnglishSixKnowledgeUnit[];
  sources?: string[];
};
export type EnglishSixKnowledgeBookSummary = {
  version: 1;
  title: string;
  edition: "2026";
  units: EnglishSixKnowledgeUnitSummary[];
};

const fail = (): never => { throw new Error("Invalid English six knowledge content"); };
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown, limit = 20000): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail();
}
function array(value: unknown, maximum: number, minimum = 0): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return fail();
  return value;
}
function runs(value: unknown, empty = false) {
  const values = array(value, 2000, empty ? 0 : 1);
  let length = 0;
  for (const value of values) {
    const run = object(value, ["text", "bold", "italic", "underline", "ipa"]);
    // Whitespace-only runs separate adjacent formatted words and must survive.
    if (typeof run.text !== "string" || !run.text.length || run.text.length > 20000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(run.text)) return fail();
    length += run.text.length;
    for (const key of ["bold", "italic", "underline", "ipa"]) if (run[key] !== undefined && typeof run[key] !== "boolean") fail();
  }
  if (length > 50000 || !empty && !values.some(value => (value as EnglishSixKnowledgeInline).text.trim())) fail();
}
function row(value: unknown, width?: number): number {
  const cells = array(value, 16, 1);
  if (width !== undefined && cells.length !== width) fail();
  cells.forEach(cell => runs(cell, true));
  return cells.length;
}
function block(value: unknown) {
  const kind = object(value, ["kind", "level", "text", "runs", "tone", "headers", "rows", "paragraphs"]).kind;
  if (kind === "heading") {
    const heading = object(value, ["kind", "level", "text"]);
    if (heading.level !== 3 && heading.level !== 4) fail();
    text(heading.text, 1000);
  } else if (kind === "paragraph") {
    const paragraph = object(value, ["kind", "runs", "tone"]);
    if (paragraph.tone !== undefined && paragraph.tone !== "note") fail();
    runs(paragraph.runs);
  } else if (kind === "table") {
    const table = object(value, ["kind", "headers", "rows"]);
    const rows = array(table.rows, 500, table.headers === undefined ? 1 : 0);
    let width = table.headers === undefined ? undefined : row(table.headers);
    for (const cells of rows) width = row(cells, width);
  } else if (kind === "callout") {
    const callout = object(value, ["kind", "paragraphs"]);
    array(callout.paragraphs, 30, 1).forEach(paragraph => runs(paragraph));
  } else fail();
}

/** Validate only the native content contract. No HTML, runtime script or
 * unpublished source file is accepted as a rendering instruction. */
export function assertEnglishSixKnowledgeBook(value: unknown): asserts value is EnglishSixKnowledgeBook {
  const book = object(value, ["version", "title", "edition", "units", "sources"]);
  if (book.version !== 1 || book.edition !== "2026") fail();
  text(book.title, 200);
  const units = array(book.units, 8, 8), ids = new Set<string>();
  let count = 0;
  for (const [index, raw] of units.entries()) {
    const unit = object(raw, ["number", "title", "sections"]);
    if (unit.number !== index + 1) fail();
    text(unit.title, 200);
    const sections = array(unit.sections, 8, 8);
    for (const raw of sections) {
      const section = object(raw, ["id", "title", "blocks"]);
      text(section.id, 100);
      if (!new RegExp(`^unit-${unit.number}-[a-z0-9]+(?:[_-][a-z0-9]+)*$`).test(section.id) || ids.has(section.id)) fail();
      ids.add(section.id);
      text(section.title, 200);
      const blocks = array(section.blocks, 2000, 1);
      count += blocks.length;
      if (count > 12000) fail();
      blocks.forEach(block);
    }
  }
  if (book.sources !== undefined) {
    const sources = array(book.sources, 100);
    sources.forEach(source => text(source, 500));
    if (new Set(sources).size !== sources.length) fail();
  }
}

export function summarizeEnglishSixKnowledgeUnit(unit: EnglishSixKnowledgeUnit): EnglishSixKnowledgeUnitSummary {
  return { number: unit.number, title: unit.title, sectionCount: unit.sections.length,
    blockCount: unit.sections.reduce((total, section) => total + section.blocks.length, 0) };
}

export function summarizeEnglishSixKnowledgeBook(book: EnglishSixKnowledgeBook): EnglishSixKnowledgeBookSummary {
  return { version: book.version, title: book.title, edition: book.edition, units: book.units.map(summarizeEnglishSixKnowledgeUnit) };
}

export const englishSixKnowledgeSummary = summarizeEnglishSixKnowledgeBook;
