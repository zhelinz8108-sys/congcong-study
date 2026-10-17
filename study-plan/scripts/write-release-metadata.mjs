import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function writeReleaseMetadata(root, commit) {
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error("Expected a lowercase 40-character commit SHA.");
  }
  const buildId = (await readFile(path.join(root, ".next/BUILD_ID"), "utf8")).trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(buildId)) {
    throw new Error("Invalid Next build ID.");
  }
  const target = path.join(root, "release-metadata.json");
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ commit, buildId }) + "\n", {
      flag: "wx", mode: 0o644,
    });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error("Expected commit SHA and staging directory.");
    await writeReleaseMetadata(process.argv[3], process.argv[2]);
  } catch {
    console.error("Release metadata could not be written.");
    process.exitCode = 1;
  }
}
