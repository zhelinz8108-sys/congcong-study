import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const content = path.join(app, "content/english-six");
const out = path.join(app, "tmp/english-six-deploy");
const key = path.join(app, "../.deploy-keys/english-six-20261011");
const host = "ubuntu@124.223.31.175";
const destination = "/www/study-plan-data/english-six";
const sshOptions = ["-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15"];
const command = process.argv[2];
assert.ok(["upload", "verify"].includes(command), "Use upload or verify");
mkdirSync(out, { recursive: true });

function ssh(script) {
  return execFileSync("ssh", [...sshOptions, host, script], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}
const manifest = JSON.parse(readFileSync(path.join(content, "assets.private.json"), "utf8"));
const assets = Object.entries(manifest);
for (const [id, asset] of assets) {
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.match(asset.extension, /^\.[a-z0-9]+$/);
  assert.equal(asset.file, `assets/${id}${asset.extension}`);
  assert.equal(statSync(path.join(content, asset.file)).size, asset.size);
}
const metadata = ["index.json", "assets.private.json"];
for (const folder of ["resources", "practice"]) {
  for (const name of readdirSync(path.join(content, folder))) {
    assert.match(name, /^(?:[a-f0-9]{12}|[1-8])\.json$/);
    metadata.push(`${folder}/${name}`);
  }
}
const metadataChecks = metadata.map(file => `${createHash("sha256").update(readFileSync(path.join(content, file))).digest("hex")}  ${file}`).join("\n") + "\n";
writeFileSync(path.join(out, "metadata.sha256"), metadataChecks);

if (command === "upload") {
  assert.ok(ssh(`findmnt -n /www/study-plan-data`).trim(), "Data disk is mounted");
  const archive = path.join(out, "metadata.tar.gz");
  const list = path.join(out, "metadata.files");
  writeFileSync(list, metadata.join("\n") + "\n");
  execFileSync("tar", ["-czf", archive, "-C", content, "-T", list]);
  execFileSync("scp", [...sshOptions, archive, path.join(out, "metadata.sha256"), `${host}:${destination}/`], { stdio: "inherit" });
  ssh(`set -eu\ncd ${destination}\ntar -xzf metadata.tar.gz\nsha256sum -c metadata.sha256 >/dev/null`);
  const inventory = JSON.parse(ssh(`python3 -c 'import json,pathlib; p=pathlib.Path("${destination}/assets"); print(json.dumps({f.name:f.stat().st_size for f in p.iterdir() if f.is_file()}))'`));
  const remaining = assets.filter(([, a]) => inventory[path.basename(a.file)] !== a.size).sort((a, b) => a[1].size - b[1].size);
  const bytes = remaining.reduce((n, [, a]) => n + a.size, 0);
  console.log(JSON.stringify({ phase: "upload", remaining: remaining.length, bytes, totalAssets: assets.length }));
  const batch = path.join(out, "assets.sftp");
  writeFileSync(batch, `cd ${destination}\n` + remaining.map(([, a]) => `${inventory[path.basename(a.file)] ? "reput" : "put"} "${a.file}" "${a.file}"`).join("\n") + "\n");
  if (remaining.length) {
    await new Promise((resolve, reject) => {
      const transfer = spawn("sftp", [...sshOptions, "-R", "64", "-B", "262144", "-b", batch, host], { cwd: content, stdio: ["ignore", "pipe", "pipe"] });
      let started = 0, stdoutTail = "", stderrTail = "";
      transfer.stdout.on("data", buffer => {
        const text = stdoutTail + buffer.toString();
        const lines = text.split("\n"); stdoutTail = lines.pop();
        started += lines.filter(line => /^sftp> (?:re)?put /.test(line)).length;
      });
      transfer.stderr.on("data", buffer => { stderrTail = (stderrTail + buffer.toString()).slice(-8000); });
      const timer = setInterval(() => console.log(JSON.stringify({ phase: "upload", filesStarted: started, filesTotal: remaining.length })), 60000);
      transfer.on("error", error => { clearInterval(timer); reject(error); });
      transfer.on("exit", code => { clearInterval(timer); code === 0 ? resolve() : reject(new Error(`SFTP exited ${code}: ${stderrTail}`)); });
    });
  }
  console.log("UPLOAD_COMPLETE; run verify before publishing");
} else {
  console.log("VERIFY_START");
  const script = `import concurrent.futures,hashlib,json,pathlib\nroot=pathlib.Path("${destination}")\nraw=(root/"assets.private.json").read_bytes()\nmanifest=json.loads(raw)\ndef check(item):\n ident,a=item\n p=root/a["file"]\n if not p.is_file() or p.stat().st_size!=a["size"]: return ident+": size mismatch"\n with p.open("rb") as f: digest=hashlib.file_digest(f,"sha256").hexdigest()\n return None if digest[:32]==ident else ident+": checksum mismatch"\nwith concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: errors=[e for e in pool.map(check,manifest.items()) if e]\nreport={"assets":len(manifest),"bytes":sum(a["size"] for a in manifest.values()),"errors":errors,"manifestSha256":hashlib.sha256(raw).hexdigest()}\nif not errors: (root/"verified.private.json").write_text(json.dumps(report))\nprint(json.dumps(report))\nraise SystemExit(bool(errors))\n`;
  const check = spawn("ssh", [...sshOptions, host, "python3 -"], { stdio: ["pipe", "inherit", "inherit"] });
  check.stdin.end(script);
  await new Promise((resolve, reject) => { check.on("error", reject); check.on("exit", code => code === 0 ? resolve() : reject(new Error(`Verification exited ${code}`))); });
  ssh(`set -eu\ncd ${destination}\nsha256sum -c metadata.sha256 >/dev/null`);
  console.log("VERIFY_COMPLETE");
}
