"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

export type EnglishKnowledgeSpeechItem = { id: string; text: string; chunks?: readonly string[] };
export type SpeechItem = EnglishKnowledgeSpeechItem;
export type EnglishKnowledgeSpeechRate = 0.75 | 1 | 1.25;
export type EnglishKnowledgeSpeechVoice = { voiceURI: string; name: string; lang: string; default: boolean; localService: boolean };
export type EnglishKnowledgeSpeechStatus = "idle" | "loading" | "playing" | "paused" | "error" | "unsupported";
export type EnglishKnowledgeSpeechState = {
  status: EnglishKnowledgeSpeechStatus;
  supported: boolean;
  activeItemId: string | null;
  groupId: string | null;
  rate: EnglishKnowledgeSpeechRate;
  voices: readonly EnglishKnowledgeSpeechVoice[];
  voiceURI: string;
  error: string | null;
  canRetry: boolean;
};
export type EnglishKnowledgeSpeechApi = EnglishKnowledgeSpeechState & {
  play: (items: readonly EnglishKnowledgeSpeechItem[], options?: { groupId?: string }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  retry: () => void;
  setRate: (rate: EnglishKnowledgeSpeechRate) => void;
  setVoice: (voiceURI: string) => void;
};

export type EnglishKnowledgeSpeechBackend = {
  synthesis: Pick<SpeechSynthesis, "getVoices" | "speak" | "cancel" | "pause" | "resume" | "addEventListener" | "removeEventListener"> & Partial<Pick<SpeechSynthesis, "speaking" | "pending">>;
  createUtterance: (text: string) => SpeechSynthesisUtterance;
};
type SpeechClock = { schedule: (callback: () => void, milliseconds: number) => unknown; clear: (timer: unknown) => void };
type PreparedItem = { id: string; chunks: string[] };
const initialState: EnglishKnowledgeSpeechState = {
  status: "unsupported", supported: false, activeItemId: null, groupId: null,
  rate: 1, voices: [], voiceURI: "", error: null, canRetry: false,
};
const realClock: SpeechClock = {
  schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** Defensive fallback; the extraction library normally supplies these chunks. */
function splitChunk(raw: string): string[] {
  let text = raw.replace(/\s+/gu, " ").trim();
  const chunks: string[] = [];
  while (text.length > 150) {
    const prefix = text.slice(0, 150);
    const punctuation = Math.max(prefix.lastIndexOf(". "), prefix.lastIndexOf("? "), prefix.lastIndexOf("! "), prefix.lastIndexOf("; "));
    const space = prefix.lastIndexOf(" ");
    const end = punctuation >= 50 ? punctuation + 1 : space >= 50 ? space : 150;
    chunks.push(text.slice(0, end).trim()); text = text.slice(end).trim();
  }
  if (text) chunks.push(text);
  return chunks;
}

/** One queue owns all single-item and group playback for a mounted reader.
 * This controller has no browser access until connect(), so SSR is inert.
 * Its injectable backend/clock also lets tests drive native events exactly. */
export function createEnglishKnowledgeSpeechController(clock: SpeechClock = realClock) {
  let state: EnglishKnowledgeSpeechState = initialState;
  const listeners = new Set<() => void>();
  let backend: EnglishKnowledgeSpeechBackend | null = null;
  let nativeVoices: SpeechSynthesisVoice[] = [];
  let selectedVoice = "";
  let connection = 0, generation = 0;
  let voiceListener: (() => void) | null = null;
  let items: PreparedItem[] = [], itemIndex = 0, chunkIndex = 0;
  let utterance: SpeechSynthesisUtterance | null = null;
  let utteranceStarted = false;
  let pauseRequested = false, waitingForVoices = false;
  let voiceTimer: unknown = null, startTimer: unknown = null, monitorTimer: unknown = null, playbackTimer: unknown = null;

  const current = () => items[itemIndex];
  const publish = (patch: Partial<EnglishKnowledgeSpeechState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const clearTimer = (timer: unknown) => { if (timer !== null) clock.clear(timer); };
  const clearTimers = () => {
    clearTimer(voiceTimer); clearTimer(startTimer); clearTimer(monitorTimer); clearTimer(playbackTimer);
    voiceTimer = startTimer = monitorTimer = playbackTimer = null;
  };
  const invalidate = (cancel = true) => {
    // Invalidate BEFORE cancel(): some engines synchronously emit end/error.
    generation++; clearTimers(); waitingForVoices = false;
    const hadUtterance = utterance !== null;
    utterance = null; utteranceStarted = false;
    if (cancel && hadUtterance) { try { backend?.synthesis.cancel(); } catch { /* State is already safely stopped. */ } }
  };
  const fail = (message: string) => {
    invalidate(); pauseRequested = false;
    publish({ status: "error", error: message, canRetry: !!current(), activeItemId: current()?.id ?? null });
  };
  const chooseVoice = () => nativeVoices.find(voice => voice.voiceURI === selectedVoice)
    ?? nativeVoices.find(voice => /^en[-_]GB$/i.test(voice.lang) && voice.localService)
    ?? nativeVoices.find(voice => /^en[-_]GB$/i.test(voice.lang))
    ?? nativeVoices.find(voice => voice.default)
    ?? nativeVoices[0];

  function monitor(token: number, active: SpeechSynthesisUtterance, idleOnce = false) {
    monitorTimer = clock.schedule(() => {
      monitorTimer = null;
      if (token !== generation || utterance !== active || state.status !== "playing") return;
      const idle = backend?.synthesis.speaking === false && backend.synthesis.pending === false;
      if (idle && idleOnce) { fail("英文朗读已中断，请重试。"); return; }
      monitor(token, active, idle);
    }, idleOnce ? 250 : 1000);
  }

  function watchPlayback(token: number, active: SpeechSynthesisUtterance) {
    clearTimer(playbackTimer);
    playbackTimer = clock.schedule(() => {
      playbackTimer = null;
      if (token === generation && utterance === active && state.status === "playing") fail("英文朗读响应超时，请重试。");
    }, 60000);
  }

  function speakCurrent() {
    if (!backend || !current() || pauseRequested) return;
    const voice = chooseVoice();
    if (!voice) { waitForVoice(); return; }
    waitingForVoices = false; clearTimer(voiceTimer); voiceTimer = null;
    const token = generation;
    let active: SpeechSynthesisUtterance;
    try { active = backend.createUtterance(current().chunks[chunkIndex]); }
    catch { fail("英文朗读无法启动，请重试。"); return; }
    utterance = active; utteranceStarted = false;
    active.lang = voice.lang || "en-GB"; active.voice = voice;
    active.rate = state.rate; active.pitch = 1; active.volume = 1;
    active.onstart = () => {
      if (token !== generation || utterance !== active) return;
      utteranceStarted = true;
      clearTimer(startTimer); startTimer = null;
      clearTimer(monitorTimer); monitorTimer = null;
      publish({ status: pauseRequested ? "paused" : "playing", error: null, canRetry: false });
      if (token !== generation || utterance !== active) return;
      if (pauseRequested) {
        try { backend?.synthesis.pause(); } catch { fail("英文朗读无法暂停，请重试。"); }
      } else { monitor(token, active); watchPlayback(token, active); }
    };
    active.onend = () => {
      if (token !== generation || utterance !== active) return;
      clearTimer(startTimer); clearTimer(monitorTimer); clearTimer(playbackTimer); startTimer = monitorTimer = playbackTimer = null;
      utterance = null; utteranceStarted = false;
      chunkIndex++;
      if (chunkIndex >= current().chunks.length) { itemIndex++; chunkIndex = 0; }
      if (!current()) {
        items = []; itemIndex = chunkIndex = 0; pauseRequested = false;
        publish({ status: "idle", activeItemId: null, groupId: null, error: null, canRetry: false });
        return;
      }
      publish({ status: pauseRequested ? "paused" : "loading", activeItemId: current().id });
      if (token === generation && !pauseRequested) speakCurrent();
    };
    active.onerror = event => {
      if (token !== generation || utterance !== active) return;
      fail(event.error === "interrupted" || event.error === "canceled" ? "英文朗读已中断，请重试。" : "英文朗读失败，请重试。");
    };
    publish({ status: "loading", activeItemId: current().id, error: null, canRetry: false });
    if (token !== generation || utterance !== active) return;
    startTimer = clock.schedule(() => {
      startTimer = null;
      if (token === generation && utterance === active && state.status === "loading") fail("英文朗读未能开始，请重试。");
    }, 10000);
    try { backend.synthesis.resume(); backend.synthesis.speak(active); }
    catch { fail("英文朗读无法启动，请重试。"); }
  }

  function waitForVoice() {
    if (!backend || !current() || pauseRequested) return;
    waitingForVoices = true;
    publish({ status: "loading", activeItemId: current().id, error: null, canRetry: false });
    if (voiceTimer !== null) return;
    const token = generation;
    voiceTimer = clock.schedule(() => {
      voiceTimer = null;
      if (token !== generation || !waitingForVoices || pauseRequested) return;
      if (refreshVoices() && current()) speakCurrent();
      else if (token === generation) fail("英文语音尚未就绪，请稍后重试或更换浏览器。");
    }, 3000);
  }

  function refreshVoices() {
    if (!backend) return false;
    try { nativeVoices = backend.synthesis.getVoices().filter(voice => /^en(?:[-_]|$)/i.test(voice.lang)); }
    catch { nativeVoices = []; }
    const voice = chooseVoice();
    publish({ voices: nativeVoices.map(({ voiceURI, name, lang, default: isDefault, localService }) => ({ voiceURI, name, lang, default: isDefault, localService })), voiceURI: voice?.voiceURI ?? "" });
    return !!voice;
  }

  const stop = () => {
    invalidate(); items = []; itemIndex = chunkIndex = 0; pauseRequested = false;
    publish({ status: backend ? "idle" : "unsupported", activeItemId: null, groupId: null, error: null, canRetry: false });
  };
  const disconnect = () => {
    stop(); connection++;
    if (backend && voiceListener) backend.synthesis.removeEventListener("voiceschanged", voiceListener);
    backend = null; voiceListener = null; nativeVoices = [];
    publish({ supported: false, status: "unsupported", voices: [], voiceURI: "" });
  };
  const connect = (next: EnglishKnowledgeSpeechBackend | null) => {
    disconnect(); backend = next;
    if (!backend) return;
    const connectedBackend = backend, token = ++connection;
    voiceListener = () => {
      if (token !== connection || backend !== connectedBackend) return;
      const ready = refreshVoices();
      if (ready && waitingForVoices && !pauseRequested && state.status === "loading") speakCurrent();
    };
    backend.synthesis.addEventListener("voiceschanged", voiceListener);
    publish({ supported: true, status: "idle", error: null });
    refreshVoices();
  };
  const play = (queue: readonly EnglishKnowledgeSpeechItem[], options?: { groupId?: string }) => {
    stop();
    if (!backend) { publish({ error: "当前浏览器不支持英文朗读。" }); return; }
    if (!queue.length || queue.length > 5000) { fail("没有可朗读的英文内容。"); return; }
    const prepared: PreparedItem[] = [];
    for (const item of queue) {
      if (!item || typeof item.id !== "string" || !item.id.trim() || typeof item.text !== "string" || !item.text.trim()) { fail("英文朗读内容不完整，请重新选择。"); return; }
      if (item.chunks && (!Array.isArray(item.chunks) || item.chunks.some(chunk => typeof chunk !== "string"))) { fail("英文朗读内容不完整，请重新选择。"); return; }
      const chunks = (item.chunks?.length ? item.chunks : [item.text]).flatMap(splitChunk);
      // The extraction layer selects English. This second barrier prevents a
      // caller mistake from reading Chinese explanations as an English item.
      if (!chunks.length || chunks.some(text => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text))) { fail("请仅选择英文单词、短语或例句进行朗读。"); return; }
      prepared.push({ id: item.id, chunks });
    }
    items = prepared; itemIndex = chunkIndex = 0; pauseRequested = false;
    publish({ groupId: options?.groupId ?? null, activeItemId: current().id, error: null, canRetry: false });
    refreshVoices(); speakCurrent();
  };
  const pause = () => {
    if (state.status !== "playing" && state.status !== "loading") return;
    pauseRequested = true;
    clearTimer(voiceTimer); clearTimer(startTimer); clearTimer(monitorTimer); clearTimer(playbackTimer); voiceTimer = startTimer = monitorTimer = playbackTimer = null;
    const token = generation, active = utterance;
    try { if (utterance) backend?.synthesis.pause(); }
    catch { fail("英文朗读无法暂停，请重试。"); return; }
    if (token !== generation || !current() || active && utterance !== active) return;
    publish({ status: "paused" });
  };
  const resume = () => {
    if (state.status !== "paused" || !backend || !current()) return;
    pauseRequested = false;
    if (utterance) {
      const active = utterance, token = generation;
      try { backend.synthesis.resume(); }
      catch { fail("英文朗读无法继续，请重试。"); return; }
      if (token !== generation || utterance !== active) return;
      clearTimer(monitorTimer); monitorTimer = null;
      if (utteranceStarted) { publish({ status: "playing" }); monitor(generation, utterance); watchPlayback(generation, utterance); }
      else {
        publish({ status: "loading" });
        startTimer = clock.schedule(() => {
          startTimer = null;
          if (token === generation && utterance === active && state.status === "loading") fail("英文朗读未能开始，请重试。");
        }, 10000);
      }
    } else { refreshVoices(); speakCurrent(); }
  };
  const retry = () => {
    if (state.status !== "error" || !backend || !current()) return;
    invalidate(); pauseRequested = false; refreshVoices(); speakCurrent();
  };
  const restartWithPreference = () => {
    if (!current() || state.status === "error") return;
    const paused = pauseRequested;
    invalidate(); pauseRequested = paused;
    if (paused) publish({ status: "paused" });
    else { refreshVoices(); speakCurrent(); }
  };
  const setRate = (rate: EnglishKnowledgeSpeechRate) => {
    if (![0.75, 1, 1.25].includes(rate) || state.rate === rate) return;
    publish({ rate }); restartWithPreference();
  };
  const setVoice = (voiceURI: string) => {
    if (voiceURI && !nativeVoices.some(voice => voice.voiceURI === voiceURI)) return;
    selectedVoice = voiceURI; refreshVoices(); restartWithPreference();
  };
  return {
    connect, disconnect, play, pause, resume, stop, retry, setRate, setVoice,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
  };
}

export function useEnglishKnowledgeSpeech(scopeKey: string | number): EnglishKnowledgeSpeechApi {
  const [controller] = useState(() => createEnglishKnowledgeSpeechController());
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  useEffect(() => {
    const supported = typeof window !== "undefined" && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";
    controller.connect(supported ? { synthesis: window.speechSynthesis, createUtterance: text => new SpeechSynthesisUtterance(text) } : null);
    return () => { controller.disconnect(); };
  }, [controller, scopeKey]);
  return useMemo(() => ({ ...state, play: controller.play, pause: controller.pause, resume: controller.resume, stop: controller.stop,
    retry: controller.retry, setRate: controller.setRate, setVoice: controller.setVoice }), [controller, state]);
}
