import {
  appendFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, "..");
const WORKSPACE_ROOT = resolve(APP_ROOT, "..");
const DEFAULT_ROOT = resolve(WORKSPACE_ROOT, "英语", "阅读", "imports", "atlantic");
const DEFAULT_LIBRARY_URL =
  "https://accounts.theatlantic.com/accounts/library/?utm_source=helpcenter";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125 Safari/537.36";

function usage() {
  console.log(`
Download official The Atlantic Library PDFs into the local reading archive.

This tool opens The Atlantic pages with Chrome/Edge and only downloads PDF links
that are visibly provided by Library/issue pages. It does not scrape article HTML,
crawl article archives, store passwords, or save cookies.

Usage:
  npm run atlantic:download-pdfs -- --visible
  npm run atlantic:download-pdfs -- --max-issues 3 --visible

Options:
  --library-url <url>       Library page. Default: ${DEFAULT_LIBRARY_URL}
  --root <folder>           Archive root. Default: ${DEFAULT_ROOT}
  --pdf-dir <folder>        PDF output folder. Default: <root>/pdf
  --manifest <file>         JSONL manifest. Default: <root>/manifest.jsonl
  --report <file>           JSON report. Default: <root>/download-report.json
  --chrome <path>           Chrome/Edge executable path. Optional.
  --profile-dir <folder>    Browser profile for this tool. Default: .chrome-atlantic-library-profile
  --visible                 Show Chrome/Edge. Recommended for first login.
  --headless                Run without a visible window after login is already saved.
  --keep-browser-open       Leave the browser open after the script finishes.
  --max-issues <number>     Limit issue pages/PDFs for a test run.
  --wait-ms <number>        Wait after page loads. Default: 5000
  --delay-ms <number>       Delay between issue scans/downloads. Default: 3000
  --scroll-steps <number>   Max Library scroll/load-more steps. Default: 120
  --overwrite               Replace existing PDFs.
  --dry-run                 Discover and report candidates without downloading.
  --no-interactive-rescan   Do not pause for manual navigation when no PDFs are found.
  --no-login-prompt         Fail instead of waiting for manual login.
  --help                    Show this help.

First run:
  1. Run with --visible.
  2. Log in inside the opened Chrome window if The Atlantic asks.
  3. Return to the terminal and press Enter.
  4. Later runs can reuse the same --profile-dir.
`);
}

