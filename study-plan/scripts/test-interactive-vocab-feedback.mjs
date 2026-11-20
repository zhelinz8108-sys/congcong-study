import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";

// Execute the real component and locking hook with an in-memory HTTP server,
// dependency-aware React hooks and a virtual clock. Nothing reaches a network,
// database, browser profile or learner record.
const componentCode = compile("../src/components/interactive-memorize-mode.tsx");
const roundCode = compile("../src/lib/practice-round.ts");
const lockedHookCode = compile("../src/lib/use-english-locked.ts");
const preferenceKey = "study-plan-interactive-vocab-auto-next";
const checks = [];
const units = [1, 2].map(number => ({
  id: `unit-${number}`, subject_id: "qa-subject", name: `QA sentence ${number}`,
  group_name: "QA fixture book", sort_order: number, created_at: "2026-01-01",
}));
const words = [
  ["apple", "苹果"], ["book", "书"], ["cat", "猫"], ["dog", "狗"],
].map(([word, meaning], index) => ({
  id: `word-${index + 1}`, word, meaning, unit_id: units[Math.floor(index / 2)].id,
  subject_id: "qa-subject", sort_order: index + 1, created_at: "2026-01-01",
  phonetic: "", example: "", mastered: 0, next_review: "", last_review: null,
  interval: 0, repetitions: 0, ease_factor: 2.5, audio_start: null, audio_end: null,
}));

function compile(relative) {
  return ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
}

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  return typeof node === "object" ? text(node.props?.children) : String(node);
}

function record(id, response, correct = true) {
  const [mode, wordId] = id.split(":");
  const word = words.find(item => item.id === wordId);
  assert.ok(word, `Unknown fixture word ${wordId}`);
  return {
    id, response, submittedAt: "2026-11-16T00:00:00.000Z",
    feedback: { correct, answer: mode === "en-zh" ? word.meaning : word.word,
      explanation: "First answer is locked by the mock server." },
  };
}

