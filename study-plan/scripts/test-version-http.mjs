import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { writeReleaseMetadata } from "./write-release-metadata.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// A separate route-only production app: no real content, keys, env files or DB.
const work = path.join(root, ".tmp-version-http");
await mkdir(work, { recursive: true });
const isolated = await mkdtemp(path.join(work, "app-"));
const next = path.join(root, "node_modules/next/dist/bin/next");
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
let server, serverExit;

async function run(file, args) {
  const child = spawn(process.execPath, [file, ...args], { cwd: isolated, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const [code] = await once(child, "close");
  assert.equal(code, 0, output);
  return output;
}

try {
  await mkdir(path.join(isolated, "src/app/api/version"), { recursive: true });
  await mkdir(path.join(isolated, "src/lib"), { recursive: true });
  for (const file of ["src/app/api/version/route.ts", "src/proxy.ts", "src/lib/family-access.ts"]) {
    await copyFile(path.join(root, file), path.join(isolated, file));
  }
  await symlink(path.join(root, "node_modules"), path.join(isolated, "node_modules"), "dir");
  await writeFile(path.join(isolated, "package.json"), JSON.stringify({ private: true }));
  await writeFile(path.join(isolated, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }));
  await run(next, ["build", "--webpack"]);
  // Port zero avoids colliding with existing previews; Next prints its bound port.
  server = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", "0"], {
    cwd: isolated, env, stdio: ["ignore", "pipe", "pipe"],
  });
  serverExit = once(server, "close");
  let output = "";
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { output += chunk; });
  let base;
  for (let attempt = 0; attempt < 200; attempt++) {
    const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match && /Ready/.test(output)) { base = match[0]; break; }
    if (server.exitCode !== null) {
      await serverExit;
      assert.fail(`Next server exited with ${server.exitCode}: ${output}`);
    }
    await delay(100);
  }
  assert.ok(base, output);
  const request = (route, options) => fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(10000) });
  const unknown = { commit: "unknown", buildId: "unknown" };
  let response = await request("/api/version");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), unknown);
  const commit = "c3".repeat(20);
  // Stamp only after build and server start, proving metadata is read at runtime.
  await writeReleaseMetadata(isolated, commit);
  response = await request("/api/version?commit=untrusted");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { commit, buildId: (await readFile(path.join(isolated, ".next/BUILD_ID"), "utf8")).trim() });
  response = await request("/api/version", { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal((await request("/api/version", { method })).status, 405);
  }
  assert.equal((await request("/api/version/private")).status, 401);
  await writeFile(path.join(isolated, "release-metadata.json"), "malformed");
  assert.deepEqual(await (await request("/api/version")).json(), unknown);
  console.log(JSON.stringify({ productionBuild: "PASS", publicGet: "PASS", runtimeStamp: "PASS", head: "PASS", writeMethods405: "PASS", privatePath401: "PASS", malformedUnknown: "PASS", studentWrites: 0 }));
} finally {
  if (server && server.exitCode === null) server.kill("SIGTERM");
  if (serverExit) await serverExit;
  await rm(isolated, { recursive: true, force: true });
  await rm(work, { recursive: false }).catch(() => {});
}
