import fs from 'node:fs/promises';
import { constants as C } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';

export const PURPOSE = 'english-six-knowledge-pdf-export-v1';
export const LIMIT = 30 * 1024 ** 2;
const ROOT = '/www/study-plan-data/english-six';
const APP_ROOT = '/www/study-plan/content/english-six';
export const SUMMARY_RESOURCE = 'b7962820f014';
export const SUMMARY_IMAGES = Object.freeze([
  ['22cbb8bac3f3f4af571fcc4dcc10aeba', 21338],
  ['2832d1916c5ac50fa3fd0578e3909883', 17706],
  ['3199102deda33a0f395e061ceceaa6b4', 5708],
  ['359253b8d55838f7feb4896ab5f237d0', 115654],
  ['3b2b6c9fc4f96f4b53302a41856533ee', 18034],
  ['70a87611e959feaae0fc34d7933a650d', 22716],
  ['77349df4b3581688ff5a226adb63bad6', 19362],
  ['8bee4f70178ee5cd481bdfb05ec08f89', 111900],
  ['9a6da9e47f9554c53096403990772ec5', 86856],
  ['9e0ea9033076b46ca8ef7621ff56b154', 29652],
  ['ce71c95cbb4215072590d6e67666602e', 112470],
  ['d0a86bd45031fff1346978c5c7a56bd8', 29454],
  ['d83fdf449cfbc61d42da5270457a0436', 108696],
  ['ea8a9ea26930c0eaa01bc8615f449e08', 22628],
].map(Object.freeze));
const ID = /^[a-f0-9]{12}$/;
const ASSET = /^[a-f0-9]{32}$/;
const EXTENSIONS = new Set(['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.svg', '.emf', '.wmf']);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const check = (condition) => { if (!condition) throw new Error('Knowledge export blocked'); };
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

export function stage(resource) {
  const source = `${resource.title} ${resource.paths[0]}`;
  if (/教学计划/.test(source)) return 'teacher';
  if (/电子课本|听读手册|背记手册/.test(source)) return 'listen';
  if (/资料简介|听力扫码|更新全册资料/.test(source)) return 'reference';
  if (/知识点总结/.test(source)) return 'explain';
  return resource.stage;
}

export function selected(resource) {
  if (resource.edition !== 'new') return false;
  const names = resource.paths.map(value => value.split(/[\\/]/).at(-1)).join(' ');
  return stage(resource) === 'explain' || /知识点|知识梳理|知识汇总|知识总结/.test(`${resource.title} ${names}`);
}

