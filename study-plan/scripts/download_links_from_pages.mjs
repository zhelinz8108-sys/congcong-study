import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125 Safari/537.36";

function usage() {
  console.log(`
Find and download official PDF/download links from user-provided pages.

This tool only opens pages you list. It does not crawl an archive, bypass login,
or scrape article text. Use it for pages where your account is allowed to see
official PDF/download links.

Usage:
  node scripts/download_links_from_pages.mjs --pages pages.txt --out-dir downloads/issues

Options:
  --pages <file>          UTF-8 text file. One page URL per line.
  --out-dir <folder>      Output folder. Default: downloads/direct-files
  --chrome <path>         Chrome/Edge executable path. Optional.
  --profile-dir <path>    Browser profile folder. Default: .chrome-download-profile
  --visible               Open visible Chrome. Use this first to log in.
  --keep-browser-open     Keep Chrome open when finished.
  --overwrite             Replace existing files.
  --wait-ms <number>      Wait after page load. Default: 4000
  --delay-ms <number>     Delay between pages/files. Default: 1500
  --max-links <number>    Max candidate links per page. Default: 30
  --same-host-only        Keep only links on the same hostname as the page.
  --dry-run               Print candidate links without downloading.
  --help                  Show this help.

First-login tip:
  1. Run once with --visible and one Library/issue page.
  2. Log in inside the opened browser window.
  3. Run again without --visible using the same --profile-dir.
`);
}

function parseArgs(argv) {
  const args = {
    pages: "",
    outDir: "downloads/direct-files",
    chrome: "",
    profileDir: ".chrome-download-profile",
    visible: false,
    keepBrowserOpen: false,
    overwrite: false,
    waitMs: 4000,
    delayMs: 1500,
    maxLinks: 30,
    sameHostOnly: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = () => argv[++index] ?? "";
    if (key === "--pages") args.pages = next();
    else if (key === "--out-dir") args.outDir = next();
    else if (key === "--chrome") args.chrome = next();
    else if (key === "--profile-dir") args.profileDir = next();
    else if (key === "--visible") args.visible = true;
    else if (key === "--keep-browser-open") args.keepBrowserOpen = true;
    else if (key === "--overwrite") args.overwrite = true;
    else if (key === "--wait-ms") args.waitMs = Number(next());
    else if (key === "--delay-ms") args.delayMs = Number(next());
    else if (key === "--max-links") args.maxLinks = Number(next());
    else if (key === "--same-host-only") args.sameHostOnly = true;
    else if (key === "--dry-run") args.dryRun = true;
    else if (key === "--help" || key === "-h") args.help = true;
    else throw new Error(`Unknown option: ${key}`);
  }

  return args;
}

function readPages(file) {
  return readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function sanitizeFilename(value) {
  const decoded = decodeURIComponent(value);
  const clean = decoded
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return (clean || "download").slice(0, 170);
}

function filenameFromUrl(url) {
  const parsed = new URL(url);
  const last = parsed.pathname.split("/").filter(Boolean).at(-1) || parsed.hostname;
  const stem = last.includes(".") ? last.replace(/\.[^.]+$/, "") : last;
  return `${sanitizeFilename(stem)}.pdf`;
}

function filenameFromDisposition(disposition) {
  if (!disposition) return "";
  const match =
    disposition.match(/filename\*=UTF-8''([^;]+)/i) ||
    disposition.match(/filename="?([^";]+)"?/i);
  return match ? sanitizeFilename(match[1]) : "";
}

