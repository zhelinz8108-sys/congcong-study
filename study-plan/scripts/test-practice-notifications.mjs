// Run against a disposable local PostgreSQL database. Every table belongs to a fresh test schema.
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import pg from "pg";
import ts from "typescript";

const url = process.env.DOT_TEST_DATABASE_URL;
if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("Set DOT_TEST_DATABASE_URL to a disposable local PostgreSQL database");
const schema = "practice_test_" + randomBytes(8).toString("hex");
const admin = new pg.Pool({ connectionString: url });
const pool = new pg.Pool({ connectionString: url, options: "-c search_path=" + schema });
const require = createRequire(import.meta.url), cache = new Map();
const root = path.resolve(import.meta.dirname, "..");
function load(filename) {
  const file = path.resolve(root, filename);
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependency = name => {
    if (name === "server-only") return {};
    if (name === "@/lib/db") return { pool };
    if (name.startsWith("@/")) return load("src/" + name.slice(2) + ".ts");
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + ".ts"));
    return require(name);
  };
  new Function("require", "module", "exports", code)(dependency, mod, mod.exports);
  return mod.exports;
}
try {
  await admin.query("CREATE SCHEMA " + schema);
  const migration = readFileSync(path.join(root, "scripts/practice-notifications.sql"), "utf8");
  await pool.query(migration);
  await pool.query(migration);
  process.env.FAMILY_ACCESS_SECRET = randomBytes(32).toString("hex");
  const auth = load("src/server/dot/oauth.ts"), hooks = load("src/server/dot/webhook.ts");
  const rounds = load("src/server/dot/rounds.ts"), first = load("src/server/first-submission.ts");
  const rpc = load("src/app/dot/mcp/route.ts"), worker = load("src/server/dot/worker.ts");
  const origin = "https://congcong-study.cn", verifier = randomBytes(32).toString("base64url");
  const redirect = "https://chatgpt.com/connector_platform_oauth_redirect", client = "https://chatgpt.com/oauth/client.json";
  const consent = new URLSearchParams({ response_type: "code", client_id: client, redirect_uri: redirect, state: "fixture",
    code_challenge_method: "S256", code_challenge: auth.digest(verifier), resource: origin + "/dot/mcp", scope: auth.SCOPE });
  assert.equal(auth.consentParams(new URLSearchParams({ ...Object.fromEntries(consent), redirect_uri: "https://example.org" }), origin), null);
  const authorized = await auth.authorize("test-student", auth.consentParams(consent, origin), origin);
  const request = new URLSearchParams({ grant_type: "authorization_code", code: authorized.searchParams.get("code"), client_id: client,
    redirect_uri: redirect, code_verifier: verifier });
  assert.equal(await auth.exchange(new URLSearchParams({...Object.fromEntries(request), code_verifier: "x".repeat(43)}), origin), null);
  let tokens = await auth.exchange(request, origin);
  assert.ok(tokens?.access_token);
  assert.equal(await auth.exchange(request, origin), null);
  const refresh = new URLSearchParams({ grant_type: "refresh_token", client_id: client, refresh_token: tokens.refresh_token });
  tokens = await auth.exchange(refresh, origin);
  assert.ok(tokens?.access_token);
  assert.equal(await auth.exchange(refresh, origin), null);

  async function call(method, params = {}, token) {
    const res = await rpc.POST(new Request(origin + "/dot/mcp", {method: "POST", headers: token ? { authorization: "Bearer " + token } : {},
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })}));
    return { status: res.status, body: await res.json() };
  }
  assert.deepEqual((await call("initialize")).body.result.capabilities.events, {});
  assert.equal((await call("events/list")).body.result.events[0].name, "practice.completed");
  assert.equal((await call("events/subscribe")).status, 401);
  assert.equal(hooks.publicAddress("127.0.0.1"), false);
  assert.equal(hooks.publicAddress("::ffff:169.254.169.254"), false);
  assert.equal(hooks.publicAddress("2606:4700:4700::1111"), true);
  const secret = "whsec_" + randomBytes(32).toString("base64");
  const params = { name: "practice.completed", arguments: {}, delivery: { mode: "webhook", url: "https://callback.example.test/dot", secret } };
  // Replace only HTTPS I/O. Check the exact signed bytes that would leave the app.
  const events = [];
  let challengeCount = 0, rejectOnce = false, badChallenge = true;
  hooks.deliver = async (url, headers, bytes) => {
    assert.equal(url, params.delivery.url);
    const id = headers["webhook-id"], time = headers["webhook-timestamp"];
    const sig = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(id + "." + time + "." + bytes).digest("base64");
    assert.equal(headers["webhook-signature"], "v1," + sig);
    const body = JSON.parse(bytes);
    if (body.type === "verification") {
      challengeCount++;
      return { status: 200, body: JSON.stringify({challenge: badChallenge ? "wrong" : body.challenge}) };
    }
    assert.equal(body.eventId, id);
    events.push(body);
    if (rejectOnce) { rejectOnce = false; return { status: 503, body: "" }; }
    return { status: 204, body: "" };
  };
  assert.equal((await call("events/subscribe", params, tokens.access_token)).body.error.code, -32015);
  badChallenge = false;
  const connected = (await call("events/subscribe", params, tokens.access_token)).body.result;
  assert.ok(connected?.id);
  assert.equal((await call("events/subscribe", params, tokens.access_token)).body.result.id, connected.id);
  assert.equal(challengeCount, 2);
  const saved = (await pool.query("SELECT secret FROM dot_subscriptions")).rows[0];
  assert.notEqual(saved.secret, secret);
  assert.equal(hooks.unseal(saved.secret), secret);

  const round = randomUUID(), other = randomUUID();
  const answer = (id, value, session = round) => first.saveFirstSubmission("test-student", "english:locked:vocab:v1:session:" + session, id, value,
    a => ({correct: a === "right"}), undefined, session);
  await Promise.all([answer("a", "wrong"), answer("a", "right"), answer("b", "right")]);
  await answer("a", "right", other);
  await first.saveFirstSubmission("test-student", "english:locked:six:v1", "old", "old", () => ({}),
    { answer: "historic", feedback: {}, submittedAt: "2020-01-01" }, round);
  await rounds.updatePracticeRound("test-student", randomUUID(), true); // all skipped
  await rounds.updatePracticeRound("other-student", round, true);
  await Promise.all([rounds.updatePracticeRound("test-student", round, true), rounds.updatePracticeRound("test-student", round, true)]);
  assert.equal((await pool.query("SELECT * FROM dot_deliveries")).rowCount, 1);
  rejectOnce = true;
  await worker.runDeliveryBatch(hooks.deliver);
  await pool.query("UPDATE dot_deliveries SET available_at=now()");
  await Promise.all([worker.runDeliveryBatch(hooks.deliver), worker.runDeliveryBatch(hooks.deliver)]);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], events[1]);
  assert.deepEqual(events[0].data, { activity: "英语单词", answered: 2 });
  await pool.query("UPDATE practice_rounds SET due_at=now() WHERE session_key=$1", [other]);
  await worker.runDeliveryBatch(hooks.deliver);
  assert.deepEqual(events[2].data, { activity: "英语单词", answered: 1 });

  const paper = randomUUID();
  await pool.query("CREATE TABLE math_responses(attempt_id uuid, response_text text)");
  await pool.query("INSERT INTO math_responses VALUES ($1,'解答'),($1,' '),($2,'以前的作答')", [paper,randomUUID()]);
  await rounds.finishPaper(pool, "test-student", paper);
  await worker.runDeliveryBatch(hooks.deliver);
  assert.deepEqual(events.at(-1).data, {activity:"数学试卷", answered:1});
  assert.deepEqual((await call("events/unsubscribe", params, tokens.access_token)).body.result, {});
  await auth.revoke(tokens.refresh_token, client);
  assert.equal((await call("tools/call", {name:"practice_notification_status"}, tokens.access_token)).status, 401);
  const reports = load("src/server/practice-report.ts");
  const reportsRoute = load("src/app/practice-reports/rounds/route.ts");
  const student = "test-student";
  const grants = await Promise.all([reports.createReportAccess(student), reports.createReportAccess(student)]);
  assert.equal(grants.filter(Boolean).length, 1);
  const grant = grants.find(Boolean);
  assert.equal((await reports.reportAccess(student)).startsAt, grant.startsAt);
  const report = async (token, query = "") => {
    const res = await reportsRoute.GET(new Request(origin + "/practice-reports/rounds" + query,
      { headers: token ? { authorization: "Bearer " + token } : {} }));
    return { status: res.status, body: await res.json() };
  };
  assert.equal((await report()).status, 401);
  assert.equal((await report("pr_" + randomBytes(32).toString("base64url"))).status, 401);
  assert.deepEqual((await report(grant.token)).body, {rounds: [], nextAfter: null});
  await pool.query(`INSERT INTO practice_rounds(student_id,activity,session_key,answered,due_at,finished_at)
    SELECT $1,'英语单词','fixture-'||n,n,now(),now() FROM generate_series(1,102) n`, [student]);
  await pool.query(`INSERT INTO practice_rounds(student_id,activity,session_key,answered,due_at,finished_at)
    VALUES ($1,'进行中','in-progress',2,now(),NULL),('other-student','其他人','other',999,now(),now())`, [student]);
  const page = (await report(grant.token)).body;
  assert.equal(page.rounds.length, 100);
  assert.equal(page.nextAfter, page.rounds.at(-1).id);
  assert.deepEqual(Object.keys(page.rounds[0]).sort(), ["activity","answered","finishedAt","id"]);
  const second = (await report(grant.token, "?after=" + page.nextAfter)).body;
  assert.equal(second.nextAfter, null);
  const all = [...page.rounds, ...second.rounds];
  assert.equal(new Set(all.map(r => r.id)).size, 102);
  assert.ok(all.every(r => r.activity === "英语单词"));
  assert.deepEqual(all.map(r => r.answered).sort((a,b) => a-b), Array.from({length:102}, (_,i) => i+1));
  assert.equal((await report(grant.token, "?after=" + randomUUID())).status, 400);
  assert.equal((await report(grant.token, "?since=tomorrow")).status, 400);
  assert.deepEqual((await report(grant.token, "?since=2099-01-01T00:00:00Z")).body.rounds, []);
  await reports.revokeReportAccess(student);
  assert.equal((await reports.reportAccess(student)).startsAt, null);
  assert.equal((await report(grant.token)).status, 401);
  console.log("Passed family-scoped reports, authorization baseline, isolated rounds, pagination, stable IDs, and revocation.");
  console.log("Passed OAuth consent/PKCE, refresh/revoke, signed challenges, round isolation, repeated submissions, blank papers, concurrent delivery, stable retries and unsubscribe.");
} finally {
  await pool.end();
  await admin.query("DROP SCHEMA " + schema + " CASCADE");
  await admin.end();
}
