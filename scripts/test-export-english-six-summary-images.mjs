import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { SUMMARY_RESOURCE, SUMMARY_IMAGES, collectSummaryImages, encrypt, decrypt } from './export-english-six-knowledge.mjs';
import { publishSummary } from './publish-summary-images-encrypted.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'summary-image-export-'));
try {
  await fs.mkdir(path.join(root, 'resources')); await fs.mkdir(path.join(root, 'assets'));
  const json = (file, value) => fs.writeFile(path.join(root, file), JSON.stringify(value));
  const meta = { id: SUMMARY_RESOURCE, edition: 'new', stage: 'explain', title: 'Synthetic knowledge', paths: ['Synthetic.pdf'] };
  const resource = { id: SUMMARY_RESOURCE, meta, pages: [{ blocks: SUMMARY_IMAGES.map(([id]) => ({ kind: 'image', asset: id })) }] };
  await json('index.json', { resources: [meta, { id: 'f'.repeat(12), edition: 'new' }] });
  await json(`resources/${SUMMARY_RESOURCE}.json`, resource);
  const manifest = {};
  for (const [id, size] of SUMMARY_IMAGES) {
    manifest[id] = { extension: '.webp', file: `assets/${id}.webp`, size };
    await fs.writeFile(path.join(root, `assets/${id}.webp`), Buffer.alloc(size, 0x42));
  }
  // An unrelated private asset path and resource deliberately do not exist.
  manifest['f'.repeat(32)] = { file: '/etc/private-unrelated', size: 100, extension: '.webp' };
  await json('assets.private.json', manifest);
  const result = await collectSummaryImages(root);
  assert.equal(result.files.length, 14); assert.equal(result.files.reduce((sum, file) => sum + file.size, 0), 722174);
  assert.deepEqual(result.files.map(file => file.id), SUMMARY_IMAGES.map(([id]) => id));
  assert.ok(result.files.every(file => file.uses.every(use => use.resource === SUMMARY_RESOURCE)));
  const keys = crypto.generateKeyPairSync('x25519');
  const pub = keys.publicKey.export({ type: 'spki', format: 'pem' }), priv = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const envelope = encrypt(result, pub, 'assets');
  assert.deepEqual(decrypt(envelope, priv), result);
  const envelopeFile = path.join(root, 'envelope.json'), publicFile = path.join(root, 'public.pem');
  await fs.writeFile(envelopeFile, JSON.stringify(envelope)); await fs.writeFile(publicFile, pub);
  let logged = ''; await publishSummary(envelopeFile, publicFile, value => { logged += value; });
  const chunks = [...logged.matchAll(/ENGLISH_SIX_SUMMARY_IMAGES_CHUNK ([A-P]+)\n/g)].map(match => match[1]);
  assert.ok(chunks.length && chunks.every(chunk => chunk.length <= 16384));
  const hex = chunks.join('').replace(/[A-P]/g, letter => 'ABCDEFGHIJKLMNOP'.indexOf(letter).toString(16));
  assert.deepEqual(JSON.parse(Buffer.from(hex, 'hex')), envelope);
  await fs.writeFile(envelopeFile, JSON.stringify({ ...envelope, plaintext: 'must-not-log' }));
  await assert.rejects(publishSummary(envelopeFile, publicFile, () => assert.fail('Invalid output must not log')));
  resource.pages[0].blocks.push({ kind: 'image', asset: 'f'.repeat(32) }); await json(`resources/${SUMMARY_RESOURCE}.json`, resource);
  await assert.rejects(collectSummaryImages(root));
  resource.pages[0].blocks.pop(); await json(`resources/${SUMMARY_RESOURCE}.json`, resource);
  const [first, size] = SUMMARY_IMAGES[0];
  manifest[first].size = size + 1; await json('assets.private.json', manifest);
  await assert.rejects(collectSummaryImages(root));
  manifest[first].size = size; await json('assets.private.json', manifest);
  await fs.unlink(path.join(root, `assets/${first}.webp`));
  await fs.symlink('/etc/passwd', path.join(root, `assets/${first}.webp`));
  await assert.rejects(collectSummaryImages(root));
  await fs.unlink(path.join(root, `assets/${first}.webp`)); await fs.writeFile(path.join(root, `assets/${first}.webp`), Buffer.alloc(size));
  meta.edition = 'legacy'; await json('index.json', { resources: [meta] });
  await assert.rejects(collectSummaryImages(root));
  console.log('PASS: exact fourteen image whitelist and byte pins, unrelated paths unread, authenticated encrypted roundtrip, changed references/size/edition and symlink rejected');
} finally { await fs.rm(root, { recursive: true, force: true }); }
