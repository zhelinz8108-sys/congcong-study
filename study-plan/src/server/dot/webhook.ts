import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";

export function callbackURL(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("invalid_url");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) throw new Error("invalid_url");
  return url;
}
export function signingKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^whsec_[a-zA-Z0-9+/]+={0,2}$/.test(value)) return false;
  const bytes = Buffer.from(value.slice(6), "base64");
  return bytes.length >= 24 && bytes.length <= 64 && bytes.toString("base64").replace(/=+$/, "") === value.slice(6).replace(/=+$/, "");
}
export function equalText(a: string, b: string) {
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
function storageKey() {
  const secret = process.env.FAMILY_ACCESS_SECRET?.trim() || process.env.FAMILY_ACCESS_PASSWORD?.trim();
  if (!secret) throw new Error("Family access must be configured");
  return createHash("sha256").update("dot-signing-keys\0").update(secret).digest();
}
export function seal(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", storageKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}
export function unseal(value: string) {
  const bytes = Buffer.from(value, "base64"), decipher = createDecipheriv("aes-256-gcm", storageKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}
export function signedHeaders(subscription: string, id: string, body: string, keys: string[], time = Math.floor(Date.now() / 1000)) {
  const signatures = keys.map(key => "v1," + createHmac("sha256", Buffer.from(key.slice(6), "base64")).update(`${id}.${time}.${body}`).digest("base64"));
  return { "Content-Type": "application/json", "webhook-id": id, "webhook-timestamp": String(time),
    "webhook-signature": signatures.join(" "), "X-MCP-Subscription-Id": subscription };
}

export function publicAddress(address: string) {
  const ip = ipaddr.process(address);
  return ip.range() === "unicast" && (ip.kind() === "ipv4" || (ip.toByteArray()[0] & 0xe0) === 0x20);
}
export async function deliver(target: string, headers: Record<string,string>, body: string) {
  const url = callbackURL(target), hostname = url.hostname.replace(/^\[|\]$/g, "");
  const timeout = AbortSignal.timeout(7000);
  const addresses = await Promise.race([lookup(hostname, { all: true }), new Promise<never>((_, reject) =>
    timeout.addEventListener("abort", () => reject(new Error("timeout")), { once: true }))]);
  if (!addresses.length || addresses.some(({address}) => !publicAddress(address))) throw new Error("invalid_url");
  const peer = addresses.find(a => a.family === 4) ?? addresses[0];
  // Pin the checked address for this connection. HTTPS still verifies the original hostname.
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(url, { method: "POST", headers, signal: timeout, agent: false, family: peer.family,
      lookup: (_host, _options, done) => done(null, peer.address, peer.family) }, res => {
      const parts: Buffer[] = [];
      let size = 0;
      res.on("data", (part: Buffer) => {
        size += part.length;
        if (size > 16384) req.destroy(new Error("response_too_large"));
        else parts.push(part);
      });
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(parts).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}
