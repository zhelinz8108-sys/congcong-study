// Only the purpose-separated PUBLIC encryption key leaves this process.
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, hkdfSync } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

const PURPOSE = 'english-six-knowledge-v1';
const PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

function publicKey(secret, purpose = PURPOSE) {
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/i.test(secret.trim())) throw new Error('Public key unavailable');
  const master = Buffer.from(secret.trim(), 'hex');
  let seed, der;
  try {
    seed = Buffer.from(hkdfSync('sha256', master, Buffer.from(purpose, 'utf8'), Buffer.from('x25519-private', 'utf8'), 32));
    der = Buffer.concat([PREFIX, seed]);
    const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    const publicObject = createPublicKey(privateKey);
    const bytes = publicObject.export({ format: 'der', type: 'spki' });
    return { pem: publicObject.export({ format: 'pem', type: 'spki' }).toString(), sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally { master.fill(0); seed?.fill(0); der?.fill(0); }
}

function safePublicPem(pem) {
  // A configured SSH-port mask can corrupt the digits 22 in PUBLIC material.
  // Whitespace-only PEM wrapping preserves exactly the same public SPKI.
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  return `-----BEGIN PUBLIC KEY-----\n${[...body].join('\n')}\n-----END PUBLIC KEY-----\n`;
}

function selfTest() {
  const invented = 'ab'.repeat(32), one = publicKey(invented), two = publicKey(invented);
  assert.deepEqual(one, two);
  assert.notDeepEqual(one, publicKey('cd'.repeat(32)));
  assert.notDeepEqual(one, publicKey(invented, 'grade6-result-assessments-v1'));
  assert.notDeepEqual(one, publicKey(invented, 'holiday-math-700'));
  assert.equal(createPublicKey(one.pem).asymmetricKeyType, 'x25519');
  const wrapped = safePublicPem(one.pem);
  assert.deepEqual(createPublicKey(wrapped).export({ type: 'spki', format: 'der' }), createPublicKey(one.pem).export({ type: 'spki', format: 'der' }));
  assert.equal(one.sha256, createHash('sha256').update(createPublicKey(one.pem).export({ type: 'spki', format: 'der' })).digest('hex'));
  assert.doesNotMatch(JSON.stringify(one) + wrapped, /PRIVATE KEY|abababababababababababababababab|302e020100300506032b656e04220420/);
  assert.throws(() => publicKey('invalid'));
  assert.throws(() => publicKey('ab'.repeat(31)));
  process.stdout.write('Public encryption key synthetic checks passed.\n');
}

try {
  if (process.argv.slice(2).join(' ') === '--self-test') selfTest();
  else {
    if (process.argv.length > 2) throw new Error('Unsupported invocation');
    const require = createRequire(path.join(process.cwd(), 'package.json'));
    const { loadEnvConfig } = require('@next/env');
    loadEnvConfig(process.cwd(), false, { info() {}, log() {}, warn() {}, error() {} });
    const key = publicKey(process.env.HOLIDAY_MATH_700_KEY);
    process.stdout.write(safePublicPem(key.pem));
    process.stdout.write(`PUBLIC_KEY_SHA256 ${[...key.sha256].join(' ')}\n`);
    process.stdout.write('Public encryption key export succeeded.\n');
  }
} catch {
  process.stderr.write('Public encryption key export failed.\n');
  process.exitCode = 1;
}
