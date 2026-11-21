"use client";

import { useEffect, useState } from "react";

const settings = "/api/practice-reports/access";
const button = "rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50";

export default function PracticeReportSettings() {
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch(settings, { cache: "no-store", signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "暂时无法读取授权状态。");
        setStartsAt(data.startsAt);
        setReady(true);
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "请刷新页面重试。");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  async function change(method: "POST" | "DELETE") {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(settings, { method, cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "请稍后重试。");
      setStartsAt(data.startsAt);
      setToken(data.token || "");
      setConfirmStop(false);
      if (method === "DELETE") setMessage("只读密钥已停用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setMessage("密钥已复制。");
    } catch {
      setMessage("请长按密钥，选择并复制。");
    }
  }

  return <main className="mx-auto w-full max-w-lg space-y-6 px-5 py-10 text-stone-800">
    <h1 className="text-2xl font-bold text-emerald-950">练习报告授权</h1>
    <p>允许家长的云端任务查看聪聪每轮完成的练习名称、完成时间和实际答题数。记录从生成密钥时开始提供。</p>
    <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      {!ready ? <p>{busy ? "正在读取授权状态…" : "请刷新页面重新读取授权状态。"}</p> : startsAt ? <>
        <p>只读密钥已于 {new Date(startsAt).toLocaleString("zh-CN")} 生效。</p>
        {token && <div className="space-y-2">
          <label className="block font-semibold" htmlFor="report-token">只读密钥（仅显示这一次）</label>
          <input id="report-token" readOnly autoComplete="off" value={token} onFocus={event => event.target.select()}
            className="w-full rounded border border-stone-300 p-2 font-mono text-base" />
          <button type="button" className={button} onClick={copy}>复制密钥</button>
        </div>}
        {confirmStop ? <div className="space-y-3"><p>停用后，使用此密钥的云端任务将失去读取权限。</p>
          <div className="flex gap-3"><button type="button" className={button} onClick={() => change("DELETE")} disabled={busy}>确认停用</button>
          <button type="button" onClick={() => setConfirmStop(false)} disabled={busy}>取消</button></div></div> :
          <button type="button" className="text-sm text-stone-600 underline" onClick={() => setConfirmStop(true)}>停用密钥</button>}
      </> : <button type="button" className={button} onClick={() => change("POST")} disabled={busy}>生成只读密钥</button>}
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </div>
    <section className="space-y-2"><h2 className="text-lg font-bold">连接到云端任务</h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>在云环境设置中，将 <code>congcong-study.cn</code> 加入允许访问的域名。</li>
        <li>把密钥保存为运行时密钥 <code className="break-all">CONGCONG_REPORT_TOKEN</code>，并保存到定时任务使用的环境。</li>
      </ol>
      <p className="text-sm text-stone-600">密钥只填在云环境的密钥栏，请勿发到聊天里。</p>
    </section>
  </main>;
}
