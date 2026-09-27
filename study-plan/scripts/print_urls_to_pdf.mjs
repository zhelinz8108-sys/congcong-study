import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_WAIT_MS = 3500;
const DEFAULT_DELAY_MS = 1500;

function usage() {
  console.log(`
Print user-provided article URLs to local PDFs with Chrome.

This tool only opens URLs you provide. It does not crawl, search, bypass login,
or download a whole site.

Usage:
  node scripts/print_urls_to_pdf.mjs --urls urls.txt --out-dir downloads/articles

Options:
  --urls <file>          UTF-8 text file. One URL per line, or filename<TAB>URL.
  --out-dir <folder>     Output folder. Default: downloads/printed-articles
  --chrome <path>        Chrome/Edge executable path. Optional.
  --profile-dir <path>   Browser profile folder for this tool. Default: .chrome-print-profile
  --visible              Open a visible browser window. Useful for first login.
  --keep-browser-open    Keep Chrome open after finishing.
  --overwrite            Replace existing PDFs.
  --wait-ms <number>     Extra wait after page load. Default: ${DEFAULT_WAIT_MS}
  --delay-ms <number>    Delay between URLs. Default: ${DEFAULT_DELAY_MS}
  --dry-run              Show planned output only.
  --help                 Show this help.

First-login tip:
  1. Run once with --visible and an Atlantic URL.
  2. Log in inside the opened Chrome window.
  3. Keep using the same --profile-dir later.
`);
}

function parseArgs(argv) {
  const args = {
    urls: "",
    outDir: "downloads/printed-articles",
    chrome: "",
    profileDir: ".chrome-print-profile",
    visible: false,
    keepBrowserOpen: false,
    overwrite: false,
    waitMs: DEFAULT_WAIT_MS,
    delayMs: DEFAULT_DELAY_MS,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = () => argv[++index] ?? "";
    if (key === "--urls") args.urls = next();
    else if (key === "--out-dir") args.outDir = next();
    else if (key === "--chrome") args.chrome = next();
    else if (key === "--profile-dir") args.profileDir = next();
    else if (key === "--visible") args.visible = true;
    else if (key === "--keep-browser-open") args.keepBrowserOpen = true;
    else if (key === "--overwrite") args.overwrite = true;
    else if (key === "--wait-ms") args.waitMs = Number(next());
    else if (key === "--delay-ms") args.delayMs = Number(next());
    else if (key === "--dry-run") args.dryRun = true;
    else if (key === "--help" || key === "-h") args.help = true;
    else throw new Error(`Unknown option: ${key}`);
  }

  return args;
}

function sanitizeFilename(value) {
  const clean = decodeURIComponent(value)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return (clean || "article").slice(0, 170);
}

function filenameFromUrl(url) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const last = parts.at(-1) || parsed.hostname || "article";
  const name = last.includes(".") ? last.replace(/\.[^.]+$/, "") : last;
  return `${sanitizeFilename(name)}.pdf`;
}

function ensurePdfName(name) {
  const clean = sanitizeFilename(name);
  return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean}.pdf`;
}

function parseJobs(file) {
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const jobs = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.includes("\t")) {
      const [filename, url] = line.split("\t");
      jobs.push({ filename: ensurePdfName(filename), url: url.trim() });
      continue;
    }

    jobs.push({ filename: filenameFromUrl(line), url: line });
  }

  return jobs;
}

function findBrowser(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      "Chrome/Edge was not found. Pass --chrome \"C:\\Path\\To\\chrome.exe\"."
    );
  }
  return found;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function waitForChrome(port) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + 15000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await fetchJson(versionUrl);
    } catch (error) {
      lastError = error;
      await delay(300);
    }
  }

  throw new Error(`Chrome DevTools did not start on port ${port}: ${lastError}`);
}

async function openTab(port, url) {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
  try {
    return await fetchJson(endpoint, { method: "PUT" });
  } catch {
    return fetchJson(endpoint);
  }
}

async function closeTab(port, id) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/close/${id}`);
  } catch {
    // Best effort cleanup only.
  }
}

