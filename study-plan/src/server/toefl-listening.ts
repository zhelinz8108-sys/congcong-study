import path from 'node:path';
import data from '@/data/toefl-listening-6-6.json';
import { toeflClipAsset } from '@/lib/toefl-listening';

const assets = new Map<string, { filename: string; type: string }>([
  ...data.clips.map(clip => [toeflClipAsset(clip.id), { filename: `${toeflClipAsset(clip.id)}.m4a`, type: 'audio/mp4' }] as const),
  ...data.questions.map(question => [question.id, { filename: `${question.id}.png`, type: 'image/png' }] as const),
  ['continuous', { filename: 'continuous.m4a', type: 'audio/mp4' }] as const,
]);

export function toeflAsset(asset: string) {
  const entry = assets.get(asset);
  if (!entry) return null;
  const root = process.env.TOEFL_LISTENING_ROOT || path.join(process.cwd(), 'content/toefl-listening/6.6');
  return { ...entry, file: path.join(root, entry.filename) };
}

export function toeflRange(value: string | null, size: number) {
  if (!value) return { start: 0, end: size - 1, status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const suffix = match[1] ? null : Number(match[2]);
  if (suffix !== null && (!Number.isSafeInteger(suffix) || suffix <= 0)) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - suffix!);
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return null;
  return { start, end, status: 206 };
}
