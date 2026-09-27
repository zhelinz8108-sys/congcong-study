import {
  existsSync,
  closeSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, "..");
const WORKSPACE_ROOT = resolve(APP_ROOT, "..");
const DEFAULT_ROOT = resolve(WORKSPACE_ROOT, "英语", "阅读", "imports", "atlantic");

function usage() {
  console.log(`
Audit The Atlantic Library PDF downloads.

Usage:
  npm run atlantic:audit-pdfs

Options:
  --root <folder>       Archive root. Default: ${DEFAULT_ROOT}
  --pdf-dir <folder>    PDF folder. Default: <root>/pdf
  --manifest <file>     Manifest JSONL. Default: <root>/manifest.jsonl
  --report <file>       Output report. Default: <root>/download-report.json
  --help                Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    root: DEFAULT_ROOT,
    pdfDir: "",
    manifest: "",
    report: "",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = () => argv[++index] ?? "";
    if (key === "--root") args.root = resolve(next());
    else if (key === "--pdf-dir") args.pdfDir = resolve(next());
    else if (key === "--manifest") args.manifest = resolve(next());
    else if (key === "--report") args.report = resolve(next());
    else if (key === "--help" || key === "-h") args.help = true;
    else throw new Error(`Unknown option: ${key}`);
  }

  args.pdfDir ||= resolve(args.root, "pdf");
  args.manifest ||= resolve(args.root, "manifest.jsonl");
  args.report ||= resolve(args.root, "download-report.json");
  return args;
}

function readManifest(file) {
  const records = [];
  const damaged = [];
  if (!existsSync(file)) return { records, damaged };

  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      damaged.push({ line: index + 1, error: error.message });
    }
  }
  return { records, damaged };
}

function walkPdfFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, item.name);
    if (item.isDirectory()) files.push(...walkPdfFiles(fullPath));
    else if (extname(item.name).toLowerCase() === ".pdf") files.push(fullPath);
  }
  return files;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function isPdf(file) {
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(5);
    readSync(fd, buffer, 0, 5, 0);
    return buffer.toString("latin1").startsWith("%PDF-");
  } finally {
    closeSync(fd);
  }
}

function groupBy(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function writeReport(file, report) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const { records, damaged } = readManifest(args.manifest);
  const files = walkPdfFiles(args.pdfDir);
  const downloaded = records.filter((record) => record.status === "downloaded");
  const skipped = records.filter((record) => record.status === "skipped");
  const failed = records.filter((record) => record.status === "failed");

  const fileRows = files.map((file) => {
    const stats = statSync(file);
    return {
      file,
      bytes: stats.size,
      sha256: sha256(file),
      valid_pdf_header: isPdf(file),
    };
  });

  const byHash = groupBy(fileRows, (file) => file.sha256);
  const duplicateFiles = [...byHash.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.map((item) => item.file));

  const manifestPaths = new Set(
    downloaded
      .map((record) => record.filePath || record.file_path)
      .filter(Boolean)
      .map((file) => resolve(file))
  );
  const missingFiles = [...manifestPaths].filter((file) => !existsSync(file));
  const extraFiles = fileRows
    .map((row) => row.file)
    .filter((file) => !manifestPaths.has(resolve(file)));

  const invalidPdfs = fileRows.filter((row) => !row.valid_pdf_header || row.bytes < 1024);

  const report = {
    audited_at: new Date().toISOString(),
    root: args.root,
    pdf_dir: args.pdfDir,
    manifest: args.manifest,
    summary: {
      manifest_records: records.length,
      downloaded_records: downloaded.length,
      skipped_records: skipped.length,
      failed_records: failed.length,
      pdf_files: fileRows.length,
      damaged_manifest_lines: damaged.length,
      missing_files: missingFiles.length,
      extra_files: extraFiles.length,
      duplicate_file_groups: duplicateFiles.length,
      invalid_or_tiny_pdfs: invalidPdfs.length,
    },
    damaged_manifest_lines: damaged,
    missing_files: missingFiles,
    extra_files: extraFiles,
    duplicate_files: duplicateFiles,
    invalid_or_tiny_pdfs: invalidPdfs,
    failed_records: failed,
  };

  writeReport(args.report, report);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report written: ${args.report}`);
}

main();
