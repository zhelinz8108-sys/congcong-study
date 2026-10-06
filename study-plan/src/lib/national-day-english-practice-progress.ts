"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EnglishPracticeFeedback, EnglishPracticeLetter } from "./national-day-english-practice-types";
import {
  emptyEnglishPracticeProgress,
  englishPracticeScope,
  normalizeEnglishPracticeLocation,
  normalizeEnglishPracticeProgress,
  recordEnglishPracticeFeedback,
  validEnglishPracticeId,
  validEnglishPracticeLetter,
  type EnglishPracticeLocation,
  type EnglishPracticeProgress,
} from "./national-day-english-practice-progress-state";

export { normalizeEnglishPracticeProgress } from "./national-day-english-practice-progress-state";
export type { EnglishPracticeAttempt, EnglishPracticeLocation, EnglishPracticeProgress } from "./national-day-english-practice-progress-state";
export type EnglishPracticeSync = "loading" | "synced" | "saving" | "offline";

// Serialize writes across chapter-page mounts so a slower old request cannot overwrite a newer draft.
const queues = new Map<string, Promise<void>>();

export function useEnglishPracticeProgress(subjectId: string) {
  const scope = englishPracticeScope(subjectId);
  const storageKey = `study-plan-${scope}`;
  const [progress, setProgress] = useState<EnglishPracticeProgress>(emptyEnglishPracticeProgress);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<EnglishPracticeSync>("loading");
  const current = useRef(emptyEnglishPracticeProgress());
  const readyRef = useRef(false);
  const active = useRef(false);
  const generation = useRef(0);
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readController = useRef<AbortController | null>(null);
  const readNumber = useRef(0);

  const mirror = useCallback((value: EnglishPracticeProgress) => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); }
    catch { /* The in-memory and cloud copies remain usable when local storage is unavailable. */ }
  }, [storageKey]);

  const push = useCallback((value: EnglishPracticeProgress) => {
    // An unsuccessful initial read must never result in an empty cloud overwrite.
    if (!value.updatedAt) return Promise.resolve();
    const body = JSON.stringify({ payload: normalizeEnglishPracticeProgress(value) });
    const epoch = generation.current;
    if (active.current) setSync("saving");
    const next = (queues.get(scope) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      const response = await fetch(`/api/progress/${encodeURIComponent(scope)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body,
        cache: "no-store", keepalive: new TextEncoder().encode(body).length < 60000,
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Progress sync failed");
    });
    queues.set(scope, next);
    void next.then(() => {
      if (active.current && generation.current === epoch && current.current.updatedAt === value.updatedAt) setSync("synced");
    }, () => {
      if (active.current && generation.current === epoch && current.current.updatedAt === value.updatedAt) setSync("offline");
    }).finally(() => { if (queues.get(scope) === next) queues.delete(scope); });
    return next;
  }, [scope]);

  const refresh = useCallback(async () => {
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const epoch = generation.current;
    const number = ++readNumber.current;
    const edited = revision.current;
    const timeout = setTimeout(() => controller.abort(), 15000);
    let remote: EnglishPracticeProgress | undefined;
    try {
      await queues.get(scope)?.catch(() => undefined);
      if (controller.signal.aborted) throw new Error("Progress read cancelled");
      const response = await fetch(`/api/progress/${encodeURIComponent(scope)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Progress load failed");
      const result = await response.json() as { payload?: unknown };
      remote = normalizeEnglishPracticeProgress(result.payload);
    } catch { /* Keep the local copy and allow offline work. */ }
    finally { clearTimeout(timeout); }
    if (!active.current || generation.current !== epoch || readNumber.current !== number) return;
    let loaded = current.current;
    const localNewer = !!remote && (Date.parse(loaded.updatedAt) || 0) > (Date.parse(remote.updatedAt) || 0);
    const editedDuringRead = revision.current !== edited;
    if (remote && !localNewer && !editedDuringRead) loaded = remote;
    current.current = loaded;
    setProgress(loaded);
    readyRef.current = true;
    setReady(true);
    setSync(remote ? "synced" : "offline");
    mirror(loaded);
    // Retry first reads the server; an old offline copy must not erase newer progress from another device.
    if (remote && (localNewer || editedDuringRead)) void push(loaded).catch(() => undefined);
  }, [mirror, push, scope]);

  const flush = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    void push(current.current).catch(() => undefined);
  }, [push]);

  useEffect(() => {
    active.current = true;
    ++generation.current;
    readyRef.current = false;
    revision.current = 0;
    // Run initialization asynchronously to keep render pure, including subject changes and Strict Mode re-mounts.
    const epoch = generation.current;
    void Promise.resolve().then(() => {
      if (!active.current || generation.current !== epoch) return;
      let local = emptyEnglishPracticeProgress();
      try { local = normalizeEnglishPracticeProgress(JSON.parse(localStorage.getItem(storageKey) ?? "null")); }
      catch { /* Empty local mirror. */ }
      current.current = local;
      setProgress(local);
      setReady(false);
      setSync("loading");
      void refresh();
    });
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    const online = () => { if (readyRef.current) void refresh(); };
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      active.current = false;
      generation.current = epoch + 1;
      readyRef.current = false;
      readController.current?.abort();
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [storageKey, refresh, flush]);

  const mutate = useCallback((update: (value: EnglishPracticeProgress, at: string) => EnglishPracticeProgress) => {
    if (!active.current || !readyRef.current) return;
    const at = new Date(Math.max(Date.now(), (Date.parse(current.current.updatedAt) || 0) + 1)).toISOString();
    const updated = update(current.current, at);
    if (updated === current.current) return;
    const next = { ...updated, updatedAt: at };
    ++revision.current;
    current.current = next;
    setProgress(next);
    mirror(next);
    setSync("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void push(current.current).catch(() => undefined); }, 400);
  }, [mirror, push]);

  const draft = useCallback((id: string, letter: EnglishPracticeLetter) => {
    if (!validEnglishPracticeId(id) || !validEnglishPracticeLetter(letter)) return;
    mutate((value) => value.drafts[id] === letter ? value : {
      ...value, drafts: { ...value.drafts, [id]: letter },
      location: { chapter: id.slice(0, 4), page: Math.ceil(Number(id.slice(-3)) / 10), id },
    });
  }, [mutate]);
  const record = useCallback((feedback: EnglishPracticeFeedback) => {
    mutate((value, at) => recordEnglishPracticeFeedback(value, feedback, at));
  }, [mutate]);
  const locate = useCallback((input: EnglishPracticeLocation) => {
    const location = normalizeEnglishPracticeLocation(input);
    if (!location) return;
    mutate((value) => JSON.stringify(value.location) === JSON.stringify(location) ? value : { ...value, location });
  }, [mutate]);
  const retry = useCallback(() => {
    if (!active.current || !readyRef.current) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    void refresh();
  }, [refresh]);
  return { progress, ready, sync, draft, record, locate, retry };
}
