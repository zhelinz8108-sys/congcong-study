import { pool } from "@/lib/db";
import { authorizedGrant, oauthOrigin } from "@/server/dot/oauth";
import { changeSubscription, eventDefinition, EventError } from "@/server/dot/subscriptions";

const versions = ["2025-11-25", "2025-06-18", "2025-03-26"];
const capabilities = { tools: {}, events: {} };
const statusTool = { name: "practice_notification_status", description: "查看当前 Dot 是否已订阅练习完成提醒。",
  inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } };
const json = (value: unknown, status = 200, headers: Record<string,string> = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
export async function POST(request: Request) {
  const origin = oauthOrigin(request);
  if (request.headers.has("origin") && ![origin, "https://chatgpt.com"].includes(request.headers.get("origin") ?? "")) return new Response(null, { status: 403 });
  let id: number | string | null = null;
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 32768) return new Response(null, { status: 413 });
  let rpc;
  try { rpc = JSON.parse(raw); } catch { return json({ jsonrpc: "2.0", id, error: { code: -32700, message: "Invalid JSON" } }, 400); }
  try {
    if (rpc?.jsonrpc !== "2.0" || typeof rpc.method !== "string") throw new EventError(-32600, "Invalid request");
    id = rpc.id ?? null;
    const method = rpc.method, params = rpc.params ?? {};
    const ok = (result: unknown) => json({ jsonrpc: "2.0", id, result });
    if (method.startsWith("notifications/") && id === null) return new Response(null, { status: 202 });
    if (method === "initialize") return ok({ protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0],
      serverInfo: { name: "congcong-practice", version: "1.0.0" }, capabilities });
    if (method === "server/discover") return ok({ resultType: "complete", supportedVersions: ["2026-07-28"], capabilities });
    if (method === "ping") return ok({});
    if (method === "events/list") return ok({ events: [eventDefinition] });
    if (method === "tools/list") return ok({ tools: [statusTool] });
    const grant = await authorizedGrant(request);
    if (!grant) return json({ jsonrpc: "2.0", id, error: { code: -32001, message: "Family authorization required" } }, 401,
      { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/dot/mcp", scope="practice.notify"` });
    if (method === "events/subscribe" || method === "events/unsubscribe") return ok(await changeSubscription(grant, params, method === "events/unsubscribe"));
    if (method === "tools/call" && params.name === statusTool.name) {
      const rows = await pool.query("SELECT 1 FROM dot_subscriptions WHERE grant_id=$1 AND expires_at>now() LIMIT 1", [grant]);
      return ok({ content: [{ type: "text", text: rows.rowCount ? "练习完成提醒已订阅" : "尚未订阅练习完成提醒" }] });
    }
    throw new EventError(-32601, "Method not found");
  } catch (e) {
    const error = e instanceof EventError ? { code: e.code, message: e.message, ...(e.reason ? { data: { reason: e.reason } } : {}) } : { code: -32603, message: "Service unavailable" };
    return json({ jsonrpc: "2.0", id, error });
  }
}
export function GET() { return new Response(null, { status: 405, headers: { Allow: "POST" } }); }
