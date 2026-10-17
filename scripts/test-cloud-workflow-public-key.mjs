// Execute only the workflow's public-key preparation block with synthetic keys.
// No SSH, GitHub API, production material or actual recipient private key.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generateKeyPairSync, createHash, createPublicKey } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await fs.readFile(path.join(sourceRoot, '.github/workflows/cloud-materials.yml'), 'utf8');
const blocks = [...workflow.matchAll(/node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n          NODE/g)];
assert.equal(blocks.length, 1);
const program = blocks[0][1].replace(/^          /gm, '');
assert(program.indexOf('Buffer.byteLength(submitted') < program.indexOf('submitted.replace'), 'Bound raw input before normalization');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'test-cloud-pubkey-'));
let passed = 0;
try {
  const pair = generateKeyPairSync('rsa', {modulusLength: 3072});
  const pem = pair.publicKey.export({type: 'spki', format: 'pem'});
  const fingerprint = 'sha256:' + createHash('sha256').update(createPublicKey(pem).export({type: 'spki', format: 'der'})).digest('hex');
  const prepare = async (name, input, expectPrepare, expectInspect) => {
    const directory = path.join(temporary, name); await fs.mkdir(directory);
    const result = spawnSync(process.execPath, ['--input-type=module'], {input: program, encoding: 'utf8', env: {...process.env, WORK_DIR: directory, RECIPIENT_PUBLIC_KEY: input}});
    assert.equal(result.status === 0, expectPrepare, name);
    const filename = path.join(directory, 'recipient.pem');
    if (!expectPrepare) { await assert.rejects(fs.stat(filename), {code: 'ENOENT'}); passed++; return; }
    const inspected = spawnSync(process.execPath, [path.join(sourceRoot, 'scripts/cloud-material-envelope.mjs'), 'inspect-public-key', '--public-key', filename], {encoding: 'utf8'});
    assert.equal(inspected.status === 0, expectInspect, name);
    if (expectInspect) assert.equal(JSON.parse(inspected.stdout).recipientFingerprint, fingerprint);
    passed++;
  };
  await prepare('multiline', pem, true, true);
  await prepare('literal-newlines', pem.replace(/\n/g, '\\n'), true, true);
  await prepare('literal-crlf', pem.replace(/\n/g, '\\r\\n'), true, true);
  await prepare('private-rejected', pair.privateKey.export({type: 'pkcs8', format: 'pem'}), false, false);
  await prepare('oversized', '-----BEGIN PUBLIC KEY-----' + 'A'.repeat(8192), false, false);
  await prepare('empty', '', false, false);
  const weak = generateKeyPairSync('rsa', {modulusLength: 2048}).publicKey.export({type: 'spki', format: 'pem'});
  await prepare('weak-rsa', weak, true, false);
  const ec = generateKeyPairSync('ec', {namedCurve: 'prime256v1'}).publicKey.export({type: 'spki', format: 'pem'});
  await prepare('non-rsa', ec, true, false);
  console.log(JSON.stringify({passed, literalNewlineInput: 'supported', networkAccess: false, productionKeyUsed: false}));
} finally { await fs.rm(temporary, {recursive: true, force: true}); }
