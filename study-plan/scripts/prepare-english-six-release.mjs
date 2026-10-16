import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.dirname(app);
const out = path.join(app, "tmp/english-six-deploy");
const stage = path.join(out, "code");
const git = args => execFileSync("git", ["-c", `safe.directory=${repo.replaceAll("\\", "/")}`, ...args], { cwd: repo });
const baseline = file => git(["show", `HEAD:study-plan/${file}`]);
const digest = data => createHash("sha256").update(data).digest("hex");
mkdirSync(stage, { recursive: true });
const files = [
  "src/lib/english-six.ts", "src/server/english-six.ts",
  "src/components/english-six-hub.tsx", "src/components/english-six-reader.tsx",
  "src/components/english-six-practice.tsx", "src/components/english-six.module.css",
  "src/app/subjects/[id]/page.tsx",
  "scripts/test-english-six.mjs", "scripts/test-english-six-browser.mjs",
];
function walk(folder) {
  for (const entry of readdirSync(path.join(app, folder), { withFileTypes: true })) {
    const file = `${folder}/${entry.name}`;
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) files.push(file);
    else throw new Error(`Unexpected entry: ${file}`);
  }
}
walk("src/app/subjects/[id]/english/six");
walk("src/app/api/english/six");
const subjectDiff = git(["diff", "--unified=0", "--", "study-plan/src/app/subjects/[id]/page.tsx"]).toString();
assert.equal((subjectDiff.match(/^@@/gm) ?? []).length, 2, "Subject change must contain only the two English entry hunks");
assert.ok(subjectDiff.includes("/english/six"));
for (const file of files) {
  const target = path.join(stage, file);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.join(app, file), target);
}

// Build shared files from HEAD plus this feature, excluding concurrent math edits.
let config = baseline("next.config.ts").toString();
assert.ok(config.includes("const nextConfig: NextConfig = {"));
assert.ok(config.includes("  outputFileTracingExcludes: {"));
config = config.replace("const nextConfig: NextConfig = {", 'const nextConfig: NextConfig = {\n  distDir: process.env.STUDY_PLAN_BUILD_DIR || ".next",');
config = config.replace("  outputFileTracingExcludes: {", '  outputFileTracingExcludes: {\n    "/api/english/six/**": ["./content/english-six/assets/**/*", "./content/english-six/ocr-work/**/*"],');
assert.ok(!config.includes("questions.native.public.json"));
writeFileSync(path.join(stage, "next.config.ts"), config);
const pkg = JSON.parse(baseline("package.json").toString());
pkg.scripts["test:english-six"] = "node scripts/test-english-six.mjs";
pkg.scripts["test:english-six:browser"] = "node scripts/test-english-six-browser.mjs";
writeFileSync(path.join(stage, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
files.push("next.config.ts", "package.json");
const checks = files.map(file => `${digest(readFileSync(path.join(stage, file)))}  ${file}`).join("\n") + "\n";
writeFileSync(path.join(stage, "english-six-release.sha256"), checks);
files.push("english-six-release.sha256");
const expected = ["src/app/subjects/[id]/page.tsx", "next.config.ts", "package.json"].map(file => `${digest(baseline(file))}  ${file}`).join("\n") + "\n";
writeFileSync(path.join(out, "expected-server.sha256"), expected);
const list = path.join(out, "code.files");
writeFileSync(list, files.join("\n") + "\n");
execFileSync("tar", ["-czf", path.join(out, "code.tar.gz"), "-C", stage, "-T", list]);
console.log(JSON.stringify({ files: files.length - 1, codeBytes: files.reduce((n, f) => n + readFileSync(path.join(stage, f)).length, 0), archive: path.join(out, "code.tar.gz") }, null, 2));
