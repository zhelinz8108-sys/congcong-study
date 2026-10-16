import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = "ubuntu@124.223.31.175";
const releaseName = process.argv[3];
assert.match(releaseName ?? "", /^english-six-bank-[a-z0-9-]{1,64}$/, "Provide a fresh release directory name");
const remote = `/www/study-plan-data/${releaseName}`;
const options = ["-i", path.join(path.dirname(app), ".deploy-keys/english-six-20261011"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=12"];
const mode = process.argv[2];
assert.ok(["prepare", "activate"].includes(mode));
const resourceFlag = process.argv.find(a => a.startsWith("--resources="));
const resourceIds = resourceFlag ? resourceFlag.slice(12).split(",") : [];
assert.equal(new Set(resourceIds).size, resourceIds.length);
assert.ok(resourceIds.every(id => /^[a-f0-9]{12}$/.test(id)));
const folder = path.join(app, "tmp", releaseName);
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const ssh = command => execFileSync("ssh", [...options, target, command], { encoding: "utf8", timeout: 300000 });
if (mode === "prepare") {
  mkdirSync(folder, { recursive: true });
  const runtime = ["src/server/english-six-bank.ts", "src/lib/english-six-bank.ts", "src/server/english-six.ts", "src/components/english-six-bank-practice.tsx", "src/components/english-six-bank.tsx"];
  const remoteHashes = ssh(`cd /www/study-plan; sha256sum ${runtime.join(" ")}`);
  const localHashes = runtime.map(f => `${hash(path.join(app, f))}  ${f}\n`).join("");
  assert.equal(remoteHashes.trim(), localHashes.trim(), "Data-only update requires the same bank runtime");
  writeFileSync(path.join(folder, "runtime.sha256"), remoteHashes);
  const sourceFiles = resourceIds.map(id => `resources/${id}.json`);
  const beforeFiles = ["bank/index.json", "bank/lookup.private.json", ...(resourceIds.length ? ["index.json", ...sourceFiles] : [])];
  writeFileSync(path.join(folder, "before.sha256"), ssh(`cd /www/study-plan; sha256sum ${beforeFiles.map(f => `content/english-six/${f}`).join(" ")}`));
  const previousQuestions = Number(ssh("cd /www/study-plan; node -p \"require('./content/english-six/bank/index.json').questionCount\""));
  assert.ok(Number.isSafeInteger(previousQuestions) && previousQuestions > 0);
  const root = path.join(app, "content/english-six/bank");
  const bank = JSON.parse(readFileSync(path.join(root, "index.json"), "utf8"));
  assert.equal(bank.complete, false);
  assert.ok(bank.questionCount > previousQuestions || resourceIds.length > 0 && bank.questionCount === previousQuestions,
    "A release must add questions or include a reviewed resource repair");
  for (const id of resourceIds) assert.ok(bank.papers.some(p => p.sourceId === id), "Repaired source has an interactive entry");
  const files = ["index.json", "lookup.private.json", "audit.private.json", ...bank.papers.map(p => `papers/${p.id}.json`)];
  writeFileSync(path.join(folder, "bank.sha256"), files.map(f => `${hash(path.join(root, f))}  ${f}\n`).join(""));
  writeFileSync(path.join(folder, "release.json"), JSON.stringify({ questions: bank.questionCount, papers: bank.papers.length, complete: false, resourceIds }));
  execFileSync("tar", ["-czf", path.join(folder, "bank.tar.gz"), "-C", root, ...files]);
  const extra = [];
  if (resourceIds.length) {
    const content = path.dirname(root);
    writeFileSync(path.join(folder, "resources.sha256"), sourceFiles.map(f => `${hash(path.join(content, f))}  ${f}\n`).join(""));
    execFileSync("tar", ["-czf", path.join(folder, "resources.tar.gz"), "-C", content, ...sourceFiles]);
    extra.push("resources.sha256", "resources.tar.gz");
  }
  ssh(`test ! -e '${remote}' && install -d -m 700 '${remote}'`);
  execFileSync("scp", [...options, ...["bank.tar.gz", "bank.sha256", "runtime.sha256", "before.sha256", "release.json", ...extra].map(f => path.join(folder, f)), ...["release-english-six-bank-data.sh", "check-english-six-bank-data.mjs"].map(f => path.join(app, "scripts", f)), `${target}:${remote}/`], { stdio: "inherit" });
}
console.log(ssh(`bash '${remote}/release-english-six-bank-data.sh' ${mode}`));
