import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { brotliDecompressSync } from "node:zlib";
import AdmZip from "adm-zip";
import assets from "@/data/grade-six-reviews.json";
import index from "@/data/math-atlas-index.json";
import { finalExamNames, finalExamNumber, type FinalExamEdition } from "@/lib/math-final-exams";
import { decryptEnglishSixKnowledge } from "./english-six-knowledge-envelope";

const root = path.join(process.cwd(), "content/grade-six-reviews");
const files = new Map<string, Promise<Buffer>>();

type ReviewFile = { id: string; sha256: string; parts?: number };

export function readReviewFile(asset: ReviewFile): Promise<Buffer> {
  const cached = files.get(asset.id);
  if (cached) return cached;

  const pending = (async () => {
    const chunks: Buffer[] = [];
    for (let part = 1; part <= (asset.parts ?? 1); part++) {
      const id = part === 1 ? asset.id : asset.id + "-" + part;
      const envelope = JSON.parse(await readFile(path.join(root, id + ".encrypted.json"), "utf8"));
      const encoded = decryptEnglishSixKnowledge(envelope, process.env.HOLIDAY_MATH_700_KEY?.trim() ?? "");
      if (typeof encoded !== "string") throw new Error("Invalid grade-six review package");
      chunks.push(Buffer.from(encoded, "base64"));
    }
    const bytes = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
      throw new Error("Grade-six review does not match its published edition");
    }
    return bytes;
  })().catch(error => {
    files.delete(asset.id);
    throw error;
  });
  files.set(asset.id, pending);
  return pending;
}

export const atlasPageCount = index.reduce((count, group) => count + group.titles.length, 0);
type AtlasEdition = { id: string; sha256: string; readerSha256?: string; pageCount?: number };
const atlasBooks = new Map<string, Promise<string[]>>();

function readAtlasPages(assetId: string, expectedPages?: number) {
  const cached = atlasBooks.get(assetId);
  if (cached) return cached;

  const pending = (async () => {
    const asset: AtlasEdition | undefined = assets.find(entry => entry.id === assetId);
    const count = expectedPages ?? asset?.pageCount;
    if (!asset?.readerSha256 || !count) throw new Error("Missing atlas edition");
    const bytes = await readReviewFile({ id: assetId + "-reader", sha256: asset.readerSha256 });
    const book = JSON.parse(brotliDecompressSync(bytes, { maxOutputLength: 8 * 1024 * 1024 }).toString("utf8"));
    if (book.edition !== asset.sha256 || !Array.isArray(book.pages) || book.pages.length !== count ||
        !book.pages.every((page: unknown) => typeof page === "string" && page.length > 0)) {
      throw new Error("Atlas pages do not match the downloadable edition");
    }
    return book.pages as string[];
  })().catch(error => {
    atlasBooks.delete(assetId);
    throw error;
  });
  atlasBooks.set(assetId, pending);
  return pending;
}

export function getMathAtlasPages() {
  return readAtlasPages("math", atlasPageCount);
}

export function getEnglishAtlasPages() {
  return readAtlasPages("english-atlas");
}

export async function getFinalExamArticle(number: number, edition: FinalExamEdition) {
  const articles = await readAtlasPages(`math-final-${edition}`, finalExamNames.length);
  return articles[number - 1];
}

export async function readFinalExamPdf(id: string) {
  const match = /^math-final-(student|answers)-(\d+)$/.exec(id);
  const number = match && finalExamNumber(match[2]);
  if (!match || !number) return null;

  // Serve the original individual PDFs directly from the verified print bundle.
  const bundle = assets.find(asset => asset.id === "math-final-pack");
  if (!bundle) throw new Error("Missing final exam print bundle");
  const label = match[1] === "student" ? "学生卷" : "答案解析";
  const filename = `第${String(number).padStart(2, "0")}卷-${label}.pdf`;
  const entry = new AdmZip(await readReviewFile(bundle)).getEntry(`${label}/${filename}`);
  if (!entry || entry.isDirectory) throw new Error("Missing PDF in final exam print bundle");
  return { filename, type: "application/pdf", bytes: entry.getData() };
}