async function openRoot(root) {
  const absolute = path.resolve(root);
  let handle = await fs.open('/', C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
  try {
    for (const part of absolute.split('/').filter(Boolean)) {
      check(part !== '.' && part !== '..' && !part.includes('/'));
      const next = await fs.open(`/proc/self/fd/${handle.fd}/${part}`, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
      await handle.close(); handle = next;
      check((await handle.stat()).isDirectory());
    }
    return handle;
  } catch (error) {
    await handle.close(); throw error;
  }
}

async function directory(parent, name) {
  check(/^[a-z-]+$/.test(name));
  const handle = await fs.open(`/proc/self/fd/${parent.fd}/${name}`, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
  check((await handle.stat()).isDirectory());
  return handle;
}

export async function readPinned(parent, name, maxBytes) {
  check(/^[a-z0-9][a-z0-9.-]*$/.test(name) && !name.includes('..'));
  const handle = await fs.open(`/proc/self/fd/${parent.fd}/${name}`, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    check(before.isFile() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(maxBytes));
    const bytes = await handle.readFile();
    check(bytes.length === Number(before.size) && same(before, await handle.stat({ bigint: true })));
    return { bytes, snapshot: before, name };
  } finally { await handle.close(); }
}

async function unchanged(parent, item) {
  const current = await fs.lstat(`/proc/self/fd/${parent.fd}/${item.name}`, { bigint: true });
  check(current.isFile() && !current.isSymbolicLink() && same(item.snapshot, current));
}

export async function collect(root) {
  const handles = [];
  const rootHandle = await openRoot(root); handles.push(rootHandle);
  try {
    const resourceHandle = await directory(rootHandle, 'resources'); handles.push(resourceHandle);
    const indexFile = await readPinned(rootHandle, 'index.json', 16 * 1024 ** 2);
    const manifestFile = await readPinned(rootHandle, 'assets.private.json', 16 * 1024 ** 2);
    const index = JSON.parse(indexFile.bytes);
    const manifest = JSON.parse(manifestFile.bytes);
    check(Array.isArray(index.units) && JSON.stringify(index.units.map(unit => unit.number)) === '[1,2,3,4,5,6,7,8]');
    check(Array.isArray(index.resources) && index.resources.length <= 20000);
    for (const resource of index.resources) {
      check(resource && ID.test(resource.id) && typeof resource.title === 'string' && Array.isArray(resource.paths) && resource.paths.length > 0 && resource.paths.every(p => typeof p === 'string') && Array.isArray(resource.units));
    }
    const active = index.resources.filter(resource => resource.edition === 'new');
    check(new Set(active.map(resource => resource.id)).size === active.length);
    const chosen = active.filter(selected).sort((a, b) => a.id.localeCompare(b.id));
    check(chosen.length > 0 && chosen.length <= 1000);
    const resources = [], assetUses = new Map(), sourceSnapshots = [];
    let textBytes = indexFile.bytes.length;
    const reference = (id, use) => {
      check(ASSET.test(id));
      if (!assetUses.has(id)) assetUses.set(id, []);
      assetUses.get(id).push(use);
    };
    for (const meta of chosen) {
      const source = await readPinned(resourceHandle, `${meta.id}.json`, 16 * 1024 ** 2);
      textBytes += source.bytes.length; check(textBytes <= 80 * 1024 ** 2);
      sourceSnapshots.push(source);
      const resource = JSON.parse(source.bytes);
      check(resource.id === meta.id && resource.meta?.id === meta.id && resource.meta.edition === 'new' && Array.isArray(resource.pages));
      check(resource.meta.title === meta.title && JSON.stringify(resource.meta.paths) === JSON.stringify(meta.paths));
      check(resource.pages.length <= 2000);
      for (let page = 0; page < resource.pages.length; page++) {
        const content = resource.pages[page];
        check(content && typeof content.title === 'string' && Array.isArray(content.blocks));
        for (const block of content.blocks) {
          check(block && ['text', 'table', 'image', 'audio', 'video'].includes(block.kind));
          if (block.kind === 'text') check(typeof block.text === 'string');
          if (block.kind === 'table') check(Array.isArray(block.rows));
          if (block.kind === 'image') reference(block.asset, { resource: meta.id, page: page + 1, kind: 'image' });
        }
      }
      if (resource.asset && ['.pdf', '.docx'].includes(meta.extension)) reference(resource.asset, { resource: meta.id, kind: 'original' });
      resources.push({ id: resource.id, meta, pages: resource.pages, asset: resource.asset ?? null, reference: resource.reference === true });
    }
    const assets = [];
    for (const [id, uses] of [...assetUses].sort(([a], [b]) => a.localeCompare(b))) {
      const entry = manifest[id];
      check(entry && EXTENSIONS.has(entry.extension) && entry.file === `assets/${id}${entry.extension}` && Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= 128 * 1024 ** 2);
      assets.push({ id, file: entry.file, extension: entry.extension, size: entry.size, uses });
    }
    await unchanged(rootHandle, indexFile); await unchanged(rootHandle, manifestFile);
    for (const item of sourceSnapshots) await unchanged(resourceHandle, item);
    return { version: 1, purpose: PURPOSE, selection: 'active-new-knowledge',
      index: { version: index.version, units: index.units.map(({ number, title }) => ({ number, title })), resources: active },
      sourceIndexSha256: sha(indexFile.bytes), sourceManifestSha256: sha(manifestFile.bytes),
      selectedIds: chosen.map(resource => resource.id), resources, assets };
  } finally { for (const handle of handles.reverse()) await handle.close(); }
}

export async function binaryBundle(root, text) {
  const handles = [];
  const rootHandle = await openRoot(root); handles.push(rootHandle);
  try {
    const indexFile = await readPinned(rootHandle, 'index.json', 16 * 1024 ** 2);
    const manifestFile = await readPinned(rootHandle, 'assets.private.json', 16 * 1024 ** 2);
    check(sha(indexFile.bytes) === text.sourceIndexSha256 && sha(manifestFile.bytes) === text.sourceManifestSha256);
    const assetHandle = await directory(rootHandle, 'assets'); handles.push(assetHandle);
    const files = [], omitted = [], snapshots = [];
    let rawBytes = 0;
    const candidates = [...text.assets].sort((a, b) => {
      const priority = value => Math.min(...value.uses.map(use => {
        const resource = text.resources.find(resource => resource.id === use.resource);
        const title = resource?.meta.title ?? '';
        return use.kind === 'original' ? /知识点|知识总结|知识梳理|知识汇总/.test(title) ? 0 : 1 : 2;
      }));
      return priority(a) - priority(b) || a.size - b.size || a.id.localeCompare(b.id);
    });
    for (const asset of candidates) {
      // Knowledge-summary originals first, other originals, then image refs;
      // smallest sources first within each group. Omitted metadata remains
      // complete in both encrypted documents. No unrelated assets are read.
      if (rawBytes + asset.size > 28 * 1024 ** 2) { omitted.push(asset.id); continue; }
      const source = await readPinned(assetHandle, `${asset.id}${asset.extension}`, 28 * 1024 ** 2);
      check(source.bytes.length === asset.size);
      rawBytes += source.bytes.length; snapshots.push(source);
      files.push({ ...asset, sha256: sha(source.bytes), base64: source.bytes.toString('base64') });
    }
    for (const item of snapshots) await unchanged(assetHandle, item);
    await unchanged(rootHandle, indexFile); await unchanged(rootHandle, manifestFile);
    const bundle = { version: 1, purpose: PURPOSE, sourceIndexSha256: text.sourceIndexSha256,
      selectedIds: text.selectedIds, included: files.map(file => file.id), omitted, files };
    check(zlib.gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 }).length <= LIMIT);
    return bundle;
  } finally { for (const handle of handles.reverse()) await handle.close(); }
}

export async function collectSummaryImages(root) {
  const handles = [];
  const rootHandle = await openRoot(root); handles.push(rootHandle);
  try {
    const resources = await directory(rootHandle, 'resources'); handles.push(resources);
    const assets = await directory(rootHandle, 'assets'); handles.push(assets);
    const indexFile = await readPinned(rootHandle, 'index.json', 16 * 1024 ** 2);
    const manifestFile = await readPinned(rootHandle, 'assets.private.json', 16 * 1024 ** 2);
    const resourceFile = await readPinned(resources, `${SUMMARY_RESOURCE}.json`, 16 * 1024 ** 2);
    const index = JSON.parse(indexFile.bytes), manifest = JSON.parse(manifestFile.bytes), resource = JSON.parse(resourceFile.bytes);
    const meta = index.resources?.find(item => item.id === SUMMARY_RESOURCE);
    check(meta?.edition === 'new' && selected(meta));
    check(resource.id === SUMMARY_RESOURCE && resource.meta?.id === SUMMARY_RESOURCE && resource.meta.edition === 'new' && Array.isArray(resource.pages));
    const references = new Map();
    for (let page = 0; page < resource.pages.length; page++) {
      check(Array.isArray(resource.pages[page].blocks));
      for (const block of resource.pages[page].blocks) if (block.kind === 'image') {
        check(ASSET.test(block.asset));
        if (!references.has(block.asset)) references.set(block.asset, []);
        references.get(block.asset).push({ resource: SUMMARY_RESOURCE, page: page + 1, kind: 'image' });
      }
    }
    check(JSON.stringify([...references.keys()].sort()) === JSON.stringify(SUMMARY_IMAGES.map(([id]) => id)));
    const files = [], snapshots = [];
    for (const [id, size] of SUMMARY_IMAGES) {
      const entry = manifest[id];
      check(entry?.extension === '.webp' && entry.file === `assets/${id}.webp` && entry.size === size);
      const source = await readPinned(assets, `${id}.webp`, size);
      check(source.bytes.length === size);
      snapshots.push(source);
      files.push({ id, file: entry.file, extension: '.webp', size, uses: references.get(id), sha256: sha(source.bytes), base64: source.bytes.toString('base64') });
    }
    for (const snapshot of snapshots) await unchanged(assets, snapshot);
    await unchanged(rootHandle, indexFile); await unchanged(rootHandle, manifestFile); await unchanged(resources, resourceFile);
    check(files.length === 14 && files.reduce((sum, file) => sum + file.size, 0) === 722174);
    return { version: 1, purpose: PURPOSE, sourceResource: SUMMARY_RESOURCE, files };
  } finally { for (const handle of handles.reverse()) await handle.close(); }
}

export function encrypt(value, recipientPem, kind) {
  check(['text', 'assets'].includes(kind));
  const recipient = crypto.createPublicKey(recipientPem);
  check(recipient.asymmetricKeyType === 'x25519');
  const recipientDer = recipient.export({ type: 'spki', format: 'der' });
  const ephemeral = crypto.generateKeyPairSync('x25519');
  const salt = crypto.randomBytes(32), nonce = crypto.randomBytes(12);
  const header = { version: 1, algorithm: 'X25519-HKDF-SHA256+A256GCM', purpose: PURPOSE, kind,
    recipientSha256: sha(recipientDer), ephemeralSpki: ephemeral.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    salt: salt.toString('base64'), nonce: nonce.toString('base64'), encoding: 'gzip-json' };
  const aad = Buffer.from(JSON.stringify(header));
  const shared = crypto.diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient });
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, salt, Buffer.from(`${PURPOSE}:${kind}`), 32));
  shared.fill(0);
  const plaintext = zlib.gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 });
  check(plaintext.length <= LIMIT);
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { header, tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  } finally { key.fill(0); plaintext.fill(0); }
}

