import assert from "node:assert/strict";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";
const { bankResultPublicKey, encryptBankResultDescriptors, decryptBankResultDescriptors } = await loadHolidayTestModule("src/server/grade6-bank/result-envelope.ts");
const invented = "a1".repeat(32), other = "b2".repeat(32), digest = "c3".repeat(32);
const value = { version: 1, total: 1, descriptors: { synthetic: { fields: { result: [{ start: 1, end: 2 }] } } } };
const publicKey = bankResultPublicKey(invented);
assert.match(publicKey, /^-----BEGIN PUBLIC KEY-----/);
assert.equal(publicKey, bankResultPublicKey(invented));
assert.notEqual(publicKey, bankResultPublicKey(other));
const envelope = encryptBankResultDescriptors(value, publicKey, digest);
assert.deepEqual(decryptBankResultDescriptors(envelope, invented, digest), value);
assert.notEqual(envelope.ciphertext, encryptBankResultDescriptors(value, publicKey, digest).ciphertext);
assert.doesNotMatch(JSON.stringify(envelope), /synthetic|result|PRIVATE KEY/);
assert.throws(() => decryptBankResultDescriptors(envelope, other, digest));
assert.throws(() => decryptBankResultDescriptors(envelope, invented, "d4".repeat(32)));
for (const field of ["ciphertext", "tag", "salt", "iv", "ephemeralPublicKey"]) {
  const changed = structuredClone(envelope);
  const bytes = Buffer.from(changed[field], "base64"); bytes[0] ^= 1; changed[field] = bytes.toString("base64");
  assert.throws(() => decryptBankResultDescriptors(changed, invented, digest), field);
}
assert.throws(() => bankResultPublicKey("not-a-key"));
assert.throws(() => decryptBankResultDescriptors({ ...envelope, unexpected: true }, invented, digest));
console.log(JSON.stringify({ passed: true, publicKeyOnlyAuthoring: true, purposeSeparatedKey: true, authenticatedTamperRejection: true, secretsExported: false }));
