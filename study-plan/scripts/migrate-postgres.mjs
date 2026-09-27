import nextEnv from "@next/env";
import { Pool } from "pg";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "study_plan",
  user: process.env.PGUSER ?? "study_plan",
  password: process.env.PGPASSWORD,
});

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_cloud_state (
      student_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (student_id, scope)
    );

    CREATE INDEX IF NOT EXISTS idx_student_cloud_state_updated
      ON student_cloud_state (student_id, updated_at DESC);
  `);
  console.log("PostgreSQL migrations completed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
