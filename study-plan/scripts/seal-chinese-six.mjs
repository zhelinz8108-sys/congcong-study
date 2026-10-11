import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

// Local authoring or deployment verification only. No learner-state writes,
// network calls, key creation, plaintext output, or source deletion.
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const root = path.join(appRoot, "content/chinese-six");
const sealedRoot = path.join(root, "sealed");
const mode = process.argv[2] ?? "seal";
if (process.argv.length > 3 || !["seal", "--check", "--verify"].includes(mode)) throw new Error("Use --check or --verify, or no arguments to seal local sources.");
nextEnv.loadEnvConfig(appRoot, false, { info() {}, error() {} });
const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Existing deployment key is unavailable; no key was created.");
const ensure = (value, message) => { if (!value) throw new Error(message); };

async function regularFile(base, relative) {
  ensure(!path.isAbsolute(relative) && relative.split(/[\\/]/).every(part => part && part !== "." && part !== ".."), "Invalid resource path.");
  let directory = base;
  for (const part of ["", ...relative.split("/").slice(0, -1)]) {
    directory = path.join(directory, part);
    const info = await fs.lstat(directory);
    ensure(info.isDirectory() && !info.isSymbolicLink(), "Resource directory must not be a link.");
  }
  const target = path.join(base, relative);
  const info = await fs.lstat(target);
  ensure(info.isFile() && !info.isSymbolicLink(), "Resource must be a regular file.");
  return fs.readFile(target);
}
async function persist(relative, bytes) {
  const target = path.join(sealedRoot, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  let directory = sealedRoot;
  for (const part of ["", ...relative.split("/").slice(0, -1)]) {
    directory = path.join(directory, part);
    const info = await fs.lstat(directory);
    ensure(info.isDirectory() && !info.isSymbolicLink(), "Sealed directory must not be a link.");
  }
  try {
    const info = await fs.lstat(target);
    ensure(info.isFile() && !info.isSymbolicLink(), "Sealed output must be a regular file.");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.writeFile(target, bytes);
}
function decode(value, length) {
  ensure(typeof value === "string" && /^[a-z0-9+/]+={0,2}$/i.test(value), "Invalid sealed encoding.");
  const bytes = Buffer.from(value, "base64");
  ensure(bytes.toString("base64") === value && (length === undefined || bytes.length === length), "Invalid sealed size.");
  return bytes;
}
function pack(key, plain, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}
function unpack(key, sealed, aad) {
  ensure(sealed.iv.length === 12 && sealed.tag.length === 16 && sealed.ciphertext.length > 0, "Invalid sealed payload.");
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
}
function verify(key, sealed, aad, original) {
  const plain = unpack(key, sealed, aad);
  if (original) ensure(plain.equals(original), "Decrypted resource differs from its local source.");
  const altered = Buffer.from(sealed.ciphertext);
  altered[altered.length - 1] ^= 1;
  for (const [payload, label] of [[{ ...sealed, ciphertext: altered }, aad], [sealed, aad + ":tampered"]]) {
    let rejected = false;
    try { unpack(key, payload, label); } catch { rejected = true; }
    ensure(rejected, "Tampered resource was not rejected.");
  }
  return plain;
}
async function listImages(directory, prefix = "") {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await listImages(path.join(directory, entry.name), relative + "/"));
    else { ensure(entry.isFile(), "Unexpected sealed directory entry."); files.push(relative); }
  }
  return files.sort();
}

const sourceBank = mode === "--verify" ? undefined : await regularFile(root, "bank.private.json");
let envelope, salt;
if (mode === "seal") salt = randomBytes(16);
else {
  envelope = JSON.parse((await regularFile(sealedRoot, "bank.encrypted.json")).toString("utf8"));
  ensure(envelope.version === 1, "Unsupported sealed bank version.");
  salt = decode(envelope.salt, 16);
}
const key = scryptSync(secret, Buffer.concat([Buffer.from("chinese-six-v1:"), salt]), 32);
try {
  if (mode === "seal") {
    const sealed = pack(key, sourceBank, "chinese-six-v1:bank");
    envelope = { version: 1, salt: salt.toString("base64"), iv: sealed.iv.toString("base64"), tag: sealed.tag.toString("base64"), ciphertext: sealed.ciphertext.toString("base64") };
    await persist("bank.encrypted.json", JSON.stringify(envelope) + "\n");
  }
  envelope = JSON.parse((await regularFile(sealedRoot, "bank.encrypted.json")).toString("utf8"));
  const plain = verify(key, { iv: decode(envelope.iv, 12), tag: decode(envelope.tag, 16), ciphertext: decode(envelope.ciphertext) }, "chinese-six-v1:bank", sourceBank);
  const bank = JSON.parse(plain.toString("utf8"));
  const index = JSON.parse(await fs.readFile(path.join(appRoot, "src/data/chinese-six-index.json"), "utf8"));
  ensure(bank.items.length === 167 && bank.methods.length === 24 && bank.sources.length === 4, "Chinese bank coverage differs from the checked import.");
  ensure(bank.items.every(item => index.items.some(entry => entry.id === item.id && entry.title === item.title)), "Public index differs from the encrypted bank.");
  const images = bank.sources.flatMap(source => {
    ensure(/^[a-z]+$/.test(source.id) && Number.isInteger(source.pageCount) && source.pageCount > 0, "Invalid source metadata.");
    return Array.from({ length: source.pageCount }, (_, page) => `${source.id}/${page + 1}.webp`);
  });
  ensure(images.length === 276 && new Set(images).size === 276, "Expected exactly 276 source pages.");
  let imageBytes = 0;
  for (const relative of images) {
    const original = mode === "--verify" ? undefined : await regularFile(path.join(root, "pages"), relative);
    if (mode === "seal") {
      const sealed = pack(key, original, "chinese-six-v1:image:" + relative);
      await persist("pages/" + relative + ".enc", Buffer.concat([Buffer.from("C6BK01"), sealed.iv, sealed.tag, sealed.ciphertext]));
    }
    const bytes = await regularFile(path.join(sealedRoot, "pages"), relative + ".enc");
    ensure(bytes.length > 34 && bytes.subarray(0, 6).equals(Buffer.from("C6BK01")), "Invalid sealed page header.");
    const image = verify(key, { iv: bytes.subarray(6, 18), tag: bytes.subarray(18, 34), ciphertext: bytes.subarray(34) }, "chinese-six-v1:image:" + relative, original);
    ensure(image.subarray(0, 4).toString() === "RIFF" && image.subarray(8, 12).toString() === "WEBP", "Source page is not a valid WebP container.");
    imageBytes += bytes.length;
  }
  const actual = await listImages(path.join(sealedRoot, "pages"));
  const expected = images.map(relative => relative + ".enc").sort();
  ensure(actual.length === expected.length && actual.every((name, i) => name === expected[i]), "Sealed page coverage differs from the import.");
  console.log(JSON.stringify({ mode, items: bank.items.length, methods: bank.methods.length, images: images.length, imageBytes, verifiedPayloads: 277, tamperChecks: 554, plaintextPublished: false }));
} finally { key.fill(0); }