async function mount({ initialRecords = {}, storage = new Map(), count = 4, holdReview = false } = {}) {
  const slots = [], timers = new Map(), posts = [], requests = [], reviews = [], completions = [];
  const historyRecords = structuredClone(initialRecords), sessions = new Map();
  let currentSession = null;
  let cursor = 0, dirty = true, tree, unmounted = false, time = 0, timerId = 0;
  let effects = [], randomSeed = 7261;
  const depsEqual = (a, b) => a !== undefined && b !== undefined && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, value => {
        if (unmounted) return;
        const next = typeof value === "function" ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(calculate, dependencies) {
      const index = cursor++;
      if (!(index in slots) || !depsEqual(slots[index].dependencies, dependencies))
        slots[index] = { value: calculate(), dependencies };
      return slots[index].value;
    },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!(index in slots) || !depsEqual(slots[index].dependencies, dependencies)) {
        const previous = slots[index];
        slots[index] = { dependencies, cleanup: previous?.cleanup };
        effects.push(() => {
          slots[index].cleanup?.();
          slots[index].cleanup = effect();
        });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  const schedule = (callback, milliseconds = 0) => {
    const id = ++timerId;
    timers.set(id, { due: time + milliseconds, callback });
    return id;
  };
  const clear = id => timers.delete(id);
  const math = Object.create(Math);
  math.random = () => ((randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const fetchMock = (url, options = {}) => {
    const parsed = new URL(url, "http://fixture.invalid");
    if (parsed.pathname === "/api/practice-round") {
      const body = JSON.parse(options.body);
      if (body.action === "finish") completions.push(body.round);
      return Promise.resolve({ ok: true });
    }
    assert.equal(parsed.pathname, "/api/english/locked");
    assert.equal(parsed.searchParams.get("module"), "vocab");
    assert.equal(parsed.searchParams.get("subject"), "qa-subject");
    const session = parsed.searchParams.get("session");
    if (session) {
      assert.match(session, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      if (!sessions.has(session)) sessions.set(session, {});
    }
    const method = options.method ?? "GET";
    requests.push({ url, method, session });
    if (method === "GET") {
      if (session) currentSession = session;
      const records = session ? sessions.get(session) : historyRecords;
      const mistakes = Object.values(historyRecords).concat([...sessions.values()].flatMap(Object.values))
        .filter(item => item.feedback.correct === false).map(item => item.id.replace(/^(?:en-zh|zh-en):/, ""));
      return Promise.resolve({ ok: true, json: async () => ({ records: structuredClone(records), mistakeWordIds: [...new Set(mistakes)] }) });
    }
    assert.equal(method, "POST");
    assert.ok(session, "Every vocabulary submission must carry this round's session UUID");
    assert.equal(options.cache, "no-store");
    const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body).sort(), ["id", "response"]);
    return new Promise((resolve, reject) => posts.push({ body, session, resolve, reject }));
  };
  const crypto = { randomUUID };
  const context = {
    console, AbortController, AbortSignal, Headers, location: { pathname: "/fixture/vocab" }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, fetch: fetchMock, setTimeout: schedule, clearTimeout: clear,
    Math: math, crypto, window: { localStorage, crypto, setTimeout: schedule, clearTimeout: clear }, localStorage,
  };
  const load = (code, dependencies) => {
    const compiledModule = { exports: {} };
    vm.runInNewContext(code, { ...context, module: compiledModule, exports: compiledModule.exports, require: dependencies });
    return compiledModule.exports;
  };
  const rounds = load(roundCode, name => { throw new Error(name); });
  const hook = load(lockedHookCode, name => {
    if (name.endsWith("practice-round")) return rounds;
    assert.equal(name, "react");
    return react;
  });
  const component = load(componentCode, name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name === "next/link") return { __esModule: true, default: "link" };
    if (name.endsWith("practice-round")) return rounds;
    if (name === "@/lib/use-english-locked") return hook;
    if (name === "@/lib/cloud-progress") return { loadCloudState: async (_namespace, _key, fallback) => fallback };
    if (name === "@/lib/sentences") return { getSentenceText: () => null };
    throw new Error(`Unexpected dependency ${name}`);
  }).InteractiveMemorizeMode;
  const props = {
    subjectId: "qa-subject", subjectName: "QA English",
    books: [{ groupName: "QA fixture book", units, totalWords: count }, { groupName: "QA second book", units, totalWords: count }],
    words: words.slice(0, count), onFinish: () => {},
    onReview: (id, quality) => {
      const review = { id, quality };
      reviews.push(review);
      return holdReview ? new Promise((resolve, reject) => Object.assign(review, { resolve, reject })) : Promise.resolve();
    },
  };
  function render() {
    for (let cycles = 0; dirty && !unmounted; cycles++) {
      assert.ok(cycles < 50, "Render/effect loop did not settle");
      dirty = false;
      cursor = 0;
      effects = [];
      tree = component(props);
      const commit = effects;
      effects = [];
      commit.forEach(effect => effect());
    }
  }
  async function settle() {
    for (let cycle = 0; cycle < 8; cycle++) {
      render();
      await new Promise(resolve => setImmediate(resolve));
    }
    render();
  }
  function find(type, predicate) {
    render();
    const found = nodes(tree).find(node => node.type === type && predicate(node));
    assert.ok(found, `Missing ${type}; rendered text: ${text(tree).slice(0, 400)}`);
    return found;
  }
  const button = value => find("button", node => text(node) === value);
  const checkbox = label => {
    const container = find("label", node => text(node).trim() === label);
    const input = nodes(container).find(node => node.type === "input" && node.props.type === "checkbox");
    assert.ok(input, `Missing checkbox ${label}`);
    return input;
  };
  async function click(node) {
    assert.notEqual(node.props.disabled, true, `Cannot click disabled ${text(node)}`);
    node.props.onClick();
    await settle();
  }
  const options = () => nodes(tree).filter(node => node.type === "button" && /min-h-\[104px\]/.test(node.props.className ?? ""));
  const answer = response => {
    render();
    const found = options().find(node => text(node).slice(1) === response);
    assert.ok(found, `Missing option ${response}: ${options().map(text).join(" | ")}`);
    return found;
  };
  const position = () => {
    render();
    const match = /第\s*(\d+)\/\d+\s*题/.exec(text(tree));
    return match ? Number(match[1]) : null;
  };
  const stat = label => {
    const container = find("div", node => nodes(node.props.children).some(child => child.type === "small" && text(child) === label) &&
      !nodes(node.props.children).some(child => child.type === "div"));
    return text(nodes(container).find(node => node.type === "span"));
  };
  const streak = () => Number(stat("连对"));
  const assertFresh = () => {
    assert.equal(position(), 1);
    assert.match(stat("本场"), /^0\/\d+$/, "Only this session's answers count toward current progress");
    assert.equal(stat("正确率"), "0%");
    assert.equal(streak(), 0);
    assert.doesNotMatch(text(tree), /答对了|答错了/, "Previous rounds cannot lock or reveal this round's answers");
    assert.ok(options().every(option => !option.props.disabled), "New round can answer previously tested words");
  };
  async function advance(milliseconds) {
    const target = time + milliseconds;
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      assert.ok(!unmounted, "Timer ran after unmount");
      timers.delete(due[0]);
      time = due[1].due;
      due[1].callback();
      await settle();
    }
    time = target;
    await settle();
  }
  async function confirm(index, correct = true) {
    const post = posts[index];
    assert.ok(post, `Missing POST ${index}`);
    assert.equal(post.finished, undefined, "POST can resolve only once");
    post.finished = true;
    const records = sessions.get(post.session);
    const saved = records[post.body.id] ?? record(post.body.id, post.body.response, correct);
    records[post.body.id] = saved;
    post.resolve({ ok: true, json: async () => ({ record: structuredClone(saved) }) });
    await settle();
  }
  async function fail(index) {
    posts[index].finished = true;
    posts[index].reject(new Error("Mock network failure"));
    await settle();
  }
  function unmount() {
    unmounted = true;
    slots.forEach(slot => slot.cleanup?.());
  }
  await settle();
  await click(find("button", node => text(node).includes("QA fixture book")));
  checkbox("随机出题").props.onChange({ target: { checked: false } });
  await settle();
  assert.equal(position(), 1);
  return { get tree() { render(); return tree; }, get sessionId() { return currentSession; },
    get serverRecords() { return sessions.get(currentSession) ?? {}; }, historyRecords, sessions,
    posts, requests, reviews, completions, storage, timers,
    settle, click, button, checkbox, answer, options, position, streak, stat, assertFresh, advance, confirm, fail, find, unmount };
}

