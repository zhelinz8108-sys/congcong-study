import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { writeReleaseMetadata } from "./write-release-metadata.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commit = "a1".repeat(20), buildId = "next-build_123";
const unknown = { commit: "unknown", buildId: "unknown" };
const code = ts.transpileModule(await readFile(path.join(root, "src/app/api/version/route.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function loadRoute(readMetadata) {
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "process", code)(specifier => {
    if (specifier === "node:path") return path;
    if (specifier === "node:fs/promises") return { readFile: async (file, encoding) => {
      assert.equal(file, path.join(root, "release-metadata.json"));
      assert.equal(encoding, "utf8");
      return readMetadata();
    } };
    throw new Error(`Unexpected endpoint dependency: ${specifier}`);
  }, loaded, loaded.exports, { cwd: () => root });
  return loaded.exports;
}

async function responseFrom(value) {
  const route = loadRoute(() => JSON.stringify(value));
  assert.equal(route.runtime, "nodejs");
  assert.equal(route.dynamic, "force-dynamic");
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}

test("version returns only validated identity fields, without other imports or env access", async () => {
  assert.deepEqual(await responseFrom({ commit, buildId, password: "never-return", path: "/private", student: "never-return" }), { commit, buildId });
});

test("missing, unreadable, malformed and non-object metadata fail closed", async () => {
  for (const read of [() => { throw new Error("ENOENT /private/path"); },
    () => { throw new Error("EACCES secret"); }, () => "{invalid", () => "null", () => "[]", () => "42"]) {
    assert.deepEqual(await (await loadRoute(read).GET()).json(), unknown);
  }
});

test("invalid fields are independently unknown and cannot leak paths or objects", async () => {
  for (const invalid of [null, {}, [], 42, "", "a".repeat(39), "a".repeat(41), "g".repeat(40), "A".repeat(40), commit + "\n", "/private/path"]) {
    assert.deepEqual(await responseFrom({ commit: invalid, buildId }), { ...unknown, buildId });
  }
  for (const invalid of [null, {}, [], 42, "", "../secret", "build\nsecret", "x".repeat(129), "<script>"]) {
    assert.deepEqual(await responseFrom({ commit, buildId: invalid }), { ...unknown, commit });
  }
});

test("reads metadata per request so no build-time or process-global identity is frozen", async () => {
  let value = { commit, buildId };
  const route = loadRoute(() => JSON.stringify(value));
  assert.deepEqual(await (await route.GET()).json(), value);
  value = { commit: "b2".repeat(20), buildId: "other-build" };
  assert.deepEqual(await (await route.GET()).json(), value);
});

test("release writer pairs the supplied SHA with actual BUILD_ID and moves with rollback", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "study-version-"));
  try {
    const staged = path.join(temporary, "staged"), active = path.join(temporary, "active"), previous = path.join(temporary, "previous");
    for (const directory of [staged, active]) await mkdir(path.join(directory, ".next"), { recursive: true });
    await writeFile(path.join(active, ".next/BUILD_ID"), "old-build\n");
    await writeReleaseMetadata(active, "b2".repeat(20));
    await writeFile(path.join(staged, ".next/BUILD_ID"), buildId + "\n");
    await writeReleaseMetadata(staged, commit);
    const identity = async directory => JSON.parse(await readFile(path.join(directory, "release-metadata.json"), "utf8"));
    assert.deepEqual(await identity(staged), { commit, buildId });
    assert.equal((await stat(path.join(staged, "release-metadata.json"))).mode & 0o222, 0o200);
    await rename(active, previous);
    await rename(staged, active);
    assert.deepEqual(await identity(active), { commit, buildId });
    await rename(active, staged);
    await rename(previous, active);
    assert.deepEqual(await identity(active), { commit: "b2".repeat(20), buildId: "old-build" });
    const retained = await identity(staged);
    await assert.rejects(writeReleaseMetadata(staged, "bad-sha"));
    await writeFile(path.join(staged, ".next/BUILD_ID"), "../invalid");
    await assert.rejects(writeReleaseMetadata(staged, commit));
    await rm(path.join(staged, ".next/BUILD_ID"));
    await assert.rejects(writeReleaseMetadata(staged, commit));
    assert.deepEqual(await identity(staged), retained);
    assert.deepEqual((await readdir(staged)).sort(), [".next", "release-metadata.json"]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("proxy exposes exactly the version path while student APIs remain protected", async () => {
  const require = createRequire(import.meta.url);
  const loaded = { exports: {} };
  const proxyCode = ts.transpileModule(await readFile(path.join(root, "src/proxy.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let authCalls = 0;
  new Function("require", "module", "exports", proxyCode)(specifier => {
    if (specifier === "@/lib/family-access") return {
      FAMILY_ACCESS_COOKIE: "test-access", verifyFamilyAccessToken: () => { authCalls++; return { allowed: false, reason: "missing" }; },
    };
    assert.equal(specifier, "next/server");
    return require(specifier);
  }, loaded, loaded.exports);
  const { NextRequest } = require("next/server");
  assert.equal(loaded.exports.proxy(new NextRequest("http://localhost/api/version")).headers.get("x-middleware-next"), "1");
  assert.equal(authCalls, 0);
  for (const pathname of ["/api/version/private", "/api/health/private", "/api/progress"]) {
    assert.equal(loaded.exports.proxy(new NextRequest(`http://localhost${pathname}`)).status, 401);
  }
  assert.equal(authCalls, 3);
});

test("release verifier rejects stale identity, extra fields, caching and failed HTTP", async () => {
  const source = ts.transpileModule(await readFile(path.join(root, "scripts/check-release-version.mjs"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const require = createRequire(import.meta.url);
  const verify = async ({ body = { commit, buildId }, status = 200, cache = "no-store", actualBuild = buildId } = {}) => {
    const loaded = { exports: {} };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction("require", "module", "exports", "process", "fetch", "console", source)(specifier => {
      if (specifier === "node:fs/promises") return { readFile: async file => {
        if (file === "release-metadata.json") return JSON.stringify({ commit, buildId });
        assert.equal(file, ".next/BUILD_ID");
        return actualBuild;
      } };
      assert.equal(specifier, "node:assert/strict");
      return require(specifier);
    }, loaded, loaded.exports, { argv: ["node", "verify", "3002"] }, async url => {
      assert.equal(url, "http://127.0.0.1:3002/api/version");
      return Response.json(body, { status, headers: { "Cache-Control": cache } });
    }, { log() {} });
  };
  await verify();
  for (const invalid of [
    { body: { commit: "b2".repeat(20), buildId } },
    { body: { commit, buildId: "old-build" } },
    { body: { commit, buildId, extra: "unexpected" } },
    { actualBuild: "old-build" }, { cache: "public, max-age=60" }, { status: 503 },
  ]) await assert.rejects(verify(invalid));
});
