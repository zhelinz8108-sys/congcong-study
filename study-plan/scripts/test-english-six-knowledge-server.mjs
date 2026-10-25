import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const require = createRequire(import.meta.url);
const contract = await loadHolidayTestModule("src/lib/english-six-knowledge.ts");
const envelope = await loadHolidayTestModule("src/server/english-six-knowledge-envelope.ts");
const secret = "a1".repeat(32), other = "b2".repeat(32);
const book = { version: 1, title: "Synthetic knowledge", edition: "2026", units: Array.from({ length: 8 }, (_, n) => ({
  number: n + 1, title: `Synthetic unit ${n + 1}`, sections: Array.from({ length: 8 }, (_, s) => ({
    id: `unit-${n + 1}-section-${s + 1}`, title: `Synthetic section ${s + 1}`,
    blocks: [{ kind: "paragraph", runs: [{ text: `SYNTHETIC_PRIVATE_LESSON_${n + 1}_${s + 1} /ə/\n中文` }] }],
  })),
})) };
contract.assertEnglishSixKnowledgeBook(book);
const publicKey = envelope.englishSixKnowledgePublicKey(secret);
assert.match(publicKey, /^-----BEGIN PUBLIC KEY-----/);
assert.notEqual(publicKey, envelope.englishSixKnowledgePublicKey(other));
const sealed = envelope.encryptEnglishSixKnowledge(book, publicKey);
assert.deepEqual(envelope.decryptEnglishSixKnowledge(sealed, secret), book);
assert.notEqual(sealed.ciphertext, envelope.encryptEnglishSixKnowledge(book, publicKey).ciphertext);
assert.doesNotMatch(JSON.stringify(sealed), /SYNTHETIC_PRIVATE|Synthetic unit|PRIVATE KEY/);
assert.throws(() => envelope.decryptEnglishSixKnowledge(sealed, other));
for (const field of ["salt", "iv", "tag", "ciphertext", "ephemeralPublicKey"]) {
  const damaged = structuredClone(sealed), bytes = Buffer.from(damaged[field], "base64");
  bytes[0] ^= 1; damaged[field] = bytes.toString("base64");
  assert.throws(() => envelope.decryptEnglishSixKnowledge(damaged, secret), field);
}
for (const data of [{ ...sealed, extra: "untrusted" }, { ...sealed, version: 2 }, { ...sealed, algorithm: "untrusted" },
  { ...sealed, salt: sealed.salt + "\n" }, { ...sealed, iv: "AA==" }, { ...sealed, ciphertext: "" }]) {
  assert.throws(() => envelope.decryptEnglishSixKnowledge(data, secret));
}
assert.throws(() => envelope.englishSixKnowledgePublicKey("invalid"));
assert.throws(() => envelope.encryptEnglishSixKnowledge("x".repeat(9 * 1024 * 1024), publicKey));