function parseArgs(argv) {
  const args = {
    libraryUrl: DEFAULT_LIBRARY_URL,
    root: DEFAULT_ROOT,
    pdfDir: "",
    manifest: "",
    report: "",
    chrome: "",
    profileDir: resolve(APP_ROOT, ".chrome-atlantic-library-profile"),
    visible: false,
    headless: false,
    keepBrowserOpen: false,
    maxIssues: 0,
    waitMs: 5000,
    delayMs: 3000,
    scrollSteps: 120,
    overwrite: false,
    dryRun: false,
    interactiveRescan: true,
    loginPrompt: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = () => argv[++index] ?? "";
    if (key === "--library-url") args.libraryUrl = next();
    else if (key === "--root") args.root = resolve(next());
    else if (key === "--pdf-dir") args.pdfDir = resolve(next());
    else if (key === "--manifest") args.manifest = resolve(next());
    else if (key === "--report") args.report = resolve(next());
    else if (key === "--chrome") args.chrome = next();
    else if (key === "--profile-dir") args.profileDir = resolve(next());
    else if (key === "--visible") args.visible = true;
    else if (key === "--headless") args.headless = true;
    else if (key === "--keep-browser-open") args.keepBrowserOpen = true;
    else if (key === "--max-issues") args.maxIssues = Number(next());
    else if (key === "--wait-ms") args.waitMs = Number(next());
    else if (key === "--delay-ms") args.delayMs = Number(next());
    else if (key === "--scroll-steps") args.scrollSteps = Number(next());
    else if (key === "--overwrite") args.overwrite = true;
    else if (key === "--dry-run") args.dryRun = true;
    else if (key === "--no-interactive-rescan") args.interactiveRescan = false;
    else if (key === "--no-login-prompt") args.loginPrompt = false;
    else if (key === "--help" || key === "-h") args.help = true;
    else throw new Error(`Unknown option: ${key}`);
  }

  args.pdfDir ||= resolve(args.root, "pdf");
  args.manifest ||= resolve(args.root, "manifest.jsonl");
  args.report ||= resolve(args.root, "download-report.json");
  return args;
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
      'Chrome/Edge was not found. Pass --chrome "C:\\Path\\To\\chrome.exe".'
    );
  }
  return found;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function waitForEnter(message) {
  console.log(message);
  return new Promise((resolveWait) => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolveWait();
    });
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function waitForChrome(port) {
  const deadline = Date.now() + 20000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
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

async function getControllableTab(port, fallbackUrl, preferExisting = false) {
  const tabs = await fetchJson(`http://127.0.0.1:${port}/json`);
  const pages = tabs.filter((tab) => tab.type === "page" && tab.webSocketDebuggerUrl);
  if (preferExisting) {
    const existing = pages.find((tab) => tab.url !== "about:blank") ?? pages[0];
    if (existing) return { ...existing, shouldClose: false };
  }
  const reusable = tabs.find(
    (tab) => tab.type === "page" && tab.webSocketDebuggerUrl && tab.url === "about:blank"
  );
  if (reusable) return { ...reusable, shouldClose: false };

  const created = await openTab(port, fallbackUrl);
  return { ...created, shouldClose: true };
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
    if (callbacks) callbacks.forEach((callback) => callback(message.params ?? {}));
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
        const callback = (params) => {
          listeners.set(
            method,
            (listeners.get(method) ?? []).filter((item) => item !== callback)
          );
          resolveEvent(params);
        };
        listeners.set(method, [...(listeners.get(method) ?? []), callback]);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function navigate(client, url, waitMs) {
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await Promise.race([loaded, delay(Math.max(waitMs, 7000))]);
  await delay(waitMs);
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function expandLibrary(client, maxSteps) {
  return evaluate(
    client,
    `
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        let stable = 0;
        let lastHeight = 0;
        let clicks = 0;

        for (let step = 0; step < ${Number(maxSteps) || 120}; step += 1) {
          const loadMore = Array.from(document.querySelectorAll('button, a'))
            .find((el) => /load more|show more|more issues|older|view more/i.test(
              [el.innerText, el.getAttribute('aria-label'), el.getAttribute('title')]
                .filter(Boolean)
                .join(' ')
            ));

          if (loadMore) {
            loadMore.click();
            clicks += 1;
            await sleep(1400);
          } else {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(900);
          }

          const height = document.body.scrollHeight;
          if (height === lastHeight) stable += 1;
          else stable = 0;
          lastHeight = height;
          if (stable >= 5) break;
        }

        window.scrollTo(0, 0);
        await sleep(400);
        return { height: document.body.scrollHeight, clicks };
      })()
    `
  );
}

async function getPageDiagnostics(client) {
  return evaluate(
    client,
    `
      (() => {
        const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim();
        const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 120).map((link) => ({
          href: new URL(link.getAttribute('href'), location.href).href,
          text: clean([
            link.innerText,
            link.getAttribute('aria-label'),
            link.getAttribute('title')
          ].filter(Boolean).join(' ')).slice(0, 180)
        }));
        const buttons = Array.from(document.querySelectorAll('button')).slice(0, 80).map((button) => ({
          text: clean([
            button.innerText,
            button.getAttribute('aria-label'),
            button.getAttribute('title')
          ].filter(Boolean).join(' ')).slice(0, 180),
          disabled: Boolean(button.disabled)
        }));
        return {
          href: location.href,
          title: document.title,
          body_text_sample: clean(document.body?.innerText || '').slice(0, 2500),
          link_count: document.querySelectorAll('a[href]').length,
          button_count: document.querySelectorAll('button').length,
          links,
          buttons
        };
      })()
    `
  );
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function safeUrl(value) {
  try {
    return new URL(value).href;
  } catch {
    return "";
  }
}

function normalizeUrlForCompare(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch {
    return "";
  }
}

function sanitizeFilename(value) {
  const decoded = decodeURIComponent(String(value ?? ""));
  const clean = decoded
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return (clean || "atlantic-issue").slice(0, 170);
}

function filenameFromDisposition(disposition) {
  if (!disposition) return "";
  const match =
    disposition.match(/filename\*=UTF-8''([^;]+)/i) ||
    disposition.match(/filename="?([^";]+)"?/i);
  return match ? sanitizeFilename(match[1]) : "";
}

function inferDateFromText(...values) {
  const text = values.map((value) => String(value ?? "")).join(" ");
  const iso = text.match(/(18|19|20)\d{2}[-/.](0?[1-9]|1[0-2])(?:[-/.]([0-3]?\d))?/);
  if (iso) {
    const year = iso[0].slice(0, 4);
    const month = iso[2].padStart(2, "0");
    const day = iso[3] ? iso[3].padStart(2, "0") : "";
    return day ? `${year}-${month}-${day}` : `${year}-${month}`;
  }

  const monthNames =
    "january|february|march|april|may|june|july|august|september|october|november|december";
  const month = text.match(new RegExp(`(${monthNames})\\s+([0-3]?\\d,\\s+)?((18|19|20)\\d{2})`, "i"));
  if (!month) return "";

  const monthNumber =
    monthNames.split("|").findIndex((name) => name.toLowerCase() === month[1].toLowerCase()) + 1;
  return `${month[3]}-${String(monthNumber).padStart(2, "0")}`;
}

function inferFilename(candidate, responseUrl, contentType) {
  const fromTitle = [candidate.issueDate, candidate.issueTitle || candidate.text]
    .filter(Boolean)
    .join(" ");
  const url = safeUrl(responseUrl || candidate.href);
  const fromUrl = url
    ? new URL(url).pathname.split("/").filter(Boolean).at(-1)?.replace(/\.pdf$/i, "")
    : "";
  const stem = sanitizeFilename(fromTitle || fromUrl || "atlantic-issue");
  if (/pdf/i.test(contentType) || /\.pdf(?:$|[?#])/i.test(url)) return `${stem}.pdf`;
  return `${stem}.bin`;
}

function ensurePdfFilename(filename) {
  const clean = sanitizeFilename(filename);
  return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean}.pdf`;
}

function appendManifest(manifestPath, record) {
  appendFileSync(manifestPath, `${JSON.stringify(record)}\n`, "utf8");
}

function readSuccessfulManifest(manifestPath) {
  if (!existsSync(manifestPath)) return new Set();
  const successful = new Set();
  const text = readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      if ((item.status === "downloaded" || item.status === "skipped") && item.download_url) {
        successful.add(item.download_url);
      }
    } catch {
      // Ignore damaged historical lines; the audit script will report them.
    }
  }
  return successful;
}

async function collectCandidates({ port, url, waitMs, scrollSteps, navigatePage = true, preferExisting = false }) {
  const tab = await getControllableTab(port, url || "about:blank", preferExisting);
  const client = createCdpClient(tab.webSocketDebuggerUrl);

  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    if (navigatePage && url) await navigate(client, url, waitMs);
    else await delay(waitMs);

    let loginState = await evaluate(
      client,
      `
        (() => {
          const text = document.body.innerText || '';
          return {
            href: location.href,
            title: document.title,
            likelyLogin:
              /sign in|log in|continue with|email address|password/i.test(text) &&
              !/library|magazine issues|download pdf|digital issues/i.test(text)
          };
        })()
      `
    );

    if (loginState.likelyLogin) {
      const diagnostics = await getPageDiagnostics(client);
      return { loginState, candidates: [], expanded: null, diagnostics };
    }

    const beforeExpandDiagnostics = await getPageDiagnostics(client);
    if (/page not found|404/i.test(beforeExpandDiagnostics.title || "")) {
      return {
        loginState,
        candidates: [],
        manualButtons: [],
        expanded: null,
        diagnostics: beforeExpandDiagnostics,
      };
    }

    const expanded = await expandLibrary(client, scrollSteps);
    const candidates = await evaluate(
      client,
      `
        (() => {
          const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim();
          const items = [];
          const seen = new Set();

          for (const link of Array.from(document.querySelectorAll('a[href]'))) {
            const href = new URL(link.getAttribute('href'), location.href).href;
            const text = clean([
              link.innerText,
              link.getAttribute('aria-label'),
              link.getAttribute('title')
            ].filter(Boolean).join(' '));
            const card = clean(link.closest('article, li, section, [class*="card"], [class*="issue"], div')?.innerText || text);
            const haystack = (href + ' ' + text + ' ' + card).toLowerCase();
            const path = new URL(href).pathname.toLowerCase();
            const directPdf =
              /\\.pdf(?:$|[?#])/.test(haystack) ||
              path.endsWith('.pdf') ||
              path.includes('/pdf/') ||
              path.includes('/downloads/') ||
              path.includes('/download/') ||
              haystack.includes('download pdf') ||
              haystack.includes('pdf edition') ||
              haystack.includes('download issue') ||
              haystack.includes('download magazine') ||
              haystack.includes('print edition pdf');
            const issuePage =
              !directPdf &&
              href.includes('theatlantic.com') &&
              (
                path.includes('/accounts/library') ||
                path.includes('/my-account/library') ||
                path.includes('/account/library') ||
                path.includes('/library') ||
                path.includes('/magazine/archive') ||
                path.includes('/magazine/toc') ||
                path.includes('/magazine/issues') ||
                path.includes('/issues') ||
                (path.includes('/magazine/') && /issue|magazine|view|read|digital|archive|january|february|march|april|may|june|july|august|september|october|november|december|\\b(18|19|20)\\d{2}\\b/.test(haystack))
              );

            if (!directPdf && !issuePage) continue;
            if (seen.has(href)) continue;
            seen.add(href);
            items.push({
              href,
              text: text || card.slice(0, 120),
              cardText: card.slice(0, 500),
              type: directPdf ? 'pdf' : 'issue_page',
              sourcePage: location.href
            });
          }

          const manualButtons = Array.from(document.querySelectorAll('button'))
            .map((button) => clean([
              button.innerText,
              button.getAttribute('aria-label'),
              button.getAttribute('title')
            ].filter(Boolean).join(' ')))
            .filter((text) => /pdf|download|issue/i.test(text));

          return { items, manualButtons };
        })()
      `
    );

    loginState = await evaluate(
      client,
      `(() => ({ href: location.href, title: document.title, likelyLogin: false }))()`
    );
    const diagnostics = await getPageDiagnostics(client);
    return {
      loginState,
      candidates: candidates.items ?? [],
      manualButtons: candidates.manualButtons ?? [],
      expanded,
      diagnostics,
    };
  } finally {
    client.close();
    if (tab.shouldClose) await closeTab(port, tab.id);
  }
}

async function getCookies(port) {
  const tabs = await fetchJson(`http://127.0.0.1:${port}/json`);
  const tab = tabs[0] ?? (await openTab(port, "about:blank"));
  const client = createCdpClient(tab.webSocketDebuggerUrl);
  try {
    const result = await client.send("Network.getAllCookies");
    return result.cookies ?? [];
  } finally {
    client.close();
  }
}

function cookieHeaderFor(url, cookies) {
  const target = new URL(url);
  const parts = [];

  for (const cookie of cookies) {
    const domain = String(cookie.domain ?? "").replace(/^\./, "");
    const hostMatches = target.hostname === domain || target.hostname.endsWith(`.${domain}`);
    const pathMatches = !cookie.path || target.pathname.startsWith(cookie.path);
    const secureOk = !cookie.secure || target.protocol === "https:";
    if (hostMatches && pathMatches && secureOk) {
      parts.push(`${cookie.name}=${cookie.value}`);
    }
  }

  return parts.join("; ");
}

function fileSha256(file) {
  const hash = createHash("sha256");
  const bytes = readFileSync(file);
  hash.update(bytes);
  return hash.digest("hex");
}

function hasPdfHeader(file) {
  const handle = createReadStream(file, { start: 0, end: 4 });
  return new Promise((resolveHeader) => {
    const chunks = [];
    handle.on("data", (chunk) => chunks.push(chunk));
    handle.on("end", () => resolveHeader(Buffer.concat(chunks).toString("latin1").startsWith("%PDF-")));
    handle.on("error", () => resolveHeader(false));
  });
}

async function downloadPdf({ candidate, pdfDir, cookies, overwrite }) {
  const cookie = cookieHeaderFor(candidate.href, cookies);
  const response = await fetch(candidate.href, {
    redirect: "follow",
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5",
      Referer: candidate.sourcePage || DEFAULT_LIBRARY_URL,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const dispositionName = filenameFromDisposition(response.headers.get("content-disposition"));
  const filename = ensurePdfFilename(
    dispositionName || inferFilename(candidate, response.url, contentType)
  );
  const target = resolve(pdfDir, basename(filename));

  if (existsSync(target) && !overwrite) {
    return {
      status: "skipped",
      filePath: target,
      filename: basename(target),
      bytes: statSync(target).size,
      sha256: fileSha256(target),
      contentType,
    };
  }

  if (!response.body) throw new Error("response body is empty");
  const temp = `${target}.download-${Date.now()}.tmp`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temp));

  const isPdf = await hasPdfHeader(temp);
  if (!isPdf) {
    const size = statSync(temp).size;
    rmSync(temp, { force: true });
    throw new Error(`download was not a PDF (${contentType || "unknown content type"}, ${size} bytes)`);
  }

  renameSync(temp, target);
  return {
    status: "downloaded",
    filePath: target,
    filename: basename(target),
    bytes: statSync(target).size,
    sha256: fileSha256(target),
    contentType,
  };
}

function uniqueCandidates(candidates) {
  const byHref = new Map();
  for (const candidate of candidates) {
    const href = safeUrl(candidate.href);
    if (!href || byHref.has(href)) continue;
    const issueDate = inferDateFromText(candidate.href, candidate.text, candidate.cardText);
    byHref.set(href, {
      ...candidate,
      href,
      text: normalizeText(candidate.text),
      cardText: normalizeText(candidate.cardText),
      issueTitle: normalizeText(candidate.cardText || candidate.text),
      issueDate,
    });
  }
  return [...byHref.values()];
}

function limitItems(items, max) {
  if (!max || max < 1) return items;
  return items.slice(0, max);
}

function writeReport(reportPath, report) {
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function compactDiagnostics(diagnostics) {
  if (!diagnostics) return {};
  return {
    href: diagnostics.href,
    title: diagnostics.title,
    body_text_sample: diagnostics.body_text_sample,
    link_count: diagnostics.link_count,
    button_count: diagnostics.button_count,
    links: diagnostics.links,
    buttons: diagnostics.buttons,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  mkdirSync(args.root, { recursive: true });
  mkdirSync(args.pdfDir, { recursive: true });
  mkdirSync(dirname(args.manifest), { recursive: true });
  mkdirSync(dirname(args.report), { recursive: true });
  mkdirSync(args.profileDir, { recursive: true });

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const port = 9500 + Math.floor(Math.random() * 800);
  const browserPath = findBrowser(args.chrome);
  const visible = args.visible || !args.headless;

  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${args.profileDir}`,
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-popup-blocking",
  ];
  if (!visible) chromeArgs.push("--headless=new", "--disable-gpu", "--hide-scrollbars");
  chromeArgs.push("about:blank");

  console.log(`Output root: ${args.root}`);
  console.log(`PDF dir: ${args.pdfDir}`);
  console.log(`Manifest: ${args.manifest}`);
  console.log(`Report: ${args.report}`);
  console.log(`Browser profile: ${args.profileDir}`);

  const browser = spawn(browserPath, chromeArgs, {
    detached: false,
    stdio: "ignore",
  });

  const report = {
    run_id: runId,
    started_at: startedAt,
    finished_at: "",
    library_url: args.libraryUrl,
    root: args.root,
    pdf_dir: args.pdfDir,
    manifest: args.manifest,
    direct_pdf_candidates: 0,
    issue_page_candidates: 0,
    issue_pages_scanned: 0,
    downloaded: 0,
    skipped: 0,
    failed: 0,
    dry_run: args.dryRun,
    failures: [],
    manual_buttons_seen: [],
    diagnostics: [],
  };

  try {
    await waitForChrome(port);

    let library = await collectCandidates({
      port,
      url: args.libraryUrl,
      waitMs: args.waitMs,
      scrollSteps: args.scrollSteps,
    });

    if (library.loginState?.likelyLogin) {
      if (!visible || !args.loginPrompt) {
        throw new Error("The Atlantic appears to require sign-in. Re-run with --visible.");
      }
      await waitForEnter(
        "The Atlantic is asking for sign-in. Log in in the opened browser window, then press Enter here."
      );
      library = await collectCandidates({
        port,
        url: args.libraryUrl,
        waitMs: args.waitMs,
        scrollSteps: args.scrollSteps,
      });
    }

    report.manual_buttons_seen = library.manualButtons ?? [];
    report.diagnostics.push({ stage: "library_initial", ...compactDiagnostics(library.diagnostics) });

    let firstPass = uniqueCandidates(library.candidates ?? []);

    if (
      firstPass.length === 0 &&
      visible &&
      args.interactiveRescan &&
      !args.dryRun
    ) {
      console.log("No PDF/issue links were detected automatically.");
      console.log(`Current page: ${library.diagnostics?.href || library.loginState?.href || "(unknown)"}`);
      console.log(`Title: ${library.diagnostics?.title || library.loginState?.title || "(unknown)"}`);
      await waitForEnter(
        "In the opened browser, navigate to the Library/issues page where you can see magazine PDF/download links, then press Enter here to rescan the current page."
      );
      library = await collectCandidates({
        port,
        url: "",
        waitMs: args.waitMs,
        scrollSteps: args.scrollSteps,
        navigatePage: false,
        preferExisting: true,
      });
      report.manual_buttons_seen = library.manualButtons ?? [];
      report.diagnostics.push({ stage: "library_manual_rescan", ...compactDiagnostics(library.diagnostics) });
      firstPass = uniqueCandidates(library.candidates ?? []);
    }

    const directPdfs = firstPass.filter((item) => item.type === "pdf");
    const issuePages = firstPass.filter(
      (item) =>
        item.type === "issue_page" &&
        normalizeUrlForCompare(item.href) !== normalizeUrlForCompare(args.libraryUrl) &&
        !/page not found|404/i.test(item.issueTitle || "")
    );
    report.direct_pdf_candidates = directPdfs.length;
    report.issue_page_candidates = issuePages.length;

    console.log(`Direct PDF candidates on Library: ${directPdfs.length}`);
    console.log(`Issue page candidates on Library: ${issuePages.length}`);

    const limitedIssuePages = limitItems(issuePages, args.maxIssues);
    const pdfCandidates = [...directPdfs];

    for (const [index, issue] of limitedIssuePages.entries()) {
      console.log(`[issue ${index + 1}/${limitedIssuePages.length}] scanning: ${issue.href}`);
      try {
        const issueResult = await collectCandidates({
          port,
          url: issue.href,
          waitMs: args.waitMs,
          scrollSteps: 10,
        });
        report.issue_pages_scanned += 1;
        const found = uniqueCandidates(issueResult.candidates ?? [])
          .filter((item) => item.type === "pdf")
          .map((item) => ({
            ...item,
            issueTitle: issue.issueTitle || item.issueTitle,
            issueDate: issue.issueDate || item.issueDate,
            sourcePage: issue.href,
          }));
        console.log(`  PDF links: ${found.length}`);
        pdfCandidates.push(...found);
      } catch (error) {
        report.failed += 1;
        report.failures.push({
          stage: "scan_issue_page",
          issue_page: issue.href,
          error: error.message,
        });
        console.log(`  failed: ${error.message}`);
      }

      if (index < limitedIssuePages.length - 1 && args.delayMs > 0) await delay(args.delayMs);
    }

    const uniquePdfs = limitItems(uniqueCandidates(pdfCandidates), args.maxIssues);
    const successful = readSuccessfulManifest(args.manifest);
    console.log(`Unique PDF candidates to process: ${uniquePdfs.length}`);

    if (args.dryRun) {
      for (const [index, candidate] of uniquePdfs.entries()) {
        console.log(`[${index + 1}/${uniquePdfs.length}] ${candidate.issueTitle || candidate.text}`);
        console.log(`  ${candidate.href}`);
      }
      return;
    }

    const cookies = await getCookies(port);
    for (const [index, candidate] of uniquePdfs.entries()) {
      const baseRecord = {
        run_id: runId,
        attempted_at: new Date().toISOString(),
        source: "theatlantic-library",
        issue_title: candidate.issueTitle || candidate.text || "",
        issue_date: candidate.issueDate || "",
        source_page: candidate.sourcePage || args.libraryUrl,
        download_url: candidate.href,
      };

      if (successful.has(candidate.href) && !args.overwrite) {
        const record = { ...baseRecord, status: "skipped", reason: "already_in_manifest" };
        appendManifest(args.manifest, record);
        report.skipped += 1;
        console.log(`[${index + 1}/${uniquePdfs.length}] skipped from manifest: ${candidate.href}`);
        continue;
      }

      console.log(`[${index + 1}/${uniquePdfs.length}] downloading: ${candidate.issueTitle || candidate.href}`);
      try {
        const result = await downloadPdf({
          candidate,
          pdfDir: args.pdfDir,
          cookies,
          overwrite: args.overwrite,
        });
        appendManifest(args.manifest, { ...baseRecord, ...result });
        if (result.status === "downloaded") report.downloaded += 1;
        else report.skipped += 1;
        console.log(`  ${result.status}: ${result.filePath}`);
      } catch (error) {
        const record = { ...baseRecord, status: "failed", error: error.message };
        appendManifest(args.manifest, record);
        report.failed += 1;
        report.failures.push(record);
        console.log(`  failed: ${error.message}`);
      }

      if (index < uniquePdfs.length - 1 && args.delayMs > 0) await delay(args.delayMs);
    }
  } finally {
    report.finished_at = new Date().toISOString();
    writeReport(args.report, report);
    if (!args.keepBrowserOpen) browser.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
