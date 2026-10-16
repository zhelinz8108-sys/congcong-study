import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = path.join(path.dirname(app), ".deploy-keys/english-six-20261011");
const host = "ubuntu@124.223.31.175";
const options = ["-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=12"];
const remotePath = "/etc/nginx/sites-available/study-plan";
const output = path.join(app, "tmp/navigation-guard-release");
const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
const backup = `${remotePath}.before-navigation-guard-${stamp}`;
const upload = `/tmp/study-plan-navigation-${stamp}.conf`;
const hash = value => createHash("sha256").update(value).digest("hex");
const ssh = command => execFileSync("ssh", [...options, host, command], { encoding: "utf8", timeout: 30000 });

assert.equal(ssh("readlink -f /etc/nginx/sites-enabled/study-plan").trim(), remotePath);
const original = ssh(`sudo cat ${remotePath}`);
assert.ok(!original.includes("$study_plan_document_navigation"), "Guard is already installed; inspect before redeploying.");
const template = await readFile(path.join(app, "deploy/nginx.conf"), "utf8");
const maps = template.slice(0, template.indexOf("server {"));
const guard = template.match(/        # Keep client-side fetches intact[^\n]*\n(?:        proxy_set_header (?:RSC|Next-Router-[\w-]+) [^;]+;\n){4}/)?.[0];
assert.ok(guard, "Missing four guard headers in deployment template");
const anchor = "        proxy_set_header X-Forwarded-Proto $scheme;";
assert.equal(original.split(anchor).length, 2, "Unexpected live Nginx config; refuse to overwrite.");
assert.ok(original.includes("ssl_certificate ") && original.includes("listen 443 ssl"), "Preserve existing HTTPS configuration");
const candidate = maps + original.replace(anchor, `${anchor}\n${guard.trimEnd()}`);
await mkdir(output, { recursive: true });
const staged = path.join(output, "study-plan.conf");
await writeFile(path.join(output, "before.conf"), original);
await writeFile(staged, candidate);
assert.equal(ssh(`sudo sha256sum ${remotePath}`).split(/\s/)[0], hash(original), "Live config changed during preparation");
execFileSync("scp", [...options, staged, `${host}:${upload}`], { encoding: "utf8", timeout: 30000 });
assert.equal(ssh(`sha256sum ${upload}`).split(/\s/)[0], hash(candidate));
ssh(`sudo cp -p ${remotePath} ${backup}`);
assert.equal(ssh(`sudo sha256sum ${remotePath}`).split(/\s/)[0], hash(original), "Live config changed after backup");
try {
  ssh(`sudo install -m 0644 ${upload} ${remotePath}`);
  ssh("sudo nginx -t");
  ssh("sudo systemctl reload nginx");
  assert.equal(ssh("systemctl is-active nginx").trim(), "active");
} catch (error) {
  ssh(`sudo cp -p ${backup} ${remotePath}`);
  ssh("sudo nginx -t");
  ssh("sudo systemctl reload nginx");
  throw error;
}
const report = { backup, originalSha256: hash(original), deployedSha256: hash(candidate), appRestarted: false, httpsConfigurationPreserved: true };
await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
