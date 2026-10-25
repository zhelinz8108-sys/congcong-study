import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { publish } from './publish-english-six-encrypted.mjs';
import { collect, binaryBundle, encrypt, decrypt, selected, readPinned, PURPOSE } from './export-english-six-knowledge.mjs';
import { constants as C } from 'node:fs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'english-six-export-'));
try {
  const root = path.join(temporary, 'content');
  await fs.mkdir(path.join(root, 'resources'), { recursive: true });
  await fs.mkdir(path.join(root, 'assets'));
  const image = 'a'.repeat(32), original = 'b'.repeat(32), unrelated = 'c'.repeat(32);
  const meta = (id, edition = 'new', title = 'Unit 1 knowledge', stage = 'explain', units = [1]) => ({
    id, edition, title, stage, units, extension: '.pdf', paths: [`source/${title}.pdf`], pageCount: 1, size: 1, status: 'ready' });
  const first = meta('1'.repeat(12)), cross = meta('2'.repeat(12), 'new', '整册知识点总结', 'practice', [1,2,3,4,5,6,7,8]);
  const legacy = meta('3'.repeat(12), 'legacy'), practice = meta('4'.repeat(12), 'new', 'Unit 2 practice', 'practice', [2]);
  const resources = [first, cross, legacy, practice];
  const save = (relative, value) => fs.writeFile(path.join(root, relative), JSON.stringify(value));
  await save('index.json', { version: 1, units: Array.from({ length: 8 }, (_, i) => ({ number: i + 1, title: `New Unit ${i + 1}`, legacyTitle: 'Retired' })), resources });
  await save('assets.private.json', { [image]: { file: `assets/${image}.png`, extension: '.png', size: 4 },
    [original]: { file: `assets/${original}.pdf`, extension: '.pdf', size: 4 },
    [unrelated]: { file: 'assets/unrelated-private-file.png', extension: '.png', size: 999 } });
  for (const item of [first, cross]) await save(`resources/${item.id}.json`, { id: item.id, meta: item,
    pages: [{ title: 'Page one', blocks: [{ kind: 'text', text: 'Teaching text 课文', runs: [{ text: 'Teaching text 课文', underline: true }] },
      { kind: 'table', rows: [['English', '中文']] }, { kind: 'image', asset: image }] }], asset: original, reference: false });
  // Deliberately absent private/legacy/practice resources prove they are unread.
  await fs.writeFile(path.join(root, `assets/${image}.png`), 'IMAG');
  await fs.writeFile(path.join(root, `assets/${original}.pdf`), 'PDF!');
  const text = await collect(root);
  assert.deepEqual(text.selectedIds, [first.id, cross.id]);
  assert.equal(text.index.resources.length, 3);
  assert.equal(text.resources[0].pages[0].blocks[0].runs[0].underline, true);
  assert.deepEqual(text.resources[0].pages[0].blocks[1].rows, [['English', '中文']]);
  assert.deepEqual(text.assets.map(asset => asset.id), [image, original]);
  assert.equal(JSON.stringify(text.index.units).includes('Retired'), false);
  const binary = await binaryBundle(root, text);
  assert.equal(binary.files.length, 2);
  assert.ok(binary.files.every(file => file.sha256 === crypto.createHash('sha256').update(Buffer.from(file.base64, 'base64')).digest('hex')));
  assert.equal(selected(meta('5'.repeat(12), 'new', '教学计划', 'teacher')), false);
  assert.equal(selected(meta('6'.repeat(12), 'new', '电子课本', 'listen')), false);
  assert.equal(selected(meta('7'.repeat(12), 'legacy', '知识点总结')), false);
  const recipient = crypto.generateKeyPairSync('x25519');
  const publicPem = recipient.publicKey.export({ type: 'spki', format: 'pem' });
  const privatePem = recipient.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const one = encrypt(text, publicPem, 'text'), two = encrypt(text, publicPem, 'text');
  assert.notEqual(one.ciphertext, two.ciphertext);
  assert.notEqual(one.header.ephemeralSpki, two.header.ephemeralSpki);
  assert.deepEqual(decrypt(one, privatePem), text);
  assert.deepEqual(decrypt(encrypt(binary, publicPem, 'assets'), privatePem), binary);
  assert.equal(JSON.stringify(one).includes('Teaching text'), false);
  assert.equal(JSON.stringify(one).includes('PRIVATE KEY'), false);
  const modified = structuredClone(one); modified.header.kind = 'assets';
  assert.throws(() => decrypt(modified, privatePem));
  const corrupt = structuredClone(one); corrupt.ciphertext = Buffer.from('corrupt').toString('base64');
  assert.throws(() => decrypt(corrupt, privatePem));
  assert.equal(one.header.purpose, PURPOSE);
  const encoded = Buffer.from(JSON.stringify(one)).toString('hex').replace(/[0-9a-f]/g, c => 'ABCDEFGHIJKLMNOP'[parseInt(c, 16)]);
  assert.match(encoded, /^[A-P]+$/);
  assert.equal(Buffer.from(encoded.replace(/[A-P]/g, c => 'ABCDEFGHIJKLMNOP'.indexOf(c).toString(16)), 'hex').toString(), JSON.stringify(one));
  const delivery = path.join(temporary, 'delivery'); await fs.mkdir(delivery);
  const stream = path.join(temporary, 'stream.json'), pem = path.join(temporary, 'recipient.pem');
  await fs.writeFile(pem, publicPem);
  const assetEnvelope = encrypt(binary, publicPem, 'assets');
  await fs.writeFile(stream, JSON.stringify({ text: one, assets: assetEnvelope }));
  let logged = ''; await publish(stream, delivery, pem, value => { logged += value; });
  assert.equal(logged.includes('Teaching text'), false);
  assert.ok(logged.startsWith('ENGLISH_SIX_TEXT_BEGIN\n') && logged.includes('\nENGLISH_SIX_TEXT_END\n'));
  const chunks = logged.split('\n').filter(line => line.startsWith('ENGLISH_SIX_TEXT_CHUNK ')).map(line => line.slice('ENGLISH_SIX_TEXT_CHUNK '.length));
  assert.ok(chunks.length > 0 && chunks.every(line => /^[A-P]+$/.test(line) && line.length <= 16384));
  assert.equal(chunks.join(''), encoded);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(delivery, 'text.envelope.json'))), one);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(delivery, 'assets.envelope.json'))), assetEnvelope);
  await fs.writeFile(stream, JSON.stringify({ text: { ...one, plaintext: 'must-not-publish' }, assets: assetEnvelope }));
  const rejected = path.join(temporary, 'rejected'); await fs.mkdir(rejected);
  await assert.rejects(publish(stream, rejected, pem, () => assert.fail('Rejected content must not log')));
  assert.deepEqual(await fs.readdir(rejected), []);
  const bounded = structuredClone(text); bounded.assets[1].size = 29 * 1024 ** 2;
  const limited = await binaryBundle(root, bounded);
  assert.deepEqual(limited.included, [image]);
  assert.deepEqual(limited.omitted, [original]);
  const dir = await fs.open(root, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
  try {
    await assert.rejects(readPinned(dir, '../outside', 100));
    await fs.symlink('/etc/passwd', path.join(root, 'symlink.json'));
    await assert.rejects(readPinned(dir, 'symlink.json', 100000));
    await fs.link(path.join(root, 'index.json'), path.join(root, 'hardlink.json'));
    await assert.rejects(readPinned(dir, 'hardlink.json', 100000));
    await fs.unlink(path.join(root, 'hardlink.json'));
  } finally { await dir.close(); }
  const ancestor = path.join(temporary, 'ancestor'); await fs.mkdir(ancestor);
  await fs.symlink(root, path.join(ancestor, 'content'));
  await assert.rejects(collect(path.join(ancestor, 'content')));
  await fs.unlink(path.join(ancestor, 'content')); await fs.rmdir(ancestor);
  await fs.mkdir(ancestor); await fs.mkdir(path.join(ancestor, 'child'));
  const originalOpen = fs.open;
  let raced = false;
  fs.open = async function(filename, ...args) {
    if (!raced && /^\/proc\/self\/fd\/\d+\/ancestor$/.test(filename)) {
      raced = true;
      await fs.rename(ancestor, `${ancestor}-held`);
      await fs.symlink(root, ancestor);
    }
    return originalOpen.call(fs, filename, ...args);
  };
  try { await assert.rejects(collect(path.join(ancestor, 'child'))); }
  finally { fs.open = originalOpen; }
  assert.equal(raced, true, 'ancestor replacement exercised before O_NOFOLLOW open');
  await fs.rename(path.join(root, 'resources'), path.join(root, 'original-resources'));
  await fs.symlink(path.join(root, 'original-resources'), path.join(root, 'resources'));
  await assert.rejects(collect(root));
  await fs.unlink(path.join(root, 'resources'));
  await fs.rename(path.join(root, 'original-resources'), path.join(root, 'resources'));
  const index = JSON.parse(await fs.readFile(path.join(root, 'index.json')));
  index.resources[0].id = '../../escape'; await save('index.json', index);
  await assert.rejects(collect(root));
  await assert.rejects(binaryBundle(root, text));
  console.log('PASS: active knowledge selection, cross-unit text/tables/runs, exact asset references, symlink/hardlink/traversal guards, source-change guard, randomized envelopes, AAD/corruption rejection, digit-free ciphertext transport');
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
