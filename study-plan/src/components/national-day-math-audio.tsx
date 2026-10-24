"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { buildMathAudioLessons, splitMathSpeech } from "@/lib/national-day-math-audio";
import { MathLessonSpeaker, type MathSpeechState } from "@/lib/math-lesson-speaker";
import type { NationalDayMathPublicSection } from "@/lib/national-day-math";

export type MathListenRequest = { id: string; sequence: number };

const button = "rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-sky-900 disabled:opacity-40";
const subscribeSupport = () => () => {};
const speechSupport = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const serverSupport = () => null;

export default function NationalDayMathAudio({ sections, request }: {
  sections: NationalDayMathPublicSection[];
  request: MathListenRequest | null;
}) {
  const lessons = useMemo(() => buildMathAudioLessons(sections), [sections]);
  const speaker = useRef<MathLessonSpeaker | null>(null);
  const supported = useSyncExternalStore(subscribeSupport, speechSupport, serverSupport);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [rate, setRate] = useState(0.9);
  const [continuous, setContinuous] = useState(true);
  const [transcript, setTranscript] = useState(false);
  const [state, setState] = useState<MathSpeechState>({ status: "idle", lesson: 0, chunk: 0, message: "" });

  useEffect(() => {
    const available = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    if (!available) return;
    const engine = window.speechSynthesis;
    const player = new MathLessonSpeaker(engine, text => new SpeechSynthesisUtterance(text), lessons, setState);
    speaker.current = player;
    const loadVoices = () => setVoices(engine.getVoices().filter(voice => /^zh(?:[-_]|$)|^cmn/i.test(voice.lang)).sort((a, b) => {
      const rank = (voice: SpeechSynthesisVoice) => (/Xiaoxiao|Xiaoyi|Tingting|晓晓|晓伊/i.test(voice.name) ? 4 : 0) + (/zh[-_]CN/i.test(voice.lang) ? 2 : 0) + Number(voice.default);
      return rank(b) - rank(a);
    }));
    loadVoices();
    engine.addEventListener("voiceschanged", loadVoices);
    return () => { engine.removeEventListener("voiceschanged", loadVoices); player.dispose(); speaker.current = null; };
  }, [lessons]);

  useEffect(() => {
    speaker.current?.configure(rate, voices.find(voice => voice.voiceURI === voiceId) ?? voices[0] ?? null, continuous);
  }, [rate, voices, voiceId, continuous]);

  useEffect(() => {
    if (!request) return;
    const index = lessons.findIndex(lesson => lesson.id === request.id || lesson.sectionId === request.id);
    if (index >= 0) speaker.current?.select(index, true);
  }, [request, lessons]);

  const lesson = lessons[state.lesson];
  if (!lesson) return null;
  const chunks = splitMathSpeech(lesson.text);
  const playing = state.status === "playing";
  const canPlay = supported === true;
  return <section aria-label="老师讲解音频" data-math-audio className="sticky top-2 z-20 mt-6 rounded-2xl border border-sky-200 bg-sky-50/95 p-4 shadow-sm backdrop-blur-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-bold text-sky-950">🎧 跟着老师听数学</h2>
      <span className="text-xs text-sky-800">第 {state.lesson + 1} / {lessons.length} 段</span>
    </div>
    <label className="mt-3 block text-xs font-semibold text-slate-600">选择讲解
      <select aria-label="选择音频讲解" value={state.lesson} disabled={!canPlay} onChange={event => speaker.current?.select(Number(event.target.value), playing)} className="mt-1 block w-full min-w-0 rounded-xl border border-sky-200 bg-white p-2 text-sm text-slate-800">
        {sections.map(section => <optgroup key={section.id} label={section.title}>{lessons.map((item, index) => item.sectionId === section.id ? <option key={item.id} value={index}>{item.kind === "example" ? "例题 · " : item.kind === "practice" ? "读题 · " : "讲解 · "}{item.title}</option> : null)}</optgroup>)}
      </select>
    </label>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" disabled={!canPlay || state.lesson === 0} onClick={() => speaker.current?.select(state.lesson - 1, playing)} className={button} aria-label="上一段讲解">上一段</button>
      <button type="button" disabled={!canPlay} onClick={() => playing ? speaker.current?.pause() : speaker.current?.play()} className={`${button} min-w-24 !border-sky-700 !bg-sky-700 !text-white`}>{playing ? "暂停" : state.status === "paused" ? "继续听" : state.status === "finished" ? "重听本段" : "开始听课"}</button>
      <button type="button" disabled={!canPlay || state.lesson === lessons.length - 1} onClick={() => speaker.current?.select(state.lesson + 1, playing || state.status === "finished")} className={button} aria-label="下一段讲解">下一段</button>
      <button type="button" disabled={!canPlay || state.status === "idle"} onClick={() => speaker.current?.stop()} className={button}>停止</button>
      <label className="text-xs text-slate-600">语速 <select aria-label="讲解语速" value={rate} onChange={event => setRate(Number(event.target.value))} className="rounded-lg border border-sky-200 bg-white px-1 py-2 text-sm">{[[0.75, "0.75× 慢速"], [0.9, "0.9× 舒缓"], [1, "1× 标准"], [1.25, "1.25× 稍快"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
      <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={continuous} onChange={event => setContinuous(event.target.checked)} />连续听课</label>
      {voices.length > 1 && <label>音色 <select aria-label="中文讲解音色" value={voiceId || voices[0].voiceURI} onChange={event => setVoiceId(event.target.value)} className="max-w-48 rounded-lg border border-sky-200 bg-white p-1">{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>)}</select></label>}
      <a href={`#${lesson.anchorId}`} className="font-semibold text-sky-800">定位到课文 ↓</a>
      <button type="button" aria-expanded={transcript} aria-controls="math-audio-transcript" onClick={() => setTranscript(!transcript)} className="font-semibold text-sky-800">{transcript ? "收起讲稿" : "查看讲稿"}</button>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-500">知识点与例题连续讲解，自测读题后自动停下。可在课文中点“听讲解”直接听该题。</p>
    <p role="status" aria-live="polite" className="mt-1 text-xs leading-5 text-sky-900">{supported === null ? "正在准备中文语音…" : !supported ? "当前浏览器不支持语音播放，请使用支持中文语音的浏览器。" : state.message || (playing ? `正在讲解 · ${state.chunk + 1} / ${chunks.length} 句` : state.status === "paused" ? "已暂停，可继续听课。" : "点击开始听课；音色随设备而异。")}</p>
    {transcript && <div id="math-audio-transcript" className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-sky-100 bg-white p-3 text-sm leading-7 text-slate-700">{chunks.map((text, index) => <button key={index} type="button" disabled={!canPlay} onClick={() => speaker.current?.select(state.lesson, true, index)} aria-label={`从第 ${index + 1} 句开始听`} aria-current={index === state.chunk ? "step" : undefined} className={`mb-2 block w-full rounded-lg p-1 text-left ${index === state.chunk ? "bg-sky-100 text-sky-950" : "hover:bg-slate-50"}`}>{text}</button>)}</div>}
  </section>;
}