{
  const h = await mount({ holdReview: true });
  assert.equal(h.checkbox("答对后自动下一题").props.checked, true, "Auto advance defaults to enabled");
  const before = h.options().map(text);
  const option = h.answer("苹果");
  option.props.onClick();
  option.props.onClick(); // Same-render double click must not duplicate the outer side effects.
  await h.settle();
  assert.equal(h.posts.length, 1, "Clicking an option submits once without a submit-button click");
  assert.deepEqual(h.posts[0].body, { id: "en-zh:word-1", response: "苹果" });
  assert.doesNotMatch(text(h.tree), /答对了|答错了/, "No client-made result before server confirmation");
  assert.ok(h.options().every(node => node.props.disabled), "Pending choice cannot be changed");
  await h.advance(5000);
  assert.equal(h.position(), 1, "Pending server response never advances the question");
  await h.confirm(0);
  assert.match(text(h.tree), /答对了/);
  assert.deepEqual(h.options().map(text), before, "Option order stays stable when feedback appears");
  assert.equal(h.reviews.length, 1, "Double click schedules one review update");
  assert.equal(h.streak(), 1, "Double click counts one correct answer");
  await h.advance(899);
  assert.equal(h.position(), 1, "Correct feedback remains visible for the delay");
  await h.advance(1);
  assert.equal(h.position(), 2, "Server-confirmed correct answer advances after 900ms");
  h.reviews[0].reject(new Error("Delayed review scheduling failed"));
  await h.settle();
  assert.doesNotMatch(text(h.tree), /复习日程暂未更新/, "Old review failure cannot pollute the next question");
  h.unmount();
  checks.push("click submits once; authoritative result; stable options; 900ms advance independent of review scheduling");
}

