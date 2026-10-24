import { splitMathSpeech, type MathAudioLesson } from "./national-day-math-audio";

export type MathSpeechState = {
  status: "idle" | "playing" | "paused" | "finished" | "error";
  lesson: number;
  chunk: number;
  message: string;
};

/** One queue owns playback. Generation guards discard canceled utterance events. */
export class MathLessonSpeaker {
  private generation = 0;
  private current: SpeechSynthesisUtterance | null = null;
  private rate = 0.9;
  private voice: SpeechSynthesisVoice | null = null;
  private continuous = true;
  private disposed = false;
  private chunks: string[][];
  state: MathSpeechState = { status: "idle", lesson: 0, chunk: 0, message: "" };

  constructor(
    private engine: Pick<SpeechSynthesis, "speak" | "cancel" | "pause" | "resume">,
    private utterance: (text: string) => SpeechSynthesisUtterance,
    private lessons: MathAudioLesson[],
    private notify: (state: MathSpeechState) => void,
  ) { this.chunks = lessons.map(lesson => splitMathSpeech(lesson.text)); }

  private update(next: Partial<MathSpeechState>) {
    this.state = { ...this.state, ...next };
    if (!this.disposed) this.notify({ ...this.state });
  }

  private cancel() {
    this.generation++;
    this.current = null;
    this.engine.cancel();
    // Some engines retain their paused flag after canceling the queue.
    this.engine.resume();
  }

  select(lesson: number, play = false, chunk = 0) {
    if (this.disposed || !Number.isInteger(lesson) || !this.lessons[lesson]) return;
    this.cancel();
    this.update({ lesson, chunk: Math.max(0, Math.min(Number.isInteger(chunk) ? chunk : 0, this.chunks[lesson].length - 1)), status: "idle", message: "" });
    if (play) this.play();
  }

  configure(rate: number, voice: SpeechSynthesisVoice | null, continuous: boolean) {
    const changed = rate !== this.rate || voice !== this.voice;
    this.rate = Math.max(0.6, Math.min(1.5, rate));
    this.voice = voice;
    this.continuous = continuous;
    if (changed && this.current) {
      const wasPlaying = this.state.status === "playing";
      this.cancel();
      if (wasPlaying) this.speak();
    }
  }

  play() {
    if (this.disposed || !this.lessons.length) return;
    if (this.state.status === "playing") return;
    if (this.state.status === "paused" && this.current) {
      this.update({ status: "playing", message: "" });
      this.engine.resume();
      return;
    }
    if (this.state.status === "finished") this.update({ chunk: 0 });
    this.update({ status: "playing", message: "" });
    this.speak();
  }

  pause() {
    if (this.state.status !== "playing") return;
    this.update({ status: "paused" });
    this.engine.pause();
  }

  stop() {
    this.cancel();
    this.update({ status: "idle", chunk: 0, message: "" });
  }

  private speak() {
    if (this.disposed) return;
    const text = this.chunks[this.state.lesson]?.[this.state.chunk];
    if (!text) return;
    const token = ++this.generation;
    const line = this.utterance(text);
    this.current = line;
    line.lang = "zh-CN";
    line.rate = this.rate;
    if (this.voice) line.voice = this.voice;
    line.onend = () => {
      if (token !== this.generation || this.disposed) return;
      this.current = null;
      if (this.state.chunk + 1 < this.chunks[this.state.lesson].length) {
        this.update({ chunk: this.state.chunk + 1 });
        if (this.state.status === "playing") this.speak();
      } else {
        const practice = this.lessons[this.state.lesson].kind === "practice";
        if (!practice && this.continuous && this.state.lesson + 1 < this.lessons.length) {
          const play = this.state.status === "playing";
          this.update({ lesson: this.state.lesson + 1, chunk: 0 });
          if (play) this.speak();
        } else this.update({ status: "finished", message: practice ? "读题结束，请独立作答；完成后选择下一段。" : "这一段听完了。" });
      }
    };
    line.onerror = event => {
      if (token !== this.generation || this.disposed) return;
      this.current = null;
      this.update({ status: "error", message: event.error === "not-allowed" ? "请点击播放，允许浏览器播放语音。" : "语音播放中断，请重试或选择另一种中文音色。" });
    };
    try { this.engine.speak(line); }
    catch { this.update({ status: "error", message: "这台设备暂时无法播放中文语音，请换用支持中文语音的浏览器。" }); }
  }

  dispose() { this.disposed = true; this.cancel(); }
}
