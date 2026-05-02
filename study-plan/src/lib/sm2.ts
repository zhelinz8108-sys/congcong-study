/**
 * SM-2 Spaced Repetition Algorithm (Anki variant)
 *
 * Quality ratings:
 *   0 = 完全不会 (Again)
 *   1 = 很难想起 (Hard)
 *   2 = 想了一会 (Good)
 *   3 = 很轻松   (Easy)
 *
 * Maps to SM-2 quality 0-5:
 *   0→1, 1→2, 2→4, 3→5
 */

interface SM2Input {
  interval: number;      // current interval in days
  repetitions: number;   // successful repetitions count
  ease_factor: number;   // easiness factor (≥1.3)
  quality: number;       // user rating 0-3
}

interface SM2Output {
  interval: number;
  repetitions: number;
  ease_factor: number;
  next_review: string;   // ISO datetime string
  mastered: number;       // 1 if interval >= 21 days
}

const QUALITY_MAP = [1, 2, 4, 5]; // maps 0-3 to SM-2 scale

export function sm2(input: SM2Input): SM2Output {
  const q = QUALITY_MAP[Math.min(Math.max(input.quality, 0), 3)];
  let { interval, repetitions, ease_factor } = input;

  // Update ease factor: EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
  ease_factor = ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease_factor < 1.3) ease_factor = 1.3;

  if (q < 3) {
    // Failed: reset
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease_factor);
    }
  }

  // Cap interval at 365 days
  if (interval > 365) interval = 365;

  const now = new Date();
  const next = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
  const next_review = next.toISOString().replace("T", " ").slice(0, 19);

  return {
    interval,
    repetitions,
    ease_factor: Math.round(ease_factor * 100) / 100,
    next_review,
    mastered: interval >= 21 ? 1 : 0,
  };
}

/** Format interval as human-readable Chinese string */
export function formatInterval(days: number): string {
  if (days === 0) return "新词";
  if (days === 1) return "1天";
  if (days < 7) return `${days}天`;
  if (days < 30) return `${Math.round(days / 7)}周`;
  if (days < 365) return `${Math.round(days / 30)}个月`;
  return `${Math.round(days / 365)}年`;
}
