export interface Subject {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
  material_count?: number;
  unit_count?: number;
  word_count?: number;
}

export interface Unit {
  id: string;
  subject_id: string;
  name: string;
  group_name: string;
  sort_order: number;
  created_at: string;
  materials?: Material[];
  words?: Word[];
  material_count?: number;
  word_count?: number;
}

export interface Word {
  id: string;
  subject_id: string;
  unit_id: string | null;
  word: string;
  phonetic: string;
  meaning: string;
  example: string;
  mastered: number;
  interval: number;
  repetitions: number;
  ease_factor: number;
  next_review: string;
  last_review: string | null;
  audio_start: number | null;
  audio_end: number | null;
  sort_order: number;
  created_at: string;
}

export interface Material {
  id: string;
  unit_id: string;
  name: string;
  file_path: string | null;
  file_type: "pdf" | "image" | "video" | "audio" | "other";
  file_size: number;
  sort_order: number;
  created_at: string;
}
