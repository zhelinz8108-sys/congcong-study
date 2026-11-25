import { readFile } from "node:fs/promises";
import path from "node:path";
import pdfPackage from "pdfjs-dist/package.json";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ version: pdfPackage.version }];
}

export async function GET() {
  const source = await readFile(path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"), "utf8");
  return new Response(source, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
