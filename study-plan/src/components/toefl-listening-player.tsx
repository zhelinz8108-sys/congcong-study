'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toeflClipAsset, toeflClipAtTime, toeflClock, toeflMediaUrl,
  type ToeflListeningSet, type ToeflPlayMode, type ToeflQuestion } from '@/lib/toefl-listening';
import styles from './toefl-listening.module.css';

const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
const modes: { id: ToeflPlayMode; label: string }[] = [
  { id: 'single', label: '单段' }, { id: 'sequence', label: '连播' }, { id: 'repeat', label: '循环' },
];

export default function ToeflListeningPlayer({ subjectId, set, initialQuestion }: {
  subjectId: string; set: ToeflListeningSet; initialQuestion?: string;
}) {
  const [selected, setSelected] = useState(initialQuestion ?? set.questions[0].id);
  const [mode, setMode] = useState<ToeflPlayMode>('single');
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [position, setPosition] = useState(0);
  const [ready, setReady] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const pending = useRef<{ position: number; play: boolean } | null>(null);
  const hydrated = useRef(false);
  const question = set.questions.find(q => q.id === selected) ?? set.questions[0];
  const clip = set.clips.find(c => c.id === question.clip)!;
  const source = toeflMediaUrl(mode === 'sequence' ? 'continuous' : toeflClipAsset(clip.id));
  const storageKey = `toefl-listening:6.6:${subjectId}:v1`;
  const moduleQuestions = set.questions.filter(q => q.module === question.module);
  const clipIndex = set.clips.findIndex(c => c.id === clip.id);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      if (!initialQuestion && set.questions.some(q => q.id === saved.selected)) setSelected(saved.selected);
      if (rates.includes(saved.rate)) setRate(saved.rate);
    } catch { /* Preferences are optional; playback never depends on storage. */ }
    setReady(true);
  }, [initialQuestion, set.questions, storageKey]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ selected, rate })); } catch { /* Private browsing may block storage. */ }
    const url = new URL(window.location.href);
    url.searchParams.set('module', String(question.module));
    url.searchParams.set('question', String(question.number));
    window.history.replaceState(null, '', url);
  }, [selected, rate, ready, storageKey, question.module, question.number]);

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    player.playbackRate = rate;
    player.loop = mode === 'repeat';
  }, [rate, mode]);

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    setError('');
    setComplete(false);
    const wanted = pending.current;
    if (wanted?.play) void player.play().catch(() => setError('请点击播放继续。'));
  }, [source]);

  function play() {
    const player = audio.current;
    if (!player) return;
    setComplete(false); setError('');
    void player.play().catch(() => setError('播放未开始，请重试。'));
  }
  function choose(q: ToeflQuestion, resume = true) {
    const player = audio.current;
    const target = set.clips.find(c => c.id === q.clip)!;
    setSelected(q.id); setComplete(false); setError('');
    if (mode === 'sequence') {
      if (q.clip !== clip.id && player) player.currentTime = target.offset;
      if (resume) play();
    } else if (q.clip === clip.id) {
      if (resume) play();
    } else {
      pending.current = { position: 0, play: resume };
      setPosition(0);
    }
  }
  function changeMode(next: ToeflPlayMode) {
    if (next === mode) return;
    const player = audio.current;
    const within = mode === 'sequence' ? Math.max(0, (player?.currentTime ?? clip.offset) - clip.offset) : player?.currentTime ?? 0;
    const nextPosition = next === 'sequence' ? clip.offset + Math.min(within, clip.duration) : Math.min(within, clip.duration);
    if ((mode === 'sequence') !== (next === 'sequence')) {
      pending.current = { position: nextPosition, play: !!player && !player.paused };
    }
    setComplete(false); setMode(next);
  }
  function loaded() {
    const player = audio.current;
    if (!player) return;
    player.playbackRate = rate;
    player.loop = mode === 'repeat';
    const wanted = pending.current;
    if (wanted) {
      player.currentTime = Math.min(wanted.position, Number.isFinite(player.duration) ? Math.max(0, player.duration - 0.01) : wanted.position);
      pending.current = null;
      if (wanted.play) play();
    }
    setPosition(mode === 'sequence' ? Math.max(0, player.currentTime - clip.offset) : player.currentTime);
  }
  function timeUpdate() {
    const player = audio.current;
    if (!player || pending.current) return;
    if (mode === 'sequence') {
      const active = toeflClipAtTime(set.clips, player.currentTime);
      if (active.id !== clip.id) {
        const first = set.questions.find(q => q.clip === active.id)!;
        setSelected(first.id);
      }
      setPosition(Math.max(0, player.currentTime - active.offset));
    } else setPosition(player.currentTime);
  }
  function adjacent(direction: number) {
    const next = set.clips[clipIndex + direction];
    if (!next) return;
    choose(set.questions.find(q => q.clip === next.id)!, true);
  }
  function skip(seconds: number) {
    const player = audio.current;
    if (!player || !Number.isFinite(player.duration)) return;
    player.currentTime = Math.max(0, Math.min(player.duration, player.currentTime + seconds));
  }

  return <main className={styles.page}>
    <Link className={styles.back} href={`/subjects/${subjectId}`}>← 英语</Link>
    <header className={styles.heading}>
      <h1>托福听力</h1>
      <span>6.6 · 27 段 · 47 题</span>
    </header>
    <nav className={styles.tabs} aria-label="听力模块">
      {[1, 2].map(module => <button key={module} type="button" aria-pressed={question.module === module}
        onClick={() => choose(set.questions.find(q => q.module === module)!, false)}>Module {module}</button>)}
    </nav>
    <nav className={styles.numbers} aria-label="听力题号">
      {moduleQuestions.map(q => <button type="button" key={q.id} aria-label={`第 ${q.number} 题`}
        aria-current={q.id === question.id ? 'true' : undefined}
        data-shared={q.clip === clip.id ? 'true' : undefined} onClick={() => choose(q)}>{q.number}</button>)}
    </nav>
    <section className={styles.player} aria-label="音频播放器">
      <div className={styles.clipHeading}>
        <h2>{clip.title}</h2>
        <span>Module {clip.module} · 第 {clip.first}{clip.last !== clip.first ? `-${clip.last}` : ''} 题</span>
      </div>
      <div className={styles.controls}>
        <div className={styles.mode} role="group" aria-label="播放方式">
          {modes.map(item => <button key={item.id} type="button" aria-pressed={mode === item.id}
            onClick={() => changeMode(item.id)}>{item.label}</button>)}
        </div>
        <label className={styles.speed}>倍速 <select aria-label="播放速度" value={rate} onChange={e => setRate(Number(e.target.value))}>
          {rates.map(value => <option key={value} value={value}>{value}×</option>)}
        </select></label>
        <a className={styles.download} href={`${toeflMediaUrl(toeflClipAsset(clip.id))}?download=1`} download title="下载当前音频" aria-label="下载当前音频">↓</a>
      </div>
      <audio ref={audio} src={source} controls preload="metadata" onLoadedMetadata={loaded} onTimeUpdate={timeUpdate}
        onPlay={() => { setPlaying(true); setError(''); }} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setComplete(mode === 'sequence'); }}
        onError={() => setError('音频加载失败，请重试或重新登录。')} aria-label="托福听力音频" />
      <div className={styles.transport}>
        <button type="button" title="上一段" aria-label="上一段" disabled={clipIndex === 0} onClick={() => adjacent(-1)}>←</button>
        <button type="button" title="后退5秒" aria-label="后退5秒" onClick={() => skip(-5)}>↶ 5</button>
        <button className={styles.play} type="button" title={playing ? '暂停' : '播放'} aria-label={playing ? '暂停' : '播放'}
          onClick={() => playing ? audio.current?.pause() : play()}>{playing ? 'Ⅱ' : '▶'}</button>
        <button type="button" title="前进5秒" aria-label="前进5秒" onClick={() => skip(5)}>5 ↷</button>
        <button type="button" title="下一段" aria-label="下一段" disabled={clipIndex === set.clips.length - 1} onClick={() => adjacent(1)}>→</button>
        <span className={styles.time}>当前段 {toeflClock(position)} / {toeflClock(clip.duration)}</span>
      </div>
      {error && <p className={styles.error} role="alert">{error} <button type="button" onClick={() => { audio.current?.load(); play(); }}>重试</button></p>}
      {complete && <p className={styles.complete} role="status">全部播放完成</p>}
    </section>
    <section className={styles.question} aria-label="当前听力题目">
      <h2>第 {question.number} 题</h2>
      <p className={styles.stem}>{question.stem}</p>
      <ol className={styles.options}>
        {Object.entries(question.options).map(([key, text]) => <li key={key}><span>{key}.</span><p>{text}</p></li>)}
      </ol>
      <details key={question.id} className={styles.original}>
        <summary>原题截图</summary>
        {/* The source screenshot is a document, so preserve its original pixels. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={toeflMediaUrl(question.id)} alt={`Module ${question.module} 第 ${question.number} 题原题截图`} loading="lazy" />
      </details>
    </section>
  </main>;
}
