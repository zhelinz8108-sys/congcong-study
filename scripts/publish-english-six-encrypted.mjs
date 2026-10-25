import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { PURPOSE } from './export-english-six-knowledge.mjs';

const check = value => { if (!value) throw new Error('Encrypted export blocked'); };
export async function publish(streamPath, outputDir, publicPath, write = value => process.stdout.write(value)) {
  check(streamPath && outputDir && publicPath);
  const input = await fs.readFile(streamPath);
  check(input.length > 0 && input.length <= 86 * 1024 ** 2);
  const parsed = JSON.parse(input);
  check(Object.keys(parsed).length === 2 && parsed.text && parsed.assets);
  const recipient = crypto.createPublicKey(await fs.readFile(publicPath));
  check(recipient.asymmetricKeyType === 'x25519');
  const fingerprint = crypto.createHash('sha256').update(recipient.export({ type: 'spki', format: 'der' })).digest('hex');
  for (const kind of ['text', 'assets']) {
    const envelope = parsed[kind];
    check(Object.keys(envelope).length === 3 && Object.keys(envelope).sort().join(',') === 'ciphertext,header,tag');
    const header = envelope.header;
    const keys = ['version', 'algorithm', 'purpose', 'kind', 'recipientSha256', 'ephemeralSpki', 'salt', 'nonce', 'encoding'];
    check(header && Object.keys(header).length === keys.length && Object.keys(header).every((key, i) => key === keys[i]));
    check(header.version === 1 && header.algorithm === 'X25519-HKDF-SHA256+A256GCM' && header.purpose === PURPOSE && header.kind === kind && header.recipientSha256 === fingerprint && header.encoding === 'gzip-json');
    const base64 = (value, min, max = min) => {
      check(typeof value === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(value));
      const bytes = Buffer.from(value, 'base64');
      check(bytes.length >= min && bytes.length <= max && bytes.toString('base64') === value);
    };
    base64(header.ephemeralSpki, 44); base64(header.salt, 32); base64(header.nonce, 12);
    base64(envelope.tag, 16); base64(envelope.ciphertext, 1, 30 * 1024 ** 2);
    const peer = crypto.createPublicKey({ key: Buffer.from(header.ephemeralSpki, 'base64'), type: 'spki', format: 'der' });
    check(peer.asymmetricKeyType === 'x25519');
    const bytes = Buffer.from(JSON.stringify(envelope));
    await fs.writeFile(path.join(outputDir, `${kind}.envelope.json`), bytes, { flag: 'wx', mode: 0o600 });
    if (kind === 'text') {
      const digits = 'ABCDEFGHIJKLMNOP';
      const encoded = bytes.toString('hex').replace(/[0-9a-f]/g, c => digits[parseInt(c, 16)]);
      write('ENGLISH_SIX_TEXT_BEGIN\n');
      for (let offset = 0; offset < encoded.length; offset += 16 * 1024) write(`ENGLISH_SIX_TEXT_CHUNK ${encoded.slice(offset, offset + 16 * 1024)}\n`);
      write('ENGLISH_SIX_TEXT_END\n');
    }
  }
  write('Encrypted knowledge export ready\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    check(process.argv.length === 5);
    await publish(...process.argv.slice(2));
  } catch { process.stderr.write('Encrypted export blocked\n'); process.exitCode = 1; }
}
