"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BankAnswers, BankFeedback, BankProgress, BankResponse } from "./grade6-bank-types";

const blank = (): BankProgress => ({ responses: {}, lastQuestionId: "", updatedAt: "" });
const validRevision = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 2147483647;
// The server trims each field and fills omitted draft fields with "". Those
// canonicalizations are not other-device edits and must not create conflicts.
const sameAnswers = (a: BankAnswers, b: BankAnswers) => [...new Set([...Object.keys(a), ...Object.keys(b)])].every((id) => (a[id] ?? "").trim() === (b[id] ?? "").trim());
type Conflict = { revision: number; acknowledged: boolean };
type LocalSnapshot = BankProgress & { dirtyQuestionIds?: string[]; conflicts?: Record<string, Conflict> };
const conflictMessage = "这道题的云端记录已在其他页面更新。本机答案已保留，这次没有覆盖云端；确认要使用本机答案后，请再次手动点“提交答案”。";

export function normalizeBankProgress(raw: unknown): BankProgress {
  const result = blank();
  if (!raw || typeof raw !== "object") return result;
  const value = raw as Partial<BankProgress>;
  for (const [id, record] of Object.entries(value.responses ?? {})) {
    if (!/^[a-z0-9_-]{1,100}$/i.test(id) || !record || typeof record !== "object") continue;
    const answers: BankAnswers = {};
    for (const [field, answer] of Object.entries(record.answers ?? {})) if (field !== "__proto__" && typeof answer === "string" && answer.length <= 3000) answers[field] = answer;
    const outcome = ["correct", "incorrect", "review", "missing"].includes(record.outcome ?? "") ? record.outcome : null;
    result.responses[id] = {
      answers, submitted: record.submitted === true && outcome !== null, outcome,
      score: typeof record.score === "number" ? record.score : null,
      maxScore: Math.max(0, Number(record.maxScore) || 0), submissions: Math.max(0, Number(record.submissions) || 0),
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "", revision: validRevision(record.revision) ? record.revision : 0,
      ...(validRevision(record.baseRevision) ? { baseRevision: record.baseRevision } : {}),
    };
  }
  result.lastQuestionId = typeof value.lastQuestionId === "string" ? value.lastQuestionId : "";
  result.updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : "";
  return result;
}

