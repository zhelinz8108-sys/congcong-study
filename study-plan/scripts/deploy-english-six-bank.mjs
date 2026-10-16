import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = "ubuntu@124.223.31.175";
const remote = "/www/study-plan-data/english-six-bank-20261011";
const options = ["-i", path.join(path.dirname(app), ".deploy-keys/english-six-20261011"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=12"];
const existing = {
  "src/components/english-six-hub.tsx": "36752aa9923d489cb9b938984cbb8408eba558bb5a19199b4a619166691770ad",
  "src/components/english-six-reader.tsx": "4f0c4d01096fe87c8af932eb7fbd1cce23d0d08e4b8517371d0a24b1d019ecf4",
  "src/components/english-six.module.css": "106c2d8f0300f0445a97d107b64f306faee964970db8c5ff478e4109299ab122",
  "src/app/api/english/six/resource/[resource]/route.ts": "722fa6d9c3d5f7a48a25780f343ec27e55ba6b9501c4737c99014505d4e04a53",
  "src/server/english-locked.ts": "3c4bf74072c02ce1b2629d1d50e741fde4e5882c707f57a30f515fe0eabe243c",
};
const added = [
  "src/lib/english-six-bank.ts", "src/server/english-six-bank.ts",
  "src/components/english-six-bank.tsx", "src/components/english-six-bank-practice.tsx",
  "src/app/api/english/six/bank/route.ts", "src/app/api/english/six/bank/[paper]/route.ts",
  "src/app/subjects/[id]/english/six/bank/page.tsx", "src/app/subjects/[id]/english/six/bank/[paper]/page.tsx",
];
const files = [...Object.keys(existing), ...added];
const mode = process.argv[2];
assert.ok(["prepare", "activate", "preflight"].includes(mode));
function ssh(command) { execFileSync("ssh", [...options, target, command], { stdio: "inherit" }); }
if (mode === "prepare") {
  const folder = path.join(app, "tmp/english-six-bank-release");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, "before.sha256"), Object.entries(existing).map(([f, hash]) => `${hash}  ${f}\n`).join(""));
  writeFileSync(path.join(folder, "after.sha256"), files.map(f => `${createHash("sha256").update(readFileSync(path.join(app, f))).digest("hex")}  ${f}\n`).join(""));
  writeFileSync(path.join(folder, "added-files.txt"), added.join("\n") + "\n");
  execFileSync("tar", ["-czf", path.join(folder, "code.tar.gz"), "-C", app, ...files]);
  const bank = JSON.parse(readFileSync(path.join(app, "content/english-six/bank/index.json"), "utf8"));
  assert.equal(bank.complete, false);
  const data = ["index.json", "lookup.private.json", "audit.private.json", ...bank.papers.map(p => `papers/${p.id}.json`)];
  writeFileSync(path.join(folder, "bank.sha256"), data.map(f => `${createHash("sha256").update(readFileSync(path.join(app, "content/english-six/bank", f))).digest("hex")}  ${f}\n`).join(""));
  execFileSync("tar", ["-czf", path.join(folder, "bank.tar.gz"), "-C", path.join(app, "content/english-six/bank"), ...data]);
  ssh(`test ! -e '${remote}' && install -d -m 700 '${remote}'`);
  execFileSync("scp", [...options, ...["code.tar.gz", "bank.tar.gz", "before.sha256", "after.sha256", "bank.sha256", "added-files.txt"].map(f => path.join(folder, f)), `${target}:${remote}/`], { stdio: "inherit" });
}
execFileSync("scp", [...options, ...["release-english-six-bank.sh", "check-english-six-bank-release.mjs", "check-english-six-release.mjs"].map(f => path.join(app, "scripts", f)), `${target}:${remote}/`], { stdio: "inherit" });
ssh(`bash '${remote}/release-english-six-bank.sh' ${mode}`);