{
  const h = await mount();
  const round = h.sessionId;
  await h.click(h.answer("书"));
  await h.confirm(0, false);
  await h.click(h.button("结束本轮"));
  await h.settle();
  assert.deepEqual(h.completions, [round], "Ending a partial round delivers one completion");
  h.unmount();
  checks.push("partial vocabulary session sends one completion for the exact round");
}

{
  const h = await mount();
  await h.click(h.answer("书"));
  await h.confirm(0, false);
  assert.match(text(h.tree), /答错了.*正确答案：苹果/);
  assert.match(h.answer("书").props.className, /rose/);
  assert.match(h.answer("苹果").props.className, /emerald/);
  await h.advance(5000);
  assert.equal(h.position(), 1, "Wrong answer stays for review");
  await h.click(h.button("下一题"));
  assert.equal(h.position(), 2);
  h.unmount();
  checks.push("wrong answer shows correction and waits for manual next");
}

{
  const h = await mount();
  await h.click(h.answer("苹果"));
  await h.fail(0);
  assert.match(text(h.tree), /提交未确认，请重试/);
  assert.doesNotMatch(text(h.tree), /答对了|答错了/);
  assert.equal(Object.keys(h.serverRecords).length, 0);
  assert.equal(h.reviews.length, 0);
  await h.advance(5000);
  assert.equal(h.position(), 1);
  await h.click(h.button("重试提交"));
  assert.equal(h.posts.length, 2, "Failed answer can be retried without reselection");
  assert.equal(h.posts[1].body.response, "苹果");
  await h.confirm(1);
  await h.advance(900);
  assert.equal(h.position(), 2);
  h.unmount();
  checks.push("failed submission preserves draft, never grades locally and supports retry");
}

{
  const h = await mount();
  await h.click(h.answer("苹果"));
  await h.confirm(0);
  await h.advance(200);
  await h.click(h.button("下一题"));
  assert.equal(h.position(), 2);
  await h.advance(2000);
  assert.equal(h.position(), 2, "Manual next cancels the old correct-answer timer");
  h.unmount();
  checks.push("manual next does not double advance");
}

for (const delayedResponse of [false, true]) {
  const h = await mount();
  await h.click(h.answer("苹果"));
  if (!delayedResponse) await h.confirm(0);
  await h.click(h.find("button", node => node.props.title === "QA sentence 2"));
  assert.equal(h.position(), 1);
  if (delayedResponse) await h.confirm(0);
  await h.advance(5000);
  assert.equal(h.position(), 1, "Previous round cannot move the new sentence scope");
  assert.doesNotMatch(text(h.tree), /答对了|答错了/);
  assert.equal(h.streak(), 0, "Previous submission cannot change the new round's streak");
  h.unmount();
  checks.push(delayedResponse ? "late submission cannot affect a new round" : "scope change cancels old timer");
}

for (const delayedResponse of [false, true]) {
  const h = await mount();
  const wordLink = value => h.find("button", node => nodes(node.props.children).some(child => child.type === "strong" && text(child) === value));
  await h.click(h.answer("苹果"));
  if (!delayedResponse) await h.confirm(0);
  await h.click(wordLink("book"));
  assert.equal(h.position(), 2, "Word lookup list can jump to another question");
  if (delayedResponse) await h.confirm(0);
  assert.equal(h.streak(), delayedResponse ? 0 : 1, "Late response cannot update the destination question's streak");
  assert.doesNotMatch(text(h.tree), /答对了|答错了/, "Old feedback is not shown for the lookup destination");
  await h.advance(2000);
  assert.equal(h.position(), 2, "Lookup navigation cancels pending automatic transitions");
  await h.click(wordLink("apple"));
  assert.equal(h.position(), 1);
  assert.match(text(h.tree), /答对了/, "Returning to a saved word restores its immutable feedback");
  await h.advance(2000);
  assert.equal(h.position(), 1, "Returning through lookup cannot restart an earlier automatic transition");
  h.unmount();
  checks.push(delayedResponse ? "lookup jump rejects stale response effects and returning does not advance" : "lookup jump cancels correct-answer timer without restarting on return");
}

