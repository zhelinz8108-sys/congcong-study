import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import nextEnv from "@next/env";
export const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
nextEnv.loadEnvConfig(appRoot, false);
const urls = new Map();
async function moduleUrl(filename) {
  if (urls.has(filename)) return urls.get(filename);
  let source;
  if (filename.endsWith(".json"))
    source = `export default ${readFileSync(filename, "utf8")};`;
  else {
    source = ts.transpileModule(
      readFileSync(filename, "utf8").replace(
        /^\s*import\s+['"]server-only['"];?\s*$/gm,
        "",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;
    for (const [, specifier] of [
      ...source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g),
    ]) {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
      let file = specifier.startsWith("@/")
        ? path.join(appRoot, "src", specifier.slice(2))
        : path.resolve(path.dirname(filename), specifier);
      if (!path.extname(file)) file += ".ts";
      const url = await moduleUrl(file);
      source = source
        .replaceAll(`'${specifier}'`, JSON.stringify(url))
        .replaceAll(`"${specifier}"`, JSON.stringify(url));
    }
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  urls.set(filename, url);
  return url;
}
export async function loadHolidayTestModule(file) {
  return import(await moduleUrl(path.resolve(appRoot, file)));
}
export function canonicalHolidayAnswer(key) {
  return key.kind === "parts"
    ? Object.fromEntries(
        Object.entries(key.value).map(([id, part]) => [
          id,
          canonicalHolidayAnswer(part),
        ]),
      )
    : structuredClone(key.value);
}
