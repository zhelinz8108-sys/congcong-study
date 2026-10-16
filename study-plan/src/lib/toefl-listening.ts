export type ToeflClip = {
  id: number; module: number; first: number; last: number; type: string;
  duration: number; offset: number; title: string;
};
export type ToeflQuestion = {
  id: string; module: number; number: number; clip: number; type: string;
  stem: string; options: Record<string, string>;
};
export type ToeflListeningSet = {
  version: number; title: string; clips: ToeflClip[]; questions: ToeflQuestion[];
  continuousDuration: number;
};
export type ToeflPlayMode = 'single' | 'sequence' | 'repeat';

export function toeflMediaUrl(asset: string) {
  return `/api/english/toefl/media/${encodeURIComponent(asset)}`;
}
export function toeflClipAsset(id: number) {
  return `clip-${String(id).padStart(2, '0')}`;
}
export function toeflClipAtTime(clips: ToeflClip[], time: number) {
  return [...clips].reverse().find(clip => time >= clip.offset - 0.02) ?? clips[0];
}
export function toeflClock(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
