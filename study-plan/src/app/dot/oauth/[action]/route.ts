import { NextRequest } from "next/server";
import { bankAccess, bankProfile } from "@/server/grade6-bank/http";
import { approvedCallback, authorize, consentParams, exchange, oauthOrigin, registeredClient, revoke } from "@/server/dot/oauth";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params, origin = oauthOrigin(request);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 16384) return json({ error: "invalid_request" }, 413);
  if (action === "register") {
    let data;
    try { data = JSON.parse(raw); } catch { return json({ error: "invalid_client_metadata" }, 400); }
    const uris = data?.redirect_uris;
    if (!Array.isArray(uris) || uris.length !== 1 || typeof uris[0] !== "string" || !approvedCallback(uris[0]) ||
        (data.token_endpoint_auth_method && data.token_endpoint_auth_method !== "none")) return json({ error: "invalid_client_metadata" }, 400);
    return json({ client_id: registeredClient(uris[0]), redirect_uris: uris, token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }, 201);
  }
  const params = new URLSearchParams(raw);
  if (action === "authorize") {
    const denied = bankAccess(request, true);
    if (denied) return denied;
    if (request.headers.get("origin") !== origin || params.get("consent") !== "allow") return json({ error: "access_denied" }, 403);
    const validated = consentParams(params, origin);
    if (!validated) return json({ error: "invalid_request" }, 400);
    return new Response(null, { status: 303, headers: { Location: (await authorize(bankProfile(request).id, validated, origin)).href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  if (action === "token") {
    const token = await exchange(params, origin);
    return token ? json(token) : json({ error: "invalid_grant" }, 400);
  }
  if (action === "revoke") {
    await revoke(params.get("token") ?? "", params.get("client_id") ?? "");
    return json({});
  }
  return json({ error: "not_found" }, 404);
}
