"use client";

const activeKey = "study:active-practice-round:v1";
const pendingPrefix = "study:finish-practice-round:";
type ActiveRound = { path: string; id: string };
let active: ActiveRound | null = null;
const closing = new Set<string>();
const pending = new Set<string>();
const saves = new Map<string, Set<Promise<Response>>>();

function activeRound() {
  if (!active) try { active = JSON.parse(sessionStorage.getItem(activeKey) ?? "null"); } catch { /* Storage is optional. */ }
  return active;
}
function remember(round: ActiveRound | null) {
  active = round;
  try { if (round) sessionStorage.setItem(activeKey, JSON.stringify(round)); else sessionStorage.removeItem(activeKey); } catch { /* Use memory. */ }
}
function signal(round: string, action: "finish" | "active") {
  return fetch("/api/practice-round", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round, action }), keepalive: true, cache: "no-store" });
}
async function sendFinish(id: string) {
  if (closing.has(id)) return;
  closing.add(id);
  try {
    await Promise.allSettled([...(saves.get(id) ?? [])]);
    if (!(await signal(id, "finish")).ok) return;
    pending.delete(id);
    try { localStorage.removeItem(pendingPrefix + id); } catch { /* Use memory. */ }
  } catch { /* Retry when online, or let the server close an abandoned round. */ }
  finally { closing.delete(id); }
}
export function finishPracticeRound(id = activeRound()?.id) {
  if (!id || activeRound()?.id !== id) return;
  remember(null);
  pending.add(id);
  try { localStorage.setItem(pendingPrefix + id, "1"); } catch { /* Use memory. */ }
  void sendFinish(id);
}
export function visitPracticePath(path: string) {
  const current = activeRound();
  if (current && current.path !== path) finishPracticeRound(current.id);
  retryPracticeFinishes();
}
export function retryPracticeFinishes() {
  try {
    for (let i=0; i<localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(pendingPrefix)) pending.add(key.slice(pendingPrefix.length));
    }
  } catch { /* In-memory entries remain available. */ }
  for (const id of pending) void sendFinish(id);
}
export function keepPracticeRoundActive() {
  const current = activeRound();
  if (current && document.visibilityState === "visible") void signal(current.id, "active").catch(() => {});
  retryPracticeFinishes();
}
export function submitInPracticeRound(url: string, init: RequestInit, session?: string | null) {
  const previous = activeRound(), path = location.pathname;
  const id = session ?? (previous?.path === path ? previous.id : crypto.randomUUID());
  if (previous && (previous.id !== id || previous.path !== path)) finishPracticeRound(previous.id);
  remember({ path, id });
  const headers = new Headers(init.headers);
  headers.set("X-Practice-Round", id);
  const requests = saves.get(id) ?? new Set<Promise<Response>>();
  const request = fetch(url, { ...init, headers });
  requests.add(request); saves.set(id, requests);
  const settled = () => { requests.delete(request); if (!requests.size) saves.delete(id); };
  void request.then(settled, settled);
  return request;
}
