// This helper emits only an X25519 PUBLIC encryption key. Production secret,
// HKDF seed and private KeyObject remain in this short-lived process memory.
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, hkdfSync } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

const PURPOSE = 'grade6-result-assessments-v1';
const INFO = 'x25519-private';
const PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

function publicKeyPem(secret, purpose = PURPOSE) {
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/i.test(secret.trim())) {
    throw new Error('Public encryption key configuration is unavailable.');
  }
  const master = Buffer.from(secret.trim(), 'hex');
  let seed, der;
  try {
    seed = Buffer.from(hkdfSync('sha256', master, Buffer.from(purpose, 'utf8'), Buffer.from(INFO, 'utf8'), 32));
    der = Buffer.concat([PKCS8_PREFIX, seed]);
    const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    return createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString();
  } finally {
    master.fill(0);
    seed?.fill(0);
    der?.fill(0);
  }
}

function wrapPublicPem(pem, force = false) {
  // A configured SSH-port redaction can corrupt the public digits "22".
  // If needed, use valid whitespace-only PUBLIC PEM wrapping. No private data
  // or credential is ever encoded or returned by this function.
  if (!force && !/22|ubuntu/.test(pem)) return pem;
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  return `-----BEGIN PUBLIC KEY-----\n${[...body].join('\n')}\n-----END PUBLIC KEY-----\n`;
}

function selfTest() {
  const invented = '11'.repeat(32);
  const first = publicKeyPem(invented);
  assert.equal(first, publicKeyPem(invented));
  assert.notEqual(first, publicKeyPem('22'.repeat(32)));
  assert.notEqual(first, publicKeyPem(invented, 'unrelated-purpose'));
  assert.equal(createPublicKey(first).asymmetricKeyType, 'x25519');
  const wrapped = wrapPublicPem(first, true);
  assert.deepEqual(createPublicKey(wrapped).export({ format: 'der', type: 'spki' }), createPublicKey(first).export({ format: 'der', type: 'spki' }));
  assert.match(wrapped, /^-----BEGIN PUBLIC KEY-----\n/);
  assert.doesNotMatch(first + wrapped, /PRIVATE KEY|11{63}|22{63}|302e020100300506032b656e04220420/);
  assert.throws(() => publicKeyPem('invalid'), /configuration is unavailable/);
  assert.throws(() => publicKeyPem('11'.repeat(31)), /configuration is unavailable/);
  process.stdout.write('Public encryption key synthetic tests passed.\n');
}

function exportPublicKey() {
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const { loadEnvConfig } = require('@next/env');
  const silent = { info() {}, log() {}, warn() {}, error() {} };
  loadEnvConfig(process.cwd(), false, silent);
  const pem = publicKeyPem(process.env.HOLIDAY_MATH_700_KEY);
  process.stdout.write(wrapPublicPem(pem));
  process.stdout.write('Public encryption key export succeeded.\n');
}

try {
  if (process.argv.slice(2).join(' ') === '--self-test') selfTest();
  else if (process.argv.length > 2) throw new Error('Unsupported invocation.');
  else exportPublicKey();
} catch {
  // Do not forward configuration errors, crypto objects, process metadata or
  // exception values into public workflow logs.
  process.stderr.write('Public encryption key export failed.\n');
  process.exitCode = 1;
}
