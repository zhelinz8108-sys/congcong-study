import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PURPOSE } from './export-english-six-knowledge.mjs';

export async function publishSummary(envelopePath, publicPath, write = value => process.stdout.write(value)) {
  const raw = await fs.readFile(envelopePath);
  if (!raw.length || raw.length > 2 * 1024 ** 2) throw new Error('Encrypted images blocked');
  const value = JSON.parse(raw), header = value.header;
  const fingerprint = crypto.createHash('sha256').update(crypto.createPublicKey(await fs.readFile(publicPath)).export({ type: 'spki', format: 'der' })).digest('hex');
  const keys = ['version', 'algorithm', 'purpose', 'kind', 'recipientSha256', 'ephemeralSpki', 'salt', 'nonce', 'encoding'];
  if (Object.keys(value).sort().join(',') !== 'ciphertext,header,tag' || !header || Object.keys(header).join(',') !== keys.join(',') || header.version !== 1 || header.algorithm !== 'X25519-HKDF-SHA256+A256GCM' || header.purpose !== PURPOSE || header.kind !== 'assets' || header.recipientSha256 !== fingerprint || header.encoding !== 'gzip-json') throw new Error('Encrypted images blocked');
  for (const [field, min, max] of [['ephemeralSpki',44,44], ['salt',32,32], ['nonce',12,12], ['tag',16,16], ['ciphertext',1,1024 ** 2]]) {
    const encoded = ['tag', 'ciphertext'].includes(field) ? value[field] : header[field];
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Encrypted images blocked');
    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.length < min || decoded.length > max || decoded.toString('base64') !== encoded) throw new Error('Encrypted images blocked');
  }
  if (crypto.createPublicKey({ key: Buffer.from(header.ephemeralSpki, 'base64'), type: 'spki', format: 'der' }).asymmetricKeyType !== 'x25519') throw new Error('Encrypted images blocked');
  const encoded = raw.toString('hex').replace(/[0-9a-f]/g, digit => 'ABCDEFGHIJKLMNOP'[parseInt(digit, 16)]);
  write('ENGLISH_SIX_SUMMARY_IMAGES_BEGIN\n');
  for (let offset = 0; offset < encoded.length; offset += 16384) write(`ENGLISH_SIX_SUMMARY_IMAGES_CHUNK ${encoded.slice(offset, offset + 16384)}\n`);
  write('ENGLISH_SIX_SUMMARY_IMAGES_END\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Encrypted images blocked');
    await publishSummary(...process.argv.slice(2));
  } catch { process.stderr.write('Encrypted images blocked\n'); process.exitCode = 1; }
}
