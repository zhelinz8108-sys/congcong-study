import "server-only";
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";

const purpose = "grade6-result-assessments-v1";
const privatePrefix = Buffer.from("302e020100300506032b656e04220420", "hex");
export type BankResultEnvelope = { version: 1; nativeKeyDigest: string; ephemeralPublicKey: string; salt: string; iv: string; tag: string; ciphertext: string };

function privateKey(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Result assessment key is not configured");
  const seed = Buffer.from(hkdfSync("sha256", Buffer.from(secret, "hex"), Buffer.from(purpose), Buffer.from("x25519-private"), 32));
  return createPrivateKey({ key: Buffer.concat([privatePrefix, seed]), format: "der", type: "pkcs8" });
}
export function bankResultPublicKey(secret: string): string {
  return createPublicKey(privateKey(secret)).export({ format: "pem", type: "spki" }).toString();
}
function payloadKey(shared: Buffer, salt: Buffer) {
  return Buffer.from(hkdfSync("sha256", shared, salt, Buffer.from(purpose + ":payload"), 32));
}
function aad(digest: string) { return Buffer.from(purpose + ":" + digest); }

/** Offline authoring uses only the production public encryption key. */
export function encryptBankResultDescriptors(value: unknown, recipientPublicKey: string, nativeKeyDigest: string): BankResultEnvelope {
  if (!/^[a-f0-9]{64}$/.test(nativeKeyDigest) || recipientPublicKey.length > 4096) throw new Error("Invalid result recipient metadata");
  const recipient = createPublicKey(recipientPublicKey);
  if (recipient.asymmetricKeyType !== "x25519") throw new Error("Expected an X25519 public encryption key");
  const ephemeral = generateKeyPairSync("x25519"), salt = randomBytes(32), iv = randomBytes(12);
  const key = payloadKey(diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient }), salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(aad(nativeKeyDigest));
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > 4 * 1024 * 1024) throw new Error("Result descriptor package is too large");
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return { version: 1, nativeKeyDigest,
    ephemeralPublicKey: ephemeral.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

export function decryptBankResultDescriptors(envelope: BankResultEnvelope, secret: string, expectedNativeDigest: string): unknown {
  if (!envelope || Object.keys(envelope).some(key => !["version", "nativeKeyDigest", "ephemeralPublicKey", "salt", "iv", "tag", "ciphertext"].includes(key)) ||
    envelope.version !== 1 || envelope.nativeKeyDigest !== expectedNativeDigest || typeof envelope.ciphertext !== "string" || envelope.ciphertext.length > 6 * 1024 * 1024 ||
    typeof envelope.ephemeralPublicKey !== "string" || envelope.ephemeralPublicKey.length > 256) throw new Error("Invalid result descriptor envelope");
  const salt = Buffer.from(envelope.salt, "base64"), iv = Buffer.from(envelope.iv, "base64"), tag = Buffer.from(envelope.tag, "base64");
  if (salt.length !== 32 || iv.length !== 12 || tag.length !== 16) throw new Error("Invalid result descriptor encryption metadata");
  const ephemeral = createPublicKey({ key: Buffer.from(envelope.ephemeralPublicKey, "base64"), format: "der", type: "spki" });
  if (ephemeral.asymmetricKeyType !== "x25519") throw new Error("Invalid result descriptor ephemeral key");
  const key = payloadKey(diffieHellman({ privateKey: privateKey(secret), publicKey: ephemeral }), salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAAD(aad(expectedNativeDigest)); decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}