function isolatedModule(relative, dependencies, environment = {}) {
  const source = fs.readFileSync(path.resolve(relative), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const record = { exports: {} };
  vm.runInNewContext(compiled, { module: record, exports: record.exports, Buffer, process: { env: environment, cwd: process.cwd },
    require: name => {
      if (name === "server-only") return {};
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith("node:") || name === "react/jsx-runtime") return require(name);
      throw new Error("Unexpected knowledge test dependency");
    } }, { filename: relative });
  return record.exports;
}
const manifest = { version: 1, canonicalSha256: crypto.createHash("sha256").update(JSON.stringify(book)).digest("hex") };
function bankFixture({ hash = manifest.canonicalSha256, key = secret, value = sealed } = {}) {
  let reads = 0;
  const bank = isolatedModule("src/server/english-six-knowledge.ts", {
    "node:fs/promises": { readFile: async file => { reads++; return JSON.stringify(file.endsWith("manifest.public.json") ? { ...manifest, canonicalSha256: hash } : value); } },
    "@/lib/english-six-knowledge": contract,
    "./english-six-knowledge-envelope": envelope,
  }, { HOLIDAY_MATH_700_KEY: key });
  return { module: bank, reads: () => reads };
}
const fixture = bankFixture();
assert.equal(await fixture.module.getEnglishSixKnowledgeUnit(0), undefined);
assert.equal(await fixture.module.getEnglishSixKnowledgeUnit(9), undefined);
assert.equal(await fixture.module.getEnglishSixKnowledgeUnit(NaN), undefined);
assert.equal(fixture.reads(), 0, "invalid units never open private content");
const [loaded, summary, unit] = await Promise.all([fixture.module.getEnglishSixKnowledgeBook(), fixture.module.getEnglishSixKnowledgeSummary(), fixture.module.getEnglishSixKnowledgeUnit(3)]);
assert.deepEqual(loaded, book); assert.deepEqual(unit, book.units[2]);
assert.equal(summary.units.length, 8); assert.equal(summary.units[2].sectionCount, 8);
assert.doesNotMatch(JSON.stringify(summary), /SYNTHETIC_PRIVATE_LESSON/);
assert.equal(fixture.reads(), 2, "concurrent readers share one authenticated file load");
for (const options of [{ hash: "0".repeat(64) }, { key: other }, { value: { ...sealed, tag: "AAAA" } }]) {
  await assert.rejects(bankFixture(options).module.getEnglishSixKnowledgeBook());
}
const invalidBook = structuredClone(book); invalidBook.units.pop();
await assert.rejects(bankFixture({ value: envelope.encryptEnglishSixKnowledge(invalidBook, publicKey) }).module.getEnglishSixKnowledgeBook());

let allowed = false, contentReads = 0;
const routeDependencies = {
  "@/server/english-six-knowledge-access": { canReadEnglishSixKnowledge: async () => allowed },
  "@/server/english-six-knowledge": {
    getEnglishSixKnowledgeSummary: async () => { contentReads++; return contract.summarizeEnglishSixKnowledgeBook(book); },
    getEnglishSixKnowledgeUnit: async number => { contentReads++; return book.units.find(unit => unit.number === number); },
  },
  "@/components/english-six-knowledge-hub": () => null,
  "@/components/english-six-knowledge-reader": () => null,
  "next/navigation": { notFound: () => { throw new Error("not-found"); } },
};
const hub = isolatedModule("src/app/subjects/[id]/english/six-knowledge/page.tsx", routeDependencies);
const reader = isolatedModule("src/app/subjects/[id]/english/six-knowledge/[unit]/page.tsx", routeDependencies);
assert.equal(await hub.default({ params: Promise.resolve({ id: "synthetic" }) }), null);
assert.equal(await reader.default({ params: Promise.resolve({ id: "synthetic", unit: "1" }) }), null);
assert.equal(contentReads, 0, "anonymous pages do not read or decrypt lesson content");
allowed = true;
for (const unit of ["0", "9", "01", "1.0", "1anything", "../1"]) {
  await assert.rejects(reader.default({ params: Promise.resolve({ id: "synthetic", unit }) }), /not-found/);
}
assert.equal(contentReads, 0, "invalid routes do not load content");
const page = await reader.default({ params: Promise.resolve({ id: "synthetic", unit: "3" }) });
assert.equal(page.props.subjectId, "synthetic");
assert.equal(page.props.unit.number, 3); assert.equal(page.props.units.length, 8);
assert.doesNotMatch(JSON.stringify(page.props), /SYNTHETIC_PRIVATE_LESSON_1_/);
const home = await hub.default({ params: Promise.resolve({ id: "synthetic" }) });
assert.equal(home.props.bookSummary.units.length, 8);
assert.doesNotMatch(JSON.stringify(home.props), /SYNTHETIC_PRIVATE_LESSON/);

console.log(JSON.stringify({ passed: true, encryptedRecipientOnly: true, tamperRejected: true,
  concurrentLoads: true, verifiedManifest: true, anonymousLessonReads: 0, invalidRouteLessonReads: 0, learnerWrites: 0 }));
