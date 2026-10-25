"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { EnglishSixKnowledgeBlock, EnglishSixKnowledgeInline, EnglishSixKnowledgeUnit } from "@/lib/english-six-knowledge";
import { chunkEnglishSpeech, speechForRuns } from "@/lib/english-six-knowledge-speech";
import { useEnglishKnowledgeSpeech, type EnglishKnowledgeSpeechApi, type EnglishKnowledgeSpeechItem } from "./use-english-knowledge-speech";
import styles from "./english-six-knowledge.module.css";

type Registry = { items: Map<string, EnglishKnowledgeSpeechItem>; blocks: Map<string, EnglishKnowledgeSpeechItem[]>; sections: Map<string, EnglishKnowledgeSpeechItem[]>; all: EnglishKnowledgeSpeechItem[] };
const AudioContext = createContext<{ speech: EnglishKnowledgeSpeechApi; registry: Registry } | null>(null);

export function knowledgeSpeechBlockId(sectionId: string, blockIndex: number) { return `${sectionId}-b${blockIndex}`; }

function speechItem(id: string, runs: EnglishSixKnowledgeInline[]): EnglishKnowledgeSpeechItem[] {
  const text = speechForRuns(runs).join("\n");
  return text ? [{ id, text, chunks: chunkEnglishSpeech(text) }] : [];
}

function blockItems(block: EnglishSixKnowledgeBlock, id: string): EnglishKnowledgeSpeechItem[] {
  if (block.kind === "heading") return [];
  if (block.kind === "paragraph") return speechItem(`${id}-p`, block.runs);
  if (block.kind === "callout") return block.paragraphs.flatMap((runs, index) => speechItem(`${id}-note-${index}`, runs));
  return [...(block.headers ?? []).flatMap((runs, index) => speechItem(`${id}-h-${index}`, runs)),
    ...block.rows.flatMap((row, rowIndex) => row.flatMap((runs, cellIndex) => speechItem(`${id}-r${rowIndex}-c${cellIndex}`, runs)))];
}

function makeRegistry(unit: EnglishSixKnowledgeUnit): Registry {
  const registry: Registry = { items: new Map(), blocks: new Map(), sections: new Map(), all: [] };
  for (const section of unit.sections) {
    const sectionItems = section.blocks.flatMap((block, index) => {
      const id = knowledgeSpeechBlockId(section.id, index);
      const items = blockItems(block, id);
      registry.blocks.set(id, items);
      for (const item of items) registry.items.set(item.id, item);
      return items;
    });
    registry.sections.set(section.id, sectionItems);
    registry.all.push(...sectionItems);
  }
  return registry;
}

export function KnowledgeAudioProvider({ unit, children }: { unit: EnglishSixKnowledgeUnit; children: ReactNode }) {
  const registry = useMemo(() => makeRegistry(unit), [unit]);
  const speech = useEnglishKnowledgeSpeech(String(unit.number));
  return <AudioContext.Provider value={{ speech, registry }}>{children}</AudioContext.Provider>;
}

function AudioIcon({ pause = false, stop = false }: { pause?: boolean; stop?: boolean }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false">
    {stop ? <rect x="6" y="6" width="12" height="12" rx="2" /> : pause ? <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></> : <path d="M8 4.8a1 1 0 0 1 1.5-.86l11 6.34a2 2 0 0 1 0 3.44l-11 6.34A1 1 0 0 1 8 19.2Z" />}
  </svg>;
}

function toggleQueue(speech: EnglishKnowledgeSpeechApi, items: EnglishKnowledgeSpeechItem[], groupId: string) {
  if (speech.groupId === groupId && speech.status === "playing") speech.pause();
  else if (speech.groupId === groupId && speech.status === "paused") speech.resume();
  else if (speech.groupId === groupId && speech.status === "error") speech.retry();
  else speech.play(items, { groupId });
}

export function useKnowledgeAudioActiveItem() {
  return useContext(AudioContext)?.speech.activeItemId ?? null;
}

export function KnowledgeAudioButton({ itemId }: { itemId: string }) {
  const context = useContext(AudioContext);
  const item = context?.registry.items.get(itemId);
  if (!context || !item) return null;
  const { speech } = context;
  const active = speech.activeItemId === itemId && ["playing", "paused", "loading", "error"].includes(speech.status);
  const playing = active && speech.status === "playing";
  const label = `${playing ? "暂停英文" : active && speech.status === "paused" ? "继续英文" : "播放英文"}：${item.text.slice(0, 120)}`;
  return <button type="button" className={styles.speakButton} aria-label={label} title={label}
    data-speech-item={itemId} data-speech-active={active || undefined} aria-pressed={active}
    disabled={!speech.supported || active && speech.status === "loading"}
    onClick={() => {
      if (playing) speech.pause();
      else if (active && speech.status === "paused") speech.resume();
      else if (active && speech.status === "error") speech.retry();
      else speech.play([item], { groupId: itemId });
    }}><AudioIcon pause={playing} /></button>;
}

