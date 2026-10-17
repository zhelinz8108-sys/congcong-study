#!/usr/bin/env node
// Reassemble bounded ciphertext chunks. Cryptographic decryption is a separate step.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MAX_ENVELOPE = 12 * 1024 * 1024;
const CHUNK_BYTES = 16384;
const MAX_INDEX = 512 * 1024;
const INDEX_KEYS = ['version', 'kind', 'runId', 'runAttempt', 'pack', 'recipientFingerprint', 'envelopeBytes', 'envelopeSha256', 'chunkBytes', 'chunks'];
class AssemblyError extends Error {}
function check(condition, message) { if (!condition) throw new AssemblyError(message); }
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isDigest = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const isRun = (value) => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
function samePath(a, b) { return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; }
function physicalParent(file) {
  const absolute = path.resolve(file);
  const parent = path.dirname(absolute);
  let actual;
  try { actual = fs.realpathSync.native(parent); } catch { throw new AssemblyError('File parent must already exist.'); }
  check(samePath(parent, actual), 'Symlinked parents are not allowed.');
  return absolute;
}
function regularBytes(file, maximum, expectedSize, label) {
  const absolute = physicalParent(file);
  let before;
  try { before = fs.lstatSync(absolute); } catch { throw new AssemblyError(`${label} is unavailable.`); }
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1, `${label} must be a regular file with exactly one hard link.`);
  check(before.size > 0 && before.size <= maximum && (expectedSize === undefined || before.size === expectedSize), `${label} has an invalid size.`);
  let fd;
  try {
    fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(fd);
    check(opened.isFile() && opened.nlink === 1 && opened.dev === before.dev && opened.ino === before.ino && opened.size === before.size, `${label} changed while opening.`);
    const bytes = Buffer.alloc(opened.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    const after = fs.fstatSync(fd);
    check(length === opened.size && after.nlink === 1 && after.size === opened.size && after.mtimeMs === opened.mtimeMs && after.ctimeMs === opened.ctimeMs, `${label} changed while reading.`);
    return bytes.subarray(0, length);
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function freshDestination(file) {
  const absolute = physicalParent(file);
  try { fs.lstatSync(absolute); }
  catch (error) {
    if (error.code === 'ENOENT') return absolute;
    throw new AssemblyError('Cannot inspect output destination.');
  }
  throw new AssemblyError('Output destination already exists; refusing to overwrite it.');
}
function exactKeys(value, keys, label) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  check(actual.length === expected.length && actual.every((key, i) => key === expected[i]), `${label} has unexpected or missing fields.`);
}
function validateIndex(index) {
  exactKeys(index, INDEX_KEYS, 'Chunk index');
  check(index.version === 1 && index.kind === 'native-material-envelope-chunks', 'Unsupported chunk-index format.');
  check(isRun(index.runId) && isRun(index.runAttempt), 'Invalid workflow run or attempt.');
  check(index.pack === 'native-authoring-min', 'Unexpected material pack.');
  check(typeof index.recipientFingerprint === 'string' && /^sha256:[0-9a-f]{64}$/.test(index.recipientFingerprint), 'Invalid recipient fingerprint.');
  check(Number.isSafeInteger(index.envelopeBytes) && index.envelopeBytes > 0 && index.envelopeBytes <= MAX_ENVELOPE, 'Invalid envelope size.');
  check(index.chunkBytes === CHUNK_BYTES && isDigest(index.envelopeSha256), 'Invalid chunk size or envelope digest.');
  const count = Math.ceil(index.envelopeBytes / CHUNK_BYTES);
  check(Array.isArray(index.chunks) && index.chunks.length === count, 'Chunk count does not match the envelope size.');
  for (let i = 0; i < count; i++) {
    const item = index.chunks[i];
    exactKeys(item, ['name', 'bytes', 'sha256'], 'Chunk entry');
    check(item.name === `chunks/${String(i).padStart(5, '0')}.bin`, 'Chunk names must be exact and sequential.');
    const expectedBytes = i === count - 1 ? index.envelopeBytes - i * CHUNK_BYTES : CHUNK_BYTES;
    check(Number.isSafeInteger(item.bytes) && item.bytes === expectedBytes && isDigest(item.sha256), 'Invalid chunk byte count or digest.');
  }
}
function physicalDirectory(directory) {
  const absolute = physicalParent(directory);
  let stat;
  try { stat = fs.lstatSync(absolute); } catch { throw new AssemblyError('Chunk directory is unavailable.'); }
  check(stat.isDirectory() && !stat.isSymbolicLink(), 'Chunk directory must be an actual directory.');
  check(samePath(fs.realpathSync.native(absolute), absolute), 'Symlinked chunk directories are not allowed.');
  return absolute;
}
function writeFresh(file, bytes) {
  const absolute = freshDestination(file);
  let fd, identity, complete = false;
  try {
    fd = fs.openSync(absolute, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    identity = fs.fstatSync(fd);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    complete = true;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* Keep the original error. */ }
    }
    if (!complete && identity) {
      try {
        const now = fs.lstatSync(absolute);
        if (now.isFile() && now.dev === identity.dev && now.ino === identity.ino) fs.unlinkSync(absolute);
      } catch { /* Do not remove a replacement owned by someone else. */ }
    }
  }
}
export function assemble(options) {
  freshDestination(options.output);
  const expectedIndexHash = options['expected-index-sha256'];
  check(isDigest(expectedIndexHash), 'Expected index SHA256 must be a lowercase digest.');
  const rawIndex = regularBytes(options.index, MAX_INDEX, undefined, 'Chunk index');
  check(sha256(rawIndex) === expectedIndexHash, 'Chunk-index SHA256 does not match the expected digest.');
  let index;
  try { index = JSON.parse(rawIndex.toString('utf8')); }
  catch { throw new AssemblyError('Chunk index is not valid JSON.'); }
  validateIndex(index);
  const directory = physicalDirectory(options.chunks);
  const actualFiles = fs.readdirSync(directory, { withFileTypes: true });
  const names = new Set(index.chunks.map((item) => item.name.slice('chunks/'.length)));
  check(actualFiles.length === names.size && actualFiles.every((entry) => entry.isFile() && !entry.isSymbolicLink() && names.has(entry.name)), 'Chunk directory contains missing, extra, or non-regular entries.');
  const envelope = Buffer.alloc(index.envelopeBytes);
  let offset = 0;
  for (const item of index.chunks) {
    const bytes = regularBytes(path.join(directory, item.name.slice('chunks/'.length)), CHUNK_BYTES, item.bytes, 'Ciphertext chunk');
    check(sha256(bytes) === item.sha256, 'Ciphertext chunk SHA256 does not match its index.');
    bytes.copy(envelope, offset);
    offset += bytes.length;
  }
  check(offset === index.envelopeBytes && sha256(envelope) === index.envelopeSha256, 'Reassembled envelope SHA256 does not match its index.');
  // No new file is created until every chunk and the complete envelope verify.
  writeFresh(options.output, envelope);
  return { version: 1, kind: index.kind, runId: index.runId, runAttempt: index.runAttempt, pack: index.pack, recipientFingerprint: index.recipientFingerprint, indexSha256: expectedIndexHash, envelopeBytes: index.envelopeBytes, envelopeSha256: index.envelopeSha256, chunkCount: index.chunks.length };
}
export function main(args = process.argv.slice(2)) {
  const flags = ['index', 'chunks', 'output', 'expected-index-sha256'];
  check(args.length === flags.length * 2, 'Expected --index, --chunks, --output and --expected-index-sha256.');
  const options = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i].startsWith('--') ? args[i].slice(2) : '';
    check(flags.includes(flag) && !(flag in options) && typeof args[i + 1] === 'string' && args[i + 1].length > 0, 'Unknown, duplicate, or empty argument.');
    options[flag] = args[i + 1];
  }
  check(flags.every((flag) => flag in options), 'Missing command argument.');
  return assemble(options);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(`${JSON.stringify(main())}\n`); }
  catch (error) {
    process.stderr.write(`assemble-cloud-material-envelope: ${error instanceof AssemblyError ? error.message : 'Operation failed.'}\n`);
    process.exitCode = 1;
  }
}
