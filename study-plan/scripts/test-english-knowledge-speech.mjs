import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// All voices, utterances and timers are local doubles. No audio, fetch, files
// containing textbook data, credentials or student-record writes are involved.
const code = ts.transpileModule(readFileSync(new URL("../src/components/use-english-knowledge-speech.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
function clock() {
  let now = 0, next = 0;
  const timers = new Map();
  return {
    schedule(callback, milliseconds) { const id = ++next; timers.set(id, { callback, due: now + milliseconds }); return id; },
    clear(id) { timers.delete(id); },
    tick(milliseconds) {
      const until = now + milliseconds;
      for (;;) {
        const scheduled = [...timers].filter(([, timer]) => timer.due <= until).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!scheduled) break;
        const [id, timer] = scheduled; timers.delete(id); now = timer.due; timer.callback();
      }
      now = until;
    },
    get size() { return timers.size; },
  };
}
class Utterance { constructor(text) { this.text = text; } }
const voice = (voiceURI, lang, extra = {}) => ({ voiceURI, lang, name: voiceURI, default: false, localService: true, ...extra });
const englishGB = voice("English-GB", "en-GB"), englishUS = voice("English-US", "en-US"), chinese = voice("Chinese", "zh-CN", { default: true });
function native(voices = [chinese, englishUS, englishGB]) {
  const listeners = new Set(), utterances = [];
  const synthesis = {
    speaking: false, pending: false, paused: false, voices, cancelCount: 0, pauseCount: 0, resumeCount: 0, throwSpeak: false, cancelEndsSynchronously: false,
    getVoices() { return this.voices; },
    speak(utterance) { if (this.throwSpeak) throw new Error("Native synthesis failed"); utterances.push(utterance); this.active = utterance; this.pending = true; },
    cancel() { this.cancelCount++; const old = this.active; this.active = null; this.speaking = this.pending = false; if (this.cancelEndsSynchronously) old?.onend?.({}); },
    pause() { this.paused = true; this.pauseCount++; },
    resume() { this.paused = false; this.resumeCount++; },
    addEventListener(type, listener) { assert.equal(type, "voiceschanged"); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, "voiceschanged"); listeners.delete(listener); },
  };
  return {
    backend: { synthesis, createUtterance: text => new Utterance(text) }, synthesis, utterances, listeners,
    emitVoices(voices) { synthesis.voices = voices; [...listeners].forEach(listener => listener()); },
    start(utterance = utterances.at(-1)) { if (synthesis.active === utterance) { synthesis.speaking = true; synthesis.pending = false; } utterance.onstart?.({}); },
    end(utterance = utterances.at(-1)) { if (synthesis.active === utterance) { synthesis.speaking = false; synthesis.pending = false; synthesis.active = null; } utterance.onend?.({}); },
    error(error = "interrupted", utterance = utterances.at(-1)) { if (synthesis.active === utterance) { synthesis.speaking = false; synthesis.pending = false; } utterance.onerror?.({ error }); },
  };
}
function module(react = {}, additions = {}) {
  const record = { exports: {} };
  const context = { module: record, exports: record.exports, setTimeout, clearTimeout, require: name => { assert.equal(name, "react"); return react; }, ...additions };
  vm.runInNewContext(code, context); return { exports: record.exports, context };
}
const { createEnglishKnowledgeSpeechController: create } = module().exports;
function fixture(voices) {
  const time = clock(), speech = native(voices), controller = create(time);
  controller.connect(speech.backend);
  return { controller, time, speech, state: () => controller.getSnapshot() };
}
const item = (id, text = id, chunks) => ({ id, text, ...(chunks ? { chunks } : {}) });

test("SSR and unsupported browsers stay inert and never claim a completed playback", () => {
  const controller = create(clock());
  assert.equal(controller.getSnapshot().status, "unsupported");
  assert.equal(controller.getServerSnapshot().supported, false);
  controller.connect(null); controller.play([item("a", "hello")]);
  assert.equal(controller.getSnapshot().status, "unsupported");
  assert.match(controller.getSnapshot().error, /不支持/);
  assert.equal(controller.getSnapshot().activeItemId, null);
});

test("connect has no autoplay and only English voice choices are exposed", () => {
  const h = fixture();
  assert.equal(h.speech.utterances.length, 0);
  assert.equal(h.state().rate, 1); assert.equal(h.state().status, "idle");
  assert.deepEqual(plain(h.state().voices).map(voice => voice.lang), ["en-US", "en-GB"]);
  assert.equal(h.state().voiceURI, "English-GB");
  h.controller.play([item("a", "hello")]);
  assert.equal(h.speech.utterances[0].voice.lang, "en-GB");
  assert.equal(h.speech.utterances[0].lang, "en-GB");
  assert.equal(h.speech.utterances[0].rate, 1);
  h.controller.disconnect();
});

test("one queue advances chunks and items serially only on native end", () => {
  const h = fixture();
  h.controller.play([item("first", "First sentence. Second sentence.", ["First sentence.", "Second sentence."]), item("second", "Last sentence.")], { groupId: "section" });
  assert.equal(h.state().status, "loading"); assert.equal(h.state().groupId, "section");
  assert.equal(h.speech.utterances.length, 1);
  h.speech.start(); assert.equal(h.state().status, "playing");
  assert.equal(h.speech.utterances.length, 1, "start cannot enqueue the rest of the group");
  h.speech.end(); assert.equal(h.speech.utterances.length, 2); assert.equal(h.state().activeItemId, "first");
  h.speech.start(); h.speech.end();
  assert.equal(h.speech.utterances.length, 3); assert.equal(h.state().activeItemId, "second");
  h.speech.start(); h.speech.end();
  assert.equal(h.state().status, "idle"); assert.equal(h.state().activeItemId, null); assert.equal(h.state().groupId, null);
  assert.equal(h.time.size, 0);
});

test("single/group replacement invalidates old synchronous cancel and delayed callbacks", () => {
  const h = fixture(); h.speech.synthesis.cancelEndsSynchronously = true;
  h.controller.play([item("old-1"), item("old-2")], { groupId: "old-group" });
  const old = h.speech.utterances[0]; h.speech.start(old);
  h.controller.play([item("new-1"), item("new-2")], { groupId: "new-group" });
  assert.equal(h.speech.utterances.length, 2); assert.equal(h.state().activeItemId, "new-1");
  old.onstart({}); old.onend({}); old.onerror({ error: "canceled" });
  assert.equal(h.speech.utterances.length, 2); assert.equal(h.state().groupId, "new-group");
  h.speech.start(); h.speech.end();
  assert.equal(h.state().activeItemId, "new-2"); assert.equal(h.speech.utterances.length, 3);
  h.controller.play([item("single")]);
  assert.equal(h.state().activeItemId, "single"); assert.equal(h.state().groupId, null);
  h.controller.stop(); assert.equal(h.state().status, "idle");
  h.speech.utterances.at(-1).onend({});
  assert.equal(h.state().activeItemId, null); assert.equal(h.time.size, 0);
});

test("pause/resume keeps the active utterance and a boundary pause cannot autoplay the next chunk", () => {
  const h = fixture();
  h.controller.play([item("first", "First. Second.", ["First.", "Second."]), item("next")]);
  h.speech.start(); const first = h.speech.utterances[0];
  h.controller.pause(); h.time.tick(60000);
  assert.equal(h.state().status, "paused"); assert.equal(h.speech.utterances.length, 1);
  h.controller.resume(); assert.equal(h.state().status, "playing"); assert.equal(h.speech.utterances[0], first);
  h.controller.pause(); h.speech.end(first);
  assert.equal(h.state().status, "paused"); assert.equal(h.state().activeItemId, "first");
  assert.equal(h.speech.utterances.length, 1);
  h.controller.resume(); assert.equal(h.speech.utterances.length, 2); assert.equal(h.speech.utterances[1].text, "Second.");
  assert.equal(h.speech.synthesis.paused, false);
  h.controller.disconnect();

  const boundary = fixture(); boundary.controller.play([item("only")]); boundary.speech.start(); boundary.controller.pause();
  boundary.speech.synthesis.resume = () => { boundary.speech.synthesis.paused = false; boundary.speech.end(); };
  boundary.controller.resume();
  assert.equal(boundary.state().status, "idle", "a native end emitted inside resume cannot be overwritten by playing/loading");
  assert.equal(boundary.time.size, 0); boundary.controller.disconnect();
});

test("a paused pending start keeps its start watchdog after resume", () => {
  const h = fixture(); h.controller.play([item("first")]);
  h.controller.pause(); h.time.tick(15000); assert.equal(h.state().status, "paused");
  h.controller.resume(); assert.equal(h.state().status, "loading");
  h.time.tick(10000); assert.equal(h.state().status, "error"); assert.equal(h.state().canRetry, true);
});

test("rate and English voice changes restart one chunk, while paused changes stay paused", () => {
  const h = fixture(); h.speech.synthesis.cancelEndsSynchronously = true;
  h.controller.play([item("first"), item("next")]); h.speech.start();
  h.controller.setRate(0.75);
  assert.equal(h.speech.utterances.length, 2); assert.equal(h.speech.utterances[1].text, "first"); assert.equal(h.speech.utterances[1].rate, 0.75);
  h.controller.setRate(2); assert.equal(h.speech.utterances.length, 2);
  h.controller.setVoice("Chinese"); assert.equal(h.state().voiceURI, "English-GB"); assert.equal(h.speech.utterances.length, 2);
  h.controller.setVoice("English-US"); assert.equal(h.speech.utterances.length, 3); assert.equal(h.speech.utterances[2].voice.lang, "en-US");
  h.speech.start(); h.controller.pause(); h.controller.setRate(1.25);
  assert.equal(h.state().status, "paused"); assert.equal(h.speech.utterances.length, 3);
  h.controller.resume(); assert.equal(h.speech.utterances.length, 4); assert.equal(h.speech.utterances[3].rate, 1.25);
  assert.equal(h.speech.utterances[3].text, "first"); assert.equal(h.speech.synthesis.paused, false);
  h.controller.disconnect();
});

test("empty voice lists wait for asynchronous English voices without duplicate starts", () => {
  const h = fixture([]); h.controller.play([item("first")]);
  assert.equal(h.state().status, "loading"); assert.equal(h.speech.utterances.length, 0);
  h.time.tick(2000); h.speech.emitVoices([chinese, englishGB]);
  assert.equal(h.speech.utterances.length, 1); assert.equal(h.speech.utterances[0].voice.lang, "en-GB");
  h.speech.emitVoices([chinese, englishGB]); h.time.tick(1000);
  assert.equal(h.speech.utterances.length, 1);
  h.controller.disconnect();
});

test("missing English voices fail visibly, stay retryable and never use a Chinese default", () => {
  const h = fixture([chinese]); h.controller.play([item("first"), item("next")]); h.time.tick(3000);
  assert.equal(h.state().status, "error"); assert.equal(h.state().activeItemId, "first"); assert.equal(h.state().canRetry, true);
  assert.equal(h.speech.utterances.length, 0); assert.match(h.state().error, /英文语音/);
  h.speech.emitVoices([chinese, englishUS]); assert.equal(h.speech.utterances.length, 0, "a late voice does not silently retry a reported failure");
  h.controller.retry(); assert.equal(h.speech.utterances.length, 1); assert.equal(h.speech.utterances[0].text, "first");
  assert.equal(h.speech.utterances[0].voice.lang, "en-US"); h.controller.disconnect();
});

test("voice loading while paused cannot start speech until explicit resume", () => {
  const h = fixture([]); h.controller.play([item("first")]); h.controller.pause();
  h.time.tick(10000); h.speech.emitVoices([englishGB]);
  assert.equal(h.state().status, "paused"); assert.equal(h.speech.utterances.length, 0);
  h.controller.resume(); assert.equal(h.speech.utterances.length, 1); h.controller.disconnect();
});

test("native errors and exceptions never advance; retry preserves the failing chunk", () => {
  const h = fixture(); h.controller.play([item("first"), item("next")]); h.speech.start();
  const failed = h.speech.utterances[0]; h.speech.error("network", failed);
  assert.equal(h.state().status, "error"); assert.equal(h.state().activeItemId, "first"); assert.equal(h.speech.utterances.length, 1);
  h.controller.retry(); assert.equal(h.speech.utterances[1].text, "first");
  failed.onend({}); assert.equal(h.speech.utterances.length, 2); assert.equal(h.state().activeItemId, "first");
  h.speech.start(); h.speech.end(); assert.equal(h.state().activeItemId, "next");
  h.controller.stop(); h.speech.synthesis.throwSpeak = true; h.controller.play([item("throws")]);
  assert.equal(h.state().status, "error"); assert.equal(h.state().canRetry, true);
  h.speech.synthesis.throwSpeak = false; h.controller.retry(); assert.equal(h.speech.utterances.at(-1).text, "throws"); h.controller.disconnect();
});

test("an unreported native interruption becomes an error rather than a completed group", () => {
  const h = fixture(); h.controller.play([item("first"), item("next")]); h.speech.start();
  h.speech.synthesis.speaking = h.speech.synthesis.pending = false;
  h.time.tick(1000); assert.equal(h.state().status, "playing"); h.time.tick(250);
  assert.equal(h.state().status, "error"); assert.equal(h.state().activeItemId, "first"); assert.equal(h.speech.utterances.length, 1);
  h.controller.disconnect();
});

test("a stuck speaking engine times out visibly; pause suspends and resume resets that deadline", () => {
  const h = fixture(); h.controller.play([item("first"), item("next")]); h.speech.start();
  h.time.tick(59000); assert.equal(h.state().status, "playing");
  h.controller.pause(); h.time.tick(120000); assert.equal(h.state().status, "paused");
  h.controller.resume(); h.time.tick(59999); assert.equal(h.state().status, "playing");
  const stuck = h.speech.utterances[0]; h.time.tick(1);
  assert.equal(h.state().status, "error"); assert.match(h.state().error, /超时/);
  assert.equal(h.state().activeItemId, "first"); assert.equal(h.state().canRetry, true);
  assert.equal(h.speech.utterances.length, 1, "a stuck chunk never silently skips to the next item");
  stuck.onend({}); assert.equal(h.speech.utterances.length, 1);
  h.controller.retry(); assert.equal(h.speech.utterances.length, 2); assert.equal(h.speech.utterances[1].text, "first");
  h.controller.disconnect();
});

test("oversized chunks are defensively split without losing text or crossing 150 characters", () => {
  const h = fixture(), text = "This is an English example sentence for safe sequential playback. ".repeat(8).trim();
  h.controller.play([item("long", text, [text]), item("after", "All done.")]);
  const seen = [];
  while (h.state().activeItemId === "long") {
    const utterance = h.speech.utterances.at(-1); seen.push(utterance.text); assert.ok(utterance.text.length <= 150);
    h.speech.start(); h.speech.end();
  }
  assert.equal(seen.join(" "), text); assert.equal(h.state().activeItemId, "after"); h.controller.disconnect();
});

test("invalid or Chinese payloads stop old speech and fail instead of being marked complete", () => {
  const h = fixture();
  for (const queue of [[], [item("中文", "请读中文")], [{ id: "a", text: "English", chunks: [null] }]]) {
    h.controller.play([item("old"), item("old-next")]); const old = h.speech.utterances.at(-1), count = h.speech.utterances.length;
    h.controller.play(queue); assert.equal(h.state().status, "error"); assert.equal(h.state().canRetry, false);
    old.onend({}); assert.equal(h.speech.utterances.length, count);
  }
  h.controller.disconnect();
});

test("disconnect removes voice listeners, cancels timers and ignores detached callbacks", () => {
  const h = fixture(); h.controller.play([item("first"), item("next")]); h.speech.start();
  const old = h.speech.utterances[0], changed = [...h.speech.listeners][0];
  h.controller.disconnect(); assert.equal(h.speech.listeners.size, 0); assert.equal(h.time.size, 0);
  old.onend({}); old.onerror({ error: "interrupted" }); changed(); h.time.tick(60000);
  assert.equal(h.state().status, "unsupported"); assert.equal(h.speech.utterances.length, 1);
  h.controller.connect(h.speech.backend); assert.equal(h.state().status, "idle"); assert.equal(h.speech.utterances.length, 1, "reconnection never autoplays");
  h.controller.disconnect();
});

test("the actual hook cancels on scope changes and unmount, and has an SSR-safe snapshot", () => {
  const time = clock(), speech = native(); let controller, effect, cleanup, dependencies, server = true;
  const react = {
    useState(initial) { controller ??= initial(); return [controller, () => { throw new Error("Controller identity cannot be replaced."); }]; },
    useMemo(factory) { return factory(); },
    useSyncExternalStore(_subscribe, snapshot, serverSnapshot) { return server ? serverSnapshot() : snapshot(); },
    useEffect(callback, next) { if (!dependencies || next.some((value, index) => value !== dependencies[index])) { effect = callback; dependencies = next; } },
  };
  const { exports, context } = module(react, { setTimeout: time.schedule, clearTimeout: time.clear });
  let api = exports.useEnglishKnowledgeSpeech("unit-1"); assert.equal(api.supported, false); assert.equal(speech.utterances.length, 0);
  context.window = { speechSynthesis: speech.synthesis, SpeechSynthesisUtterance: Utterance }; context.SpeechSynthesisUtterance = Utterance; server = false;
  const commit = () => { if (effect) { cleanup?.(); cleanup = effect(); effect = null; } };
  commit(); api = exports.useEnglishKnowledgeSpeech("unit-1"); api.play([item("unit-1-a"), item("unit-1-b")]); speech.start();
  const old = speech.utterances[0]; exports.useEnglishKnowledgeSpeech("unit-2"); commit();
  api = exports.useEnglishKnowledgeSpeech("unit-2"); assert.equal(api.status, "idle"); assert.equal(api.activeItemId, null);
  api.play([item("unit-2-a"), item("unit-2-b")]); const count = speech.utterances.length;
  old.onend({}); assert.equal(speech.utterances.length, count);
  const active = speech.utterances.at(-1); cleanup(); active.onend({});
  assert.equal(speech.utterances.length, count); assert.equal(speech.listeners.size, 0); assert.equal(time.size, 0);
});
