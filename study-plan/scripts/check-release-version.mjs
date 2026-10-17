import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const port = process.argv[2];
assert.ok(port === "3001" || port === "3002", "Invalid verification port.");
const metadata = JSON.parse(await readFile("release-metadata.json", "utf8"));
assert.deepEqual(Object.keys(metadata).sort(), ["buildId", "commit"]);
assert.match(metadata.commit, /^[0-9a-f]{40}$/);
assert.match(metadata.buildId, /^[A-Za-z0-9_-]{1,128}$/);
assert.equal(metadata.buildId, (await readFile(".next/BUILD_ID", "utf8")).trim());
const response = await fetch(`http://127.0.0.1:${port}/api/version`, {
  signal: AbortSignal.timeout(10000),
});
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "no-store");
assert.deepEqual(await response.json(), metadata);
console.log("Deployed commit and Next build ID verification passed.");
