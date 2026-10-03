"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HolidayFeedback,
  HolidayStudentAnswer,
} from "./holiday-math-700-types";
export type HolidayAttempt = {
  correct: boolean;
  score: number;
  maxScore: number;
  submissions: number;
  wrongCount: number;
  hinted: boolean;
  updatedAt: string;
};
export type HolidayProgress = {
  updatedAt: string;
  drafts: Record<string, HolidayStudentAnswer>;
  attempts: Record<string, HolidayAttempt>;
  location: {
    chapter: string;
    difficulty: string;
    type: string;
    page: number;
    id: string;
  };
};
const empty = (): HolidayProgress => ({
  updatedAt: "",
  drafts: {},
  attempts: {},
  location: { chapter: "CH01", difficulty: "", type: "", page: 1, id: "" },
});
const validId = (id: string) =>
  /^M6A_CH0[1-7]_Q(?:00[1-9]|0[1-9]\d|100)$/.test(id);
const queues = new Map<string, Promise<void>>();
export function normalizeHolidayProgress(raw: unknown): HolidayProgress {
  const value =
    raw && typeof raw === "object" ? (raw as Partial<HolidayProgress>) : {};
  const result = empty();
  if (
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt))
  )
    result.updatedAt = value.updatedAt;
  for (const [id, draft] of Object.entries(value.drafts ?? {}))
    if (
      validId(id) &&
      draft !== undefined &&
      JSON.stringify(draft).length <= 12000
    )
      result.drafts[id] = draft;
  for (const [id, a] of Object.entries(value.attempts ?? {}))
    if (
      validId(id) &&
      a &&
      typeof a.correct === "boolean" &&
      Number.isInteger(a.score) &&
      Number.isInteger(a.maxScore) &&
      a.score >= 0 &&
      a.maxScore > 0 &&
      a.score <= a.maxScore
    ) {
      result.attempts[id] = {
        correct: a.correct,
        score: a.score,
        maxScore: a.maxScore,
        submissions: Math.max(1, Number(a.submissions) || 1),
        wrongCount: Math.max(0, Number(a.wrongCount) || 0),
        hinted: a.hinted === true,
        updatedAt: typeof a.updatedAt === "string" ? a.updatedAt : "",
      };
    }
  const l = value.location;
  if (l && /^CH0[1-7]$/.test(l.chapter))
    result.location = {
      chapter: l.chapter,
      difficulty: ["easy", "hard", "extreme"].includes(l.difficulty)
        ? l.difficulty
        : "",
      type: typeof l.type === "string" ? l.type : "",
      page: Number.isInteger(l.page) && l.page > 0 ? l.page : 1,
      id: validId(l.id) ? l.id : "",
    };
  return result;
}
export function useHolidayMathProgress(subjectId: string) {
  const scope = `math:holiday700:${subjectId}:v1`,
    key = `study-plan-${scope}`;
  const [progress, setProgress] = useState<HolidayProgress>(empty);
  const [ready, setReady] = useState(false),
    [sync, setSync] = useState<"loading" | "saving" | "saved" | "offline">(
      "loading",
    );
  const current = useRef<HolidayProgress>(empty()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    active = useRef(false);
  const push = useCallback(
    (value: HolidayProgress) => {
      const body = JSON.stringify({ payload: value });
      setSync("saving");
      const next = (queues.get(scope) ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch(
            `/api/progress/${encodeURIComponent(scope)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body,
              cache: "no-store",
              keepalive: new TextEncoder().encode(body).length < 60000,
              signal: AbortSignal.timeout(15000),
            },
          );
          if (!response.ok) throw new Error("sync failed");
        });
      queues.set(scope, next);
      void next
        .then(
          () => {
            if (active.current) setSync("saved");
          },
          () => {
            if (active.current) setSync("offline");
          },
        )
        .finally(() => {
          if (queues.get(scope) === next) queues.delete(scope);
        });
      return next;
    },
    [scope],
  );
  const mutate = useCallback(
    (update: (value: HolidayProgress) => HolidayProgress) => {
      const next = {
        ...update(current.current),
        updatedAt: new Date().toISOString(),
      };
      current.current = next;
      setProgress(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Cloud saves remain available if local storage is full. */
      }
      setSync("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void push(current.current).catch(() => undefined);
      }, 400);
    },
    [key, push],
  );
  useEffect(() => {
    active.current = true;
    let alive = true;
    let local = empty();
    try {
      local = normalizeHolidayProgress(
        JSON.parse(localStorage.getItem(key) ?? "null"),
      );
    } catch {
      /* Empty local mirror. */
    }
    void (async () => {
      let loaded = local,
        status: "saved" | "offline" = "offline";
      let restoreLocal = false;
      try {
        await queues.get(scope)?.catch(() => undefined);
        const response = await fetch(
          `/api/progress/${encodeURIComponent(scope)}`,
          { cache: "no-store", signal: AbortSignal.timeout(15000) },
        );
        if (response.ok) {
          const result = await response.json();
          const remote = result.payload
            ? normalizeHolidayProgress(result.payload)
            : empty();
          restoreLocal =
            (Date.parse(local.updatedAt) || 0) >
            (Date.parse(remote.updatedAt) || 0);
          loaded = restoreLocal ? local : remote;
          status = "saved";
        }
      } catch {
        /* Keep existing local drafts when offline. */
      }
      if (!alive) return;
      current.current = loaded;
      setProgress(loaded);
      setReady(true);
      setSync(status);
      try {
        localStorage.setItem(key, JSON.stringify(loaded));
      } catch {
        /* No loss of in-memory state. */
      }
      // An unsynced offline draft must not be replaced by an older cloud copy.
      if (restoreLocal) void push(loaded).catch(() => undefined);
    })();
    function flush() {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void push(current.current).catch(() => undefined);
      }
    }
    function hidden() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      alive = false;
      active.current = false;
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [key, scope, push]);
  const draft = useCallback(
    (id: string, value: HolidayStudentAnswer) =>
      mutate((p) => ({
        ...p,
        drafts: { ...p.drafts, [id]: value },
        location: { ...p.location, id },
      })),
    [mutate],
  );
  const record = useCallback(
    (result: HolidayFeedback, hinted: boolean) =>
      mutate((p) => {
        const old = p.attempts[result.question_id];
        return {
          ...p,
          attempts: {
            ...p.attempts,
            [result.question_id]: {
              correct: result.correct,
              score: result.score,
              maxScore: result.maxScore,
              submissions: (old?.submissions ?? 0) + 1,
              wrongCount: (old?.wrongCount ?? 0) + (result.correct ? 0 : 1),
              hinted,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }),
    [mutate],
  );
  const locate = useCallback(
    (location: HolidayProgress["location"]) =>
      mutate((p) => ({ ...p, location })),
    [mutate],
  );
  return {
    progress,
    ready,
    sync,
    draft,
    record,
    locate,
    retry: () => void push(current.current).catch(() => undefined),
  };
}