export function KnowledgeAudioPlaylistButton({ sectionId, blockIds, label = "整组播放", className }: { sectionId?: string; blockIds?: string[]; label?: string; className?: string }) {
  const context = useContext(AudioContext);
  if (!context) return null;
  const { speech, registry } = context;
  const items = sectionId ? registry.sections.get(sectionId) ?? [] : (blockIds ?? []).flatMap(id => registry.blocks.get(id) ?? []);
  if (!items.length) return null;
  const groupId = sectionId ? `section-${sectionId}` : `group-${blockIds?.[0]}`;
  const active = speech.groupId === groupId;
  const playing = active && speech.status === "playing";
  return <button type="button" className={`${styles.playlistButton} ${className ?? ""}`} aria-label={playing ? `暂停${label}` : label}
    aria-pressed={active && ["playing", "paused", "loading"].includes(speech.status)} disabled={!speech.supported || active && speech.status === "loading"}
    onClick={() => toggleQueue(speech, items, groupId)}><AudioIcon pause={playing} /><span>{playing ? "暂停" : active && speech.status === "paused" ? "继续" : label}</span></button>;
}

function PlaybackButtons({ speech }: { speech: EnglishKnowledgeSpeechApi }) {
  const playing = speech.status === "playing";
  return <div className={styles.playbackButtons}>
    <button type="button" className={styles.playlistButton} disabled={!["playing", "paused", "error"].includes(speech.status)}
      onClick={() => playing ? speech.pause() : speech.status === "error" ? speech.retry() : speech.resume()}>
      <AudioIcon pause={playing} /><span>{playing ? "暂停" : speech.status === "error" ? "重试" : "继续"}</span>
    </button>
    <button type="button" className={styles.playlistButton} disabled={["idle", "unsupported"].includes(speech.status)} onClick={speech.stop}><AudioIcon stop /><span>停止</span></button>
  </div>;
}

export function KnowledgeAudioControls() {
  const context = useContext(AudioContext);
  if (!context) return null;
  const { speech, registry } = context;
  const statuses = { idle: "点击播放，听英文发音", loading: "正在准备英文语音…", playing: "英文朗读中", paused: "已暂停", error: "朗读暂时中断", unsupported: "当前浏览器不支持英文朗读，可使用 Chrome 或 Edge。" };
  return <section className={styles.audioPanel} aria-label="英文朗读设置" data-knowledge-audio-controls>
    <div className={styles.audioPanelHeading}><h2>英文听读</h2><span>单词 · 短语 · 例句</span></div>
    <p className={styles.audioHelp}>点英文旁的播放按钮听发音，也可以整组、整节连播。使用设备英文语音。</p>
    <div className={styles.audioSettings}>
      <label>语速<select aria-label="英文朗读语速" value={speech.rate} disabled={!speech.supported} onChange={event => speech.setRate(Number(event.target.value) as 0.75 | 1 | 1.25)}>
        <option value={0.75}>0.75× 慢速</option><option value={1}>1× 正常</option><option value={1.25}>1.25× 快速</option>
      </select></label>
      <label>英语发音<select aria-label="英语发音" value={speech.voiceURI} disabled={!speech.supported} onChange={event => speech.setVoice(event.target.value)}>
        <option value="">自动选择英语发音</option>{speech.voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
      </select></label>
    </div>
    <div className={styles.audioActions}>
      <button type="button" className={styles.unitPlayButton} disabled={!speech.supported || !registry.all.length || speech.status === "loading"} onClick={() => toggleQueue(speech, registry.all, "unit")}>
        <AudioIcon pause={speech.groupId === "unit" && speech.status === "playing"} /><span>{speech.groupId === "unit" && speech.status === "playing" ? "暂停本单元" : speech.groupId === "unit" && speech.status === "paused" ? "继续本单元" : "播放本单元英文"}</span>
      </button>
      <PlaybackButtons speech={speech} />
    </div>
    <p className={styles.audioStatus} role="status">{speech.error ?? statuses[speech.status]}</p>
  </section>;
}
