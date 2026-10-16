"use client";
import { useState } from "react";
import type { useEnglishLocked } from "@/lib/use-english-locked";

/** Open-ended teaching tasks keep the student's first wording, without self-awarded marks. */
export default function EnglishLockedTask({ id, prompt, locked, hidePrompt = false }: {
  id: string; prompt: string; locked: ReturnType<typeof useEnglishLocked>; hidePrompt?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const record = locked.records[id];
  const value = typeof record?.response === "string" ? record.response : draft;
  return <section className="space-y-3">
    {!hidePrompt && <p className="whitespace-pre-line text-base font-bold leading-8 text-stone-800">{prompt}</p>}
    <textarea aria-label="我的答案与理由" value={value} disabled={!!record || locked.busy || !locked.ready} onChange={event => setDraft(event.target.value)} rows={3} className="w-full rounded-2xl border border-orange-200 bg-white p-4 text-base leading-7 text-stone-800 disabled:bg-orange-50/40" placeholder="写下答案和判断理由…" />
    {record ? <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
      <p className="text-sm font-bold text-orange-800">已提交 · 首次答案已锁定</p>
      <p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-700">{record.feedback.answer}</p>
      <p className="mt-2 text-xs leading-6 text-stone-500">{record.feedback.explanation}</p>
    </div> : <button type="button" disabled={!draft.trim() || locked.busy || !locked.ready} onClick={() => void locked.submit(id, draft).catch(() => undefined)} className="w-full rounded-xl border border-orange-200 bg-orange-100 px-4 py-3 text-sm font-bold text-orange-900 disabled:opacity-50">{locked.busy ? "提交中…" : "提交答案"}</button>}
    {locked.error && <p role="alert" className="text-sm text-rose-700">{locked.error}</p>}
  </section>;
}
