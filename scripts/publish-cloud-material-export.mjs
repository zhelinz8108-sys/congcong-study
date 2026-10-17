import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'zhelinz8108-sys/congcong-study';
const TAR_SHA = '88e005c10482f2178dbc998ae47328b1ea0c6fd08f822208af23d7756924ebaf';
const SELECTION_SHA = '0c8ece619c49ca68ca31da5271eab62a8c9c4cff36ed5318e0ddedb5163c0fcd';
const HEADER_KEYS = ['version', 'algorithm', 'runId', 'runAttempt', 'pack', 'selectionSha256', 'inputSha256', 'recipientFingerprint'];
const META_KEYS = [...HEADER_KEYS, 'rsaBits', 'inputBytes', 'selectionBytes', 'envelopeBytes', 'envelopeSha256'];
const ENVELOPE_KEYS = ['header', 'encryptedKey', 'nonce', 'tag', 'ciphertext'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

async function readRegular(filename, limit) {
  const absolute = path.resolve(filename);
  for (let item = absolute;; item = path.dirname(item)) {
    requireValue(!(await fs.lstat(item)).isSymbolicLink(), 'Input path contains a symbolic link');
    if (item === path.dirname(item)) break;
  }
  const info = await fs.lstat(absolute);
  requireValue(info.isFile() && info.nlink === 1 && info.size > 0 && info.size <= limit, 'Invalid bounded input file');
  const raw = await fs.readFile(absolute);
  requireValue(raw.length === info.size, 'Input size changed');
  return raw;
}

export async function publishExport({ envelopePath, metadataPath, env = process.env, fetchImpl = fetch }) {
  requireValue(env.GITHUB_REPOSITORY === REPOSITORY && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Only a manual trusted-main export is allowed');
  requireValue(/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]{0,9}$/.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'Invalid run identity');
  requireValue(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && typeof env.GH_TOKEN === 'string' && env.GH_TOKEN.length > 0, 'Missing trusted commit or token');
  const envelope = await readRegular(envelopePath, 24 * 1024 ** 2);
  const metadata = JSON.parse(await readRegular(metadataPath, 8192));
  requireValue(Object.keys(metadata).every(key => META_KEYS.includes(key)) && META_KEYS.every(key => Object.hasOwn(metadata, key)), 'Unexpected/missing safe metadata field');
  requireValue(metadata.version === 1 && metadata.algorithm === 'RSA-OAEP-256+A256GCM' && metadata.pack === 'native-authoring-min', 'Unsupported envelope identity');
  requireValue(metadata.runId === env.GITHUB_RUN_ID && metadata.runAttempt === env.GITHUB_RUN_ATTEMPT, 'Run binding mismatch');
  requireValue(metadata.inputSha256 === TAR_SHA && metadata.inputBytes === 405441 && metadata.selectionSha256 === SELECTION_SHA && metadata.selectionBytes === 35998, 'Fixed private input pin mismatch');
  requireValue(/^sha256:[a-f0-9]{64}$/.test(metadata.recipientFingerprint) && Number.isInteger(metadata.rsaBits) && metadata.rsaBits >= 3072 && metadata.rsaBits <= 8192, 'Invalid recipient identity');
  requireValue(metadata.envelopeBytes === envelope.length && metadata.envelopeSha256 === sha(envelope), 'Envelope byte digest mismatch');
  const parsedEnvelope = JSON.parse(envelope);
  requireValue(parsedEnvelope.header && HEADER_KEYS.every(key => parsedEnvelope.header[key] === metadata[key]) && Object.keys(parsedEnvelope.header).length === HEADER_KEYS.length, 'Authenticated header differs from metadata');
  requireValue(Object.keys(parsedEnvelope).length === ENVELOPE_KEYS.length && ENVELOPE_KEYS.every(key => Object.hasOwn(parsedEnvelope, key)), 'Unexpected envelope field; refusing a potential plaintext addition');
  const fixedBase64 = (value, length) => typeof value === 'string' && value.length === Math.ceil(length / 3) * 4 && Buffer.from(value, 'base64').length === length && Buffer.from(value, 'base64').toString('base64') === value;
  requireValue(fixedBase64(parsedEnvelope.encryptedKey, Math.ceil(metadata.rsaBits / 8)) && fixedBase64(parsedEnvelope.nonce, 12) && fixedBase64(parsedEnvelope.tag, 16) && fixedBase64(parsedEnvelope.ciphertext, 4 + 35998 + 405441), 'Envelope encrypted fields have invalid encoding/length');
  const branch = `codex/private-material-export-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const prefix = `cloud-material-exports/native-authoring-min/${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const chunks = [];
  const chunkBytes = 16384;
  for (let offset = 0; offset < envelope.length; offset += chunkBytes) {
    const bytes = envelope.subarray(offset, offset + chunkBytes);
    chunks.push({name: `chunks/${String(chunks.length).padStart(5, '0')}.bin`, bytes, sha256: sha(bytes)});
  }
  const indexBytes = Buffer.from(JSON.stringify({version: 1, kind: 'native-material-envelope-chunks',
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, pack: metadata.pack,
    recipientFingerprint: metadata.recipientFingerprint, envelopeBytes: envelope.length,
    envelopeSha256: metadata.envelopeSha256, chunkBytes,
    chunks: chunks.map(({name, bytes, sha256}) => ({name, bytes: bytes.length, sha256}))}, null, 2) + '\n');
  const endpoint = `https://api.github.com/repos/${REPOSITORY}`;
  const call = async (method, suffix, body, allowMissing = false) => {
    const response = await fetchImpl(endpoint + suffix, {
      method, redirect: 'error', headers: {Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', Authorization: `Bearer ${env.GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28'},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      signal: AbortSignal.timeout(30000),
    });
    if (allowMissing && response.status === 404) return null;
    requireValue(response.status >= 200 && response.status < 300, `GitHub ${method} ${suffix} failed (${response.status}); no ref update or force fallback is permitted`);
    return response.json();
  };
  const main = await call('GET', '/git/ref/heads/main');
  requireValue(main.object?.sha === env.GITHUB_SHA, 'Main advanced or source commit mismatch; start a fresh run');
  requireValue(await call('GET', `/git/ref/heads/${branch}`, undefined, true) === null, 'Export branch already exists; use a new run attempt');
  const base = await call('GET', `/git/commits/${env.GITHUB_SHA}`);
  requireValue(/^[a-f0-9]{40}$/.test(base.tree?.sha ?? ''), 'Invalid base tree');
  const safeMetadata = Buffer.from(JSON.stringify({...metadata, repository: REPOSITORY, sourceCommit: env.GITHUB_SHA,
    exportBranch: branch, envelopePath: `${prefix}/envelope.json`, indexPath: `${prefix}/index.json`,
    indexSha256: sha(indexBytes), chunkCount: chunks.length,
    sourceManifestSha256: '7e8baa1455caeccb7d106c0ac440c90f4f724d80b053cd13df8e1bc72683c79b'}, null, 2) + '\n');
  const treeEntries = [];
  for (const [name, bytes] of [['envelope.json', envelope], ['metadata.json', safeMetadata], ['index.json', indexBytes], ...chunks.map(chunk => [chunk.name, chunk.bytes])]) {
    const blob = await call('POST', '/git/blobs', {content: bytes.toString('base64'), encoding: 'base64'});
    requireValue(/^[a-f0-9]{40}$/.test(blob.sha ?? ''), 'Invalid created blob identity');
    treeEntries.push({path: `${prefix}/${name}`, mode: '100644', type: 'blob', sha: blob.sha});
  }
  const tree = await call('POST', '/git/trees', {base_tree: base.tree.sha, tree: treeEntries});
  requireValue(/^[a-f0-9]{40}$/.test(tree.sha ?? ''), 'Invalid created tree');
  const commit = await call('POST', '/git/commits', {message: `Encrypted native fixture export ${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`, tree: tree.sha, parents: [env.GITHUB_SHA]});
  requireValue(/^[a-f0-9]{40}$/.test(commit.sha ?? ''), 'Invalid created commit');
  // The only ref mutation is creation. A race/422 aborts; no update or force path.
  await call('POST', '/git/refs', {ref: `refs/heads/${branch}`, sha: commit.sha});
  return {status: 'created-ciphertext-only-export-branch', repository: REPOSITORY, branch, commit: commit.sha,
    envelopePath: `${prefix}/envelope.json`, metadataPath: `${prefix}/metadata.json`, recipientFingerprint: metadata.recipientFingerprint,
    indexPath: `${prefix}/index.json`, indexSha256: sha(indexBytes), chunkCount: chunks.length, chunkBytes,
    inputSha256: TAR_SHA, selectionSha256: SELECTION_SHA, envelopeSha256: metadata.envelopeSha256};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = {};
    for (let index = 2; index < process.argv.length; index += 2) {
      const name = process.argv[index], value = process.argv[index + 1];
      if (!['--envelope', '--metadata'].includes(name) || !value || Object.hasOwn(options, name)) throw new Error('Expected --envelope FILE --metadata FILE');
      options[name] = value;
    }
    requireValue(options['--envelope'] && options['--metadata'], 'Expected both input paths');
    console.log(JSON.stringify(await publishExport({envelopePath: options['--envelope'], metadataPath: options['--metadata']})));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
