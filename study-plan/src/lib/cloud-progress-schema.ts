import { pool } from "@/lib/db";

let schemaPromise: Promise<void> | null = null;

export function ensureCloudProgressSchema() {
  schemaPromise ??= pool
    .query(`
      CREATE TABLE IF NOT EXISTS student_cloud_state (
        student_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (student_id, scope)
      );

      CREATE INDEX IF NOT EXISTS idx_student_cloud_state_updated
        ON student_cloud_state (student_id, updated_at DESC);
    `)
    .then(() => undefined)
    .catch((error) => {
      schemaPromise = null;
      throw error;
    });

  return schemaPromise;
}
