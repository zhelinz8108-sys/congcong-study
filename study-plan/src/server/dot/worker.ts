import "server-only";
import { pool } from "@/lib/db";
import { deliver, signedHeaders, unseal } from "./webhook";
import { eventName } from "./subscriptions";

export async function runDeliveryBatch(send = deliver) {
  await pool.query("UPDATE practice_rounds SET finished_at=due_at WHERE finished_at IS NULL AND due_at<=now()");
  // Lease rows before network I/O. A process restart makes the same event ID eligible again.
  const rows = await pool.query(`WITH due AS (
    SELECT round_id,subscription_id FROM dot_deliveries WHERE available_at<=now()
    ORDER BY available_at LIMIT 8 FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE dot_deliveries d SET available_at=now()+interval '90 seconds', attempts=d.attempts+1 FROM due
    WHERE d.round_id=due.round_id AND d.subscription_id=due.subscription_id RETURNING d.*
  ) SELECT c.*,r.activity,r.answered,r.finished_at,s.callback,s.secret,
    CASE WHEN s.rotated_at>now()-interval '5 minutes' THEN s.previous_secret END AS previous_secret,
    s.expires_at>now() AND g.refresh_until>now() AS active
    FROM claimed c JOIN practice_rounds r ON r.id=c.round_id
    JOIN dot_subscriptions s ON s.id=c.subscription_id JOIN dot_grants g ON g.id=s.grant_id`);
  await Promise.all(rows.rows.map(async row => {
    const identity = [row.round_id, row.subscription_id, row.attempts];
    let status = 0;
    if (row.active) {
      const body = JSON.stringify({ eventId: row.round_id, name: eventName, timestamp: new Date(row.finished_at).toISOString(),
        data: { activity: row.activity, answered: row.answered }, cursor: null });
      try {
        const keys = [unseal(row.secret)];
        if (row.previous_secret) keys.push(unseal(row.previous_secret));
        status = (await send(row.callback, signedHeaders(row.subscription_id, row.round_id, body, keys), body)).status;
      } catch { /* A transient connection failure retains the durable delivery. */ }
    }
    if (status === 410) {
      await pool.query("DELETE FROM dot_subscriptions WHERE id=$1 AND secret=$2", [row.subscription_id, row.secret]);
    } else if (!row.active || (status >= 200 && status < 300) || status === 413 || row.attempts >= 18) {
      await pool.query("DELETE FROM dot_deliveries WHERE round_id=$1 AND subscription_id=$2 AND attempts=$3", identity);
      if (row.active && !(status >= 200 && status < 300)) console.error("Dot delivery ended", row.round_id, status, row.attempts);
    } else {
      const delay = Math.min(3600, 5 * 2 ** Math.min(row.attempts, 10));
      await pool.query("UPDATE dot_deliveries SET available_at=now()+$4*interval '1 second' WHERE round_id=$1 AND subscription_id=$2 AND attempts=$3", [...identity, delay]);
    }
  }));
}

const state = globalThis as typeof globalThis & { studyDotTimer?: NodeJS.Timeout };
export function startDeliveryWorker() {
  if (state.studyDotTimer) return;
  let running = false;
  state.studyDotTimer = setInterval(() => {
    if (running) return;
    running = true;
    void runDeliveryBatch().catch(() => {
      // Delivery is retried after startup/migration and transient database failures.
    }).finally(() => { running = false; });
  }, 5000);
  state.studyDotTimer.unref();
}