{
  const saved = Object.fromEntries(words.map(word => [`en-zh:${word.id}`, record(`en-zh:${word.id}`, word.meaning, false)]));
  for (let index = 0; index < 546; index++) {
    const id = `en-zh:historic-${index}`;
    saved[id] = { id, response: "historical response", submittedAt: "2026-01-01T00:00:00.000Z",
      feedback: { correct: index % 2 === 0, answer: "historical answer", explanation: "Preserved history" } };
  }
  const h = await mount({ initialRecords: saved });
  assert.equal(Object.keys(h.historyRecords).length, 550);
  h.assertFresh();
  await h.advance(5000);
  assert.equal(h.position(), 1, "Past correct records never trigger a new round's navigation");
  assert.equal(h.posts.length, 0);
  await h.click(h.answer("苹果"));
  await h.confirm(0);
  assert.equal(h.stat("本场"), "1/4", "550 historic records do not enter this round's numerator");
  assert.equal(h.serverRecords["en-zh:word-1"].feedback.correct, true);
  assert.deepEqual(h.historyRecords, saved, "Legacy history is preserved byte-for-byte rather than reset or overwritten");
  h.find("select", () => true).props.onChange({ target: { value: "mistakes" } });
  await h.settle();
  h.assertFresh();
  assert.equal(h.stat("本场"), "0/4", "Historical mistakes still populate the review pool without counting as this round's answers");
  assert.deepEqual(h.historyRecords, saved);
  h.unmount();
  checks.push("550 historical answers are retained, excluded from fresh-round scores and available to the mistake pool");
}

const resetActions = [
  ["sentence scope", h => h.click(h.find("button", node => node.props.title === "QA sentence 1"))],
  ["test quantity", h => h.click(h.button("200 词"))],
  ["direction", h => h.click(h.button("中文选英文"))],
  ["new round", h => h.click(h.button("调整练习范围"))],
  ["word book", async h => {
    await h.click(h.button("词书选择"));
    await h.click(h.find("button", node => text(node).includes("QA second book")));
  }],
  ["word-list filter", async h => {
    h.find("select", () => true).props.onChange({ target: { value: "due" } });
    await h.settle();
  }],
];
for (const [name, change] of resetActions) {
  const h = await mount();
  await h.click(h.answer("苹果"));
  await h.confirm(0);
  const previousSession = h.sessionId;
  const previousRecord = structuredClone(h.serverRecords["en-zh:word-1"]);
  assert.equal(h.stat("本场"), "1/4");
  await change(h);
  assert.notEqual(h.sessionId, previousSession, `${name} starts a separate server session`);
  h.assertFresh();
  assert.deepEqual(h.sessions.get(previousSession)["en-zh:word-1"], previousRecord, `${name} does not delete the preceding round's answer`);
  await h.advance(2000);
  h.assertFresh();
  h.unmount();
  checks.push(`${name} resets progress, accuracy and streak with a new UUID while preserving prior answers`);
}