function ensurePdfExtension(filename, contentType) {
  if (/\.[a-z0-9]{2,6}$/i.test(filename)) return filename;
  if (/pdf/i.test(contentType)) return `${filename}.pdf`;
  return `${filename}.bin`;
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
  const deadline = Date.now() + 15000;
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

async function closeTab(port, id) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/close/${id}`);
  } catch {
    // Best effort.
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

async function loadPageAndFindLinks({ port, pageUrl, waitMs, maxLinks, sameHostOnly }) {
  const tab = await openTab(port, pageUrl);
  const client = createCdpClient(tab.webSocketDebuggerUrl);

  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    const loaded = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: pageUrl });
    await Promise.race([loaded, delay(Math.max(waitMs, 6000))]);
    await delay(waitMs);

    await client.send("Runtime.evaluate", {
      awaitPromise: true,
      expression: `
        new Promise((resolve) => {
          let steps = 0;
          const timer = setInterval(() => {
            window.scrollBy(0, Math.max(500, window.innerHeight * 0.9));
            steps += 1;
            if (steps > 12 || window.scrollY + window.innerHeight >= document.body.scrollHeight - 2) {
              clearInterval(timer);
              setTimeout(() => {
                window.scrollTo(0, 0);
                resolve(true);
              }, 400);
            }
          }, 140);
        })
      `,
    });

    const result = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `
        (() => {
          const pageHost = location.hostname;
          const candidates = Array.from(document.querySelectorAll('a[href]'))
            .map((link) => {
              const href = new URL(link.getAttribute('href'), location.href).href;
              const text = (link.innerText || link.getAttribute('aria-label') || '').trim();
              const lower = (href + ' ' + text).toLowerCase();
              const looksDownload =
                /\\.pdf(?:$|[?#])/.test(lower) ||
                lower.includes('/pdf') ||
                lower.includes('download') ||
                lower.includes('print edition') ||
                lower.includes('view this issue');
              return { href, text, pageHost, host: new URL(href).hostname, looksDownload };
            })
            .filter((item) => item.looksDownload)
            .filter((item) => ${sameHostOnly ? "item.host === item.pageHost" : "true"});

          const seen = new Set();
          return candidates
            .filter((item) => {
              if (seen.has(item.href)) return false;
              seen.add(item.href);
              return true;
            })
            .slice(0, ${Number(maxLinks) || 30});
        })()
      `,
    });

    return result.result.value ?? [];
  } finally {
    client.close();
    await closeTab(port, tab.id);
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

async function downloadFile({ url, outDir, suggestedName, cookies, overwrite }) {
  const cookie = cookieHeaderFor(url, cookies);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const dispositionName = filenameFromDisposition(response.headers.get("content-disposition"));
  const contentType = response.headers.get("content-type") ?? "";
  const filename = ensurePdfExtension(
    dispositionName || suggestedName || filenameFromUrl(response.url || url),
    contentType
  );
  const target = resolve(outDir, basename(filename));

  if (existsSync(target) && !overwrite) {
    return { status: "skipped", target };
  }

  if (!response.body) throw new Error("response body is empty");
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  return { status: "downloaded", target };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.pages) throw new Error("Missing --pages <file>.");

  const pages = readPages(args.pages);
  if (pages.length === 0) throw new Error(`No page URLs found in ${args.pages}.`);

  const outDir = resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });

  console.log(`Found ${pages.length} page URL(s). Output: ${outDir}`);

  const port = 9333 + Math.floor(Math.random() * 1000);
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
    const allLinks = [];

    for (const [pageIndex, pageUrl] of pages.entries()) {
      console.log(`[page ${pageIndex + 1}/${pages.length}] scanning: ${pageUrl}`);
      const links = await loadPageAndFindLinks({
        port,
        pageUrl,
        waitMs: args.waitMs,
        maxLinks: args.maxLinks,
        sameHostOnly: args.sameHostOnly,
      });
      console.log(`  candidate link(s): ${links.length}`);
      allLinks.push(...links.map((link) => ({ ...link, sourcePage: pageUrl })));
      if (pageIndex < pages.length - 1 && args.delayMs > 0) await delay(args.delayMs);
    }

    const unique = [];
    const seen = new Set();
    for (const link of allLinks) {
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      unique.push(link);
    }

    if (args.dryRun) {
      unique.forEach((link, index) => {
        console.log(`[${index + 1}/${unique.length}] ${link.text || "(no text)"}`);
        console.log(`  ${link.href}`);
      });
      return;
    }

    const cookies = await getCookies(port);
    for (const [index, link] of unique.entries()) {
      console.log(`[file ${index + 1}/${unique.length}] ${link.text || link.href}`);
      try {
        const result = await downloadFile({
          url: link.href,
          outDir,
          suggestedName: link.text ? `${sanitizeFilename(link.text)}.pdf` : "",
          cookies,
          overwrite: args.overwrite,
        });
        console.log(`  ${result.status}: ${result.target}`);
      } catch (error) {
        console.log(`  failed: ${error.message}`);
      }
      if (index < unique.length - 1 && args.delayMs > 0) await delay(args.delayMs);
    }
  } finally {
    if (!args.keepBrowserOpen) browser.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
