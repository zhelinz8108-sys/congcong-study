import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { brotliDecompressSync } from "node:zlib";
import assets from "@/data/grade-six-reviews.json";
import index from "@/data/math-atlas-index.json";
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
let atlasPages: Promise<string[]> | undefined;

export function getMathAtlasPages() {
  atlasPages ??= (async () => {
    const math = assets.find(asset => asset.id === "math");
    if (!math?.readerSha256) throw new Error("Missing math atlas edition");
    const bytes = await readReviewFile({ id: "math-reader", sha256: math.readerSha256 });
    const book = JSON.parse(brotliDecompressSync(bytes, { maxOutputLength: 8 * 1024 * 1024 }).toString("utf8"));
    if (book.edition !== math.sha256 || !Array.isArray(book.pages) || book.pages.length !== atlasPageCount ||
        !book.pages.every((page: unknown) => typeof page === "string" && page.length > 0)) {
      throw new Error("Math atlas pages do not match the downloadable edition");
    }
    return book.pages as string[];
  })().catch(error => {
    atlasPages = undefined;
    throw error;
  });
  return atlasPages;
}
