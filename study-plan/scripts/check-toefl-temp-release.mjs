import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { loadHolidayTestModule } = await import(pathToFileURL(path.join(process.cwd(), "scripts/holiday-math-test-utils.mjs")));
const family = await loadHolidayTestModule("src/lib/family-access.ts");
assert.ok(family.isFamilyAccessConfigured(), "Family access must be configured for the release check.");
const origin = `http://127.0.0.1:${Number(process.argv[2] ?? 3001)}`;
const headers = { Cookie: `${family.FAMILY_ACCESS_COOKIE}=${family.createFamilyAccessToken()}` };
const data = JSON.parse(readFileSync("src/data/toefl-temp-audio.json", "utf8"));
const request = (route, options = {}) => fetch(`${origin}${route}`, { signal: AbortSignal.timeout(10000), ...options });
const mediaPath = (clip) => `/api/english/toefl-temp/media/${encodeURIComponent(clip.id)}`;

assert.equal(data.clips.length, 38);
assert.equal(new Set(data.clips.map((clip) => clip.id)).size, 38);
assert.deepEqual(data.groups.map((group) => group.id), ["listening-m1", "listening-m2", "speaking-repeat", "speaking-interview"]);
for (const [index, total] of [32, 15, 7, 4].entries()) {
  const clips = data.clips.filter((clip) => clip.group === data.groups[index].id);
  assert.deepEqual(clips.flatMap((clip) => Array.from({ length: clip.last - clip.first + 1 }, (_, offset) => clip.first + offset)),
    Array.from({ length: total }, (_, offset) => offset + 1), data.groups[index].id);
}

const page = await request("/subjects/8bd6f79b-99f5-4e68-a961-872d60d260b1/toefl-temp", { headers });
assert.equal(page.status, 200);
const html = await page.text();
assert.ok(html.includes("托福临时") && html.includes("<audio") && html.includes(mediaPath(data.clips[0])), "The page must render its audio player.");
assert.equal((await request(mediaPath(data.clips[0]))).status, 401, "Audio requires family access.");
assert.equal((await request("/api/english/toefl-temp/media/not-a-clip", { headers })).status, 404);

let totalBytes = 0;
for (const clip of data.clips) {
  const expected = readFileSync(path.join("content/toefl-temp/audio", clip.filename));
  assert.ok(expected.length > 1000 && clip.duration > 0, clip.id);
  const head = await request(mediaPath(clip), { method: "HEAD", headers });
  assert.equal(head.status, 200, clip.id);
  assert.equal(Number(head.headers.get("content-length")), expected.length, clip.id);
  assert.equal(head.headers.get("content-type"), "audio/mpeg", clip.id);
  assert.equal(head.headers.get("accept-ranges"), "bytes", clip.id);
  assert.ok(head.headers.get("cache-control")?.startsWith("private"), clip.id);
  const response = await request(mediaPath(clip), { headers });
  assert.equal(response.status, 200, clip.id);
  const actual = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(actual).digest("hex"), createHash("sha256").update(expected).digest("hex"), clip.id);
  totalBytes += expected.length;
}

const first = data.clips[0];
const bytes = readFileSync(path.join("content/toefl-temp/audio", first.filename));
for (const [range, start, end] of [["bytes=0-1023", 0, 1023], ["bytes=-128", bytes.length - 128, bytes.length - 1]]) {
  const response = await request(mediaPath(first), { headers: { ...headers, Range: range } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), `bytes ${start}-${end}/${bytes.length}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
}
const partialHead = await request(mediaPath(first), { method: "HEAD", headers: { ...headers, Range: "bytes=0-63" } });
assert.equal(partialHead.status, 206);
assert.equal(partialHead.headers.get("content-length"), "64");
assert.equal((await partialHead.arrayBuffer()).byteLength, 0);
for (const range of [`bytes=${bytes.length}-`, "bytes=bad", "bytes=0-1,3-4"]) {
  const response = await request(mediaPath(first), { headers: { ...headers, Range: range } });
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), `bytes */${bytes.length}`);
}
console.log(JSON.stringify({ toeflTempAudio: data.clips.length, totalBytes, orderedQuestions: true, exactAudioBytes: true, rangePlayback: true, familyAccessRequired: true, checks: "passed" }));
