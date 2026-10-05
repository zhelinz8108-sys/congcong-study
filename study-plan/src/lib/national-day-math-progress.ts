"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadCloudState } from "@/lib/cloud-progress";

export type NationalDayMathAttempt = {
  value: string;
  checked: boolean;
  correct: boolean | null;
  selfRated?: boolean;
  gradingVersion?: 2;
};

export type NationalDayMathProgress = {
  attempts: Record<string, NationalDayMathAttempt>;
  completedSections: string[];
  lastSection: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200 &&
    !["__proto__", "constructor", "prototype"].includes(value);
}

export function createEmptyNationalDayMathProgress(): NationalDayMathProgress {
  return { attempts: {}, completedSections: [], lastSection: "" };
}

export function normalizeNationalDayMathProgress(value: unknown): NationalDayMathProgress {
  const record = isRecord(value) ? value : {};
  const attempts: Record<string, NationalDayMathAttempt> = {};
  if (isRecord(record.attempts)) {
    for (const [id, attempt] of Object.entries(record.attempts)) {
      if (!validId(id) || !isRecord(attempt) || typeof attempt.value !== "string") continue;
      const checked = attempt.checked === true;
      attempts[id] = {
        value: attempt.value,
        checked,
        correct: checked && typeof attempt.correct === "boolean" ? attempt.correct : null,
        ...(checked && attempt.selfRated === true ? { selfRated: true } : {}),
        ...(checked && attempt.gradingVersion === 2 && attempt.selfRated !== true ? { gradingVersion: 2 as const } : {}),
      };
    }
  }
  return {
    attempts,
    completedSections: Array.isArray(record.completedSections)
      ? [...new Set(record.completedSections.filter(validId))] : [],
    lastSection: validId(record.lastSection) ? record.lastSection : "",
  };
}

export function getNationalDayMathProgressScope(subjectId: string) {
  if (!/^[a-z0-9][a-z0-9_-]{0,95}$/i.test(subjectId)) {
    throw new Error("Invalid mathematics subject ID");
  }
  return `math:national-day:${subjectId}:v1`;
}

export function createNationalDayMathCloudRequest(progress: NationalDayMathProgress) {
  const body = JSON.stringify({ payload: progress });
  // The browser's shared keepalive budget is 64 KiB. Large drafts must use a
  // normal request, not a keepalive request that is silently rejected.
  return { body, keepalive: new TextEncoder().encode(body).byteLength < 60 * 1024 };
}

type PlannedWrite = { body: string; keepalive: boolean; timer: ReturnType<typeof setTimeout> };
const plannedWrites = new Map<string, PlannedWrite>();
const pendingWrites = new Map<string, Promise<void>>();

