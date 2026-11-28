"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExamState, ExamValues } from "@/lib/math-final-exams";

type Backup = { revision: number; base: ExamValues; values: ExamValues };
function mergeChanges(base: ExamValues, local: ExamValues, cloud: ExamValues) {
  const merged = { ...cloud };
  let conflict = false;
  for (const id of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if ((local[id] ?? "") === (base[id] ?? "")) continue;
    if ((cloud[id] ?? "") !== (base[id] ?? "") && (cloud[id] ?? "") !== (local[id] ?? "")) conflict = true;
    if (local[id]) merged[id] = local[id]; else delete merged[id];
  }
  return { merged, conflict };
}
export function useExamDraft(number: number, student: string, initial: ExamState) {
  const [values, setValues] = useState(initial.values);
  const [result, setResult] = useState(initial.submittedAt ? initial : null);
  const [saving, setSaving] = useState("");
  const [failure, setFailure] = useState("");
  const [sending, setSending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [ready, setReady] = useState(false);
  const current = useRef(initial.values), cloud = useRef(initial), dirty = useRef(false);
  const closing = useRef(false), paused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  const storageKey = `math-final-v1:${student}:${number}`;
  const backup = useCallback(() => {
    try {
      if (dirty.current && !cloud.current.submittedAt)
        localStorage.setItem(storageKey, JSON.stringify({revision: cloud.current.revision, base: cloud.current.values, values: current.current}));
      else localStorage.removeItem(storageKey);
    } catch { /* Cloud saves also work when browser storage is unavailable. */ }
  }, [storageKey]);
  function apply(values: ExamValues) { current.current = values; setValues(values); }
  const enqueue = useCallback((submit: boolean) => {
    const task = async () => {
      if (paused.current || cloud.current.submittedAt || !submit && (!dirty.current || closing.current)) return;
      const snapshot = current.current, base = cloud.current;
      setSaving(submit ? "正在交卷…" : "正在保存…"); setFailure("");
      const response = await fetch(`/api/math/final-exams/${number}`, {
        method: submit ? "POST" : "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({values: snapshot, revision: base.revision}), cache: "no-store",
      });
      const data = await response.json();
      if (response.status === 409 && data.state) {
        const server = data.state as ExamState;
        const changes = mergeChanges(base.values, current.current, server.values);
        cloud.current = server; apply(changes.merged); dirty.current = true;
        paused.current = changes.conflict; setConflict(changes.conflict);
        backup(); setSaving(""); setFailure(changes.conflict ? "另一台设备也改了同一项，请选择要保留的作答。" : "已合并另一台设备的进度，请再次保存或交卷。");
        return;
      }
      if (!response.ok) throw new Error(data.error || "未能保存作答，请重试。");
      const saved = data as ExamState;
      cloud.current = saved;
      if (saved.submittedAt) { dirty.current = false; apply(saved.values); setResult(saved); }
      else dirty.current = current.current !== snapshot;
      backup(); setSaving(saved.submittedAt ? "" : dirty.current ? "待保存" : "已保存");
    };
    queue.current = queue.current.then(task).catch((error: unknown) => {
      setSaving(""); setFailure(error instanceof Error && error.message !== "Failed to fetch" ? error.message : "网络未连接，恢复后可重试。");
    }).finally(() => { if (submit) { closing.current = false; setSending(false); } });
    return queue.current;
  }, [backup, number]);
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      try {
        const cached = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Backup | null;
        if (!initial.submittedAt && cached && cached.values && cached.base) {
          const changes = mergeChanges(cached.base, cached.values, initial.values);
          apply(changes.merged); dirty.current = true;
          paused.current = changes.conflict; setConflict(changes.conflict);
          if (changes.conflict) setFailure("另一台设备也改了同一项，请选择要保留的作答。");
          else void enqueue(false);
        } else if (initial.submittedAt) localStorage.removeItem(storageKey);
      } catch { /* An unavailable or expired browser draft must never block answering. */ }
      setReady(true);
    });
    const reconnect = () => { void enqueue(false); };
    window.addEventListener("online", reconnect);
    return () => { mounted = false; clearTimeout(timer.current); window.removeEventListener("online", reconnect); };
  }, [enqueue, initial, storageKey]);
  function change(id: string, value: string) {
    if (closing.current || cloud.current.submittedAt || paused.current) return;
    const next = { ...current.current };
    if (value) next[id] = value; else delete next[id];
    apply(next); dirty.current = true; backup(); setSaving("待保存"); setFailure("");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void enqueue(false); }, 650);
  }
  function submit() {
    if (closing.current || paused.current || cloud.current.submittedAt) return;
    clearTimeout(timer.current); closing.current = true; setSending(true);
    return enqueue(true);
  }
  function resolve(useLocal: boolean) {
    setConflict(false); paused.current = false; setFailure("");
    if (useLocal) void enqueue(false);
    else { apply(cloud.current.values); dirty.current = false; backup(); setSaving("已保存"); }
  }
  return { values, result, saving, failure, sending, ready, conflict, resolve, change, submit, retry: () => enqueue(false) };
}
