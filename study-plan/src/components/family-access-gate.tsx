"use client";

import { FormEvent, useState } from "react";

type FamilyAccessGateProps = {
  setupRequired: boolean;
  initialStudentName: string;
};

export function FamilyAccessGate({
  setupRequired,
  initialStudentName,
}: FamilyAccessGateProps) {
  const [password, setPassword] = useState("");
  const [studentName, setStudentName] = useState(initialStudentName);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/access/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          profile: { name: studentName },
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "访问密码不正确");
        return;
      }

      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] px-5 py-10 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center">
        <div className="w-full rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="mb-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-blue-600">
              Family Access
            </p>
            <h1 className="text-3xl font-black tracking-tight">聪聪学习计划</h1>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              输入家庭访问密码后进入学习网站；做题记录会保存到当前小朋友档案。
            </p>
          </div>

          {setupRequired ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
              <p className="font-bold">还没有配置访问密码。</p>
              <p className="mt-2">
                本地请在 <code className="font-mono">study-plan/.env.local</code> 添加{" "}
                <code className="font-mono">FAMILY_ACCESS_PASSWORD</code>；线上服务器也要设置同名环境变量。
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">访问密码</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-bold outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">小朋友档案</span>
                <input
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-bold outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </label>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !password.trim()}
                className="h-14 w-full rounded-2xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {submitting ? "正在进入..." : "进入学习"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
