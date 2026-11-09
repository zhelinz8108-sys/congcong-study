"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Material } from "@/lib/types";

const extensionTypes: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac",
  ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", pdf: "application/pdf",
};

async function readResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new Error("登录已过期，请重新登录后再试。");
    throw new Error(data?.error || "操作失败，请稍后重试。");
  }
  return data;
}

function DocumentCard({ material }: { material: Material }) {
  return <article className="space-y-3 rounded-xl border border-stone-100 p-4">
    <h3 className="break-words font-semibold">{material.name}</h3>
    {material.file_path && <>
      {material.file_type === "image" && (
        // User-provided screenshots are served by authenticated file routes.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={material.file_path} alt={material.name} loading="lazy" className="h-auto w-full rounded-lg" />
      )}
      <a href={material.file_path} target="_blank" rel="noopener noreferrer" className="inline-flex text-sm font-semibold text-amber-800 underline">
        {material.file_type === "pdf" ? "打开PDF题目" : "打开原文件"}
      </a>
    </>}
  </article>;
}

export default function DatedListening({ subjectId }: { subjectId: string }) {
  const api = `/api/subjects/${subjectId}/listening/2026-11-09`;
  const fileInput = useRef<HTMLInputElement>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const data = await readResponse(await fetch(api, { cache: "no-store", signal }));
      if (!Array.isArray(data?.materials)) throw new Error("听力资料加载失败，请重试。");
      if (!signal?.aborted) {
        setMaterials(data.materials);
        setReady(true);
      }
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "听力资料加载失败。");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function upload(files: File[]) {
    if (!files.length || uploading) return;
    setError("");
    setNotice("");
    const prepared: File[] = [];
    for (const file of files) {
      const mime = file.type || extensionTypes[file.name.split(".").pop()?.toLowerCase() ?? ""];
      if (!mime || !(mime.startsWith("audio/") || mime.startsWith("image/") || mime === "application/pdf")) {
        setError(`“${file.name}”格式不支持，请选择音频、图片或PDF。`);
        return;
      }
      prepared.push(file.type ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified }));
    }

    setUploading(true);
    let saved = 0;
    try {
      const unit = await readResponse(await fetch(api, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      }));
      for (const [index, file] of prepared.entries()) {
        setProgress(`正在添加 ${index + 1}/${prepared.length}：${file.name}`);
        const form = new FormData();
        form.append("file", file);
        const uploaded = await readResponse(await fetch("/api/upload", { method: "POST", body: form }));
        if (!uploaded?.file_path || !["audio", "image", "pdf"].includes(uploaded.file_type)) {
          throw new Error("文件上传结果不完整，请重试。");
        }
        const material = await readResponse(await fetch("/api/materials", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unit_id: unit.unitId, name: file.name, file_path: uploaded.file_path,
            file_type: uploaded.file_type, file_size: file.size }),
        }));
        setMaterials(current => [...current.filter(item => item.id !== material.id), material]);
        saved++;
      }
      setNotice(`已添加${saved}个文件。`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "添加失败，请重试。";
      setError(saved ? `已保存${saved}个文件，后续文件添加失败：${message}` : message);
    } finally {
      setUploading(false);
      setProgress("");
    }
  }

  const audio = materials.filter(material => material.file_type === "audio");
  const documents = materials.filter(material => material.file_type !== "audio");

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 text-stone-900">
      <Link href={`/subjects/${subjectId}`} className="inline-flex text-sm font-semibold text-amber-800 hover:text-amber-950">
        ← 返回英语主页
      </Link>
      <header className="rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
        <time dateTime="2026-11-09" className="text-sm font-semibold text-amber-800">2026年11月9日</time>
        <h1 className="mt-2 text-3xl font-black">11月9日听力</h1>
        <p className="mt-3 leading-7 text-stone-600">播放听力音频，结合下方题目与资料练习。</p>
      </header>

      <section aria-label="添加听力资料" className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">添加听力资料</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">支持音频、题目图片和PDF，可一次选择多个文件。</p>
        <input ref={fileInput} type="file" multiple accept="audio/*,image/*,.pdf,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
          className="hidden" aria-label="选择听力音频或题目文件" disabled={uploading || !ready}
          onChange={event => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void upload(files);
          }} />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || !ready}
          className="mt-4 rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50">
          {uploading ? "正在添加…" : "添加音频 / 题目"}
        </button>
        <p role="status" aria-live="polite" className="mt-3 break-words text-sm text-emerald-700">{progress || notice}</p>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="break-words">{error}</p>
        {!uploading && <button type="button" onClick={() => void load()} className="mt-3 font-semibold underline">重新加载资料</button>}
      </div>}
      {loading && <p role="status" className="py-6 text-center text-stone-500">正在加载听力资料…</p>}
      {!loading && ready && <>
        <section aria-labelledby="dated-listening-audio" className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
          <h2 id="dated-listening-audio" className="text-xl font-bold">听力音频</h2>
          {!audio.length && <p className="mt-4 text-sm leading-7 text-stone-500">暂未添加音频。添加后即可在这里播放。</p>}
          <div className="mt-4 space-y-5">
            {audio.map(material => <article key={material.id} className="space-y-3 rounded-xl bg-amber-50/60 p-4">
              <h3 className="break-words font-semibold">{material.name}</h3>
              {material.file_path && <audio controls preload="metadata" src={material.file_path}
                aria-label={`${material.name}听力音频`} className="w-full">您的浏览器不支持音频播放。</audio>}
            </article>)}
          </div>
        </section>
        <section aria-labelledby="dated-listening-documents" className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
          <h2 id="dated-listening-documents" className="text-xl font-bold">题目与资料</h2>
          {!documents.length && <p className="mt-4 text-sm leading-7 text-stone-500">暂未添加题目或资料，可添加题目图片、PDF。</p>}
          <div className="mt-4 space-y-5">
            {documents.map(material => <DocumentCard key={material.id} material={material} />)}
          </div>
        </section>
      </>}
    </main>
  );
}