function createCdpClient(wsUrl) {
  if (typeof WebSocket === "undefined") {
    throw new Error("This script needs Node.js 20+ because it uses the built-in WebSocket.");
  }

  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: ok, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else ok(message.result ?? {});
      return;
    }

    const callbacks = listeners.get(message.method);
    if (callbacks) {
      for (const callback of callbacks) callback(message.params ?? {});
    }
  });

  const opened = new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  return {
    async send(method, params = {}) {
      await opened;
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveSend, rejectSend) => {
        pending.set(id, { resolve: resolveSend, reject: rejectSend });
      });
    },
    once(method) {
      return new Promise((resolveEvent) => {
        const callbacks = listeners.get(method) ?? [];
        callbacks.push((params) => {
          listeners.set(
            method,
            (listeners.get(method) ?? []).filter((callback) => callback !== callbacks.at(-1))
          );
          resolveEvent(params);
        });
        listeners.set(method, callbacks);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function scrollPage(client) {
  await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `
      new Promise((resolve) => {
        let steps = 0;
        const timer = setInterval(() => {
          window.scrollBy(0, Math.max(400, window.innerHeight * 0.85));
          steps += 1;
          if (steps > 18 || window.scrollY + window.innerHeight >= document.body.scrollHeight - 2) {
            clearInterval(timer);
            setTimeout(() => {
              window.scrollTo(0, 0);
              resolve(true);
            }, 800);
          }
        }, 180);
      })
    `,
  });
}

async function printUrlToPdf({ port, job, target, waitMs }) {
  const tab = await openTab(port, job.url);
  const client = createCdpClient(tab.webSocketDebuggerUrl);

  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    const loaded = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: job.url });
    await Promise.race([loaded, delay(Math.max(waitMs, 5000))]);
    await delay(waitMs);
    await scrollPage(client);

    const result = await client.send("Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true,
      scale: 1,
      marginTop: 0.4,
      marginRight: 0.35,
      marginBottom: 0.4,
      marginLeft: 0.35,
    });

    writeFileSync(target, Buffer.from(result.data, "base64"));
  } finally {
    client.close();
    await closeTab(port, tab.id);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.urls) throw new Error("Missing --urls <file>.");

  const jobs = parseJobs(args.urls);
  if (jobs.length === 0) throw new Error(`No URLs found in ${args.urls}.`);

  const outDir = resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });

  console.log(`Found ${jobs.length} URL(s). Output: ${outDir}`);
  if (args.dryRun) {
    for (const [index, job] of jobs.entries()) {
      console.log(`[${index + 1}/${jobs.length}] ${job.filename} <- ${job.url}`);
    }
    return;
  }

  const port = 9222 + Math.floor(Math.random() * 1000);
  const browserPath = findBrowser(args.chrome);
  const profileDir = resolve(args.profileDir);
  mkdirSync(profileDir, { recursive: true });

  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-popup-blocking",
  ];
  if (!args.visible) chromeArgs.push("--headless=new", "--disable-gpu", "--hide-scrollbars");
  chromeArgs.push("about:blank");

  const browser = spawn(browserPath, chromeArgs, {
    detached: false,
    stdio: "ignore",
  });

  try {
    await waitForChrome(port);

    for (const [index, job] of jobs.entries()) {
      const target = resolve(outDir, basename(job.filename));
      if (existsSync(target) && !args.overwrite) {
        console.log(`[${index + 1}/${jobs.length}] skipped: ${target}`);
        continue;
      }

      console.log(`[${index + 1}/${jobs.length}] printing: ${job.url}`);
      await printUrlToPdf({ port, job, target, waitMs: args.waitMs });
      console.log(`  saved: ${target}`);

      if (index < jobs.length - 1 && args.delayMs > 0) await delay(args.delayMs);
    }
  } finally {
    if (!args.keepBrowserOpen) browser.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
