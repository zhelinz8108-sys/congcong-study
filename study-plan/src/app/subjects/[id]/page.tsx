"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import EnglishListeningPanel from "@/components/english-listening-panel";
import { countMathCurriculumItems } from "@/lib/math-curriculum";
import { countMathGradeFivePoints } from "@/lib/math-grade-five";
import { countChineseTopics } from "@/lib/chinese-curriculum";
import type { Subject, Unit, Material, Word } from "@/lib/types";

const FILE_TYPE_LABELS: Record<string, { label: string; badge: string }> = {
  video: { label: "视频", badge: "badge-video" },
  image: { label: "图片", badge: "badge-image" },
  pdf: { label: "PDF", badge: "badge-pdf" },
  audio: { label: "音频", badge: "badge-audio" },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Helper: interval display ── */
function fmtInterval(days: number): string {
  if (days === 0) return "新词";
  if (days === 1) return "1天后";
  if (days < 7) return `${days}天后`;
  if (days < 30) return `${Math.round(days / 7)}周后`;
  if (days < 365) return `${Math.round(days / 30)}个月后`;
  return `${Math.round(days / 365)}年后`;
}

const RATING_BUTTONS = [
  { quality: 0, label: "不会", sub: "1天", color: "bg-red-500" },
  { quality: 1, label: "困难", sub: "1天", color: "bg-orange-500" },
  { quality: 2, label: "一般", sub: "", color: "bg-blue-500" },
  { quality: 3, label: "简单", sub: "", color: "bg-emerald-500" },
];

/* ── Vocabulary Section (英语 only) ── */
function VocabSection({ subjectId }: { subjectId: string }) {
  const [words, setWords] = useState<Word[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [adding, setAdding] = useState(false);
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [example, setExample] = useState("");
  const [filter, setFilter] = useState<"all" | "learning" | "mastered">("all");
  // Review mode
  const [reviewing, setReviewing] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<Word[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewDone, setReviewDone] = useState(0);
  // Word list expand/collapse
  const [wordsExpanded, setWordsExpanded] = useState(false);
  // Import mode
  const [importing, setImporting] = useState(false);
  const [importParsing, setImportParsing] = useState(false);
  const [importPreview, setImportPreview] = useState<{ word: string; meaning: string }[]>([]);
  const [importFilename, setImportFilename] = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const loadWords = useCallback(async () => {
    const res = await fetch(`/api/words?subject_id=${subjectId}`);
    if (res.ok) {
      const data = await res.json();
      setWords(data.words);
      setDueCount(data.dueCount);
    }
  }, [subjectId]);

  useEffect(() => { loadWords(); }, [loadWords]);

  const addWord = async () => {
    if (!word.trim()) return;
    // Auto-fetch phonetic
    let phonetic = "";
    try {
      const pRes = await fetch(`/api/words/phonetic?word=${encodeURIComponent(word.trim())}`);
      if (pRes.ok) phonetic = (await pRes.json()).phonetic ?? "";
    } catch { /* ignore */ }
    await fetch("/api/words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject_id: subjectId, word, phonetic, meaning, example }),
    });
    setWord(""); setMeaning(""); setExample(""); setAdding(false);
    loadWords();
  };

  const deleteWord = async (wId: string) => {
    if (!confirm("删除这个单词？")) return;
    await fetch(`/api/words/${wId}`, { method: "DELETE" });
    loadWords();
  };

  // Import: upload file and parse
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportParsing(true);
    setImporting(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("subject_id", subjectId);
    fd.append("mode", "preview");
    try {
      const res = await fetch("/api/words/import", { method: "POST", body: fd });
      if (!res.ok) throw new Error("解析失败");
      const data = await res.json();
      setImportPreview(data.preview ?? []);
      setImportFilename(data.filename ?? file.name);
    } catch {
      alert("文件解析失败，请检查文件格式");
      setImporting(false);
    }
    setImportParsing(false);
  };

  const confirmImport = async () => {
    setImportSaving(true);
    // Batch fetch phonetics (parallel, max 10 at a time)
    const withPhonetics = [...importPreview];
    for (let i = 0; i < withPhonetics.length; i += 10) {
      const batch = withPhonetics.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(async (w) => {
          try {
            const r = await fetch(`/api/words/phonetic?word=${encodeURIComponent(w.word)}`);
            if (r.ok) return (await r.json()).phonetic ?? "";
          } catch { /* ignore */ }
          return "";
        })
      );
      results.forEach((p, j) => {
        (withPhonetics[i + j] as { phonetic?: string }).phonetic = p;
      });
    }
    const fd = new FormData();
    fd.append("subject_id", subjectId);
    fd.append("mode", "import");
    fd.append("words", JSON.stringify(withPhonetics));
    const res = await fetch("/api/words/import", { method: "POST", body: fd });
    const data = await res.json();
    setImportSaving(false);
    setImporting(false);
    setImportPreview([]);
    loadWords();
    alert(`成功导入 ${data.imported} 个单词（跳过 ${data.total - data.imported} 个重复）`);
  };

  // Start review: pick due words
  const startReview = () => {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const due = words.filter((w) => w.next_review <= now);
    if (due.length === 0) return;
    // Shuffle
    const shuffled = [...due].sort(() => Math.random() - 0.5);
    setReviewQueue(shuffled);
    setCurrentIdx(0);
    setShowAnswer(false);
    setReviewDone(0);
    setReviewing(true);
  };

  const rateWord = async (quality: number) => {
    const current = reviewQueue[currentIdx];
    await fetch("/api/words/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: current.id, quality }),
    });
    setReviewDone((d) => d + 1);
    if (currentIdx + 1 < reviewQueue.length) {
      setCurrentIdx((i) => i + 1);
      setShowAnswer(false);
    } else {
      // Review complete
      setReviewing(false);
      loadWords();
    }
  };

  const filtered = filter === "all" ? words
    : filter === "mastered" ? words.filter((w) => w.mastered)
    : words.filter((w) => !w.mastered);

  const masteredCount = words.filter((w) => w.mastered).length;

  // ── Review Mode UI ──
  if (reviewing && reviewQueue.length > 0) {
    const current = reviewQueue[currentIdx];
    return (
      <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-800">
              复习进度 {reviewDone + 1}/{reviewQueue.length}
            </span>
            <button onClick={() => { setReviewing(false); loadWords(); }} className="text-xs text-stone-400">退出复习</button>
          </div>
          <div className="mt-2 w-full bg-emerald-100 rounded-full h-1.5">
            <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${((reviewDone) / reviewQueue.length) * 100}%` }} />
          </div>
        </div>

        <div className="p-6 text-center min-h-[200px] flex flex-col items-center justify-center">
          {/* Word */}
          <p className="text-3xl font-bold mb-1">{current.word}</p>
          {current.phonetic && <p className="text-sm text-stone-400 mb-2">{current.phonetic}</p>}

          {showAnswer ? (
            <>
              <p className="text-lg text-stone-600 mb-1">{current.meaning}</p>
              {current.example && <p className="text-sm text-stone-400 italic mb-6">{current.example}</p>}

              {/* Rating buttons */}
              <p className="text-xs text-stone-400 mb-3">你觉得这个词怎么样？</p>
              <div className="flex gap-2 w-full max-w-xs mx-auto">
                {RATING_BUTTONS.map((btn) => (
                  <button
                    key={btn.quality}
                    onClick={() => rateWord(btn.quality)}
                    className={`flex-1 py-2 rounded-xl text-white text-sm font-medium ${btn.color} active:scale-95 transition-transform`}
                  >
                    <div>{btn.label}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowAnswer(true)}
              className="mt-4 px-8 py-3 bg-emerald-500 text-white rounded-xl text-lg font-medium active:scale-95 transition-transform"
            >
              显示答案
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Normal Mode UI ──
  return (
    <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📝</span>
            <span className="text-lg font-semibold text-emerald-800">单词学习</span>
            <span className="text-xs text-emerald-600">{masteredCount}/{words.length} 已掌握</span>
          </div>
          <div className="flex items-center gap-2">
            {dueCount > 0 && (
              <button
                onClick={startReview}
                className="text-sm px-3 py-1 rounded-lg bg-emerald-600 text-white font-medium active:scale-95"
              >
                复习 ({dueCount})
              </button>
            )}
            <button
              onClick={() => importFileRef.current?.click()}
              className="text-sm px-3 py-1 rounded-lg text-emerald-600 hover:bg-emerald-100 font-medium"
            >
              导入
            </button>
            <button
              onClick={() => setAdding(true)}
              className="text-sm px-3 py-1 rounded-lg text-emerald-600 hover:bg-emerald-100 font-medium"
            >
              + 添加
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".pdf,.txt,.csv,.tsv"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
        </div>

        {/* Progress bar */}
        {words.length > 0 && (
          <div className="mt-2 w-full bg-emerald-100 rounded-full h-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all"
              style={{ width: `${(masteredCount / words.length) * 100}%` }}
            />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mt-2">
          {([["all", "全部"], ["learning", "学习中"], ["mastered", "已掌握"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs px-2 py-0.5 rounded-full ${
                filter === key ? "bg-emerald-600 text-white" : "text-emerald-600 hover:bg-emerald-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Import preview */}
      {importing && (
        <div className="p-4 border-b border-stone-100">
          {importParsing ? (
            <p className="text-sm text-stone-400 text-center py-4">解析中...</p>
          ) : importPreview.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">
                  从 {importFilename} 解析出 <span className="text-emerald-600 font-bold">{importPreview.length}</span> 个单词
                </p>
                <div className="flex gap-2">
                  <button onClick={() => { setImporting(false); setImportPreview([]); }} className="text-xs text-stone-400 px-2 py-1">取消</button>
                  <button onClick={confirmImport} disabled={importSaving} className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg">
                    {importSaving ? "导入中..." : "确认导入"}
                  </button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 text-sm">
                {importPreview.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 border-b border-stone-50">
                    <span className="text-xs text-stone-300 w-6">{i + 1}</span>
                    <span className="font-medium">{w.word}</span>
                    <span className="text-stone-400">{w.meaning}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-stone-400">没有解析到单词</p>
              <p className="text-xs text-stone-300 mt-1">支持格式：每行一个 "单词 - 中文意思" 或 "单词  中文意思"</p>
              <button onClick={() => setImporting(false)} className="text-xs text-stone-400 mt-2">关闭</button>
            </div>
          )}
        </div>
      )}

      {/* Add word form */}
      {adding && (
        <div className="p-4 border-b border-stone-100 space-y-2">
          <input
            type="text" placeholder="单词" value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addWord()}
            className="w-full border-b border-stone-200 pb-1 outline-none font-medium"
            autoFocus
          />
          <input
            type="text" placeholder="中文意思" value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addWord()}
            className="w-full border-b border-stone-200 pb-1 outline-none text-sm"
          />
          <input
            type="text" placeholder="例句（选填）" value={example}
            onChange={(e) => setExample(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addWord()}
            className="w-full border-b border-stone-200 pb-1 outline-none text-sm text-stone-500"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setAdding(false); setWord(""); setMeaning(""); setExample(""); }} className="text-sm text-stone-400 px-3 py-1">取消</button>
            <button onClick={addWord} className="text-sm bg-emerald-600 text-white px-4 py-1.5 rounded-lg">添加</button>
          </div>
        </div>
      )}

      {/* Word list */}
      <div className="p-3">
        {filtered.length > 0 ? (
          <>
          <div className="space-y-1">
            {(wordsExpanded ? filtered : filtered.slice(0, 5)).map((w) => (
              <div key={w.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-stone-50 group">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                  w.mastered ? "bg-emerald-500 border-emerald-500 text-white" : "border-stone-300"
                }`}>
                  {w.mastered && <span className="text-xs">✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={`font-semibold ${w.mastered ? "text-stone-400" : ""}`}>{w.word}</span>
                    {w.phonetic && <span className="text-xs text-stone-400">{w.phonetic}</span>}
                    <span className="text-sm text-stone-500">{w.meaning}</span>
                  </div>
                  {w.example && (
                    <p className="text-xs text-stone-400 mt-0.5 italic">{w.example}</p>
                  )}
                  <p className="text-xs text-stone-300 mt-0.5">
                    {w.interval === 0 ? "新词" : `间隔 ${fmtInterval(w.interval)}`}
                  </p>
                </div>
                <button
                  onClick={() => deleteWord(w.id)}
                  className="text-xs text-stone-300 hover:text-red-400 opacity-0 group-hover:opacity-100 px-1 shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {filtered.length > 5 && (
            <button
              onClick={() => setWordsExpanded(!wordsExpanded)}
              className="w-full text-center text-sm text-emerald-600 hover:text-emerald-700 py-2 mt-1"
            >
              {wordsExpanded ? "收起" : `展开全部 ${filtered.length} 个单词`}
            </button>
          )}
          </>
        ) : (
          <p className="text-sm text-stone-300 text-center py-4">
            {words.length === 0 ? "点击上方 + 添加 开始背单词" : "没有匹配的单词"}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Main Subject Page ── */
export default function SubjectPage() {
  const { id } = useParams() as { id: string };

  const [subject, setSubject] = useState<Subject | null>(null);
  const [units, setUnits] = useState<(Unit & { words?: Word[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [addingUnit, setAddingUnit] = useState(false);
  const [unitName, setUnitName] = useState("");
  const [uploadingUnit, setUploadingUnit] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const wordAudioRef = useRef<HTMLAudioElement | null>(null);
  const wordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playWordAudio = (src: string, start: number, end: number) => {
    if (wordTimerRef.current) clearTimeout(wordTimerRef.current);
    if (wordAudioRef.current) { wordAudioRef.current.pause(); }
    const a = new Audio(src);
    wordAudioRef.current = a;
    a.currentTime = start;
    a.play().catch(() => {});
    const dur = (end - start) * 1000;
    wordTimerRef.current = setTimeout(() => { a.pause(); }, dur);
  };

  // Review state
  const [reviewing, setReviewing] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<Word[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewDone, setReviewDone] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [hideModes, setHideModes] = useState<Record<string, "none" | "english" | "chinese">>({});
  const [fontSize, setFontSize] = useState(100); // percentage
  const [revealedWords, setRevealedWords] = useState<Set<string>>(new Set());
  const [playingUnitId, setPlayingUnitId] = useState<string | null>(null);
  const playingRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const playAllWords = async (unitId: string, unitWords: Word[]) => {
    if (playingUnitId === unitId) {
      // Stop playing
      playingRef.current.cancelled = true;
      speechSynthesis.cancel();
      setPlayingUnitId(null);
      return;
    }
    // Start playing
    playingRef.current = { cancelled: false };
    setPlayingUnitId(unitId);

    for (let i = 0; i < unitWords.length; i++) {
      if (playingRef.current.cancelled) break;
      const w = unitWords[i];

      // Speak the English word
      await new Promise<void>((resolve) => {
        const utterEn = new SpeechSynthesisUtterance(w.word);
        utterEn.lang = "en-US";
        utterEn.rate = 0.85;
        utterEn.onend = () => resolve();
        utterEn.onerror = () => resolve();
        speechSynthesis.speak(utterEn);
      });

      if (playingRef.current.cancelled) break;

      // 2 second pause between words
      if (i < unitWords.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!playingRef.current.cancelled) {
      setPlayingUnitId(null);
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");

      const metaRes = await fetch(`/api/subjects/${id}?meta=1`);
      if (!metaRes.ok) throw new Error(`Failed to load subject (${metaRes.status})`);

      const metaSubject = await metaRes.json();
      setSubject(metaSubject);

      const isEnglishSubject = metaSubject.name === "英语";

      if (isEnglishSubject) {
        setUnits([]);
        setTotalWords(0);
        setDueCount(0);
        return;
      }

      const res = await fetch(`/api/subjects/${id}`);
      if (!res.ok) throw new Error(`Failed to load subject details (${res.status})`);

      const data = await res.json();
      const { units: u, totalWords: tw, dueCount: dc, ...s } = data;
      setSubject(s);
      setUnits(u);

      if (tw != null) {
        setTotalWords(tw);
        setDueCount(dc ?? 0);
      } else {
        const allWords: Word[] = u.flatMap((unit: { words?: Word[] }) => unit.words ?? []);
        setTotalWords(allWords.length);
        const now = new Date().toISOString().replace("T", " ").slice(0, 19);
        setDueCount(allWords.filter((w: Word) => w.next_review <= now).length);
      }
    } catch (error) {
      setSubject(null);
      setUnits([]);
      setLoadError(error instanceof Error ? error.message : "Failed to load subject");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addUnit = async () => {
    if (!unitName.trim()) return;
    await fetch("/api/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject_id: id, name: unitName.trim() }),
    });
    setUnitName("");
    setAddingUnit(false);
    load();
  };

  const deleteUnit = async (unitId: string) => {
    if (!confirm("删除该单元及所有资料？")) return;
    await fetch(`/api/units/${unitId}`, { method: "DELETE" });
    load();
  };

  const uploadFiles = async (unitId: string, files: FileList | File[]) => {
    setUploadingUnit(unitId);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      const uploaded = await uploadRes.json();
      await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_id: unitId,
          name: file.name.replace(/\.[^/.]+$/, ""),
          file_path: uploaded.file_path,
          file_type: uploaded.file_type,
          file_size: file.size,
        }),
      });
    }
    setUploadingUnit(null);
    load();
  };

  const handleFileChange = (unitId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) uploadFiles(unitId, e.target.files);
    e.target.value = "";
  };

  const handleDrop = (unitId: string, e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) uploadFiles(unitId, e.dataTransfer.files);
  };

  // Review functions
  const startReview = () => {
    const allWords: Word[] = units.flatMap((u) => (u.words ?? []) as Word[]);
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const due = allWords.filter((w) => w.next_review <= now);
    if (due.length === 0) return;
    const shuffled = [...due].sort(() => Math.random() - 0.5);
    setReviewQueue(shuffled);
    setCurrentIdx(0);
    setShowAnswer(false);
    setReviewDone(0);
    setReviewing(true);
  };

  const rateWord = async (quality: number) => {
    const current = reviewQueue[currentIdx];
    await fetch("/api/words/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: current.id, quality }),
    });
    setReviewDone((d) => d + 1);
    if (currentIdx + 1 < reviewQueue.length) {
      setCurrentIdx((i) => i + 1);
      setShowAnswer(false);
    } else {
      setReviewing(false);
      load();
    }
  };

  const deleteMaterial = async (matId: string) => {
    if (!confirm("确定删除？")) return;
    await fetch(`/api/materials/${matId}`, { method: "DELETE" });
    load();
  };

  // English skill sections state
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [vocabExpanded, setVocabExpanded] = useState(false);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-5 py-16">
        <div className="bg-white rounded-2xl border border-stone-200 px-6 py-10 text-center text-stone-500">
          Loading...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto px-5 py-16">
        <div className="bg-white rounded-2xl border border-red-200 px-6 py-10 text-center">
          <p className="text-sm text-red-500">{loadError}</p>
          <button
            onClick={load}
            className="mt-4 rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!subject) return null;

  const isEnglish = subject.name === "英语";
  const isMath = subject.name === "数学";
  const isChinese = subject.name === "语文";
  const totalMaterials = units.reduce((sum, u) => sum + (u.materials?.length ?? 0), 0);

  const ENGLISH_SKILLS = [
    { key: "reading", name: "阅读", icon: "📖", color: "#ef4444", bgColor: "bg-red-50", borderColor: "border-red-200", textColor: "text-red-800", desc: "Reading" },
    { key: "listening", name: "听力", icon: "👂", color: "#f59e0b", bgColor: "bg-amber-50", borderColor: "border-amber-200", textColor: "text-amber-800", desc: "Listening" },
    { key: "speaking", name: "口语", icon: "🗣️", color: "#3b82f6", bgColor: "bg-blue-50", borderColor: "border-blue-200", textColor: "text-blue-800", desc: "Speaking" },
    { key: "writing", name: "写作", icon: "✍️", color: "#22c55e", bgColor: "bg-emerald-50", borderColor: "border-emerald-200", textColor: "text-emerald-800", desc: "Writing" },
  ];

  // Review mode UI
  if (reviewing && reviewQueue.length > 0) {
    const current = reviewQueue[currentIdx];
    return (
      <div className="max-w-lg mx-auto px-5 py-8">
        <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-emerald-800">复习进度 {reviewDone + 1}/{reviewQueue.length}</span>
              <button onClick={() => { setReviewing(false); load(); }} className="text-xs text-stone-400">退出复习</button>
            </div>
            <div className="mt-2 w-full bg-emerald-100 rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${(reviewDone / reviewQueue.length) * 100}%` }} />
            </div>
          </div>
          <div className="p-6 text-center min-h-[200px] flex flex-col items-center justify-center">
            <p className="text-3xl font-bold mb-1">{current.word}</p>
            {current.phonetic && <p className="text-sm text-stone-400 mb-2">{current.phonetic}</p>}
            {showAnswer ? (
              <>
                <p className="text-lg text-stone-600 mb-1">{current.meaning}</p>
                {current.example && <p className="text-sm text-stone-400 italic mb-6">{current.example}</p>}
                <p className="text-xs text-stone-400 mb-3">你觉得这个词怎么样？</p>
                <div className="flex gap-2 w-full max-w-xs mx-auto">
                  {RATING_BUTTONS.map((btn) => (
                    <button key={btn.quality} onClick={() => rateWord(btn.quality)} className={`flex-1 py-2 rounded-xl text-white text-sm font-medium ${btn.color} active:scale-95 transition-transform`}>
                      {btn.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button onClick={() => setShowAnswer(true)} className="mt-4 px-8 py-3 bg-emerald-500 text-white rounded-xl text-lg font-medium active:scale-95 transition-transform">
                显示答案
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isEnglish && (!activeSkill || activeSkill === "listening") ? 'max-w-5xl' : 'max-w-lg'} mx-auto px-5 py-8`} style={{ zoom: fontSize / 100 }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-stone-400 hover:text-stone-600 text-xl">←</Link>
        <div className="w-3 h-3 rounded-full" style={{ background: subject.color }} />
        <h1 className="text-2xl font-bold">{subject.name}</h1>
        <div className="flex items-center gap-1 ml-auto" style={{ fontSize: "16px" }}>
          <button onClick={() => setFontSize((s) => Math.max(70, s - 10))} className="w-7 h-7 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-100 flex items-center justify-center text-sm">A-</button>
          <span className="text-xs text-stone-400 w-8 text-center">{fontSize}%</span>
          <button onClick={() => setFontSize((s) => Math.min(150, s + 10))} className="w-7 h-7 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-100 flex items-center justify-center text-sm">A+</button>
        </div>
      </div>

      {/* English: 4 skill sections */}
      {isEnglish && !activeSkill && (
        <div className="flex gap-12">
          {/* 左侧：四大技能 */}
          <div className="flex-1">
          {/* 4 skill cards */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {ENGLISH_SKILLS.map((skill) => (
              <button
                key={skill.key}
                onClick={() => setActiveSkill(skill.key)}
                className={`${skill.bgColor} ${skill.borderColor} border-2 rounded-2xl p-6 text-center transition-all active:scale-95 hover:shadow-md`}
              >
                <span className="text-4xl block mb-3">{skill.icon}</span>
                <span className={`text-xl font-bold block ${skill.textColor}`}>{skill.name}</span>
                <span className="text-xs text-stone-400 block mt-1">{skill.desc}</span>
              </button>
            ))}
          </div>
          </div>

          {/* 右侧：单词 / 词组学习 */}
          <div className="flex-1 space-y-4">
          {/* 单词学习 - links to dedicated page */}
          <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
            <Link
              href={`/subjects/${id}/vocab`}
              className="px-4 py-3 bg-emerald-50 flex items-center justify-between cursor-pointer hover:bg-emerald-100 transition-colors block"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-emerald-800 whitespace-nowrap">📝 单词学习</span>
              </div>
              <span className="text-stone-400 text-sm">→</span>
            </Link>

            {/* Word book groups - preview only */}
            {false && (() => {
              const groups = new Map<string, typeof units>();
              for (const u of units) {
                const g = (u as { group_name?: string }).group_name || "未分组";
                if (!groups.has(g)) groups.set(g, []);
                groups.get(g)!.push(u);
              }
              // Group into sections
              const sections = new Map<string, { groupName: string; groupUnits: typeof units }[]>();
              for (const [groupName, groupUnits] of groups) {
                const sepIdx = groupName.indexOf("｜");
                const sectionKey = sepIdx >= 0 ? groupName.substring(0, sepIdx) : "";
                if (!sections.has(sectionKey)) sections.set(sectionKey, []);
                sections.get(sectionKey)!.push({ groupName, groupUnits });
              }
              return (
                <div className="p-3 space-y-2">
                  {Array.from(sections.entries()).map(([sectionKey, sectionGroups]) => (
                    <div key={sectionKey || "_default"}>
                      {sectionKey && (
                        <p className="text-sm font-bold text-stone-600 px-1 pt-2 pb-1">{sectionKey}</p>
                      )}
                      {sectionGroups.map(({ groupName, groupUnits }) => {
                        const displayName = groupName.includes("｜") ? groupName.split("｜")[1] : groupName;
                        const groupWords = groupUnits.reduce((s, u) => s + ((u.words ?? []).length), 0);
                        const isOpen = expandedBooks.has(groupName);
                        return (
                          <div key={groupName}>
                            <div
                              onClick={() => {
                                setExpandedBooks((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(groupName)) next.delete(groupName); else next.add(groupName);
                                  return next;
                                });
                              }}
                              className="mb-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 flex items-center justify-between hover:bg-emerald-50 transition-colors cursor-pointer"
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-base">{displayName}</span>
                                <span className="text-xs text-stone-400">{groupUnits.length} 个句子 · {groupWords} 个单词</span>
                              </div>
                              <span className="text-stone-400 text-sm">{isOpen ? "▲" : "▼"}</span>
                            </div>
                            {isOpen && groupUnits.map((unit) => (
                              <div key={unit.id} className="ml-2 mb-3 bg-white rounded-xl border border-stone-100 overflow-hidden">
                                <div className="px-3 py-2 border-b border-stone-50 flex items-center justify-between">
                                  <span className="text-sm font-semibold">{unit.name}</span>
                                  <div className="flex items-center gap-1">
                                    {(unit.words ?? []).length > 0 && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); playAllWords(unit.id, (unit.words ?? []) as Word[]); }}
                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                                          playingUnitId === unit.id
                                            ? "bg-red-500 text-white animate-pulse"
                                            : "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-90"
                                        }`}
                                      >
                                        {playingUnitId === unit.id ? "⏹" : "▶"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {/* Words */}
                                {((unit.words ?? []) as Word[]).length > 0 && (
                                  <div className="px-3 py-2">
                                    <div className="flex gap-1.5 mb-2">
                                      <button
                                        onClick={() => { setHideModes((p) => ({ ...p, [unit.id]: p[unit.id] === "chinese" ? "none" : "chinese" })); setRevealedWords(new Set()); }}
                                        className={`text-xs px-3 py-1 rounded-lg transition-all ${
                                          (hideModes[unit.id] ?? "none") === "chinese"
                                            ? "bg-orange-500 text-white"
                                            : "text-stone-500 border border-stone-200"
                                        }`}
                                      >
                                        {(hideModes[unit.id] ?? "none") === "chinese" ? "显示中文" : "遮住中文"}
                                      </button>
                                      <button
                                        onClick={() => { setHideModes((p) => ({ ...p, [unit.id]: p[unit.id] === "english" ? "none" : "english" })); setRevealedWords(new Set()); }}
                                        className={`text-xs px-3 py-1 rounded-lg transition-all ${
                                          (hideModes[unit.id] ?? "none") === "english"
                                            ? "bg-blue-500 text-white"
                                            : "text-stone-500 border border-stone-200"
                                        }`}
                                      >
                                        {(hideModes[unit.id] ?? "none") === "english" ? "显示英文" : "遮住英文"}
                                      </button>
                                    </div>
                                    <div className="space-y-0.5">
                                      {((unit.words ?? []) as Word[]).map((w) => {
                                        const audioSrc = (unit.materials ?? []).find((m: Material) => m.file_type === "audio")?.file_path;
                                        const isRevealed = revealedWords.has(w.id);
                                        const unitHideMode = hideModes[unit.id] ?? "none";
                                        const hideEn = unitHideMode === "english" && !isRevealed;
                                        const hideCn = unitHideMode === "chinese" && !isRevealed;
                                        return (
                                          <div
                                            key={w.id}
                                            className="flex items-center gap-2 py-0.5 text-sm cursor-pointer"
                                            onClick={() => {
                                              if (unitHideMode !== "none") {
                                                setRevealedWords((prev) => {
                                                  const next = new Set(prev);
                                                  if (next.has(w.id)) next.delete(w.id); else next.add(w.id);
                                                  return next;
                                                });
                                              }
                                            }}
                                          >
                                            {w.audio_start != null && audioSrc && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); playWordAudio(audioSrc, w.audio_start!, w.audio_end ?? w.audio_start! + 2); }}
                                                className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 hover:bg-emerald-600 active:scale-90 text-xs"
                                              >
                                                ▶
                                              </button>
                                            )}
                                            <span className={`font-medium ${hideEn ? "bg-stone-200 text-transparent rounded select-none" : ""}`}>{w.word}</span>
                                            {w.phonetic && <span className={`text-xs text-stone-400 ${hideEn ? "invisible" : ""}`}>{w.phonetic}</span>}
                                            <span className={`text-stone-500 ${hideCn ? "bg-stone-200 text-transparent rounded select-none" : ""}`}>{w.meaning}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {/* Audio materials */}
                                {(unit.materials ?? []).filter((m: Material) => m.file_type === "audio").map((m: Material) => (
                                  <div key={m.id} className="px-3 pb-2">
                                    <audio controls className="w-full h-8" style={{ borderRadius: 8 }}>
                                      <source src={m.file_path!} type="audio/mpeg" />
                                    </audio>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
            <Link
              href={`/subjects/${id}/phrases`}
              className="px-4 py-3 bg-emerald-50 flex items-center justify-between cursor-pointer hover:bg-emerald-100 transition-colors block"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-emerald-800 whitespace-nowrap">🗂️ 词组学习</span>
              </div>
              <span className="text-stone-400 text-sm">→</span>
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
            <Link
              href={`/subjects/${id}/grammar`}
              className="px-4 py-3 bg-amber-50 flex items-center justify-between cursor-pointer hover:bg-amber-100 transition-colors block"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-amber-800 whitespace-nowrap">📚 语法</span>
              </div>
              <span className="text-stone-400 text-sm">→</span>
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-sky-200 overflow-hidden">
            <Link
              href={`/subjects/${id}/sentences`}
              className="px-4 py-3 bg-sky-50 flex items-center justify-between cursor-pointer hover:bg-sky-100 transition-colors block"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-sky-800 whitespace-nowrap">✍️ 句子训练</span>
              </div>
              <span className="text-stone-400 text-sm">→</span>
            </Link>
          </div>
          </div>
        </div>
      )}

      {/* English: active skill detail view */}
      {isEnglish && activeSkill && (
        <>
          <button
            onClick={() => setActiveSkill(null)}
            className="mb-4 text-sm text-stone-400 hover:text-stone-600 flex items-center gap-1"
          >
            ← 返回四大板块
          </button>
          <div className={`mb-6 rounded-2xl border-2 p-4 ${ENGLISH_SKILLS.find(s => s.key === activeSkill)?.bgColor} ${ENGLISH_SKILLS.find(s => s.key === activeSkill)?.borderColor}`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{ENGLISH_SKILLS.find(s => s.key === activeSkill)?.icon}</span>
              <div>
                <h2 className={`text-xl font-bold ${ENGLISH_SKILLS.find(s => s.key === activeSkill)?.textColor}`}>
                  {ENGLISH_SKILLS.find(s => s.key === activeSkill)?.name}
                </h2>
                <p className="text-xs text-stone-400">{ENGLISH_SKILLS.find(s => s.key === activeSkill)?.desc}</p>
              </div>
            </div>
          </div>
          {activeSkill === "listening" && (
            <EnglishListeningPanel subjectId={id} playWordAudio={playWordAudio} />
          )}
          {activeSkill !== "listening" && (
          <p className="text-stone-400 text-center py-8">点右下角 + 添加学习内容</p>
          )}
        </>
      )}

      {isMath && (
        <div className="space-y-4">
          <Link
            href={`/subjects/${id}/math`}
            className="block rounded-2xl border border-blue-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
            style={{ borderLeftWidth: 4, borderLeftColor: subject.color }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-stone-900">数学知识体系</h2>
                <p className="mt-1 text-sm text-stone-400">
                  小学 6 个年级 · 初中 3 个年级 · {countMathCurriculumItems()} 个主题
                </p>
              </div>
              <span className="text-stone-400">→</span>
            </div>
          </Link>

          <Link
            href={`/subjects/${id}/math/grade-5`}
            className="block rounded-2xl border border-blue-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
            style={{ borderLeftWidth: 4, borderLeftColor: subject.color }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-stone-900">五年级</h2>
                <p className="mt-1 text-sm text-stone-400">
                  8 个单元 · {countMathGradeFivePoints()} 个知识点
                </p>
              </div>
              <span className="text-stone-400">→</span>
            </div>
          </Link>
        </div>
      )}

      {isChinese && (
        <div className="space-y-4">
          <Link
            href={`/subjects/${id}/chinese`}
            className="block rounded-2xl border border-rose-200 bg-white p-5 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50"
            style={{ borderLeftWidth: 4, borderLeftColor: subject.color }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-stone-900">语文学习体系</h2>
                <p className="mt-1 text-sm text-stone-400">
                  小学 6 个年级 · 初中 3 个年级 · 基础 / 阅读 / 古诗文 / 作文 / 朗读
                </p>
                <p className="mt-3 text-sm leading-6 text-stone-500">
                  按能力板块进入，不在首页展开细节；点击后查看完整学习地图。
                </p>
              </div>
              <span className="text-stone-400">→</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["基础积累", "阅读理解", "古诗文", "作文训练", "朗读背诵"].map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
                >
                  {label}
                </span>
              ))}
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-500">
                {countChineseTopics()} 个主题
              </span>
            </div>
          </Link>
        </div>
      )}

      {/* Units grouped by section then sub-group (non-English only) */}
      {!isEnglish && !isMath && !isChinese && (() => {
        // Split groups into sections by "｜" prefix
        const groups = new Map<string, typeof units>();
        for (const u of units) {
          const g = (u as { group_name?: string }).group_name || "未分组";
          if (!groups.has(g)) groups.set(g, []);
          groups.get(g)!.push(u);
        }
        const hasMultipleGroups = groups.size > 1 || (groups.size === 1 && !groups.has("未分组"));

        // Group into sections: { sectionTitle -> [{groupName, groupUnits}] }
        const sections = new Map<string, { groupName: string; groupUnits: typeof units }[]>();
        for (const [groupName, groupUnits] of groups) {
          const sepIdx = groupName.indexOf("｜");
          const sectionKey = sepIdx >= 0 ? groupName.substring(0, sepIdx) : "";
          if (!sections.has(sectionKey)) sections.set(sectionKey, []);
          sections.get(sectionKey)!.push({ groupName, groupUnits });
        }

        const hasSections = sections.size > 1 || (sections.size === 1 && !sections.has(""));
        return Array.from(sections.entries()).map(([sectionKey, sectionGroups]) => {
          const sectionExpanded = !hasSections || expandedBooks.has(`section:${sectionKey}`);
          return (
          <div key={sectionKey || "_default"}>
            {/* Section header */}
            {sectionKey && (
              <div
                className="mt-6 mb-3 px-3 py-3 bg-white rounded-2xl border border-stone-300 shadow-sm cursor-pointer hover:bg-stone-50 transition-colors flex items-center justify-between"
                onClick={() => {
                  setExpandedBooks((prev) => {
                    const next = new Set(prev);
                    const key = `section:${sectionKey}`;
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  });
                }}
              >
                <h2 className="text-lg font-bold text-stone-700">{sectionKey}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400">{sectionGroups.reduce((s, g) => s + g.groupUnits.length, 0)} 课</span>
                  <span className="text-stone-400 text-sm">{sectionExpanded ? "▲" : "▼"}</span>
                </div>
              </div>
            )}
            {sectionExpanded && sectionGroups.map(({ groupName, groupUnits }) => {
          const isExpanded = hasMultipleGroups ? expandedBooks.has(groupName) : true;
          const groupWords = groupUnits.reduce((s, u) => s + ((u.words ?? []).length), 0);
          const showGroupHeader = hasMultipleGroups && groupName !== "未分组";
          const displayName = groupName.includes("｜") ? groupName.split("｜")[1] : groupName;
          return (
            <div key={groupName}>
              {/* Group header */}
              {showGroupHeader && (
                <div
                  id={`book-${groupName}`}
                  onClick={() => {
                    setExpandedBooks((prev) => {
                      const next = new Set(prev);
                      const willExpand = !next.has(groupName);
                      if (next.has(groupName)) next.delete(groupName); else next.add(groupName);
                      if (willExpand) {
                        setTimeout(() => {
                          document.getElementById(`book-${groupName}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 100);
                      }
                      return next;
                    });
                  }}
                  className={`mb-3 rounded-2xl border px-4 py-3 flex items-center justify-between hover:bg-stone-50 transition-colors cursor-pointer ${
                    isEnglish
                      ? "bg-white border-emerald-200"
                      : isExpanded
                        ? "bg-gradient-to-r from-blue-50 to-white border-blue-300 shadow-sm"
                        : "bg-white border-stone-200"
                  }`}
                  style={!isEnglish ? { borderLeftWidth: 4, borderLeftColor: subject.color } : undefined}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className={`font-bold ${isEnglish ? "text-base" : "text-base"}`}>{displayName}</span>
                    <span className="text-xs text-stone-400">
                      {isEnglish
                        ? `${groupUnits.length} 个句子 · ${groupWords} 个单词`
                        : `${groupUnits.length} 个知识点`}
                    </span>
                  </div>
                  <span className="text-stone-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
                </div>
              )}
              {/* Units */}
              {isExpanded && <div className="space-y-5">
              {groupUnits.map((unit) => (
          <div key={unit.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            {/* Unit header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{unit.name}</span>
                <span className="text-xs text-stone-400">{unit.materials?.length ?? 0} 个</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileRefs.current[unit.id]?.click()}
                  className="text-sm px-3 py-1 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-100"
                >
                  上传
                </button>
                <button
                  onClick={() => deleteUnit(unit.id)}
                  className="text-sm text-stone-300 hover:text-red-400 px-1"
                >
                  ×
                </button>
              </div>
              <input
                ref={(el) => { fileRefs.current[unit.id] = el; }}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf"
                onChange={(e) => handleFileChange(unit.id, e)}
                className="hidden"
              />
            </div>

            {/* Drop zone + materials */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(unit.id, e)}
              className="p-3"
            >
              {uploadingUnit === unit.id && (
                <p className="text-sm text-stone-400 text-center py-2">上传中...</p>
              )}

              {/* Material list */}
              {(unit.materials ?? []).length > 0 ? (
                <div className="space-y-2">
                  {(unit.materials ?? []).map((m: Material) => {
                    const meta = FILE_TYPE_LABELS[m.file_type];
                    // Inline audio player for audio files
                    if (m.file_type === "audio" && m.file_path) {
                      return (
                        <div key={m.id} className="group">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium truncate flex-1">{m.name}</p>
                            <button
                              onClick={() => deleteMaterial(m.id)}
                              className="text-xs text-stone-300 hover:text-red-400 opacity-0 group-hover:opacity-100 px-1"
                            >
                              ×
                            </button>
                          </div>
                          <audio controls className="w-full h-8" style={{ borderRadius: 8 }}>
                            <source src={m.file_path} type="audio/mpeg" />
                          </audio>
                        </div>
                      );
                    }
                    return (
                      <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 group">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 ${meta?.badge ?? "bg-stone-400"}`}>
                          {meta?.label ?? "文件"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <p className="text-xs text-stone-400">{formatSize(m.file_size)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {m.file_path && (
                            <a href={m.file_path} target="_blank" className="text-xs text-stone-400 hover:text-stone-600 px-2 py-1">打开</a>
                          )}
                          <button
                            onClick={() => deleteMaterial(m.id)}
                            className="text-xs text-stone-300 hover:text-red-400 opacity-0 group-hover:opacity-100 px-2 py-1"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p
                  className="text-sm text-stone-300 text-center py-4 border-2 border-dashed border-stone-200 rounded-lg cursor-pointer hover:border-stone-300"
                  onClick={() => fileRefs.current[unit.id]?.click()}
                >
                  拖拽或点击上传资料
                </p>
              )}
            </div>

            {/* Words in this unit */}
            {(unit.words ?? []).length > 0 && (
              <div className="px-3 pb-3 border-t border-stone-100 pt-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-stone-400 font-medium">单词 ({(unit.words ?? []).length})</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); playAllWords(unit.id, (unit.words ?? []) as Word[]); }}
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                        playingUnitId === unit.id
                          ? "bg-red-500 text-white animate-pulse"
                          : "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-90"
                      }`}
                      title={playingUnitId === unit.id ? "停止播放" : "自动朗读全部单词"}
                    >
                      {playingUnitId === unit.id ? "⏹" : "▶"}
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setHideModes((p) => ({ ...p, [unit.id]: p[unit.id] === "chinese" ? "none" : "chinese" })); setRevealedWords(new Set()); }}
                      className={`text-xs px-3 py-1 rounded-lg transition-all ${
                        (hideModes[unit.id] ?? "none") === "chinese"
                          ? "bg-orange-500 text-white shadow-sm shadow-orange-200"
                          : "text-stone-500 border border-stone-200 hover:border-orange-300 hover:text-orange-500"
                      }`}
                    >
                      {(hideModes[unit.id] ?? "none") === "chinese" ? "显示中文" : "遮住中文"}
                    </button>
                    <button
                      onClick={() => { setHideModes((p) => ({ ...p, [unit.id]: p[unit.id] === "english" ? "none" : "english" })); setRevealedWords(new Set()); }}
                      className={`text-xs px-3 py-1 rounded-lg transition-all ${
                        (hideModes[unit.id] ?? "none") === "english"
                          ? "bg-blue-500 text-white shadow-sm shadow-blue-200"
                          : "text-stone-500 border border-stone-200 hover:border-blue-300 hover:text-blue-500"
                      }`}
                    >
                      {(hideModes[unit.id] ?? "none") === "english" ? "显示英文" : "遮住英文"}
                    </button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  {((unit.words ?? []) as Word[]).map((w) => {
                    const audioSrc = (unit.materials ?? []).find((m: Material) => m.file_type === "audio")?.file_path;
                    const isRevealed = revealedWords.has(w.id);
                    const unitHideMode = hideModes[unit.id] ?? "none";
                    const hideEn = unitHideMode === "english" && !isRevealed;
                    const hideCn = unitHideMode === "chinese" && !isRevealed;
                    return (
                      <div
                        key={w.id}
                        className="flex items-center gap-2 py-0.5 text-sm cursor-pointer"
                        onClick={() => {
                          if (unitHideMode !== "none") {
                            setRevealedWords((prev) => {
                              const next = new Set(prev);
                              if (next.has(w.id)) next.delete(w.id); else next.add(w.id);
                              return next;
                            });
                          }
                        }}
                      >
                        {w.audio_start != null && audioSrc && (
                          <button
                            onClick={(e) => { e.stopPropagation(); playWordAudio(audioSrc, w.audio_start!, w.audio_end ?? w.audio_start! + 2); }}
                            className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 hover:bg-emerald-600 active:scale-90 text-xs"
                          >
                            ▶
                          </button>
                        )}
                        <span className={`font-medium ${hideEn ? "bg-stone-200 text-transparent rounded select-none" : ""}`}>{w.word}</span>
                        {w.phonetic && <span className={`text-xs text-stone-400 ${hideEn ? "invisible" : ""}`}>{w.phonetic}</span>}
                        <span className={`text-stone-500 ${hideCn ? "bg-stone-200 text-transparent rounded select-none" : ""}`}>{w.meaning}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>}
            </div>
          );
        })}
          </div>
        );});
      })()}

      {/* Add unit inline */}
      {addingUnit && !isMath && !isChinese && (
        <div className="mt-5 bg-white rounded-2xl border border-stone-200 p-4">
          <input
            type="text"
            placeholder="单元名称，如：第一单元"
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addUnit()}
            className="w-full border-b border-stone-200 pb-2 mb-3 outline-none text-lg"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAddingUnit(false); setUnitName(""); }} className="text-sm text-stone-400 px-3 py-1">取消</button>
            <button onClick={addUnit} className="text-sm bg-stone-800 text-white px-4 py-1.5 rounded-lg">添加</button>
          </div>
        </div>
      )}

      {units.length === 0 && !addingUnit && !isEnglish && !isMath && !isChinese && !activeSkill && (
        <p className="text-stone-400 text-center py-16">点右下角 + 添加第一个单元</p>
      )}

      {/* FABs */}
      <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-50">
        {/* Back to top */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="w-12 h-12 bg-stone-600 text-white rounded-full text-lg shadow-lg flex items-center justify-center cursor-pointer active:scale-95"
        >
          ↑
        </button>
        {/* Add unit */}
        {!addingUnit && !isMath && !isChinese && (
          <button
            onClick={() => setAddingUnit(true)}
            className="w-14 h-14 bg-stone-800 text-white rounded-full text-2xl shadow-lg flex items-center justify-center cursor-pointer active:scale-95"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
