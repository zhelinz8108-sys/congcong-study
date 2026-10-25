import type { EnglishSixKnowledgeInline } from "./english-six-knowledge";

/** Original formatting and ipa flags are preserved. Only the four reviewed
 * ASCII transcriptions can acquire this additional display-only annotation. */
export type KnowledgePhoneticRun = EnglishSixKnowledgeInline & { inferredIpa?: true };
export type KnowledgePhoneticPart =
  | { kind: "text"; runs: KnowledgePhoneticRun[] }
  | { kind: "paired"; wordRuns: KnowledgePhoneticRun[]; ipaRuns: KnowledgePhoneticRun[] }
  | { kind: "standalone"; ipaRuns: KnowledgePhoneticRun[] };

type Range = { start: number; end: number };
type SourceRun = Range & { run: EnglishSixKnowledgeInline };

function sourceRuns(runs: readonly EnglishSixKnowledgeInline[]) {
  let cursor = 0;
  return runs.map(run => {
    const start = cursor; cursor += run.text.length;
    return { start, end: cursor, run };
  });
}

function pronunciationRanges(text: string, source: SourceRun[]) {
  const marked: Range[] = [];
  for (const span of source) if (span.run.ipa && span.end > span.start) {
    const previous = marked.at(-1);
    if (previous?.end === span.start) previous.end = span.end;
    else marked.push({ start: span.start, end: span.end });
  }
  const inferred: Range[] = [];
  // Deliberately not a general /.../ recognizer: grammatical alternatives such
  // as am / is / are and these days / now / often are ordinary English text.
  for (const match of text.matchAll(/(?<![A-Za-z])\/(?:t|d|sel|red)\/(?![A-Za-z])/g)) {
    const start = match.index, end = start + match[0].length;
    if (!marked.some(span => start < span.end && end > span.start)) inferred.push({ start, end });
  }
  const ranges = [...marked, ...inferred].map(range => ({ ...range })).sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  for (const range of ranges) {
    const before = text.slice(previousEnd, range.start);
    const opening = /([（(])[ \t]*$/.exec(before);
    const closing = /^[ \t]*([）)])/.exec(text.slice(range.end));
    if (opening && closing && (opening[1] === "（" ? closing[1] === "）" : closing[1] === ")")) {
      range.start = previousEnd + opening.index;
      range.end += closing[0].length;
    }
    previousEnd = range.end;
  }
  return { ranges, inferred };
}

function sliceRuns(source: SourceRun[], start: number, end: number, inferred: Range[]): KnowledgePhoneticRun[] {
  const result: KnowledgePhoneticRun[] = [];
  for (const span of source) {
    const left = Math.max(start, span.start), right = Math.min(end, span.end);
    if (left >= right) continue;
    const cuts = [...new Set([left, right, ...inferred.flatMap(range => [range.start, range.end]).filter(position => left < position && position < right)])].sort((a, b) => a - b);
    for (let index = 0; index < cuts.length - 1; index++) {
      const from = cuts[index], to = cuts[index + 1];
      const run: KnowledgePhoneticRun = { ...span.run, text: span.run.text.slice(from - span.start, to - span.start) };
      if (!span.run.ipa && inferred.some(range => range.start <= from && to <= range.end)) run.inferredIpa = true;
      result.push(run);
    }
  }
  return result;
}

/** Match only a contiguous English suffix directly touching the transcription
 * through spaces. Chinese explanatory prose and earlier words are not searched
 * backwards for a possible headword. Ambiguous sentence-sized suffixes remain
 * standalone rather than attaching an IPA symbol to an entire sentence. */
function adjacentWordStart(text: string): number | null {
  const match = /([A-Za-z]+(?:[-'’][A-Za-z]+)*(?:[ \t]+[A-Za-z]+(?:[-'’][A-Za-z]+)*)*[ \t]*)$/.exec(text);
  if (!match) return null;
  const words = match[1].trim().split(/[ \t]+/);
  if (words.length > 4) return null;
  if (words.length > 1 && (/^(?:I|you|he|she|it|we|they|this|that|these|those|there|here)$/i.test(words[0])
    || words.some(word => /^(?:is|are|was|were|says?|pronounced|pronunciation|words?|phrases?|sentences?)$/i.test(word)))) return null;
  // Do not capture a suffix of an abbreviation, identifier, or longer word.
  if (match.index > 0 && /[A-Za-z0-9_'’.-]/.test(text[match.index - 1])) return null;
  return match.index;
}

/** Flattening text.runs, paired.wordRuns + ipaRuns, and standalone.ipaRuns in
 * returned order exactly reconstructs the source text and original styling.
 * This function never changes source runs or invents a missing headword. */
export function layoutKnowledgePhonetics(runs: readonly EnglishSixKnowledgeInline[]): KnowledgePhoneticPart[] {
  const source = sourceRuns(runs), text = runs.map(run => run.text).join("");
  const { ranges, inferred } = pronunciationRanges(text, source);
  if (!ranges.length) return text ? [{ kind: "text", runs: sliceRuns(source, 0, text.length, []) }] : [];
  const parts: KnowledgePhoneticPart[] = [];
  let cursor = 0;
  for (const range of ranges) {
    const prefix = text.slice(cursor, range.start), start = adjacentWordStart(prefix);
    const wordStart = start === null ? range.start : cursor + start;
    if (cursor < wordStart) parts.push({ kind: "text", runs: sliceRuns(source, cursor, wordStart, inferred) });
    const ipaRuns = sliceRuns(source, range.start, range.end, inferred);
    if (start === null) parts.push({ kind: "standalone", ipaRuns });
    else parts.push({ kind: "paired", wordRuns: sliceRuns(source, wordStart, range.start, inferred), ipaRuns });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push({ kind: "text", runs: sliceRuns(source, cursor, text.length, inferred) });
  return parts;
}

/** A table IPA column may contain surrounding whitespace or paired brackets,
 * but any headword, POS label, translation or explanation makes it non-IPA. */
export function phoneticOnlyRuns(runs: readonly EnglishSixKnowledgeInline[]): boolean {
  const parts = layoutKnowledgePhonetics(runs);
  return parts.some(part => part.kind === "standalone") && parts.every(part => part.kind === "standalone"
    || part.kind === "text" && part.runs.every(run => !run.text.trim()));
}
