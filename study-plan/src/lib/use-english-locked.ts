"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EnglishLockedAnswer, EnglishLockedModule, EnglishLockedRecord } from "./english-locked-types";

/** Server records are authoritative: no browser cache can reset or replace a submitted answer. */
export function useEnglishLocked(module: EnglishLockedModule, subjectId: string) {
  const [snapshot, setSnapshot] = useState<{ url: string; records: Record<string, EnglishLockedRecord> } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const requests = useRef(new Map<string, Promise<EnglishLockedRecord>>());
  const recordRef = useRef<Record<string, EnglishLockedRecord>>({});
  const currentUrl = useRef("");
  const url = `/api/english/locked?module=${module}&subject=${encodeURIComponent(subjectId)}`;
  const ready = snapshot?.url === url;
  const records = ready ? snapshot.records : {};
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    currentUrl.current = url;
    recordRef.current = {};
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json() as { records?: Record<string, EnglishLockedRecord>; error?: string };
      if (!response.ok || !body.records) throw new Error(body.error ?? "无法读取已提交记录，请重试");
      if (controller.signal.aborted) return;
      recordRef.current = body.records;
      setSnapshot({ url, records: body.records });
      setError("");
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取已提交记录");
    });
    return () => { active.current = false; controller.abort(); };
  }, [url]);

  const submit = useCallback(async (id: string, response: EnglishLockedAnswer) => {
    if (!ready) throw new Error("请等待云端答题记录读取完成");
    const saved = recordRef.current[id];
    if (saved) return saved;
    const requestKey = `${url}:${id}`;
    const pending = requests.current.get(requestKey);
    if (pending) return pending;
    setBusy(true);
    setError("");
    const request = fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, response }), cache: "no-store", signal: AbortSignal.timeout(20000),
    }).then(async result => {
      const body = await result.json() as { record?: EnglishLockedRecord; error?: string };
      if (!result.ok || !body.record || body.record.id !== id) throw new Error(body.error ?? "提交未保存，请重试");
      if (active.current && currentUrl.current === url) {
        const next = { ...recordRef.current, [id]: body.record };
        recordRef.current = next;
        setSnapshot({ url, records: next });
      }
      return body.record;
    }).catch(cause => {
      if (active.current && currentUrl.current === url) setError(cause instanceof Error ? cause.message : "提交失败，请重试");
      throw cause;
    }).finally(() => { requests.current.delete(requestKey); if (active.current) setBusy(requests.current.size > 0); });
    requests.current.set(requestKey, request);
    return request;
  }, [url, ready]);
  return { records, ready, busy, error, submit };
}