export function useGrade6BankProgress(subjectId: string) {
  const key = "study-plan-grade6-bank-v1:" + subjectId;
  const [progress, setProgress] = useState<BankProgress>(blank), [ready, setReady] = useState(false);
  const [sync, setSync] = useState<"loading" | "saved" | "saving" | "offline" | "conflict">("loading");
  const state = useRef<BankProgress>(blank()), alive = useRef(false), scope = useRef(0);
  const dirty = useRef(new Set<string>()), failed = useRef(new Set<string>()), conflicts = useRef(new Map<string, Conflict>());
  const server = useRef(new Map<string, BankResponse>()), edits = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>()), queue = useRef<Promise<void>>(Promise.resolve());

  const mirror = useCallback((next: BankProgress) => {
    state.current = next;
    if (alive.current) setProgress(next);
    const cached: LocalSnapshot = { ...next, dirtyQuestionIds: [...dirty.current], conflicts: Object.fromEntries(conflicts.current) };
    try { localStorage.setItem(key, JSON.stringify(cached)); } catch { /* Memory and dirty revisions remain available. */ }
  }, [key]);
  const remember = useCallback((questionId: string, response: BankResponse) => {
    mirror({ responses: { ...state.current.responses, [questionId]: response }, lastQuestionId: questionId, updatedAt: response.updatedAt });
  }, [mirror]);
  const status = useCallback(() => {
    if (alive.current) setSync(conflicts.current.size ? "conflict" : failed.current.size ? "offline" : dirty.current.size ? "saving" : "saved");
  }, []);
  const keepConflict = useCallback((questionId: string, response: BankResponse, acknowledged: boolean) => {
    const old = state.current.responses[questionId];
    server.current.set(questionId, response);
    conflicts.current.set(questionId, { revision: response.revision, acknowledged });
    dirty.current.add(questionId); failed.current.delete(questionId);
    remember(questionId, {
      ...response, answers: old?.answers ?? {}, submitted: false, outcome: null, score: null, maxScore: 0,
      baseRevision: acknowledged ? response.revision : old?.baseRevision ?? old?.revision ?? 0,
    });
    status();
  }, [remember, status]);
  const accept = useCallback((questionId: string, saved: BankResponse, answers: BankAnswers, edit: number) => {
    server.current.set(questionId, saved); failed.current.delete(questionId);
    const current = state.current.responses[questionId];
    if (current && (edits.current.get(questionId) ?? 0) === edit && sameAnswers(current.answers, answers)) {
      dirty.current.delete(questionId); conflicts.current.delete(questionId);
      const { baseRevision: _base, ...clean } = saved;
      void _base;
      remember(questionId, clean);
    } else if (current) {
      // Preserve later edits; only align the confirmed server version/time.
      dirty.current.add(questionId);
      remember(questionId, { ...current, submitted: false, outcome: null, score: null, maxScore: 0, revision: saved.revision, baseRevision: saved.revision, updatedAt: saved.updatedAt, submissions: saved.submissions });
    }
    status();
  }, [remember, status]);
  const enqueueDraft = useCallback((questionId: string) => {
    const scopeVersion = scope.current;
    const task = queue.current.then(async () => {
      if (scope.current !== scopeVersion || !dirty.current.has(questionId) || conflicts.current.has(questionId)) return;
      const current = state.current.responses[questionId]; if (!current) return;
      const answers = { ...current.answers }, edit = edits.current.get(questionId) ?? 0;
      const baseRevision = current.baseRevision ?? current.revision;
      if (alive.current) setSync(conflicts.current.size ? "conflict" : "saving");
      try {
        const result = await fetch("/api/math/grade6-bank/draft", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject_id: subjectId, question_id: questionId, answers, base_revision: baseRevision }), cache: "no-store", keepalive: true, signal: AbortSignal.timeout(15000) });
        const data = await result.json();
        if (scope.current !== scopeVersion) return;
        if (result.status === 409) {
          const remote = normalizeBankProgress({ responses: { [questionId]: data.response } }).responses[questionId];
          if (!remote || !validRevision(data.response?.revision)) throw new Error("Invalid conflict record");
          keepConflict(questionId, remote, false); return;
        }
        if (!result.ok) throw new Error(data.error || "Draft sync failed");
        const saved = normalizeBankProgress({ responses: { [questionId]: data } }).responses[questionId];
        if (!saved || !validRevision(data.revision)) throw new Error("Invalid draft revision");
        accept(questionId, saved, answers, edit);
      } catch (error) { if (scope.current === scopeVersion) { failed.current.add(questionId); status(); } throw error; }
    });
    // Rejections keep dirty data and cannot break the serial write queue.
    queue.current = task.then(() => undefined, () => undefined);
    return task;
  }, [subjectId, accept, keepConflict, status]);
  const flush = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    for (const id of dirty.current) if (!conflicts.current.has(id)) void enqueueDraft(id).catch(() => undefined);
    return queue.current;
  }, [enqueueDraft]);

  useEffect(() => {
    alive.current = true; scope.current++; let canceled = false, refreshing = false;
    const activeTimers = timers.current;
    const activeScope = scope.current;
    dirty.current.clear(); failed.current.clear(); conflicts.current.clear(); server.current.clear(); edits.current.clear();
    let cached: LocalSnapshot | null = null;
    try { cached = JSON.parse(localStorage.getItem(key) ?? "null") as LocalSnapshot | null; } catch { /* New bank. */ }
    const local = normalizeBankProgress(cached);
    const pending = Array.isArray(cached?.dirtyQuestionIds) ? cached.dirtyQuestionIds : Object.entries(local.responses).filter(([, r]) => r.baseRevision !== undefined || !r.submitted && Object.keys(r.answers).length).map(([id]) => id);
    for (const id of pending) if (local.responses[id]) {
      dirty.current.add(id); edits.current.set(id, 0);
      const r = local.responses[id]; local.responses[id] = { ...r, submitted: false, outcome: null, score: null, maxScore: 0, baseRevision: r.baseRevision ?? r.revision };
    }
    for (const [id, c] of Object.entries(cached?.conflicts ?? {})) if (dirty.current.has(id) && c && validRevision(c.revision)) conflicts.current.set(id, { revision: c.revision, acknowledged: c.acknowledged === true });
    state.current = local;
    const refresh = async () => {
      if (refreshing || canceled) return;
      refreshing = true;
      const previous = queue.current;
      let release = () => {};
      const gate = new Promise<void>((resolve) => { release = resolve; });
      // GET also joins the serial queue: a timer cannot write while a stale
      // progress snapshot is in flight and then have that response rolled back.
      queue.current = previous.then(() => gate);
      await previous;
      try {
        if (canceled) return;
        const response = await fetch("/api/math/grade6-bank/progress?subject_id=" + encodeURIComponent(subjectId), { cache: "no-store", signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("Progress sync failed");
        const remote = normalizeBankProgress(await response.json());
        if (canceled) return;
        const responses = { ...remote.responses };
        for (const [id, r] of Object.entries(remote.responses)) server.current.set(id, r);
        for (const id of dirty.current) {
          const edit = state.current.responses[id]; if (!edit) continue;
          const latest = remote.responses[id];
          if (latest && sameAnswers(edit.answers, latest.answers)) {
            // A pagehide save may reach the server after this scope unmounts,
            // so accept its authoritative record instead of a false conflict.
            // Keep server grades too: an equal local draft must not downgrade
            // another device's already-submitted answer with an automatic PUT.
            dirty.current.delete(id); conflicts.current.delete(id); failed.current.delete(id);
            continue;
          }
          const revision = latest?.revision ?? 0, baseRevision = edit.baseRevision ?? edit.revision;
          if (baseRevision !== revision) conflicts.current.set(id, { revision, acknowledged: false });
          // Server data alone restores grades. Client dates grant no write rights.
          responses[id] = { ...edit, revision, baseRevision, submitted: false, outcome: null, score: null, maxScore: 0, submissions: latest?.submissions ?? 0 };
        }
        failed.current.clear();
        mirror({ ...remote, responses, lastQuestionId: dirty.current.has(state.current.lastQuestionId) ? state.current.lastQuestionId : remote.lastQuestionId });
        setReady(true); status();
        void flush();
      } catch {
        if (canceled) return;
        mirror(state.current); setReady(true);
        for (const id of dirty.current) failed.current.add(id);
        setSync(conflicts.current.size ? "conflict" : "offline");
        void flush();
      } finally { refreshing = false; release(); }
    };
    void refresh();
    const visibility = () => { if (document.visibilityState === "hidden") void flush(); else void refresh(); };
    const online = () => { void refresh(); };
    const leave = () => { void flush(); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("online", online); window.addEventListener("pagehide", leave);
    return () => {
      canceled = true; alive.current = false; scope.current = activeScope + 1;
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
      document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", online); window.removeEventListener("pagehide", leave);
    };
  }, [key, subjectId, mirror, flush, status]);

  const draft = useCallback((id: string, answers: BankAnswers) => {
    const old = state.current.responses[id];
    dirty.current.add(id); edits.current.set(id, (edits.current.get(id) ?? 0) + 1);
    remember(id, { answers, submitted: false, outcome: null, score: null, maxScore: 0, submissions: old?.submissions ?? 0, updatedAt: new Date().toISOString(), revision: old?.revision ?? server.current.get(id)?.revision ?? 0, baseRevision: old?.baseRevision ?? old?.revision ?? server.current.get(id)?.revision ?? 0 });
    status();
    const previous = timers.current.get(id); if (previous) clearTimeout(previous);
    if (!conflicts.current.has(id)) timers.current.set(id, setTimeout(() => { timers.current.delete(id); void enqueueDraft(id).catch(() => undefined); }, 600));
  }, [remember, enqueueDraft, status]);
  const submit = useCallback(async (questionId: string, answers: BankAnswers): Promise<BankFeedback> => {
    const scopeVersion = scope.current;
    const old = state.current.responses[questionId];
    if (!old || !sameAnswers(old.answers, answers)) {
      // A mounted question can still display its old clean inputs after a GET
      // restores another device's answer. Without an intervening input edit,
      // do not silently reinterpret those stale controls as a new autosave.
      if (old && !dirty.current.has(questionId) && server.current.has(questionId)) conflicts.current.set(questionId, { revision: old.revision, acknowledged: false });
      draft(questionId, answers);
    }
    await flush();
    const task = queue.current.then(async () => {
      if (scope.current !== scopeVersion) throw new Error("页面已切换，请在当前页面重新提交。");
      const conflict = conflicts.current.get(questionId);
      if (conflict && !conflict.acknowledged) {
        const current = state.current.responses[questionId];
        conflicts.current.set(questionId, { ...conflict, acknowledged: true });
        if (current) remember(questionId, { ...current, baseRevision: conflict.revision, revision: conflict.revision });
        status(); throw new Error(conflictMessage);
      }
      const current = state.current.responses[questionId], edit = edits.current.get(questionId) ?? 0;
      const baseRevision = current?.baseRevision ?? current?.revision ?? server.current.get(questionId)?.revision ?? 0;
      if (alive.current) setSync(conflicts.current.size ? "conflict" : "saving");
      try {
        const result = await fetch("/api/math/grade6-bank/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject_id: subjectId, question_id: questionId, answers, base_revision: baseRevision }), cache: "no-store", signal: AbortSignal.timeout(30000) });
        const data = await result.json();
        if (scope.current !== scopeVersion) throw new Error("页面已切换，提交结果将从云端重新读取。");
        if (result.status === 409) {
          const remote = normalizeBankProgress({ responses: { [questionId]: data.response } }).responses[questionId];
          if (!remote || !validRevision(data.response?.revision)) throw new Error("Invalid conflict record");
          keepConflict(questionId, remote, true); throw new Error(conflictMessage);
        }
        if (!result.ok) throw new Error(data.error || "提交失败，请重试");
        const saved = normalizeBankProgress({ responses: { [questionId]: data.response } }).responses[questionId];
        if (!saved || !validRevision(data.response?.revision)) throw new Error("提交版本无效，请稍后重试");
        accept(questionId, saved, answers, edit);
        return data.feedback as BankFeedback;
      } catch (error) {
        if (scope.current === scopeVersion) {
          if (!conflicts.current.has(questionId)) {
            dirty.current.add(questionId); failed.current.add(questionId);
            const pending = state.current.responses[questionId];
            if (pending) remember(questionId, { ...pending, submitted: false, outcome: null, score: null, maxScore: 0, baseRevision: pending.baseRevision ?? pending.revision });
          }
          status();
        }
        throw error;
      }
    });
    queue.current = task.then(() => undefined, () => undefined);
    return task;
  }, [subjectId, flush, draft, remember, keepConflict, accept, status]);
  const getResponse = useCallback((id: string) => state.current.responses[id], []);
  return { progress, ready, sync, draft, submit, flush, getResponse };
}
