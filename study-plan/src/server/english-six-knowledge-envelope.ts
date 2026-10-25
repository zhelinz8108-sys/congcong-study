import "server-only";
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";

export const ENGLISH_SIX_KNOWLEDGE_PURPOSE = "english-six-knowledge-v1";
const algorithm = "X25519-HKDF-SHA256+A256GCM";
const privatePrefix = Buffer.from("302e020100300506032b656e04220420", "hex");
const maxBytes = 8 * 1024 * 1024;
export type EnglishSixKnowledgeEnvelope = {
  version: 1;
  algorithm: typeof algorithm;
  ephemeralPublicKey: string;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

function privateKey(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error("English knowledge service is not configured");
  const seed = Buffer.from(hkdfSync("sha256", Buffer.from(secret, "hex"), Buffer.from(ENGLISH_SIX_KNOWLEDGE_PURPOSE), Buffer.from("x25519-private"), 32));
  try { return createPrivateKey({ key: Buffer.concat([privatePrefix, seed]), format: "der", type: "pkcs8" }); }
  finally { seed.fill(0); }
}

export function englishSixKnowledgePublicKey(secret: string): string {
  return createPublicKey(privateKey(secret)).export({ format: "pem", type: "spki" }).toString();
}

function payloadKey(shared: Buffer, salt: Buffer) {
  try { return Buffer.from(hkdfSync("sha256", shared, salt, Buffer.from(ENGLISH_SIX_KNOWLEDGE_PURPOSE + ":payload"), 32)); }
  finally { shared.fill(0); }
}

/** The publishing workspace needs only the public recipient key. */
export function encryptEnglishSixKnowledge(value: unknown, recipientPublicKey: string): EnglishSixKnowledgeEnvelope {
  if (typeof recipientPublicKey !== "string" || recipientPublicKey.length > 4096) throw new Error("Invalid English knowledge recipient");
  const recipient = createPublicKey(recipientPublicKey);
  if (recipient.asymmetricKeyType !== "x25519") throw new Error("Expected an X25519 English knowledge recipient");
  const bytes = Buffer.from(JSON.stringify(value));
  if (!bytes.length || bytes.length > maxBytes) throw new Error("English knowledge package is too large");
  const ephemeral = generateKeyPairSync("x25519"), salt = randomBytes(32), iv = randomBytes(12);
  const key = payloadKey(diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient }), salt);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(ENGLISH_SIX_KNOWLEDGE_PURPOSE));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return { version: 1, algorithm,
      ephemeralPublicKey: ephemeral.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
      salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
  } finally { key.fill(0); bytes.fill(0); }
}

function binary(value: unknown, size: number, maximum = size) {
  if (typeof value !== "string" || value.length > Math.ceil(maximum / 3) * 4 || !value.length) throw new Error("Invalid English knowledge encryption field");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < size || bytes.length > maximum || bytes.toString("base64") !== value) throw new Error("Invalid English knowledge encryption field");
  return bytes;
}

export function decryptEnglishSixKnowledge(envelope: unknown, secret: string): unknown {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("Invalid English knowledge envelope");
  const data = envelope as Record<string, unknown>;
  if (Object.keys(data).length !== 7 || Object.keys(data).some(key => !["version", "algorithm", "ephemeralPublicKey", "salt", "iv", "tag", "ciphertext"].includes(key)) || data.version !== 1 || data.algorithm !== algorithm) throw new Error("Invalid English knowledge envelope");
  const salt = binary(data.salt, 32), iv = binary(data.iv, 12), tag = binary(data.tag, 16);
  const ephemeral = createPublicKey({ key: binary(data.ephemeralPublicKey, 44), format: "der", type: "spki" });
  if (ephemeral.asymmetricKeyType !== "x25519") throw new Error("Invalid English knowledge sender");
  const ciphertext = binary(data.ciphertext, 1, maxBytes);
  const key = payloadKey(diffieHellman({ privateKey: privateKey(secret), publicKey: ephemeral }), salt);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(ENGLISH_SIX_KNOWLEDGE_PURPOSE)); decipher.setAuthTag(tag);
    const bytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    try { return JSON.parse(bytes.toString("utf8")); }
    finally { bytes.fill(0); }
  } finally { key.fill(0); }
}
