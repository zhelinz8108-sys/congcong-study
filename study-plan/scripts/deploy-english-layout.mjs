import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [mode, release] = process.argv.slice(2);
assert.ok(["prepare", "activate"].includes(mode));
assert.match(release ?? "", /^english-layout-[a-z0-9-]{1,48}$/);
const remote = `/www/study-plan-data/${release}`, target = "ubuntu@124.223.31.175";
const options = ["-i", path.join(path.dirname(app), ".deploy-keys/english-six-20261011"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=12", "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=3"];
const existing = ["src/app/subjects/[id]/page.tsx", "src/components/english-six-hub.tsx", "src/components/english-six-bank.tsx", "src/components/english-six.module.css"];
const added = ["src/components/english-subject-home.tsx", "src/components/english-subject-home.module.css"];
const retired = [];
const update = process.argv.includes("--update");
const homeOnly = process.argv.includes("--home-only");
const readerOnly = process.argv.includes("--reader-only");
const practiceOnly = process.argv.includes("--practice-only");
const qualityOnly = process.argv.includes("--quality-only");
const lowMemory = process.argv.includes("--low-memory");
const temporarySwap = process.argv.includes("--temporary-swap");
assert.ok([update, homeOnly, readerOnly, practiceOnly, qualityOnly].filter(Boolean).length <= 1);
assert.ok(!lowMemory || readerOnly || practiceOnly || qualityOnly, "Low-memory release is scoped to Six");
assert.ok(!temporarySwap || lowMemory, "Temporary swap requires the isolated build");
if (qualityOnly) {
  existing.splice(0, existing.length, "src/lib/english-six.ts", "src/lib/english-locked-types.ts", "src/server/english-six.ts", "src/server/english-locked.ts", "src/components/english-six-answer-fields.tsx");
  added.splice(0, added.length, "src/server/english-six-quality.ts");
} else if (practiceOnly) {
  existing.splice(0, existing.length, "src/lib/english-six.ts", "src/lib/english-six-bank.ts", "src/server/english-six.ts", "src/server/english-six-bank.ts",
    "src/components/english-six-hub.tsx", "src/components/english-six-reader.tsx", "src/components/english-six-bank-practice.tsx", "src/components/english-six-practice.tsx", "src/components/english-six.module.css",
    "src/app/api/english/six/index/route.ts", "src/app/api/english/six/resource/[resource]/route.ts");
  added.splice(0, added.length, "src/lib/english-six-answer.ts", "src/components/english-six-answer-fields.tsx", "src/server/english-six-practice.ts", "src/app/api/english/six/resource/[resource]/practice/route.ts");
} else if (readerOnly) {
  existing.splice(0, existing.length, "src/components/english-six-reader.tsx");
  added.splice(0, added.length, "src/lib/english-six-document.ts", "src/components/english-six-document.tsx", "src/components/english-six-document.module.css", "src/data/english-six-reader-layouts.public.json");
} else if (homeOnly) { existing.splice(1); retired.push(...added.splice(0)); }
else if (update) existing.push(...added.splice(0));
if (lowMemory) existing.push("next.config.ts");
const ssh = (command, stream = false) => execFileSync("ssh", [...options, target, command], { encoding: "utf8", timeout: stream ? 1050000 : 30000, ...(stream ? { stdio: "inherit" } : {}) });
if (mode === "prepare") {
  const folder = path.join(app, "tmp", release);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, "update-mode"), qualityOnly ? "quality" : practiceOnly ? "practice" : readerOnly ? "reader" : homeOnly ? "home" : update ? "update" : "initial");
  writeFileSync(path.join(folder, "low-memory-build"), lowMemory ? "1" : "0");
  writeFileSync(path.join(folder, "temporary-swap"), temporarySwap ? "1" : "0");
  writeFileSync(path.join(folder, "before.sha256"), ssh(`cd /www/study-plan; sha256sum ${[...existing, ...retired].map(f => `'${f}'`).join(" ")}`));
  const preserved = homeOnly || readerOnly ? ["src/components/english-six-hub.tsx", "src/components/english-six-bank.tsx", "src/components/english-six.module.css", "src/components/english-listening-panel.tsx", "src/app/subjects/[id]/reading/page.tsx", "src/app/subjects/[id]/vocab/page.tsx", "src/app/subjects/[id]/grammar/page.tsx", "src/app/subjects/[id]/phrases/page.tsx"] : [];
  if (readerOnly) preserved.push("src/app/subjects/[id]/page.tsx", "src/lib/english-six.ts", "src/lib/english-six-bank.ts");
  if (practiceOnly) preserved.push("src/app/subjects/[id]/page.tsx", "src/components/english-six-bank.tsx", "src/components/english-six-document.tsx", "src/lib/english-six-document.ts", "src/components/english-six-document.module.css", "src/data/english-six-reader-layouts.public.json",
    "src/components/english-listening-panel.tsx", "src/app/subjects/[id]/reading/page.tsx", "src/app/subjects/[id]/vocab/page.tsx", "src/app/subjects/[id]/grammar/page.tsx", "src/app/subjects/[id]/phrases/page.tsx",
    "src/server/english-locked.ts", "src/server/first-submission.ts", "src/lib/use-english-locked.ts");
  if (qualityOnly) preserved.push("src/app/subjects/[id]/page.tsx", "src/components/english-six-hub.tsx", "src/components/english-six-bank.tsx", "src/components/english-six.module.css",
    "src/components/english-six-document.tsx", "src/data/english-six-reader-layouts.public.json", "src/components/english-listening-panel.tsx",
    "src/app/subjects/[id]/reading/page.tsx", "src/app/subjects/[id]/vocab/page.tsx", "src/app/subjects/[id]/grammar/page.tsx", "src/app/subjects/[id]/phrases/page.tsx",
    "src/server/first-submission.ts", "src/lib/use-english-locked.ts", "src/server/english-six-bank.ts", "src/lib/english-six-answer.ts");
  if (readerOnly) {
    const layouts = JSON.parse(readFileSync(path.join(app, "src/data/english-six-reader-layouts.public.json"), "utf8"));
    assert.equal(Object.keys(layouts).length, 8);
    const sources = Object.keys(layouts).map(id => `content/english-six/resources/${id}.json`);
    const remoteHashes = ssh(`cd /www/study-plan; sha256sum ${sources.map(f => `'${f}'`).join(" ")}`);
    for (const [id, layout] of Object.entries(layouts))
      assert.ok(remoteHashes.includes(`${layout.sourceSha256}  content/english-six/resources/${id}.json`), `Layout does not match the live source ${id}`);
    preserved.push(...sources);
  }
  const dataFiles = ["content/english-six/index.json", "content/english-six/bank/index.json", "content/english-six/bank/lookup.private.json", ...preserved];
  writeFileSync(path.join(folder, "data.sha256"), ssh(`cd /www/study-plan; sha256sum ${dataFiles.map(f => `'${f}'`).join(" ")}`));
  writeFileSync(path.join(folder, "after.sha256"), [...existing, ...added].map(f => `${createHash("sha256").update(readFileSync(path.join(app, f))).digest("hex")}  ${f}\n`).join(""));
  execFileSync("tar", ["-czf", path.join(folder, "code.tar.gz"), "-C", app, ...existing, ...added]);
  const qualityUploads = [];
  if (qualityOnly) {
    const manifest = JSON.parse(readFileSync(path.join(app, "content/english-six/quality-review.private.json"), "utf8"));
    const changed = [...new Set(manifest.changes.map(change => `content/english-six/${change.file}`))];
    const addition = "content/english-six/quality-review.private.json";
    for (const file of changed) assert.match(file, /^content\/english-six\/(?:practice\/[1-8]|bank\/papers\/[a-f0-9]{12}-[a-f0-9]{8})\.json$/);
    const before = changed.map(file => `${createHash("sha256").update(readFileSync(path.join(app, "tmp/english-six-quality/baseline", file.replace("content/english-six/", "")))).digest("hex")}  ${file}\n`).join("");
    writeFileSync(path.join(folder, "quality-before.sha256"), before);
    writeFileSync(path.join(folder, "quality-existing"), changed.join("\n") + "\n");
    writeFileSync(path.join(folder, "quality-added"), addition + "\n");
    writeFileSync(path.join(folder, "quality-after.sha256"), [...changed, addition].map(file => `${createHash("sha256").update(readFileSync(path.join(app, file))).digest("hex")}  ${file}\n`).join(""));
    execFileSync("tar", ["-czf", path.join(folder, "quality.tar.gz"), "-C", app, ...changed, addition]);
    qualityUploads.push(...["quality-before.sha256", "quality-after.sha256", "quality-existing", "quality-added", "quality.tar.gz"].map(file => path.join(folder, file)));
  }
  console.log(ssh(`test ! -e '${remote}' && install -d -m 700 '${remote}'; df -h /www/study-plan-data`));
  execFileSync("scp", [...options, ...["before.sha256", "after.sha256", "data.sha256", "code.tar.gz", "update-mode", "low-memory-build", "temporary-swap"].map(f => path.join(folder, f)), ...qualityUploads, ...["release-english-layout.sh", "build-english-layout.sh", "check-english-layout-release.mjs"].map(f => path.join(app, "scripts", f)), `${target}:${remote}/`], { stdio: "inherit", timeout: 120000 });
}
ssh(`bash '${remote}/release-english-layout.sh' '${mode}' '${release}'`, true);
