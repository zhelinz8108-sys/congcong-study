#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./assemble-cloud-material-envelope.mjs', import.meta.url));
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
const directory = fs.mkdtempSync(path.join(temporaryRoot, 'cloud-assembly-selftest-'));
fs.chmodSync(directory, 0o700);
const file = (name) => path.join(directory, name);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
let passed = 0, serial = 0;
const test = (name, body) => { body(); passed++; };
function cli(options, good) {
  const result = spawnSync(process.execPath, [script, ...Object.entries(options).flatMap(([key, value]) => [`--${key}`, value])], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
  check(!result.error, 'Assembler CLI did not finish.');
  check(good ? result.status === 0 : result.status !== 0, good ? 'Expected assembly success.' : 'Expected assembly rejection.');
  return good ? JSON.parse(result.stdout) : result;
}
function indexFile(index) {
  const target = file(`index-${++serial}.json`);
  const bytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
  fs.writeFileSync(target, bytes, { mode: 0o600 });
  return { index: target, 'expected-index-sha256': sha256(bytes) };
}
const options = {};
let original;
function rejection(change, overrides = {}) {
  const index = structuredClone(original);
  change(index);
  const output = file(`rejected-${++serial}.json`);
  cli({ ...options, ...indexFile(index), output, ...overrides }, false);
  check(!fs.existsSync(overrides.output ?? output), 'Rejected assembly created an output.');
}
try {
  fs.mkdirSync(file('chunks'));
  const payload = randomBytes(40 * 1024);
  original = { version: 1, kind: 'native-material-envelope-chunks', runId: '123456789', runAttempt: '2', pack: 'native-authoring-min', recipientFingerprint: `sha256:${'a'.repeat(64)}`, envelopeBytes: payload.length, envelopeSha256: sha256(payload), chunkBytes: 16384, chunks: [] };
  for (let offset = 0, i = 0; offset < payload.length; offset += 16384, i++) {
    const bytes = payload.subarray(offset, Math.min(offset + 16384, payload.length));
    const name = `${String(i).padStart(5, '0')}.bin`;
    fs.writeFileSync(path.join(file('chunks'), name), bytes, { mode: 0o600 });
    original.chunks.push({ name: `chunks/${name}`, bytes: bytes.length, sha256: sha256(bytes) });
  }
  Object.assign(options, { ...indexFile(original), chunks: file('chunks'), output: file('assembled.json') });
  test('valid 40KiB reassembly and receipt', () => {
    const receipt = cli(options, true);
    check(fs.readFileSync(options.output).equals(payload), 'Reassembled ciphertext differs.');
    check(receipt.envelopeBytes === payload.length && receipt.envelopeSha256 === sha256(payload) && receipt.chunkCount === 3 && receipt.indexSha256 === options['expected-index-sha256'], 'Assembly receipt is inconsistent.');
    if (process.platform !== 'win32') check((fs.statSync(options.output).mode & 0o777) === 0o600, 'Output mode is not owner-private.');
  });
  test('wrong index SHA256', () => rejection(() => {}, { 'expected-index-sha256': '0'.repeat(64) }));
  test('wrong per-chunk SHA256', () => rejection((index) => { index.chunks[1].sha256 = '0'.repeat(64); }));
  test('wrong global SHA256', () => rejection((index) => { index.envelopeSha256 = '0'.repeat(64); }));
  test('chunk order rejected', () => rejection((index) => { [index.chunks[0], index.chunks[1]] = [index.chunks[1], index.chunks[0]]; }));
  test('duplicate chunk name rejected', () => rejection((index) => { index.chunks[1].name = index.chunks[0].name; }));
  test('traversal chunk name rejected', () => rejection((index) => { index.chunks[0].name = 'chunks/../00000.bin'; }));
  test('missing chunk count rejected', () => rejection((index) => { index.chunks.pop(); }));
  test('wrong nonfinal size rejected', () => rejection((index) => { index.chunks[0].bytes--; }));
  test('wrong final size rejected', () => rejection((index) => { index.chunks.at(-1).bytes++; }));
  test('overlarge envelope rejected', () => rejection((index) => { index.envelopeBytes = 12 * 1024 * 1024 + 1; }));
  test('unexpected index field rejected', () => rejection((index) => { index.extra = true; }));
  test('unexpected chunk field rejected', () => rejection((index) => { index.chunks[0].extra = true; }));
  test('wrong chunk constant rejected', () => rejection((index) => { index.chunkBytes = 8192; }));
  test('wrong format rejected', () => rejection((index) => { index.version = 2; }));
  test('wrong pack rejected', () => rejection((index) => { index.pack = 'other'; }));
  test('invalid workflow run rejected', () => rejection((index) => { index.runId = 123; }));
  test('missing actual chunk rejected', () => {
    const target = path.join(file('chunks'), '00002.bin'), before = fs.readFileSync(target);
    fs.unlinkSync(target);
    try { rejection(() => {}); } finally { fs.writeFileSync(target, before, { mode: 0o600 }); }
  });
  test('actual size mismatch rejected', () => {
    const target = path.join(file('chunks'), '00002.bin'), before = fs.readFileSync(target);
    fs.writeFileSync(target, before.subarray(1));
    try { rejection(() => {}); } finally { fs.writeFileSync(target, before); }
  });
  test('actual chunk corruption rejected', () => {
    const target = path.join(file('chunks'), '00000.bin'), before = fs.readFileSync(target), corrupt = Buffer.from(before);
    corrupt[0] ^= 1;
    fs.writeFileSync(target, corrupt);
    try { rejection(() => {}); } finally { fs.writeFileSync(target, before); }
  });
  test('extra actual entry rejected', () => {
    fs.writeFileSync(path.join(file('chunks'), 'unexpected.bin'), 'extra');
    try { rejection(() => {}); } finally { fs.unlinkSync(path.join(file('chunks'), 'unexpected.bin')); }
  });
  test('existing output preserved', () => {
    const before = sha256(fs.readFileSync(options.output));
    cli(options, false);
    check(sha256(fs.readFileSync(options.output)) === before, 'Existing output was overwritten.');
  });
  let hardlinks = true;
  try { fs.linkSync(path.join(file('chunks'), '00000.bin'), file('hardlink.bin')); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) hardlinks = false; else throw error; }
  if (hardlinks) {
    try { test('multiply-linked chunk rejected', () => rejection(() => {})); }
    finally { fs.unlinkSync(file('hardlink.bin')); }
    fs.linkSync(options.index, file('index-hardlink.json'));
    try { test('multiply-linked index rejected', () => rejection(() => {}, { index: options.index, 'expected-index-sha256': options['expected-index-sha256'] })); }
    finally { fs.unlinkSync(file('index-hardlink.json')); }
  }
  let fileSymlinks = true;
  try { fs.symlinkSync(options.index, file('index-link.json')); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) fileSymlinks = false; else throw error; }
  if (fileSymlinks) {
    test('symlink index rejected', () => rejection(() => {}, { index: file('index-link.json'), 'expected-index-sha256': options['expected-index-sha256'] }));
    test('symlink output preserved', () => {
      fs.symlinkSync(options.output, file('output-link.json'));
      cli({ ...options, output: file('output-link.json') }, false);
      check(fs.lstatSync(file('output-link.json')).isSymbolicLink() && fs.readFileSync(options.output).equals(payload), 'Output symlink changed.');
    });
    test('symlink chunk rejected', () => {
      const target = path.join(file('chunks'), '00000.bin'), before = fs.readFileSync(target);
      fs.writeFileSync(file('held-chunk.bin'), before, { mode: 0o600 });
      fs.unlinkSync(target);
      fs.symlinkSync(file('held-chunk.bin'), target);
      try { rejection(() => {}); } finally { fs.unlinkSync(target); fs.writeFileSync(target, before, { mode: 0o600 }); fs.unlinkSync(file('held-chunk.bin')); }
    });
  }
  let directorySymlinks = true;
  try { fs.symlinkSync(file('chunks'), file('chunks-link'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) directorySymlinks = false; else throw error; }
  if (directorySymlinks) {
    test('symlink chunk directory rejected', () => rejection(() => {}, { chunks: file('chunks-link') }));
    test('symlink output parent rejected', () => rejection(() => {}, { output: path.join(file('chunks-link'), 'output.json') }));
  }
  process.stdout.write(`${JSON.stringify({ passed, hardlinkTests: hardlinks ? 'passed' : 'unavailable-on-host', fileSymlinkTests: fileSymlinks ? 'passed' : 'unavailable-on-host', directorySymlinkTests: directorySymlinks ? 'passed' : 'unavailable-on-host', fixtureBytes: payload.length, networkAccess: false })}\n`);
} catch (error) {
  process.stderr.write(`Assembly selftest failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (path.dirname(directory) === temporaryRoot && path.basename(directory).startsWith('cloud-assembly-selftest-')) fs.rmSync(directory, { recursive: true, force: true });
}
