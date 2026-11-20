import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { digest } from "./oauth";
import { callbackURL, deliver, equalText, seal, signedHeaders, signingKey, unseal } from "./webhook";

export const eventName = "practice.completed";
const emptyObject = { type: "object", properties: {}, additionalProperties: false };
export const eventDefinition = {
  name: eventName, description: "聪聪完成一轮练习。每轮只发一次，含练习名称和实际答题数。", delivery: ["webhook"],
  inputSchema: emptyObject, payloadSchema: { type: "object", required: ["activity", "answered"],
    properties: { activity: { type: "string" }, answered: { type: "integer", minimum: 1 } }, additionalProperties: false },
};
export class EventError extends Error {
  constructor(public code: number, message: string, public reason?: string) { super(message); }
}
type Params = { name?: unknown; arguments?: unknown; ttlMs?: unknown; delivery?: { mode?: unknown; url?: unknown; secret?: unknown } };
export async function changeSubscription(grant: string, params: Params, remove: boolean) {
  if (params.name !== eventName || params.delivery?.mode !== "webhook" ||
      (params.arguments !== undefined && (!params.arguments || typeof params.arguments !== "object" || Array.isArray(params.arguments) || Object.keys(params.arguments).length))) throw new EventError(-32602, "Invalid event or filter");
  let callback: string;
  try { callback = callbackURL(params.delivery.url).href; } catch { throw new EventError(-32602, "Invalid callback URL"); }
  const id = "sub_" + digest(JSON.stringify([grant, eventName, callback]));
  if (remove) {
    await pool.query("DELETE FROM dot_subscriptions WHERE id=$1 AND grant_id=$2", [id, grant]);
    return {};
  }
  const secret = params.delivery.secret;
  if (!signingKey(secret)) throw new EventError(-32602, "Invalid signing key");
  const week = 7 * 86400000, ttl = params.ttlMs ?? week;
  if (typeof ttl !== "number" || !Number.isSafeInteger(ttl) || ttl <= 0) throw new EventError(-32602, "Invalid lifetime");
  const until = new Date(Date.now() + Math.min(ttl, week));
  const old = (await pool.query("SELECT secret,verified_at FROM dot_subscriptions WHERE id=$1", [id])).rows[0];
  const cached = old && equalText(unseal(old.secret), secret) && +new Date(old.verified_at) > Date.now() - 5 * 60000;
  if (!cached) {
    const challenge = randomBytes(32).toString("base64url"), body = JSON.stringify({ type: "verification", challenge });
    try {
      const response = await deliver(callback, signedHeaders(id, "verify_" + randomUUID(), body, [secret]), body);
      if (response.status < 200 || response.status > 299 || !equalText(challenge, String(JSON.parse(response.body)?.challenge))) throw new Error();
    } catch { throw new EventError(-32015, "Callback verification failed", "challenge_failed"); }
  }
  const encrypted = old && equalText(unseal(old.secret), secret) ? old.secret : seal(secret);
  await pool.query(`INSERT INTO dot_subscriptions(id,grant_id,callback,secret,expires_at) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (id) DO UPDATE SET previous_secret=CASE WHEN dot_subscriptions.secret<>EXCLUDED.secret THEN dot_subscriptions.secret ELSE dot_subscriptions.previous_secret END,
      rotated_at=CASE WHEN dot_subscriptions.secret<>EXCLUDED.secret THEN now() ELSE dot_subscriptions.rotated_at END,
      verified_at=CASE WHEN $6 THEN dot_subscriptions.verified_at ELSE now() END, secret=EXCLUDED.secret, expires_at=EXCLUDED.expires_at`, [id, grant, callback, encrypted, until, Boolean(cached)]);
  return { id, refreshBefore: until.toISOString(), cursor: null, truncated: false };
}
