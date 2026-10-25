import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertEnglishSixKnowledgeBook, summarizeEnglishSixKnowledgeBook, type EnglishSixKnowledgeBook } from "@/lib/english-six-knowledge";
import { decryptEnglishSixKnowledge } from "./english-six-knowledge-envelope";

const root = path.join(process.cwd(), "content", "english-six-knowledge");
let loaded: Promise<EnglishSixKnowledgeBook> | undefined;

/** Server-only authenticated content. The public source tree contains encrypted
 * lesson text; browser pages receive only the requested, authorised unit. */
export function getEnglishSixKnowledgeBook(): Promise<EnglishSixKnowledgeBook> {
  loaded ??= (async () => {
    const [encrypted, rawManifest] = await Promise.all([
      readFile(path.join(root, "sealed", "book.encrypted.json"), "utf8"),
      readFile(path.join(root, "manifest.public.json"), "utf8"),
    ]);
    const manifest = JSON.parse(rawManifest) as { version: number; canonicalSha256: string };
    if (manifest.version !== 1 || !/^[a-f0-9]{64}$/.test(manifest.canonicalSha256)) throw new Error("Invalid English knowledge manifest");
    const book = decryptEnglishSixKnowledge(JSON.parse(encrypted), process.env.HOLIDAY_MATH_700_KEY?.trim() ?? "");
    assertEnglishSixKnowledgeBook(book);
    if (createHash("sha256").update(JSON.stringify(book)).digest("hex") !== manifest.canonicalSha256) throw new Error("English knowledge release does not match its manifest");
    return book;
  })();
  return loaded;
}

export async function getEnglishSixKnowledgeSummary() {
  return summarizeEnglishSixKnowledgeBook(await getEnglishSixKnowledgeBook());
}

export async function getEnglishSixKnowledgeUnit(number: number) {
  if (!Number.isInteger(number) || number < 1 || number > 8) return undefined;
  return (await getEnglishSixKnowledgeBook()).units.find(unit => unit.number === number);
}
