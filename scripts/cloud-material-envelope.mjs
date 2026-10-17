#!/usr/bin/env node
// Encrypt the fixed, reviewed material selection for a one-time recipient.
// Uses only Node built-ins. Never logs keys, archive bytes, or encrypted payloads.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  constants as cryptoConstants, createCipheriv, createDecipheriv, createHash,
  createPrivateKey, createPublicKey, privateDecrypt, publicEncrypt, randomBytes,
} from 'node:crypto';

export const PACK = 'native-authoring-min';
export const SELECTION_SHA256 = '0c8ece619c49ca68ca31da5271eab62a8c9c4cff36ed5318e0ddedb5163c0fcd';
export const ALGORITHM = 'RSA-OAEP-256+A256GCM';
const MAX_INPUT = 8 * 1024 * 1024;
const MAX_SELECTION = 64 * 1024;
const MAX_BUNDLE = 4 + MAX_SELECTION + MAX_INPUT;
const MAX_ENVELOPE = 12 * 1024 * 1024;
const HEADER_KEYS = ['version', 'algorithm', 'runId', 'runAttempt', 'pack', 'selectionSha256', 'inputSha256', 'recipientFingerprint'];
const ENVELOPE_KEYS = ['header', 'encryptedKey', 'nonce', 'tag', 'ciphertext'];

