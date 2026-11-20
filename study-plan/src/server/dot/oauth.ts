import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "@/lib/db";

export const SCOPE = "practice.notify";
const stableCallback = "https://chatgpt.com/connector_platform_oauth_redirect";
const callbackId = /^https:\/\/chatgpt\.com\/connector\/oauth\/([A-Za-z0-9_-]{1,180})$/;
export const digest = (value: string) => createHash("sha256").update(value).digest("base64url");
const randomToken = () => randomBytes(32).toString("base64url");
export const oauthOrigin = (request: Request) => process.env.NODE_ENV === "production" ? "https://congcong-study.cn" : new URL(request.url).origin;

export function authMetadata(origin: string) {
  return { issuer: origin, authorization_endpoint: origin + "/dot/connect", token_endpoint: origin + "/dot/oauth/token",
    registration_endpoint: origin + "/dot/oauth/register", revocation_endpoint: origin + "/dot/oauth/revoke",
    scopes_supported: [SCOPE, "offline_access"], response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"], client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true };
}
export function protectedMetadata(origin: string) {
  return { resource: origin + "/dot/mcp", authorization_servers: [origin], scopes_supported: [SCOPE], bearer_methods_supported: ["header"] };
}
export function approvedCallback(uri: string) { return uri === stableCallback || callbackId.test(uri); }
export function registeredClient(uri: string) { return "dot-" + digest(uri); }
function matchesClient(client: string, uri: string) {
  if (!approvedCallback(uri)) return false;
  const id = callbackId.exec(uri)?.[1];
  return client === registeredClient(uri) ||
    (uri === stableCallback && client === "https://chatgpt.com/oauth/client.json") ||
    (id !== undefined && client === `https://chatgpt.com/oauth/${id}/client.json`);
}
export function consentParams(p: URLSearchParams, origin: string) {
  const client = p.get("client_id") ?? "", redirect = p.get("redirect_uri") ?? "", challenge = p.get("code_challenge") ?? "";
  const state = p.get("state") ?? "", resource = p.get("resource");
  if (!matchesClient(client, redirect) || p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256" ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge) || state.length > 2048 || (resource && resource !== origin + "/dot/mcp") ||
      (p.get("scope") ?? "").split(" ").some(x => x && x !== SCOPE && x !== "offline_access")) return null;
  return { client, redirect, challenge, state };
}
export async function authorize(student: string, params: NonNullable<ReturnType<typeof consentParams>>, origin: string) {
  const code = randomToken();
  await pool.query(`INSERT INTO dot_grants(student_id,client_id,redirect_uri,challenge,code_hash,code_until)
    VALUES ($1,$2,$3,$4,$5,now()+interval '5 minutes')`, [student, params.client, params.redirect, params.challenge, digest(code)]);
  const to = new URL(params.redirect);
  to.searchParams.set("code", code);
  if (params.state) to.searchParams.set("state", params.state);
  to.searchParams.set("iss", origin);
  return to;
}
export async function exchange(p: URLSearchParams, origin: string) {
  const client = p.get("client_id") ?? "", grant = p.get("grant_type"), resource = p.get("resource");
  if (resource && resource !== origin + "/dot/mcp") return null;
  const access = randomToken(), refresh = randomToken();
  const hashes = [digest(access), digest(refresh), client];
  // The UPDATE consumes the code or previous refresh token atomically.
  const update = `UPDATE dot_grants SET code_hash=NULL, access_hash=$1, refresh_hash=$2,
    access_until=now()+interval '1 hour',refresh_until=now()+interval '90 days' WHERE client_id=$3`;
  let row;
  if (grant === "authorization_code") {
    const verifier = p.get("code_verifier") ?? "", redirect = p.get("redirect_uri") ?? "";
    if (!matchesClient(client, redirect) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return null;
    row = await pool.query(update + " AND code_hash=$4 AND challenge=$5 AND redirect_uri=$6 AND code_until>now()",
      [...hashes, digest(p.get("code") ?? ""), digest(verifier), redirect]);
  } else if (grant === "refresh_token") {
    row = await pool.query(update + " AND refresh_hash=$4 AND refresh_until>now()", [...hashes, digest(p.get("refresh_token") ?? "")]);
  } else return null;
  return row.rowCount ? { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 3600, scope: SCOPE } : null;
}
export async function revoke(token: string, client: string) {
  await pool.query("DELETE FROM dot_grants WHERE client_id=$1 AND (access_hash=$2 OR refresh_hash=$2)", [client, digest(token)]);
}
export async function authorizedGrant(request: Request): Promise<string | null> {
  const match = /^Bearer ([a-zA-Z0-9_-]{43})$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return null;
  const result = await pool.query("SELECT id FROM dot_grants WHERE access_hash=$1 AND access_until>now()", [digest(match[1])]);
  return result.rows[0]?.id ?? null;
}
