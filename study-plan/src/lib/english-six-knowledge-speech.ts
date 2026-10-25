import type { EnglishSixKnowledgeBlock, EnglishSixKnowledgeInline } from "./english-six-knowledge";

export type EnglishSixKnowledgeSpeechItem = { text: string; chunks: string[] };
const boundary = "\uE000";
const han = /[\u3400-\u9fff]/;

function removeChineseAnnotations(text: string) {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: { close: string; text: string }[] = [{ close: "", text: "" }];
  for (const character of text) {
    if (pairs[character]) stack.push({ close: pairs[character], text: "" });
    else if (stack.length > 1 && character === stack.at(-1)!.close) {
      const annotation = stack.pop()!.text;
      stack.at(-1)!.text += han.test(annotation)
        ? /[A-Za-z]/.test(annotation) ? boundary + annotation + boundary : " "
        : ` ${annotation} `;
    } else stack.at(-1)!.text += character;
  }
  // An unmatched bracket must not swallow the remainder of a source example.
  while (stack.length > 1) stack[stack.length - 2].text += boundary + stack.pop()!.text;
  return stack[0].text;
}

function removeUnmarkedIpa(text: string) {
  return text.replace(/(?<![A-Za-z0-9])\/(?=[^/\n]{1,80}\/)([^/\n]*[\u0250-\u02af\u1d00-\u1d7fæθðŋːˑˈˌ][^/\n]*)\/(?![A-Za-z0-9])/g, " ")
    .replace(/(?<![A-Za-z0-9])\/[ \t]*(?:[tdszfvpbgkmnhlrwjiea]|i:|u:|ai|ei|oi|au|ou)[ \t]*\/(?![A-Za-z0-9])/gi, " ");
}

/** Only English words, phrases and examples are spoken. Chinese prose is a
 * boundary, never glue joining two unrelated pieces of English. */
export function speechForText(raw: string): string[] {
  let text = raw.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");
  text = removeChineseAnnotations(removeUnmarkedIpa(text));
  text = text.replace(/((?:课文原句|例句|示例|例)\s*)\d{1,2}\s+(?=[A-Za-z])/g, "$1")
    .replace(/(?:字母组合|字母)\s*[A-Za-z]{1,3}\b/g, " ")
    .replace(/(?<![A-Za-z])-(?:ed|ing|es|s)\b/gi, " ");
  text = text.replace(/(?<![A-Za-z])(?:modal\s+v|adj|adv|prep|pron|num|conj|det|art|vi|vt|n|v)\.(?=\s|$|[\u3400-\u9fff,;:/])/gi, " ")
    .replace(/\bsb\.?'s\b/gi, "somebody's")
    .replace(/\bsth\.?'s\b/gi, "something's")
    .replace(/\bsb\.?(?=$|[^A-Za-z])/gi, "somebody")
    .replace(/\bsth\.?(?=$|[^A-Za-z])/gi, "something")
    .replace(/((?:例句|示例|例如|例)\s*[:：])/g, "\n$1");
  const parts: string[] = [];
  for (let line of text.split(/[\r\n]+/)) {
    // Formula slots are not spoken English examples. A following example on
    // the next line is still retained in full.
    if (/[+]/.test(line) && /主语|谓语|宾语|形容词|副词|动词|名词/.test(line) && /结构|句式|句型|构成|公式/.test(line)) continue;
    line = line.replace(/\b(and)\/or\b/gi, "$1 or")
      .replace(/(?<=[A-Za-z])\/(?=[A-Za-z])/g, " or ")
      .replace(/\//g, " ")
      .replace(/_{2,}/g, ", ")
      .replace(/[→⇒+*=<>×√✓✗✘]/g, ", ")
      .replace(/[，、]/g, ",").replace(/。/g, ".").replace(/！/g, "!").replace(/？/g, "?").replace(/；/g, ";").replace(/：/g, ":")
      .replace(/[^A-Za-z0-9'".,!?;:\- \t]/g, boundary);
    for (let part of line.split(new RegExp(`${boundary}+`, "g"))) {
      part = part.replace(/^\s*(?:\(?\d+[.)]\s*)+/, "")
        // A small list marker before a pronoun or these imperative starters
        // cannot be a quantity. Dates, years and noun quantities stay intact.
        .replace(/^\s*[1-9]\d?\s+(?=(?:I|We|You|He|She|It|They|This|That|These|Those|Just|Let)\b)/, "")
        .replace(/\s+/g, " ")
        .replace(/^[\s,.;:!?\-]+|[\s,;:\-]+$/g, "").trim();
      if (/[A-Za-z]/.test(part)) parts.push(part);
    }
  }
  return parts;
}

export function speechForRuns(runs: EnglishSixKnowledgeInline[]): string[] {
  return speechForText(runs.map(run => run.ipa ? " " : run.text).join(""));
}

function lastSentenceBoundary(text: string) {
  let end = -1;
  for (const match of text.matchAll(/[.!?]+["')\]]*(?=\s|$)/g)) {
    const prefix = text.slice(0, match.index! + match[0].length);
    // Keep titles, initials, dotted abbreviations and decimal numbers intact.
    if (match[0].startsWith(".") && /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr)|\b[A-Z]|\b(?:[A-Za-z]\.)+[A-Za-z])\.$/.test(prefix)) continue;
    end = match.index! + match[0].length;
  }
  return end;
}

/** A hard upper bound also applies to sentences without commas/spaces. */
export function chunkEnglishSpeech(raw: string, maximum = 150): string[] {
  const limit = Number.isFinite(maximum) ? Math.max(1, Math.min(150, Math.floor(maximum))) : 150;
  const chunks: string[] = [];
  for (const line of raw.split(/[\r\n]+/)) {
    let remaining = line.replace(/\s+/g, " ").trim();
    while (remaining.length > limit) {
      const window = remaining.slice(0, limit + 1);
      let cut = lastSentenceBoundary(window.slice(0, limit));
      if (cut < 1) {
        const clauses = [...window.slice(0, limit).matchAll(/[,;:](?=\s)/g)];
        cut = clauses.at(-1)?.index === undefined ? -1 : clauses.at(-1)!.index! + 1;
      }
      if (cut < 1) cut = window.lastIndexOf(" ", limit);
      if (cut < 1) cut = limit;
      const chunk = remaining.slice(0, cut).trim();
      if (chunk) chunks.push(chunk);
      remaining = remaining.slice(cut).trimStart();
    }
    if (remaining) chunks.push(remaining);
  }
  return chunks;
}

/** One item per nonempty paragraph/callout paragraph/table cell, in source
 * order. Headerless tables retain the first row. No global deduplication. */
export function speechForBlock(block: EnglishSixKnowledgeBlock): EnglishSixKnowledgeSpeechItem[] {
  const fields = block.kind === "heading" ? [[{ text: block.text }]] : block.kind === "paragraph" ? [block.runs]
    : block.kind === "callout" ? block.paragraphs : [...(block.headers ? [block.headers] : []), ...block.rows].flat();
  return fields.flatMap(runs => {
    const parts = speechForRuns(runs);
    return parts.length ? [{ text: parts.join("\n"), chunks: parts.flatMap(part => chunkEnglishSpeech(part)) }] : [];
  });
}