class EnvelopeError extends Error {}
function requireCondition(condition, message) {
  if (!condition) throw new EnvelopeError(message);
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function numeric(value, name) {
  requireCondition(typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value), `${name} must be a positive decimal string.`);
  return value;
}
function digest(value, name) {
  requireCondition(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), `${name} must be a lowercase SHA256 digest.`);
  return value;
}
function samePath(left, right) {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function physicalParent(file) {
  const absolute = path.resolve(file);
  const parent = path.dirname(absolute);
  let actual;
  try { actual = fs.realpathSync.native(parent); } catch { throw new EnvelopeError('File parent must already exist.'); }
  requireCondition(samePath(parent, actual), 'Symlinked file parents are not allowed.');
  return absolute;
}
function readRegular(file, maxBytes, label) {
  const absolute = physicalParent(file);
  let before;
  try { before = fs.lstatSync(absolute); } catch { throw new EnvelopeError(`${label} is not readable.`); }
  requireCondition(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular file, without symlinks.`);
  requireCondition(before.size > 0 && before.size <= maxBytes, `${label} has an invalid size.`);
  let fd;
  try {
    fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const current = fs.fstatSync(fd);
    requireCondition(current.isFile() && current.dev === before.dev && current.ino === before.ino, `${label} changed while opening.`);
    requireCondition(current.size > 0 && current.size <= maxBytes, `${label} has an invalid size.`);
    // Bound the actual read too; a concurrently enlarged source cannot exhaust memory.
    const bytes = Buffer.alloc(current.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const n = fs.readSync(fd, bytes, count, bytes.length - count, null);
      if (!n) break;
      count += n;
    }
    const after = fs.fstatSync(fd);
    requireCondition(count === current.size && after.size === current.size && after.mtimeMs === current.mtimeMs && after.ctimeMs === current.ctimeMs, `${label} changed while reading.`);
    return bytes.subarray(0, count);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function assertFresh(file) {
  const absolute = physicalParent(file);
  try {
    fs.lstatSync(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') return absolute;
    throw new EnvelopeError('Cannot inspect output destination.');
  }
  throw new EnvelopeError('Output destination already exists; refusing to overwrite it.');
}
function publishFresh(outputs) {
  const entries = outputs.map(({ file, bytes }) => ({ file: assertFresh(file), bytes }));
  requireCondition(new Set(entries.map((entry) => process.platform === 'win32' ? entry.file.toLowerCase() : entry.file)).size === entries.length, 'Output destinations must be distinct.');
  const created = [];
  let completed = false;
  try {
    // Open all destinations before writing either one. O_EXCL also rejects a
    // symlink/collision introduced after the initial checks.
    for (const entry of entries) {
      const fd = fs.openSync(entry.file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
      created.push({ ...entry, fd, identity: fs.fstatSync(fd) });
    }
    for (const entry of created) {
      fs.writeFileSync(entry.fd, entry.bytes);
      fs.fsyncSync(entry.fd);
    }
    completed = true;
  } finally {
    for (const entry of created) {
      try { fs.closeSync(entry.fd); } catch { /* Do not mask the original failure. */ }
    }
    if (!completed) {
      for (const entry of created) {
        try {
          const now = fs.lstatSync(entry.file);
          if (now.isFile() && now.dev === entry.identity.dev && now.ino === entry.identity.ino) fs.unlinkSync(entry.file);
        } catch { /* Never remove a replacement path owned by someone else. */ }
      }
    }
  }
}
function exactKeys(value, keys, label) {
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  requireCondition(actual.length === keys.length && actual.every((key, index) => key === expected[index]), `${label} has unexpected or missing fields.`);
}
function pemText(bytes, kind) {
  const value = bytes.toString('utf8');
  requireCondition(!value.includes('\uFFFD'), `${kind} must be UTF-8 PEM.`);
  const pattern = kind === 'Public key'
    ? /^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/
    : /^-----BEGIN (PRIVATE KEY|RSA PRIVATE KEY)-----\r?\n[A-Za-z0-9+/=\r\n]+-----END \1-----\r?\n?$/;
  requireCondition(pattern.test(value), `${kind} has an unsupported PEM format.`);
  return value;
}
function rsaIdentity(publicKey) {
  requireCondition(publicKey.asymmetricKeyType === 'rsa', 'Recipient key must be an RSA key.');
  const rsaBits = publicKey.asymmetricKeyDetails?.modulusLength;
  requireCondition(Number.isInteger(rsaBits) && rsaBits >= 3072 && rsaBits <= 8192, 'RSA key must be between 3072 and 8192 bits.');
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return { rsaBits, recipientFingerprint: `sha256:${sha256(der)}` };
}
function publicRecipient(file) {
  const pem = pemText(readRegular(file, 8192, 'Public key'), 'Public key');
  let key;
  try { key = createPublicKey({ key: pem, type: 'spki', format: 'pem' }); }
  catch { throw new EnvelopeError('Public key is invalid.'); }
  return { key, ...rsaIdentity(key) };
}
function privateRecipient(file) {
  const bytes = readRegular(file, 16384, 'Private key');
  try {
    const pem = pemText(bytes, 'Private key');
    let key;
    try { key = createPrivateKey({ key: pem, format: 'pem' }); }
    catch { throw new EnvelopeError('Private key is invalid or encrypted.'); }
    return { key, ...rsaIdentity(createPublicKey(key)) };
  } finally { bytes.fill(0); }
}
function validateHeader(header) {
  exactKeys(header, HEADER_KEYS, 'Authenticated header');
  requireCondition(header.version === 1 && header.algorithm === ALGORITHM, 'Unsupported envelope version or algorithm.');
  requireCondition(header.pack === PACK && header.selectionSha256 === SELECTION_SHA256, 'Envelope does not contain the approved selection.');
  numeric(header.runId, 'runId');
  numeric(header.runAttempt, 'runAttempt');
  digest(header.inputSha256, 'inputSha256');
  requireCondition(typeof header.recipientFingerprint === 'string' && /^sha256:[a-f0-9]{64}$/.test(header.recipientFingerprint), 'Invalid recipient fingerprint.');
  return Buffer.from(JSON.stringify(Object.fromEntries(HEADER_KEYS.map((key) => [key, header[key]]))), 'utf8');
}
function decodeBase64(value, minBytes, maxBytes, label) {
  requireCondition(typeof value === 'string' && value.length > 0 && value.length <= Math.ceil(maxBytes / 3) * 4, `${label} has an invalid encoded size.`);
  // Avoid a repeated-group regex on multi-megabyte ciphertext. Round-trip
  // equality below enforces both padding placement and unused padding bits.
  requireCondition(value.length % 4 === 0 && !/[^A-Za-z0-9+/=]/.test(value), `${label} is not canonical base64.`);
  const bytes = Buffer.from(value, 'base64');
  requireCondition(bytes.length >= minBytes && bytes.length <= maxBytes && bytes.toString('base64') === value, `${label} is not canonical base64 or has an invalid length.`);
  return bytes;
}
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

export function inspectPublicKey(options) {
  const { rsaBits, recipientFingerprint } = publicRecipient(options['public-key']);
  return { algorithm: ALGORITHM, rsaBits, recipientFingerprint };
}
export function encrypt(options) {
  // A requested collision must fail without creating the other output.
  assertFresh(options.output);
  assertFresh(options.metadata);
  const expectedHash = digest(options['expected-input-sha256'], 'expected-input-sha256');
  const selection = readRegular(options.selection, MAX_SELECTION, 'Selection');
  requireCondition(sha256(selection) === SELECTION_SHA256, 'Selection does not match the approved SHA256 digest.');
  const input = readRegular(options.input, MAX_INPUT, 'Input archive');
  const inputSha256 = sha256(input);
  requireCondition(inputSha256 === expectedHash, 'Input archive does not match the expected SHA256 digest.');
  const recipient = publicRecipient(options['public-key']);
  const header = {
    version: 1, algorithm: ALGORITHM,
    runId: numeric(options['run-id'], 'run-id'),
    runAttempt: numeric(options['run-attempt'], 'run-attempt'),
    pack: PACK, selectionSha256: SELECTION_SHA256, inputSha256,
    recipientFingerprint: recipient.recipientFingerprint,
  };
  const aad = validateHeader(header);
  const aesKey = randomBytes(32);
  const nonce = randomBytes(12);
  // Version 1 plaintext: uint32BE selection byte length, exact selection bytes,
  // then exact archive bytes. Neither path manifests nor archive bytes are public.
  const length = Buffer.alloc(4);
  length.writeUInt32BE(selection.length);
  const bundle = Buffer.concat([length, selection, input]);
  try {
    const cipher = createCipheriv('aes-256-gcm', aesKey, nonce, { authTagLength: 16 });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(bundle), cipher.final()]);
    const encryptedKey = publicEncrypt({ key: recipient.key, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256', oaepLabel: aad }, aesKey);
    const envelope = jsonBytes({ header, encryptedKey: encryptedKey.toString('base64'), nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
    requireCondition(envelope.length <= MAX_ENVELOPE, 'Envelope exceeds its size limit.');
    const metadata = { ...header, rsaBits: recipient.rsaBits, inputBytes: input.length, selectionBytes: selection.length, envelopeBytes: envelope.length, envelopeSha256: sha256(envelope) };
    publishFresh([{ file: options.output, bytes: envelope }, { file: options.metadata, bytes: jsonBytes(metadata) }]);
    return metadata;
  } finally { aesKey.fill(0); input.fill(0); selection.fill(0); bundle.fill(0); }
}
export function decrypt(options) {
  assertFresh(options.output);
  assertFresh(options['selection-output']);
  numeric(options['expected-run-id'], 'expected-run-id');
  numeric(options['expected-run-attempt'], 'expected-run-attempt');
  requireCondition(options['expected-selection-sha256'] === SELECTION_SHA256, 'Expected selection digest is not the approved digest.');
  digest(options['expected-input-sha256'], 'expected-input-sha256');
  const encoded = readRegular(options.input, MAX_ENVELOPE, 'Envelope');
  let envelope;
  try { envelope = JSON.parse(encoded.toString('utf8')); }
  catch { throw new EnvelopeError('Envelope is not valid JSON.'); }
  exactKeys(envelope, ENVELOPE_KEYS, 'Envelope');
  const aad = validateHeader(envelope.header);
  const header = envelope.header;
  requireCondition(header.runId === options['expected-run-id'] && header.runAttempt === options['expected-run-attempt'], 'Envelope belongs to a different workflow run or attempt.');
  requireCondition(header.inputSha256 === options['expected-input-sha256'], 'Envelope input hash does not match the expected digest.');
  const recipient = privateRecipient(options['private-key']);
  requireCondition(header.recipientFingerprint === recipient.recipientFingerprint, 'Private key does not match the envelope recipient.');
  const rsaBytes = Math.ceil(recipient.rsaBits / 8);
  const encryptedKey = decodeBase64(envelope.encryptedKey, rsaBytes, rsaBytes, 'Wrapped key');
  const nonce = decodeBase64(envelope.nonce, 12, 12, 'Nonce');
  const tag = decodeBase64(envelope.tag, 16, 16, 'Authentication tag');
  const ciphertext = decodeBase64(envelope.ciphertext, 6, MAX_BUNDLE, 'Ciphertext');
  let aesKey;
  let bundle;
  try {
    try {
      aesKey = privateDecrypt({ key: recipient.key, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256', oaepLabel: aad }, encryptedKey);
      requireCondition(aesKey.length === 32, 'Invalid wrapped key length.');
      const decipher = createDecipheriv('aes-256-gcm', aesKey, nonce, { authTagLength: 16 });
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      // Do not publish any output until authentication and content hashing pass.
      bundle = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch { throw new EnvelopeError('Envelope authentication failed.'); }
    requireCondition(bundle.length > 5, 'Authenticated material bundle is incomplete.');
    const selectionLength = bundle.readUInt32BE(0);
    requireCondition(selectionLength > 0 && selectionLength <= MAX_SELECTION && bundle.length > selectionLength + 4, 'Authenticated material bundle has an invalid selection length.');
    const selection = bundle.subarray(4, 4 + selectionLength);
    const input = bundle.subarray(4 + selectionLength);
    requireCondition(input.length <= MAX_INPUT, 'Authenticated archive exceeds its size limit.');
    requireCondition(sha256(selection) === SELECTION_SHA256, 'Authenticated selection digest does not match the approved selection.');
    requireCondition(sha256(input) === header.inputSha256, 'Authenticated archive digest does not match its header.');
    publishFresh([{ file: options.output, bytes: input }, { file: options['selection-output'], bytes: selection }]);
    return { ...header, rsaBits: recipient.rsaBits, inputBytes: input.length, selectionBytes: selection.length, envelopeBytes: encoded.length, envelopeSha256: sha256(encoded), authenticated: true };
  } finally { aesKey?.fill(0); bundle?.fill(0); }
}

const COMMANDS = {
  'inspect-public-key': { flags: ['public-key'], execute: inspectPublicKey },
  encrypt: { flags: ['input', 'selection', 'public-key', 'run-id', 'run-attempt', 'expected-input-sha256', 'output', 'metadata'], execute: encrypt },
  decrypt: { flags: ['input', 'private-key', 'output', 'selection-output', 'expected-run-id', 'expected-run-attempt', 'expected-selection-sha256', 'expected-input-sha256'], execute: decrypt },
};
export function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  const spec = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  requireCondition(Boolean(spec), 'Command must be inspect-public-key, encrypt, or decrypt.');
  requireCondition(args.length === spec.flags.length * 2, 'Incorrect number of command arguments.');
  const options = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i].startsWith('--') ? args[i].slice(2) : '';
    requireCondition(spec.flags.includes(flag) && !(flag in options), 'Unknown or duplicate command argument.');
    requireCondition(typeof args[i + 1] === 'string' && args[i + 1].length > 0, 'Argument value must not be empty.');
    options[flag] = args[i + 1];
  }
  requireCondition(spec.flags.every((flag) => flag in options), 'Missing command argument.');
  return spec.execute(options);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(`${JSON.stringify(main())}\n`); }
  catch (error) {
    process.stderr.write(`cloud-material-envelope: ${error instanceof EnvelopeError ? error.message : 'Operation failed.'}\n`);
    process.exitCode = 1;
  }
}