export function flushNationalDayMathProgress(scope: string): Promise<void> {
  const planned = plannedWrites.get(scope);
  if (!planned) return pendingWrites.get(scope) ?? Promise.resolve();
  clearTimeout(planned.timer);
  plannedWrites.delete(scope);
  const previous = pendingWrites.get(scope) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const response = await fetch(`/api/progress/${encodeURIComponent(scope)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: planned.body,
        cache: "no-store",
        keepalive: planned.keepalive,
      });
      if (!response.ok) throw new Error(`Mathematics progress save failed: ${response.status}`);
    })
    .catch(() => undefined)
    .finally(() => {
      if (pendingWrites.get(scope) === next) pendingWrites.delete(scope);
    });
  pendingWrites.set(scope, next);
  return next;
}

export function saveNationalDayMathProgressState(
  scope: string,
  storageKey: string,
  progress: NationalDayMathProgress,
) {
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(storageKey, JSON.stringify(progress)); }
    catch { /* Private browsing or a full local cache must not prevent cloud saves. */ }
  }
  const old = plannedWrites.get(scope);
  if (old) clearTimeout(old.timer);
  const request = createNationalDayMathCloudRequest(progress);
  const timer = setTimeout(() => { void flushNationalDayMathProgress(scope); }, 350);
  plannedWrites.set(scope, { ...request, timer });
}

type Mutation = (current: NationalDayMathProgress) => NationalDayMathProgress;
type Session = {
  scope: string;
  value: NationalDayMathProgress;
  ready: boolean;
  pending: Mutation[];
};

/** All sections share one profile-scoped cloud payload and its local mirror. */
export function useNationalDayMathProgress(subjectId: string, sectionId?: string) {
  const scope = getNationalDayMathProgressScope(subjectId);
  const storageKey = `study-plan-${scope}`;
  const empty = createEmptyNationalDayMathProgress();
  const [snapshot, setSnapshot] = useState({ scope, progress: empty, ready: false });
  const session = useRef<Session | null>(null);

  useEffect(() => {
    let active = true;
    const current: Session = {
      scope, value: createEmptyNationalDayMathProgress(), ready: false, pending: [],
    };
    session.current = current;
    // Chapter navigation unmounts the previous reader. Finish its queued save
    // before fetching, so a just-submitted result cannot be replaced by stale cloud state.
    void flushNationalDayMathProgress(scope).then(() => loadCloudState<NationalDayMathProgress>(scope, storageKey, current.value)).then((loaded) => {
      if (!active) return;
      let next = normalizeNationalDayMathProgress(loaded);
      for (const mutation of current.pending) next = mutation(next);
      const editedWhileLoading = current.pending.length > 0;
      current.pending = [];
      current.value = next;
      current.ready = true;
      setSnapshot({ scope, progress: next, ready: true });
      if (editedWhileLoading) saveNationalDayMathProgressState(scope, storageKey, next);
    });
    const flush = () => { void flushNationalDayMathProgress(scope); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [scope, storageKey]);

  const mutate = useCallback((mutation: Mutation) => {
    const current = session.current;
    if (!current || current.scope !== scope) return;
    const next = mutation(current.value);
    current.value = next;
    setSnapshot({ scope, progress: next, ready: current.ready });
    // Replay early edits on the fetched payload rather than overwriting it.
    if (!current.ready) current.pending.push(mutation);
    else saveNationalDayMathProgressState(scope, storageKey, next);
  }, [scope, storageKey]);

  const recordAttempt = useCallback((questionId: string, attempt: NationalDayMathAttempt, id?: string) => {
    if (!validId(questionId)) return;
    const normalized = normalizeNationalDayMathProgress({ attempts: { [questionId]: attempt } }).attempts[questionId];
    if (!normalized) return;
    mutate((current) => ({
      ...current,
      attempts: { ...current.attempts, [questionId]: normalized },
      ...(validId(id) ? { lastSection: id } : {}),
    }));
  }, [mutate]);

  const saveDraft = useCallback((questionId: string, value: string, id?: string) => {
    if (!validId(questionId)) return;
    mutate((current) => ({
      ...current,
      attempts: {
        ...current.attempts,
        [questionId]: { value, checked: false, correct: null },
      },
      ...(validId(id) ? { lastSection: id } : {}),
    }));
  }, [mutate]);

  const completeSection = useCallback((id: string) => {
    if (!validId(id)) return;
    mutate((current) => ({
      ...current,
      completedSections: [...new Set([...current.completedSections, id])],
      lastSection: id,
    }));
  }, [mutate]);

  const setLastSection = useCallback((id: string) => {
    if (!validId(id)) return;
    mutate((current) => current.lastSection === id ? current : { ...current, lastSection: id });
  }, [mutate]);

  useEffect(() => {
    if (sectionId) setLastSection(sectionId);
  }, [sectionId, setLastSection]);

  const ready = snapshot.scope === scope && snapshot.ready;
  const progress = snapshot.scope === scope ? snapshot.progress : empty;
  return {
    progress, ready, recordAttempt, saveDraft, completeSection,
    setLastSection, rememberSection: setLastSection,
  };
}
