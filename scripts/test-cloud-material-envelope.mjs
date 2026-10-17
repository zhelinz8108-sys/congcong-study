#!/usr/bin/env node
// Synthetic archive + disposable keys only. The selection contains paths/hashes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, createCipheriv, createDecipheriv, createHash, generateKeyPairSync, privateDecrypt, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ALGORITHM, PACK, SELECTION_SHA256 } from './cloud-material-envelope.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--selection') {
  process.stderr.write('Usage: node test-cloud-material-envelope.mjs --selection APPROVED_SELECTION_JSON\n');
  process.exit(1);
}
const script = fileURLToPath(new URL('./cloud-material-envelope.mjs', import.meta.url));
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
const directory = fs.mkdtempSync(path.join(temporaryRoot, 'cloud-envelope-selftest-'));
fs.chmodSync(directory, 0o700);
const file = (name) => path.join(directory, name);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
let passed = 0;
let counter = 0;
const test = (name, body) => { body(); passed++; };
function cli(command, options, good = true) {
  const argv = [script, command, ...Object.entries(options).flatMap(([key, value]) => [`--${key}`, value])];
  const result = spawnSync(process.execPath, argv, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
  check(!result.error, 'CLI process could not finish.');
  check(good ? result.status === 0 : result.status !== 0, good ? 'Expected CLI success.' : 'Expected CLI rejection.');
  check(!result.stdout.includes('BEGIN PRIVATE KEY') && !result.stderr.includes('BEGIN PRIVATE KEY'), 'A private key appeared in command output.');
  check(!result.stdout.includes('SYNTHETIC-ARCHIVE-CONTENT') && !result.stderr.includes('SYNTHETIC-ARCHIVE-CONTENT'), 'Archive bytes appeared in command output.');
  return good ? JSON.parse(result.stdout) : result;
}
function expectDecryptFailure(changes = {}, source = file('envelope.json')) {
  const output = file(`rejected-${++counter}.tar`);
  const selectionOutput = file(`rejected-selection-${counter}.json`);
  cli('decrypt', { ...decryptOptions, input: source, output, 'selection-output': selectionOutput, ...changes }, false);
  check(!fs.existsSync(output), 'Rejected decrypt created an output.');
  check(!fs.existsSync(selectionOutput), 'Rejected decrypt created a selection output.');
}
function changedEnvelope(change) {
  const value = JSON.parse(fs.readFileSync(file('envelope.json'), 'utf8'));
  change(value);
  const target = file(`tampered-${++counter}.json`);
  fs.writeFileSync(target, JSON.stringify(value));
  return target;
}
function flip(value) {
  const bytes = Buffer.from(value, 'base64');
  bytes[0] ^= 1;
  return bytes.toString('base64');
}
function authenticatedBundle(change) {
  return changedEnvelope((value) => {
    const aad = Buffer.from(JSON.stringify(value.header));
    const key = privateDecrypt({ key: fs.readFileSync(file('private.pem')), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256', oaepLabel: aad }, Buffer.from(value.encryptedKey, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.nonce, 'base64'));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    const bundle = Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]);
    change(bundle);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad);
    value.ciphertext = Buffer.concat([cipher.update(bundle), cipher.final()]).toString('base64');
    value.nonce = nonce.toString('base64');
    value.tag = cipher.getAuthTag().toString('base64');
    key.fill(0);
    bundle.fill(0);
  });
}
const encryptOptions = {};
const decryptOptions = {};
try {
  const selection = fs.readFileSync(args[1]);
  check(hash(selection) === SELECTION_SHA256 && selection.length < 65536, 'Selftest requires the approved selection file.');
  fs.writeFileSync(file('selection.json'), selection, { mode: 0o600 });
  const plain = Buffer.concat([Buffer.from('SYNTHETIC-ARCHIVE-CONTENT\n'), randomBytes(1000)]);
  fs.writeFileSync(file('synthetic.tar'), plain, { mode: 0o600 });
  const inputHash = hash(plain);
  const keys = generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const otherKeys = generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  fs.writeFileSync(file('public.pem'), keys.publicKey, { mode: 0o600 });
  fs.writeFileSync(file('private.pem'), keys.privateKey, { mode: 0o600 });
  fs.writeFileSync(file('other-private.pem'), otherKeys.privateKey, { mode: 0o600 });
  Object.assign(encryptOptions, { input: file('synthetic.tar'), selection: file('selection.json'), 'public-key': file('public.pem'), 'run-id': '123456789', 'run-attempt': '2', 'expected-input-sha256': inputHash, output: file('envelope.json'), metadata: file('metadata.json') });
  Object.assign(decryptOptions, { input: file('envelope.json'), 'private-key': file('private.pem'), output: file('roundtrip.tar'), 'selection-output': file('roundtrip-selection.json'), 'expected-run-id': '123456789', 'expected-run-attempt': '2', 'expected-selection-sha256': SELECTION_SHA256, 'expected-input-sha256': inputHash });

  test('SPKI inspection', () => {
    const value = cli('inspect-public-key', { 'public-key': file('public.pem') });
    check(value.rsaBits === 3072 && value.algorithm === ALGORITHM && /^sha256:[0-9a-f]{64}$/.test(value.recipientFingerprint), 'Public-key identity is invalid.');
  });
  test('authenticated round trip and safe metadata', () => {
    const result = cli('encrypt', encryptOptions);
    const metadata = JSON.parse(fs.readFileSync(file('metadata.json'), 'utf8'));
    const encoded = fs.readFileSync(file('envelope.json'));
    check(result.envelopeSha256 === hash(encoded) && result.envelopeBytes === encoded.length && result.inputBytes === plain.length, 'Envelope receipt is not bound to its files.');
    check(JSON.stringify(result) === JSON.stringify(metadata) && metadata.pack === PACK && metadata.selectionSha256 === SELECTION_SHA256, 'Metadata receipt is inconsistent.');
    check(!('encryptedKey' in metadata) && !('ciphertext' in metadata) && !('nonce' in metadata) && !('tag' in metadata), 'Metadata contains encrypted payload fields.');
    const decoded = cli('decrypt', decryptOptions);
    check(decoded.authenticated === true && fs.readFileSync(file('roundtrip.tar')).equals(plain), 'Round-trip archive does not match.');
    check(fs.readFileSync(file('roundtrip-selection.json')).equals(selection) && decoded.selectionBytes === selection.length, 'Round-trip selection does not match.');
    if (process.platform !== 'win32') check((fs.statSync(file('roundtrip.tar')).mode & 0o777) === 0o600, 'Decrypted output is not owner-private.');
  });
  test('fresh randomness for each encryption', () => {
    cli('encrypt', { ...encryptOptions, output: file('second-envelope.json'), metadata: file('second-metadata.json') });
    const first = JSON.parse(fs.readFileSync(file('envelope.json'), 'utf8'));
    const second = JSON.parse(fs.readFileSync(file('second-envelope.json'), 'utf8'));
    check(first.nonce !== second.nonce && first.encryptedKey !== second.encryptedKey && first.ciphertext !== second.ciphertext, 'Encryption reused random material.');
  });
  test('wrong recipient private key', () => expectDecryptFailure({ 'private-key': file('other-private.pem') }));
  for (const field of ['ciphertext', 'tag', 'nonce', 'encryptedKey']) {
    test(`tampered ${field}`, () => expectDecryptFailure({}, changedEnvelope((value) => { value[field] = flip(value[field]); })));
  }
  test('authenticated but corrupted selection rejected', () => {
    const target = authenticatedBundle((bundle) => { bundle[4] ^= 1; });
    expectDecryptFailure({}, target);
  });
  test('authenticated but corrupted archive rejected', () => expectDecryptFailure({}, authenticatedBundle((bundle) => { bundle[4 + bundle.readUInt32BE(0)] ^= 1; })));
  test('authenticated invalid bundle length rejected', () => expectDecryptFailure({}, authenticatedBundle((bundle) => { bundle.writeUInt32BE(65537, 0); })));
  test('authenticated run header', () => expectDecryptFailure({ 'expected-run-id': '123456790' }, changedEnvelope((value) => { value.header.runId = '123456790'; })));
  test('unexpected header field', () => expectDecryptFailure({}, changedEnvelope((value) => { value.header.extra = true; })));
  test('unexpected envelope field', () => expectDecryptFailure({}, changedEnvelope((value) => { value.extra = true; })));
  test('unsupported version', () => expectDecryptFailure({}, changedEnvelope((value) => { value.header.version = 2; })));
  test('unsupported algorithm', () => expectDecryptFailure({}, changedEnvelope((value) => { value.header.algorithm = 'other'; })));
  test('wrong workflow attempt', () => expectDecryptFailure({ 'expected-run-attempt': '3' }));
  test('wrong expected digest', () => expectDecryptFailure({ 'expected-input-sha256': '0'.repeat(64) }));
  test('wrong expected selection', () => expectDecryptFailure({ 'expected-selection-sha256': '0'.repeat(64) }));
  test('noncanonical base64 pad bits', () => {
    const target = changedEnvelope((value) => {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const original = value.tag;
      const index = original.length - 3;
      value.tag = `${original.slice(0, index)}${alphabet[alphabet.indexOf(original[index]) + 1]}==`;
      check(Buffer.from(original, 'base64').equals(Buffer.from(value.tag, 'base64')), 'Noncanonical test did not preserve decoded bytes.');
    });
    expectDecryptFailure({}, target);
  });
  test('wrong nonce length', () => expectDecryptFailure({}, changedEnvelope((value) => { value.nonce = Buffer.alloc(11).toString('base64'); })));
  test('encryption digest pin', () => {
    const output = file('wrong-digest.json'), metadata = file('wrong-digest-metadata.json');
    cli('encrypt', { ...encryptOptions, 'expected-input-sha256': '0'.repeat(64), output, metadata }, false);
    check(!fs.existsSync(output) && !fs.existsSync(metadata), 'Digest rejection left an output.');
  });
  test('selection digest pin', () => {
    fs.writeFileSync(file('wrong-selection.json'), '{}');
    const output = file('wrong-selection-envelope.json'), metadata = file('wrong-selection-metadata.json');
    cli('encrypt', { ...encryptOptions, selection: file('wrong-selection.json'), output, metadata }, false);
    check(!fs.existsSync(output) && !fs.existsSync(metadata), 'Selection rejection left an output.');
  });
  test('short RSA key rejection', () => {
    const weak = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    fs.writeFileSync(file('weak.pem'), weak.publicKey);
    cli('inspect-public-key', { 'public-key': file('weak.pem') }, false);
  });
  test('non-RSA key rejection', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    fs.writeFileSync(file('ec.pem'), ec.publicKey);
    cli('inspect-public-key', { 'public-key': file('ec.pem') }, false);
  });
  test('private PEM rejected at public-key entry', () => cli('inspect-public-key', { 'public-key': file('private.pem') }, false));
  test('oversized public key rejection', () => {
    fs.writeFileSync(file('oversized.pem'), Buffer.alloc(8193, 65));
    cli('inspect-public-key', { 'public-key': file('oversized.pem') }, false);
  });
  test('oversized archive rejection', () => {
    fs.writeFileSync(file('oversized.tar'), Buffer.alloc(8 * 1024 * 1024 + 1));
    const output = file('oversized-envelope.json'), metadata = file('oversized-metadata.json');
    cli('encrypt', { ...encryptOptions, input: file('oversized.tar'), output, metadata }, false);
    check(!fs.existsSync(output) && !fs.existsSync(metadata), 'Oversize rejection left an output.');
  });
  test('maximum supported archive round trip', () => {
    const large = Buffer.alloc(8 * 1024 * 1024, 0xa5);
    const largeHash = hash(large);
    fs.writeFileSync(file('maximum.tar'), large, { mode: 0o600 });
    const receipt = cli('encrypt', { ...encryptOptions, input: file('maximum.tar'), 'expected-input-sha256': largeHash, output: file('maximum-envelope.json'), metadata: file('maximum-metadata.json') });
    check(receipt.inputBytes === large.length && receipt.envelopeBytes <= 12 * 1024 * 1024, 'Maximum-size receipt is invalid.');
    cli('decrypt', { ...decryptOptions, input: file('maximum-envelope.json'), 'expected-input-sha256': largeHash, output: file('maximum-restored.tar'), 'selection-output': file('maximum-restored-selection.json') });
    check(hash(fs.readFileSync(file('maximum-restored.tar'))) === largeHash, 'Maximum-size archive did not survive round trip.');
    check(fs.readFileSync(file('maximum-restored-selection.json')).equals(selection), 'Maximum-size round trip changed the selection.');
  });
  test('existing decrypt output preserved', () => {
    const before = hash(fs.readFileSync(file('roundtrip.tar')));
    cli('decrypt', decryptOptions, false);
    check(hash(fs.readFileSync(file('roundtrip.tar'))) === before, 'Existing decrypted output changed.');
  });
  test('existing selection output rejects both decrypt outputs', () => {
    const output = file('selection-collision.tar');
    const before = hash(fs.readFileSync(file('roundtrip-selection.json')));
    cli('decrypt', { ...decryptOptions, output }, false);
    check(!fs.existsSync(output) && hash(fs.readFileSync(file('roundtrip-selection.json'))) === before, 'Selection collision changed or partially published outputs.');
  });
  test('same decrypt output rejected without partial publication', () => {
    const output = file('same-decrypt-output');
    cli('decrypt', { ...decryptOptions, output, 'selection-output': output }, false);
    check(!fs.existsSync(output), 'Same decrypt destination left an output.');
  });
  test('existing metadata rejects both encryption outputs', () => {
    const before = hash(fs.readFileSync(file('metadata.json'))), output = file('collision-envelope.json');
    cli('encrypt', { ...encryptOptions, output }, false);
    check(!fs.existsSync(output) && hash(fs.readFileSync(file('metadata.json'))) === before, 'Output collision overwrote metadata or left an envelope.');
  });
  test('same output path rejected without partial publication', () => {
    const output = file('same-destination.json');
    cli('encrypt', { ...encryptOptions, output, metadata: output }, false);
    check(!fs.existsSync(output), 'Same destination left an output.');
  });
  // Windows may deny symbolic-link creation without Developer Mode. If it does,
  // use a directory junction to exercise the parent-link guard instead.
  let fileSymlinks = true;
  try { fs.symlinkSync(file('synthetic.tar'), file('input-link.tar')); }
  catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') fileSymlinks = false; else throw error; }
  if (fileSymlinks) {
    test('symlink input rejected', () => {
      cli('encrypt', { ...encryptOptions, input: file('input-link.tar'), output: file('link-envelope.json'), metadata: file('link-metadata.json') }, false);
      check(!fs.existsSync(file('link-envelope.json')), 'Symlink input created an output.');
    });
    test('symlink key rejected', () => {
      fs.symlinkSync(file('public.pem'), file('public-link.pem'));
      cli('inspect-public-key', { 'public-key': file('public-link.pem') }, false);
    });
    test('symlink output preserved', () => {
      fs.symlinkSync(file('roundtrip.tar'), file('output-link.tar'));
      const before = hash(fs.readFileSync(file('roundtrip.tar')));
      cli('decrypt', { ...decryptOptions, output: file('output-link.tar') }, false);
      check(fs.lstatSync(file('output-link.tar')).isSymbolicLink() && hash(fs.readFileSync(file('roundtrip.tar'))) === before, 'Symlink output changed.');
    });
  }
  fs.mkdirSync(file('actual-parent'));
  let parentSymlinks = true;
  try { fs.symlinkSync(file('actual-parent'), file('parent-link'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') parentSymlinks = false; else throw error; }
  if (parentSymlinks) test('symlinked output parent rejected', () => {
    const output = path.join(file('parent-link'), 'output.tar');
    cli('decrypt', { ...decryptOptions, output }, false);
    check(!fs.existsSync(output), 'Symlinked parent created an output.');
  });
  test('duplicate CLI arguments rejected', () => {
    const result = spawnSync(process.execPath, [script, 'inspect-public-key', '--public-key', file('public.pem'), '--public-key', file('public.pem')], { encoding: 'utf8', windowsHide: true });
    check(result.status !== 0, 'Duplicate CLI flags were accepted.');
  });
  process.stdout.write(`${JSON.stringify({ passed, fileSymlinkTests: fileSymlinks ? 'passed' : 'unavailable-on-host', parentSymlinkTest: parentSymlinks ? 'passed' : 'unavailable-on-host', algorithm: ALGORITHM, pack: PACK, productionAccess: false })}\n`);
} catch (error) {
  process.stderr.write(`Envelope selftest failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  // Delete only the unique directory created by this process under its real temp root.
  if (path.dirname(directory) === temporaryRoot && path.basename(directory).startsWith('cloud-envelope-selftest-')) fs.rmSync(directory, { recursive: true, force: true });
}