{
  const h = await mount();
  await h.click(h.answer("苹果"));
  await h.confirm(0);
  const previousSession = h.sessionId;
  await h.click(h.button("调整练习范围"));
  h.assertFresh();
  await h.click(h.answer("书"));
  assert.equal(h.posts[1].body.id, h.posts[0].body.id, "The same vocabulary question can be answered in the next round");
  assert.notEqual(h.posts[1].session, h.posts[0].session);
  await h.confirm(1, false);
  assert.equal(h.sessions.get(previousSession)["en-zh:word-1"].feedback.correct, true);
  assert.equal(h.serverRecords["en-zh:word-1"].feedback.correct, false);
  assert.equal(h.stat("本场"), "1/4");
  assert.equal(h.stat("正确率"), "0%");
  assert.ok(h.options().every(option => option.props.disabled), "This round's first answer remains immutable");
  await h.advance(2000);
  assert.equal(h.position(), 1);
  h.unmount();
  checks.push("same word has independent first-answer locks and scores in separate rounds");
}

{
  const h = await mount();
  await h.click(h.answer("苹果"));
  const previousSession = h.sessionId;
  await h.click(h.button("调整练习范围"));
  h.assertFresh();
  assert.notEqual(h.sessionId, previousSession);
  await h.click(h.answer("书"));
  assert.equal(h.posts.length, 2, "Previous round's pending request cannot block or deduplicate this round's same-word submission");
  await h.confirm(1, false);
  await h.confirm(0, true);
  assert.match(text(h.tree), /答错了/);
  assert.equal(h.serverRecords["en-zh:word-1"].feedback.correct, false);
  assert.equal(h.streak(), 0);
  assert.equal(h.stat("本场"), "1/4");
  await h.advance(2000);
  assert.equal(h.position(), 1, "Late correct response from an old round cannot advance this round's wrong answer");
  h.unmount();
  checks.push("pending same-word requests are isolated by round; late older response cannot overwrite feedback or navigate");
}

{
  const storage = new Map();
  let h = await mount({ storage });
  await h.click(h.answer("苹果"));
  await h.confirm(0);
  h.checkbox("答对后自动下一题").props.onChange({ target: { checked: false } });
  await h.settle();
  assert.equal(storage.get(preferenceKey), "0");
  await h.advance(2000);
  assert.equal(h.position(), 1, "Disabling auto advance cancels an already scheduled timer");
  h.unmount();
  h = await mount({ storage });
  assert.equal(h.checkbox("答对后自动下一题").props.checked, false, "Saved disabled preference survives remount");
  await h.click(h.answer("苹果"));
  await h.confirm(0);
  await h.advance(2000);
  assert.equal(h.position(), 1);
  h.checkbox("答对后自动下一题").props.onChange({ target: { checked: true } });
  await h.settle();
  assert.equal(storage.get(preferenceKey), "1");
  await h.advance(900);
  assert.equal(h.position(), 2, "Re-enabling auto advance works for the current confirmed answer");
  h.unmount();
  checks.push("auto-advance checkbox persists preference and safely cancels/restarts timer");
}

{
  const h = await mount({ count: 2 });
  await h.click(h.answer("苹果"));
  await h.confirm(0);
  await h.advance(900);
  await h.click(h.answer("书"));
  await h.confirm(1);
  await h.advance(899);
  assert.equal(h.position(), 2);
  await h.advance(1);
  assert.equal(h.position(), null);
  assert.match(text(h.tree), /本场正确率\s*100%/);
  assert.match(text(h.tree), /答对\s*2\s*题，答错\s*0\s*题/);
  const completedSession = h.sessionId;
  await h.click(h.button("再练一轮"));
  assert.notEqual(h.sessionId, completedSession);
  h.assertFresh();
  assert.equal(h.stat("本场"), "0/2");
  assert.equal(Object.keys(h.sessions.get(completedSession)).length, 2, "Starting again preserves the completed round");
  h.unmount();
  checks.push("last correct answer opens results after its feedback delay; practice-again starts from zero and preserves the completed round");
}

{
  const h = await mount();
  await h.click(h.answer("苹果"));
  await h.confirm(0);
  assert.equal(h.timers.size, 1);
  h.unmount();
  assert.equal(h.timers.size, 0, "Unmount cancels the pending transition");
  checks.push("unmount clears transition timer");
}

console.log(JSON.stringify({ passed: true, checks, studentWrites: 0, realNetworkRequests: 0 }, null, 2));
