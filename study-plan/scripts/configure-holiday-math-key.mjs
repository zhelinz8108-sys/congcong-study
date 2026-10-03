import {
  readFileSync,
  writeFileSync,
  renameSync,
  statSync,
  chownSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { holidayEnvironmentContent } from "./holiday-math-key-config.mjs";

// Deployment only. The secret arrives over SSH stdin, never a command argument.
// The existing application environment and its owner/mode must be preserved.
if (process.platform !== "linux" || process.getuid?.() !== 0)
  throw new Error("Run only as root during Linux deployment.");
const key = readFileSync(0, "utf8").trim();
if (!/^[a-f0-9]{64}$/i.test(key))
  throw new Error("Dedicated question-bank key is missing or invalid.");
const target = "/etc/study-plan.env",
  present = existsSync(target);
const metadata = present
  ? statSync(target)
  : {
      uid: 0,
      gid: Number(
        execFileSync("id", ["-g", "ubuntu"], { encoding: "utf8" }).trim(),
      ),
      mode: 0o640,
    };
if (!Number.isSafeInteger(metadata.gid) || metadata.gid < 0)
  throw new Error("Application group could not be resolved.");
const existing = present ? readFileSync(target, "utf8") : "";
const content = holidayEnvironmentContent(existing, key);
if (content !== existing) {
  const temporary = "/etc/study-plan.env.holiday-key.tmp";
  writeFileSync(temporary, content, {
    flag: "wx",
    mode: metadata.mode & 0o777,
  });
  chownSync(temporary, metadata.uid, metadata.gid);
  chmodSync(temporary, metadata.mode & 0o777);
  renameSync(temporary, target);
}
console.log("Private question-bank server key configured; no value emitted.");
