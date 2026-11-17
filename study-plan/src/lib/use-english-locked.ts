"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EnglishLockedAnswer, EnglishLockedModule, EnglishLockedRecord } from "./english-locked-types";

/** Answers are immutable within their server scope; vocabulary rounds have separate scopes. */
export function useEnglishLocked(module: EnglishLockedModule, subjectId: string, sessionId?: string | null) {
  const [snapshot, setSnapshot] = useState<{ url: string; records: Record<string, EnglishLockedRecord> } | null>(null);
  const [mistakes, setMistakes] = useState<{ url: string; ids: string[] } | null>(null);
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const active = useRef(true);
  const requests = useRef(new Map<string, Promise<EnglishLockedRecord>>());
  const recordRef = useRef<Record<string, EnglishLockedRecord>>({});
  const currentUrl = useRef("");
  const historyUrl = `/api/english/locked?module=${module}&subject=${encodeURIComponent(subjectId)}`;
  const url = sessionId ? `${historyUrl}&session=${encodeURIComponent(sessionId)}` : historyUrl;
  const ready = snapshot?.url === url;
  // Before a round starts, read historical mistakes without treating past answers as this round's answers.
  const records = ready && sessionId !== null ? snapshot.records : {};
  const mistakeWordIds = mistakes?.url === historyUrl ? mistakes.ids : [];
  const error = failure?.url === url ? failure.message : "";
  const busy = busyUrl === url;
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    currentUrl.current = url;
    recordRef.current = {};
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json() as { records?: Record<string, EnglishLockedRecord>; mistakeWordIds?: string[]; error?: string };
      if (!response.ok || !body.records) throw new Error(body.error ?? "无法读取已提交记录，请重试");
      if (controller.signal.aborted) return;
      recordRef.current = body.records;
      setSnapshot({ url, records: body.records });
      setMistakes(previous => ({ url: historyUrl, ids: [...new Set([
        ...(previous?.url === historyUrl ? previous.ids : []),
        ...(body.mistakeWordIds ?? []),
      ])] }));
      setFailure(null);
    }).catch(cause => {
      if (!controller.signal.aborted) setFailure({ url, message: cause instanceof Error ? cause.message : "无法读取已提交记录" });
    });
    return () => { active.current = false; controller.abort(); };
  }, [url, historyUrl]);

  const submit = useCallback(async (id: string, response: EnglishLockedAnswer) => {
    if (!ready || sessionId === null) throw new Error("请等待本轮练习准备完成");
    const saved = recordRef.current[id];
    if (saved) return saved;
    const requestKey = `${url}:${id}`;
    const pending = requests.current.get(requestKey);
    if (pending) return pending;
    setBusyUrl(url);
    setFailure(null);
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
        if (body.record.feedback.correct === false) {
          const wordId = id.replace(/^(?:en-zh|zh-en):/, "");
          setMistakes(previous => ({ url: historyUrl, ids: [...new Set([
            ...(previous?.url === historyUrl ? previous.ids : []), wordId,
          ])] }));
        }
      }
      return body.record;
    }).catch(cause => {
      if (active.current && currentUrl.current === url) setFailure({ url, message: cause instanceof Error ? cause.message : "提交失败，请重试" });
      throw cause;
    }).finally(() => {
      requests.current.delete(requestKey);
      if (active.current && currentUrl.current === url &&
        ![...requests.current.keys()].some(key => key.startsWith(`${url}:`))) setBusyUrl(null);
    });
    requests.current.set(requestKey, request);
    return request;
  }, [url, historyUrl, ready, sessionId]);
  return { records, mistakeWordIds, ready, busy, error, submit };
}
