import fs from "node:fs/promises";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

// Local authoring only. No network, database, learner records, Git operations,
// plaintext output, key creation, or source deletion. --check never writes.
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const root = path.join(appRoot, "content", "grade6-bank");
const plainRoot = path.join(root, "private");
const sealedRoot = path.join(root, "sealed");
const imageRoot = path.join(sealedRoot, "private");
const answerFile = path.join(root, "answers.private.json");
const sealedAnswerFile = path.join(sealedRoot, "answers.encrypted.json");
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) throw new Error("Only --check is supported.");

const MAGIC = Buffer.from("G6BK01");
const ANSWER_AAD = Buffer.from("grade6-bank-v1:answers");
const SALT_PREFIX = Buffer.from("grade6-bank-v1:");
const HEADER_BYTES = MAGIC.length + 12 + 16;
const EXPECTED_IMAGES = 2919;
const quietLogger = { info() {}, error() {} };
nextEnv.loadEnvConfig(appRoot, false, quietLogger);
const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Existing HOLIDAY_MATH_700_KEY is unavailable or invalid; no key was created.");

function assert(condition, message) {
  // Do not include actual private buffers or records in assertion diagnostics.
  if (!condition) throw new Error(message);
}

function relativeImage(raw) {
  assert(typeof raw === "string", "Invalid private image reference.");
  const relative = raw.replaceAll("\\", "/");
  assert(/^[a-z0-9][a-z0-9_./-]*$/i.test(relative), "Invalid private image path.");
  assert(!relative.split("/").some((segment) => !segment || segment === "." || segment === ".."), "Invalid private image segments.");
  assert(/\.(?:png|webp|jpe?g)$/i.test(relative), "Invalid private image extension.");
  return relative;
}

function inside(directory, absolute) {
  const relative = path.relative(directory, absolute);
  return relative !== "" && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep);
}

const checkedDirectories = new Set();
async function checkDirectory(directory) {
  if (checkedDirectories.has(directory)) return;
  const info = await fs.lstat(directory);
  assert(info.isDirectory() && !info.isSymbolicLink(), "Private image directory must not be a link.");
  checkedDirectories.add(directory);
}

async function readImage(directory, relative, extension = "") {
  const target = path.resolve(directory, relative + extension);
  assert(inside(directory, target), "Private image target is outside its directory.");
  // lstat each in-root directory to reject symlinks/junctions. Unlike native
  // realpath, this also works in the Windows workspace filesystem sandbox.
  let parent = directory;
  await checkDirectory(parent);
  for (const segment of relative.split("/").slice(0, -1)) {
    parent = path.join(parent, segment);
    await checkDirectory(parent);
  }
  const info = await fs.lstat(target);
  assert(info.isFile() && !info.isSymbolicLink(), "Private image must be a regular file.");
  const data = await fs.readFile(target);
  assert(data.length > 0, "Empty private image.");
  return data;
}