export function decrypt(envelope, recipientPrivate) {
  check(envelope.header?.purpose === PURPOSE && ['text', 'assets'].includes(envelope.header?.kind));
  const { header } = envelope;
  const recipient = crypto.createPrivateKey(recipientPrivate);
  check(sha(crypto.createPublicKey(recipient).export({ type: 'spki', format: 'der' })) === header.recipientSha256);
  const shared = crypto.diffieHellman({ privateKey: recipient, publicKey: crypto.createPublicKey({ key: Buffer.from(header.ephemeralSpki, 'base64'), type: 'spki', format: 'der' }) });
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.from(header.salt, 'base64'), Buffer.from(`${PURPOSE}:${header.kind}`), 32));
  shared.fill(0);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(header.nonce, 'base64'));
    decipher.setAAD(Buffer.from(JSON.stringify(header)));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
    check(compressed.length <= LIMIT);
    return JSON.parse(zlib.gunzipSync(compressed, { maxOutputLength: 128 * 1024 ** 2 }));
  } finally { key.fill(0); }
}

if (['--export', '--summary-images'].includes(process.argv[2])) {
  try {
    check(process.argv.length === 4);
    const pem = Buffer.from(process.argv[3], 'base64').toString('utf8');
    check(pem.length <= 1024 && pem.startsWith('-----BEGIN PUBLIC KEY-----') && !pem.includes('PRIVATE'));
    check(await fs.realpath(APP_ROOT) === ROOT);
    let output;
    if (process.argv[2] === '--summary-images') {
      output = encrypt(await collectSummaryImages(ROOT), pem, 'assets');
    } else {
      const text = await collect(ROOT);
      const binaries = await binaryBundle(ROOT, text);
      output = { text: encrypt(text, pem, 'text'), assets: encrypt(binaries, pem, 'assets') };
    }
    const bytes = Buffer.from(JSON.stringify(output)); check(bytes.length <= 86 * 1024 ** 2);
    process.stdout.write(bytes);
  } catch { process.stderr.write('Knowledge export blocked\n'); process.exitCode = 1; }
}
