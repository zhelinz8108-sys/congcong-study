import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = "ubuntu@124.223.31.175";
const remote = "/www/study-plan-data/english-six-organization-20261011";
const options = ["-i", path.join(path.dirname(app), ".deploy-keys/english-six-20261011"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes"];
const files = ["src/components/english-six-hub.tsx", "src/components/english-six-reader.tsx", "src/components/english-six.module.css", "src/lib/english-six.ts"];
const before = ["b7737ff2f506c7646fd102185bb3fd53023aa761555a4191984add39dca03923", "57db3f68cd969687f2c5d105254c3a037c70ea443a1e74252cfb38556ec3705b", "4740226947c9269bbb14b4b0f8b982c1d95f6808e28dc5066f9c73659b9a11d3", "77dd52e20bbdf2db6f46f149f6c8d24abeb5847d8889776cbf97a6341523d635"];
const mode = process.argv[2];
assert.ok(["prepare", "activate"].includes(mode));
function ssh(command) { execFileSync("ssh", [...options, target, command], { stdio: "inherit" }); }
if (mode === "prepare") {
  const folder = path.join(app, "tmp/english-six-organization-release");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, "before.sha256"), files.map((f, i) => `${before[i]}  ${f}\n`).join(""));
  writeFileSync(path.join(folder, "after.sha256"), files.map(f => `${createHash("sha256").update(readFileSync(path.join(app, f))).digest("hex")}  ${f}\n`).join(""));
  execFileSync("tar", ["-czf", path.join(folder, "code.tar.gz"), "-C", app, ...files]);
  ssh(`install -d -m 700 '${remote}'`);
  execFileSync("scp", [...options, path.join(folder, "code.tar.gz"), path.join(folder, "before.sha256"), path.join(folder, "after.sha256"), `${target}:${remote}/`], { stdio: "inherit" });
}
execFileSync("scp", [...options, path.join(app, "scripts/release-english-six-organization.sh"), path.join(app, "scripts/check-english-six-release.mjs"), `${target}:${remote}/`], { stdio: "inherit" });
ssh(`bash '${remote}/release-english-six-organization.sh' ${mode}`);