async function writeRegular(directory, relative, data) {
  const target = path.resolve(directory, relative);
  assert(inside(directory, target), "Sealed target is outside its directory.");
  let parent = directory;
  await checkDirectory(parent);
  for (const segment of relative.split("/").slice(0, -1)) {
    parent = path.join(parent, segment);
    try { await fs.mkdir(parent); } catch (error) { if (error.code !== "EEXIST") throw error; }
    await checkDirectory(parent);
  }
  let existing;
  try { existing = await fs.lstat(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
  assert(!existing || existing.isFile() && !existing.isSymbolicLink(), "Sealed target must be a regular file.");
  await fs.writeFile(target, data);
}

function decodeBase64(value, bytes) {
  assert(typeof value === "string" && value.length > 0 && /^[a-z0-9+/]*={0,2}$/i.test(value), "Invalid encrypted envelope encoding.");
  const result = Buffer.from(value, "base64");
  assert(result.toString("base64") === value && (bytes === undefined || result.length === bytes), "Invalid encrypted envelope size.");
  return result;
}

function unpackEnvelope(envelope) {
  assert(envelope && envelope.version === 1, "Unsupported encrypted answer envelope.");
  return {
    salt: decodeBase64(envelope.salt, 16),
    iv: decodeBase64(envelope.iv, 12),
    tag: decodeBase64(envelope.tag, 16),
    ciphertext: decodeBase64(envelope.ciphertext),
  };
}

function encrypt(key, plain, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

function decrypt(key, { iv, tag, ciphertext }, aad) {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function verify(key, sealed, plain, aad) {
  assert(decrypt(key, sealed, aad).equals(plain), "Decrypted bytes differ from the private source.");
  const altered = Buffer.from(sealed.ciphertext);
  assert(altered.length > 0, "Empty encrypted payload.");
  altered[altered.length - 1] ^= 1;
  let rejected = false;
  try { decrypt(key, { ...sealed, ciphertext: altered }, aad); } catch { rejected = true; }
  assert(rejected, "Ciphertext tampering was not rejected.");
  rejected = false;
  try { decrypt(key, sealed, Buffer.concat([aad, Buffer.from(":tampered")])); } catch { rejected = true; }
  assert(rejected, "AAD tampering was not rejected.");
}

function unpackImage(binary) {
  assert(binary.length > HEADER_BYTES && binary.subarray(0, MAGIC.length).equals(MAGIC), "Invalid encrypted image header.");
  return {
    iv: binary.subarray(MAGIC.length, MAGIC.length + 12),
    tag: binary.subarray(MAGIC.length + 12, HEADER_BYTES),
    ciphertext: binary.subarray(HEADER_BYTES),
  };
}

async function imageFiles(directory, prefix = "") {
  const files = [];
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix + item.name;
    if (item.isDirectory()) files.push(...await imageFiles(path.join(directory, item.name), relative + "/"));
    else {
      assert(item.isFile(), "Unexpected non-file in sealed image directory.");
      files.push(relative);
    }
  }
  return files.sort();
}

const plainAnswers = await fs.readFile(answerFile);
const answers = JSON.parse(plainAnswers.toString("utf8"));
assert(Array.isArray(answers) && answers.length > 0, "Private answer array is missing.");
assert(new Set(answers.map((record) => record.id)).size === answers.length, "Private answer IDs are duplicated.");
const images = [...new Set(answers.flatMap((record) => {
  assert(Array.isArray(record.answerImages), "Private answer image array is missing.");
  return record.answerImages.map(relativeImage);
}))].sort();
assert(images.length === EXPECTED_IMAGES, "Private image count differs from the checked 2919-image bank.");

let envelope;
let salt;
if (check) {
  envelope = JSON.parse(await fs.readFile(sealedAnswerFile, "utf8"));
  salt = unpackEnvelope(envelope).salt;
} else {
  salt = randomBytes(16);
}
// Expensive KDF runs exactly once per invocation, not once per answer image.
const key = scryptSync(secret, Buffer.concat([SALT_PREFIX, salt]), 32);
const counts = {
  answers: answers.length,
  images: images.length,
  answerPlainBytes: plainAnswers.length,
  answerSealedBytes: 0,
  imagePlainBytes: 0,
  imageSealedBytes: 0,
  verifiedPayloads: 0,
  tamperChecks: 0,
};

try {
  if (!check) {
    const sealed = encrypt(key, plainAnswers, ANSWER_AAD);
    envelope = { version: 1, salt: salt.toString("base64"), iv: sealed.iv.toString("base64"), tag: sealed.tag.toString("base64"), ciphertext: sealed.ciphertext.toString("base64") };
    await fs.mkdir(sealedRoot, { recursive: true });
    await checkDirectory(sealedRoot);
    try { await fs.mkdir(imageRoot); } catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  for (const relative of images) {
    const plain = await readImage(plainRoot, relative);
    const aad = Buffer.from("grade6-bank-v1:image:" + relative);
    let binary;
    if (check) {
      binary = await readImage(imageRoot, relative, ".enc");
    } else {
      const sealed = encrypt(key, plain, aad);
      binary = Buffer.concat([MAGIC, sealed.iv, sealed.tag, sealed.ciphertext]);
      await writeRegular(imageRoot, relative + ".enc", binary);
      // Verify persisted bytes, not only the in-memory ciphertext.
      binary = await readImage(imageRoot, relative, ".enc");
    }
    verify(key, unpackImage(binary), plain, aad);
    counts.imagePlainBytes += plain.length;
    counts.imageSealedBytes += binary.length;
    counts.verifiedPayloads++;
    counts.tamperChecks += 2;
  }

  const actual = await imageFiles(imageRoot);
  const expected = images.map((relative) => relative + ".enc");
  assert(actual.length === expected.length && actual.every((file, index) => file === expected[index]), "Sealed image coverage differs from the private bank.");
  if (!check) await writeRegular(sealedRoot, "answers.encrypted.json", JSON.stringify(envelope) + "\n");
  const persistedEnvelope = await fs.readFile(sealedAnswerFile);
  verify(key, unpackEnvelope(JSON.parse(persistedEnvelope.toString("utf8"))), plainAnswers, ANSWER_AAD);
  counts.verifiedPayloads++;
  counts.tamperChecks += 2;
  counts.answerSealedBytes = persistedEnvelope.length;
  // Counts and byte sizes only: no private answer, key, or envelope content.
  console.log(JSON.stringify(counts));
} finally {
  key.fill(0);
}
