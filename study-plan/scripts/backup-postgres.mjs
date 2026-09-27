import { spawn } from "node:child_process";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const outputFlag = process.argv.indexOf("--output");
const output =
  outputFlag >= 0 && process.argv[outputFlag + 1]
    ? path.resolve(process.argv[outputFlag + 1])
    : path.resolve(`study-plan-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);

const args = ["--format=custom", "--compress=9", "--no-owner", "--no-privileges", `--file=${output}`];
if (process.env.DATABASE_URL) args.push(process.env.DATABASE_URL);

const child = spawn("pg_dump", args, {
  env: process.env,
  stdio: ["ignore", "inherit", "inherit"],
  windowsHide: true,
});

child.on("error", (error) => {
  console.error(`Unable to start pg_dump: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`PostgreSQL backup created: ${output}`);
    return;
  }
  process.exitCode = code ?? 1;
});
