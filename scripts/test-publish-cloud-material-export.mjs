import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { publishExport } from './publish-cloud-material-export.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'test-private-material-publish-'));
const header = {version: 1, algorithm: 'RSA-OAEP-256+A256GCM', runId: '12345', runAttempt: '1', pack: 'native-authoring-min',
  selectionSha256: '0c8ece619c49ca68ca31da5271eab62a8c9c4cff36ed5318e0ddedb5163c0fcd',
  inputSha256: '88e005c10482f2178dbc998ae47328b1ea0c6fd08f822208af23d7756924ebaf', recipientFingerprint: 'sha256:' + 'a'.repeat(64)};
const raw = Buffer.from(JSON.stringify({header, encryptedKey: Buffer.alloc(384).toString('base64'), nonce: Buffer.alloc(12).toString('base64'),
  tag: Buffer.alloc(16).toString('base64'), ciphertext: Buffer.alloc(4 + 35998 + 405441).toString('base64')}));
const metadata = {...header, rsaBits: 3072, inputBytes: 405441, selectionBytes: 35998, envelopeBytes: raw.length, envelopeSha256: crypto.createHash('sha256').update(raw).digest('hex')};
const env = {GITHUB_REPOSITORY: 'zhelinz8108-sys/congcong-study', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: '1'.repeat(40), GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', GH_TOKEN: 'synthetic-token-no-network'};
const envelopePath = path.join(temp, 'envelope.json'), metadataPath = path.join(temp, 'metadata.json');
let passed = 0;
try {
  await fs.writeFile(envelopePath, raw);
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
  const fake = ({existing = false, advanced = false, refRace = false} = {}) => {
    const calls = [];
    return {calls, fetchImpl: async (url, options) => {
      const suffix = new URL(url).pathname.replace('/repos/zhelinz8108-sys/congcong-study', '');
      const body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({method: options.method, suffix, body});
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert(!['PATCH', 'PUT', 'DELETE'].includes(options.method));
      const reply = (status, value) => ({status, json: async () => value});
      if (suffix === '/git/ref/heads/main') return reply(200, {object: {sha: (advanced ? '2' : '1').repeat(40)}});
      if (suffix.startsWith('/git/ref/heads/codex/')) return reply(existing ? 200 : 404, {});
      if (suffix.startsWith('/git/commits/') && options.method === 'GET') return reply(200, {tree: {sha: '3'.repeat(40)}});
      if (suffix === '/git/blobs') return reply(201, {sha: crypto.createHash('sha1').update(String(calls.length)).digest('hex')});
      if (suffix === '/git/trees') return reply(201, {sha: '6'.repeat(40)});
      if (suffix === '/git/commits') return reply(201, {sha: '7'.repeat(40)});
      if (suffix === '/git/refs') return reply(refRace ? 422 : 201, {});
      throw new Error('Unexpected fake API request');
    }};
  };
  const success = fake();
  const result = await publishExport({envelopePath, metadataPath, env, fetchImpl: success.fetchImpl});
  assert.equal(result.branch, 'codex/private-material-export-12345-1');
  const refs = success.calls.filter(call => call.suffix === '/git/refs');
  assert.equal(refs.length, 1); assert.equal(refs[0].body.ref, 'refs/heads/codex/private-material-export-12345-1');
  assert.equal(success.calls.filter(call => call.suffix === '/git/blobs').length, 3 + Math.ceil(raw.length / 16384));
  const tree = success.calls.find(call => call.suffix === '/git/trees').body.tree;
  assert.equal(tree.filter(entry => entry.path.includes('/chunks/')).length, Math.ceil(raw.length / 16384));
  assert(!tree.some(entry => /\.tar|\.selection|\.pem/.test(entry.path)));
  const index = success.calls.filter(call => call.suffix === '/git/blobs').map(call => Buffer.from(call.body.content, 'base64').toString('utf8'))
    .map(text => { try { return JSON.parse(text); } catch { return {}; } }).find(value => value.kind === 'native-material-envelope-chunks');
  assert.equal(index.chunkBytes, 16384);
  assert.equal(index.envelopeSha256, metadata.envelopeSha256);
  assert.equal(index.chunks.length, Math.ceil(raw.length / 16384));
  for (const [i, chunk] of index.chunks.entries()) { assert.equal(chunk.name, `chunks/${String(i).padStart(5, '0')}.bin`); assert(chunk.bytes <= 16384); }
  for (const blob of success.calls.filter(call => call.suffix === '/git/blobs')) {
    const text = Buffer.from(blob.body.content, 'base64').toString('utf8');
    assert(!text.includes('synthetic-token-no-network') && !text.includes('PRIVATE KEY'));
  }
  passed++;
  for (const options of [{existing: true}, {advanced: true}, {refRace: true}]) {
    const mocked = fake(options);
    await assert.rejects(publishExport({envelopePath, metadataPath, env, fetchImpl: mocked.fetchImpl}));
    assert(!mocked.calls.some(call => ['PUT', 'PATCH', 'DELETE'].includes(call.method)));
    if (!options.refRace) assert(!mocked.calls.some(call => call.method === 'POST'));
    passed++;
  }
  for (const patch of [{GITHUB_REF: 'refs/heads/untrusted'}, {GITHUB_EVENT_NAME: 'pull_request'}, {GITHUB_REPOSITORY: 'other/repo'}, {GITHUB_RUN_ID: '1;touch-bad'}]) {
    await assert.rejects(publishExport({envelopePath, metadataPath, env: {...env, ...patch}, fetchImpl: async () => { throw new Error('Must not reach network'); }})); passed++;
  }
  for (const patch of [{privateKey: 'not-allowed'}, {envelopeSha256: '0'.repeat(64)}, {inputBytes: 1}, {runAttempt: '2'}, {selectionBytes: undefined}]) {
    await fs.writeFile(metadataPath, JSON.stringify({...metadata, ...patch}));
    let contacted = false;
    await assert.rejects(publishExport({envelopePath, metadataPath, env, fetchImpl: async () => { contacted = true; throw new Error('Must not reach network'); }}));
    assert.equal(contacted, false); passed++;
  }
  console.log(JSON.stringify({passed, networkRequests: 0, productionReads: 0, branchMutations: 'fake API only; create-new-ref only'}));
} finally {
  await fs.rm(temp, {recursive: true, force: true});
}
