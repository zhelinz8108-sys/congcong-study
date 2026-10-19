"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import data from "@/data/toefl-temp-audio.json";
import { toeflClock } from "@/lib/toefl-listening";

function questionLabel(clip: { first: number; last: number }) {
  return clip.first === clip.last ? `第 ${clip.first} 题` : `第 ${clip.first}–${clip.last} 题`;
}

export default function ToeflTempPlayer({ subjectId }: { subjectId: string }) {
  const [selected, setSelected] = useState(0);
  const [failedClip, setFailedClip] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clip = data.clips[selected];
  const group = data.groups.find((item) => item.id === clip.group)!;
  const groupClips = data.clips.filter((item) => item.group === clip.group);
  const label = questionLabel(clip);

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, [selected]);

  function choose(index: number) {
    if (index === selected || index < 0 || index >= data.clips.length) return;
    audioRef.current?.pause();
    setFailedClip(null);
    setSelected(index);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <Link href={`/subjects/${subjectId}`} className="text-sm font-medium text-blue-700 hover:text-blue-800">
        ← 返回英语
      </Link>

      <header className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6">
        <h1 className="text-2xl font-bold text-blue-900">📘 托福临时</h1>
        <p className="mt-2 text-sm font-medium text-blue-700">
          {data.clips.length} 段音频 · {data.groups.length} 个部分 · 按题号排列
        </p>
        <p className="mt-3 text-sm leading-6 text-blue-800">
          选择题号后点击播放，每段播放结束后停在当前题。
        </p>
      </header>

      <nav aria-label="选择考试部分" className="mt-6 flex flex-wrap gap-2">
        {data.groups.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === group.id}
            onClick={() => choose(data.clips.findIndex((entry) => entry.group === item.id))}
            className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              item.id === group.id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-stone-200 bg-white text-stone-600 hover:border-blue-300 hover:bg-blue-50"
            }`}
          >
            {item.title}
          </button>
        ))}
      </nav>

      <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" aria-labelledby="toefl-temp-group">
        <h2 id="toefl-temp-group" className="text-lg font-bold text-stone-900">{group.title}</h2>
        <p className="mt-1 text-sm text-stone-500">{group.description} · {groupClips.length} 段音频</p>
        <nav aria-label="选择题号" className="mt-4 flex flex-wrap gap-2">
          {groupClips.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={`选择${questionLabel(item)}`}
              aria-pressed={item.id === clip.id}
              onClick={() => choose(data.clips.indexOf(item))}
              className={`min-h-11 min-w-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                item.id === clip.id
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-stone-200 text-stone-600 hover:border-blue-300 hover:bg-blue-50"
              }`}
            >
              {item.first === item.last ? item.first : `${item.first}–${item.last}`}
            </button>
          ))}
        </nav>
      </section>

      <section className="mt-5 rounded-2xl border border-blue-200 bg-white p-5 sm:p-6" aria-labelledby="toefl-temp-question">
        <p className="text-sm font-medium text-blue-700">{group.title} · {clip.kind}</p>
        <h2 id="toefl-temp-question" className="mt-2 text-2xl font-bold text-stone-900">{label}</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          时长 {toeflClock(clip.duration)}
          {clip.first !== clip.last && ` · ${label}共用这段音频`}
        </p>

        <audio
          key={clip.id}
          ref={audioRef}
          controls
          preload="none"
          aria-label={`${group.title} ${label}音频`}
          src={`/api/english/toefl-temp/media/${encodeURIComponent(clip.id)}`}
          onError={() => setFailedClip(clip.id)}
          className="mt-5 w-full"
        >
          你的浏览器暂不支持音频播放。
        </audio>

        {failedClip === clip.id && (
          <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
            <p>音频暂时无法播放，请重试。</p>
            <button
              type="button"
              onClick={() => {
                setFailedClip(null);
                audioRef.current?.load();
              }}
              className="mt-2 min-h-11 rounded-lg border border-rose-200 px-4 font-semibold hover:bg-rose-100"
            >
              重新加载
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-5">
          <button
            type="button"
            disabled={selected === 0}
            onClick={() => choose(selected - 1)}
            className="min-h-11 rounded-xl border border-stone-200 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-default disabled:opacity-40"
          >
            ← 上一题
          </button>
          <span className="text-sm text-stone-500">第 {selected + 1} / {data.clips.length} 段</span>
          <button
            type="button"
            disabled={selected === data.clips.length - 1}
            onClick={() => choose(selected + 1)}
            className="min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-default disabled:opacity-40"
          >
            下一题 →
          </button>
        </div>
      </section>
    </main>
  );
}
