// Pure in-memory renderer checks. No network, credentials or learner writes.
import fs from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import katex from "katex";

const source = await fs.readFile(new URL("../src/components/grade6-bank-native.tsx", import.meta.url), "utf8");
const dependencies = {};
for (const name of ["grade6-bank-native-types", "grade6-bank-native-validation", "grade6-bank-input-schema"]) {
  const raw = await fs.readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencyContext = { module: { exports: {} }, exports: {}, require(name) {
    for (const [key, module] of Object.entries(dependencies)) if (name.endsWith(key)) return module;
    throw new Error(`Unexpected schema import: ${name}`);
  } };
  dependencyContext.exports = dependencyContext.module.exports;
  vm.runInNewContext(code, dependencyContext);
  dependencies[name] = dependencyContext.module.exports;
}
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const jsx = (type, props) => ({ type, props: props ?? {} });
const slots = [];
let effects = [];
let cursor = 0;
const react = {
  useId: () => `native-render-test-${cursor++}`,
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  },
  useRef(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  },
  useMemo: (factory) => factory(),
  useEffect: (effect) => { effects.push(effect); },
};
const context = {
  module: { exports: {} }, exports: {},
  require(name) {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name === "katex") return katex;
    for (const [key, module] of Object.entries(dependencies)) if (name.endsWith(key)) return module;
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    throw new Error(`Unexpected renderer import: ${name}`);
  }, console,
};
context.exports = context.module.exports;
vm.runInNewContext(compiled, context);
const Native = context.module.exports.Grade6BankNative;
const completedDrawing = context.module.exports.bankDrawingCompleted;
function expand(value, nodes = []) {
  if (Array.isArray(value)) { value.forEach((child) => expand(child, nodes)); return nodes; }
  if (!value || typeof value !== "object") return nodes;
  if (typeof value.type === "function") return expand(value.type(value.props), nodes);
  nodes.push(value);
  expand(value.props.children, nodes);
  return nodes;
}
function render(props) { cursor = 0; return expand(Native(props)); }
const blanks = Array.from({ length: 6 }, (_, index) => ({ id: `blank-${index + 1}`, label: `第${index + 1}空`, kind: "text" }));
const content = { version: 1, blocks: [
  { type: "heading", text: "求四种数的倒数" },
  { type: "paragraph", content: [{ type: "math", tex: "\\frac{3}{10}" }, { type: "text", value: "的倒数是" }, ...blanks.flatMap((field, index) => [{ type: "blank", fieldId: field.id }, { type: "text", value: index === 5 ? "。" : "；" }])] },
] };
let edited = null;
const props = { content, inputs: blanks, answers: { "blank-2": "4" }, disabled: false, onChange: (id, value) => { edited = { id, value }; } };
const nodes = render(props), controls = nodes.filter((node) => node.type === "input");
assert.equal(controls.length, 6);
assert.deepEqual(controls.map((node) => node.props["data-field"]), blanks.map((field) => field.id));
assert.equal(controls[0].props.value, "");
assert.equal(controls[1].props.value, "4");
controls[3].props.onChange({ target: { value: "26/5" } });
assert.deepEqual(edited, { id: "blank-4", value: "26/5" });
assert(controls.every((node) => node.props["data-result"] === undefined));
assert(!nodes.some((node) => node.type === "img" || node.type === "image"));
assert(nodes.some((node) => node.props.dangerouslySetInnerHTML?.__html?.includes("katex")));
const feedback = render({ ...props, disabled: true, results: [{ id: "blank-1", correct: true }, { id: "blank-2", correct: false }] }).filter((node) => node.type === "input");
assert.equal(feedback[0].props["data-result"], "correct");
assert.equal(feedback[1].props["aria-invalid"], true);
assert(feedback.every((node) => node.props.disabled));

const richContent = { version: 1, blocks: [
  { type: "table", rows: [[[{ type: "text", value: "数" }], [{ type: "text", value: "倒数" }]], [[{ type: "math", tex: "\\frac{3}{4}" }], [{ type: "blank", fieldId: "table-1" }]]] },
  { type: "paragraph", content: [{ type: "text", value: "正确选项是" }, { type: "blank", fieldId: "choice-1" }] },
  { type: "response", fieldId: "reason-1", multiline: true },
  { type: "diagram", viewBox: [0, 0, 220, 220], label: "圆的半径", shapes: [
    { type: "circle", cx: 110, cy: 110, r: 80, stroke: "#b66a32" },
    { type: "line", x1: 110, y1: 110, x2: 190, y2: 110, stroke: "#b66a32" },
    { type: "text", x: 145, y: 99, value: "r" },
    { type: "rect", x: 1, y: 1, width: 5, height: 5 },
    { type: "ellipse", cx: 10, cy: 10, rx: 5, ry: 2 },
    { type: "path", d: "M0 0 L1 1" },
    { type: "polyline", points: "0,0 1,1 2,1" },
  ] },
] };
const richNodes = render({ ...props, content: richContent, inputs: [{ id: "table-1", label: "表格第1空", kind: "text" }, { id: "choice-1", label: "选择题", kind: "choice", choices: ["A", "B", "C", "D"] }, { id: "reason-1", label: "理由", kind: "text" }], answers: { "choice-1": "C", "reason-1": "说明" } });
assert.equal(richNodes.filter((node) => node.type === "table").length, 1);
assert.equal(richNodes.filter((node) => node.type === "td").length, 4);
assert.equal(richNodes.find((node) => node.type === "select").props.value, "C");
assert.equal(richNodes.filter((node) => node.type === "option").length, 5);
assert.equal(richNodes.find((node) => node.type === "textarea").props.value, "说明");
for (const type of ["svg", "circle", "line", "text", "rect", "ellipse", "path", "polyline"]) assert(richNodes.some((node) => node.type === type));
assert.equal(richNodes.find(node=>node.type==="figure").props.style.width,220,"small diagrams must not become a full-width close-up");
assert(!richNodes.some((node) => node.type === "img" || node.type === "image"));
const arithmeticContent = { version:1, blocks:[{type:"table",presentation:"arithmetic",rows:[[[{type:"text",value:"5"}],[{type:"blank",fieldId:"digit-1"}]],[[{type:"text",value:"─"}],[{type:"text",value:"─"}]]]}] };
dependencies["grade6-bank-native-validation"].assertBankNative([{id:"digit-1",label:"个位",kind:"text"}],arithmeticContent);
const arithmeticNodes=render({...props,content:arithmeticContent,inputs:[{id:"digit-1",label:"个位",kind:"text"}],answers:{}});
assert(arithmeticNodes.find(node=>node.type==="table").props.className.includes("arithmetic"));
assert.equal(arithmeticNodes.filter(node=>node.type==="td"&&node.props["data-bar"]===true).length,2);
assert.equal(arithmeticNodes.filter(node=>node.type==="input").length,1,"digit stays in its original cell");
const decimalContent={version:1,blocks:[{type:"table",presentation:"arithmetic",rows:[[[{type:"text",value:"1"}],[{type:"text",value:"."}],[{type:"text",value:"2"}]],[[{type:"text",value:"─"}],[{type:"text",value:"─"}],[{type:"text",value:"─"}]],[[{type:"blank",fieldId:"digit-1"}],[],[{type:"text",value:"4"}]]]}]};
const decimalNodes=render({...props,content:decimalContent,inputs:[{id:"digit-1",label:"个位",kind:"text"}],answers:{}});
assert.equal(decimalNodes.filter(node=>node.type==="td"&&node.props["data-decimal"]===true).length,3,"decimal-only columns are narrow through all rows");
decimalContent.blocks[0].rows[2][1]=[{type:"text",value:"3"}];
assert(!render({...props,content:decimalContent,inputs:[{id:"digit-1",label:"个位",kind:"text"}],answers:{}}).some(node=>node.props["data-decimal"]===true),"a decimal column containing a digit must not collapse");
assert.throws(()=>dependencies["grade6-bank-native-validation"].assertBankNative([{id:"digit-1",label:"个位",kind:"text"}],{version:1,blocks:[{...arithmeticContent.blocks[0],presentation:"raw-html"}]}),/table presentation/);
const fractionInputs=[{id:"numerator",label:"分子",kind:"text"},{id:"denominator",label:"分母",kind:"text"}];
const fractionContent={version:1,blocks:[{type:"paragraph",content:[{type:"fraction",numerator:[{type:"blank",fieldId:"numerator"}],denominator:[{type:"blank",fieldId:"denominator"}]}]}]};
dependencies["grade6-bank-native-validation"].assertBankNative(fractionInputs,fractionContent);
const fractionNodes=render({...props,content:fractionContent,inputs:fractionInputs,answers:{numerator:"1"}});
assert.equal(fractionNodes.filter(node=>node.type==="input").length,2);
assert.deepEqual(fractionNodes.filter(node=>node.type==="input").map(node=>node.props["data-field"]),["numerator","denominator"]);
assert(fractionNodes.some(node=>node.props["data-native-fraction"]==="true"));
assert.throws(()=>dependencies["grade6-bank-native-validation"].assertBankNative(fractionInputs,{version:1,blocks:[{type:"paragraph",content:[{type:"fraction",numerator:[],denominator:[{type:"blank",fieldId:"denominator"}]}]}]}),/fraction/);
const unsafe = render({ ...props, inputs: [], content: { version: 1, blocks: [{ type: "paragraph", content: [{ type: "math", tex: "\\href{javascript:alert(1)}{x}" }] }] } });
assert(!unsafe.some((node) => /<a(?:\s|>)/.test(node.props.dangerouslySetInnerHTML?.__html ?? "")));

slots.length = 0;
let drawingValue = "", drawingEdits = 0;
const drawingProps = { content: { version: 1, blocks: [{ type: "drawing", fieldId: "drawing-1", viewBox: [0, 0, 600, 360], label: "作图", shapes: [{ type: "line", x1: 0, y1: 0, x2: 600, y2: 0, stroke: "#a77" }] }] }, inputs: [{ id: "drawing-1", label: "第1小题作图", kind: "drawing" }], answers: {}, disabled: false, onChange: (id, value) => { assert.equal(id, "drawing-1"); drawingValue = value; drawingEdits++; } };
function drawingRender() { return render({ ...drawingProps, answers: { "drawing-1": drawingValue } }); }
function canvas(nodes = drawingRender()) { return nodes.find((node) => node.type === "svg" && node.props.role === "application"); }
function key(value) { canvas().props.onKeyDown({ key: value, repeat: false, shiftKey: false, preventDefault() {} }); }
function tool(name) { drawingRender().find((node) => node.type === "button" && node.props.children === name).props.onClick(); }
assert.equal(drawingEdits, 0, "mount is read-only");
assert(!completedDrawing(""));
assert(!completedDrawing(JSON.stringify({ version: 1, viewBox: [0, 0, 600, 360], items: [] })));
key("Enter"); key("ArrowRight"); key("Enter");
assert.equal(JSON.parse(drawingValue).items[0].type, "line");
assert(completedDrawing(drawingValue, [0, 0, 600, 360]));
tool("圆"); key("Enter"); key("ArrowDown"); key("Enter");
assert.equal(JSON.parse(drawingValue).items[1].type, "circle");
tool("矩形"); key("Enter"); key("ArrowRight"); key("ArrowDown"); key("Enter");
assert.equal(JSON.parse(drawingValue).items[2].type, "rect");
tool("笔"); key("Enter"); key("ArrowLeft"); key("ArrowUp"); key("Enter");
assert.equal(JSON.parse(drawingValue).items[3].type, "pen");
tool("标注");
drawingRender().find((node) => node.type === "input" && node.props["aria-label"] === "图形标注").props.onChange({ target: { value: "O" } });
key("Enter");
assert.equal(JSON.parse(drawingValue).items[4].value, "O");
const beforeUndo = JSON.parse(drawingValue).items.length;
tool("撤销"); assert.equal(JSON.parse(drawingValue).items.length, beforeUndo - 1);
tool("清空"); assert.equal(drawingValue, "");

tool("涂色"); key("Enter"); key("ArrowRight"); key("ArrowDown"); key("ArrowLeft"); key("Enter");
assert.equal(JSON.parse(drawingValue).items[0].type, "shade");
assert(drawingRender().some((node) => node.type === "polygon" && node.props.fill === "currentColor" && node.props.fillOpacity === "0.3" && node.props.stroke === "none"));
tool("清空");
tool("涂色"); key("Enter"); key("ArrowRight"); key("Enter");
assert.equal(drawingValue, "", "a straight line is not a shaded region");

// These public cells model the two fraction-area drawing questions. Filled
// regions contain only student-selected vertices, never private answers.
drawingProps.content.blocks[0].shapes.push({ type: "rect", x: 20, y: 15, width: 80, height: 40, fill: "#ffffff" }, { type: "rect", x: 100, y: 15, width: 80, height: 40, fill: "#ffffff" }, { type: "rect", x: 20, y: 15, width: 400, height: 40, fill: "none", stroke: "#a77" });
tool("填格");
const fillTarget = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 360 }), setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} };
const fillPointer = (x, y) => ({ clientX: x, clientY: y, currentTarget: fillTarget, pointerId: 1, button: 0, isPrimary: true, preventDefault() {} });
canvas().props.onPointerDown(fillPointer(60, 30));
assert.deepEqual(JSON.parse(drawingValue).items[0], { type: "shade", points: [[20, 15], [100, 15], [100, 55], [20, 55]] });
canvas().props.onPointerDown(fillPointer(140, 30));
assert.equal(JSON.parse(drawingValue).items.length, 2);
key("Enter");
assert.equal(JSON.parse(drawingValue).items.length, 1, "keyboard can toggle the currently selected cell");
canvas().props.onPointerDown(fillPointer(60, 30));
assert.equal(drawingValue, "", "a repeated click removes only its shading");

tool("直线");
const target = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 360 }), setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} };
const pointer = (x, y) => ({ clientX: x, clientY: y, currentTarget: target, pointerId: 1, button: 0, isPrimary: true, preventDefault() {} });
canvas().props.onPointerDown(pointer(20, 40)); canvas().props.onPointerMove(pointer(120, 160)); canvas().props.onPointerUp(pointer(120, 160));
assert.deepEqual(JSON.parse(drawingValue).items[0], { type: "line", from: [20, 40], to: [120, 160] });
const previous = drawingValue;
const busyCanvas = canvas(render({ ...drawingProps, answers: { "drawing-1": drawingValue }, disabled: true }));
assert.equal(busyCanvas.props.tabIndex, -1);
busyCanvas.props.onKeyDown({ key: "Enter", repeat: false, preventDefault() {} });
busyCanvas.props.onPointerDown(pointer(30, 50));
assert.equal(drawingValue, previous, "pending blocks pointer and keyboard writes");
assert(!completedDrawing(JSON.stringify({ version: 1, viewBox: [0, 0, 600, 360], items: [{ type: "line", from: [-1, 0], to: [10, 10] }] })));
assert(!completedDrawing(JSON.stringify({ version: 1, viewBox: [0, 0, 600, 360], items: [{ type: "text", at: [20, 20], value: "O", onload: "alert(1)" }] })));
assert(!completedDrawing(JSON.stringify({ version: 1, viewBox: [0, 0, 600, 360], items: Array.from({ length: 25 }, () => ({ type: "line", from: [0, 0], to: [1, 1] })) })));
assert(!completedDrawing(previous, [0, 0, 300, 200]));
assert(!completedDrawing(JSON.stringify({ version: 1, viewBox: [0, 0, 600, 360], items: [{ type: "shade", points: [[1, 1], [2, 2]] }] })));
assert(!completedDrawing(JSON.stringify({ version: 1, viewBox: [0, 0, 600, 360], items: [{ type: "shade", points: [[1, 1], [20, 20], [1, 20]], fill: "url(javascript:alert(1))" }] })));

// Exercise the actual parent session's legacy-history path with asynchronous
// GET values; these calls go solely to this in-memory draft double.
slots.length = 0;
const sessionSource = await fs.readFile(new URL("../src/components/grade6-bank.tsx", import.meta.url), "utf8");
const sessionCode = ts.transpileModule(`${sessionSource}\nexport { QuestionSession as TestQuestionSession };`, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const sessionContext = { module: { exports: {} }, exports: {}, require(name) {
  if (name === "next/link") return () => null;
  if (name.endsWith("grade6-bank-progress")) return { useGrade6BankProgress: () => null };
  if (name.endsWith("grade6-bank-types")) return { BANK_DIFFICULTIES: [{ value: 1, label: "基础起步" }] };
  if (name === "./grade6-bank-native") return context.module.exports;
  return context.require(name);
} };
sessionContext.exports = sessionContext.module.exports;
vm.runInNewContext(sessionCode, sessionContext);
let drafts = 0;
const question = { id: "native-history", number: 1, difficulty: 1, inputs: [{ id: "blank-1", label: "第1空", kind: "text" }], native: { version: 1, blocks: [{ type: "paragraph", content: [{ type: "blank", fieldId: "blank-1" }] }] }, questionImages: [], prompt: "" };
const record = { answers: {}, revision: 1, submitted: false };
const progress = { progress: { responses: { [question.id]: record } }, getResponse: () => record, draft: (_id, answers) => { drafts++; record.answers = answers; record.revision++; } };
const sessionProps = { question, collection: { palette: 0, questionCount: 1 }, position: 0, count: 1, progress, go: () => { throw new Error("Unexpected automatic navigation"); } };
function sessionRender() { cursor = 0; effects = []; const nodes = expand(sessionContext.module.exports.TestQuestionSession(sessionProps)); for (const effect of effects) effect(); return nodes; }
assert(!sessionRender().some((node) => node.type === "details"));
record.answers = { "old-combined": "3/4，1/2", "blank-1": "" }; record.revision++;
assert(sessionRender().some((node) => node.type === "details"), "late GET shows legacy history");
assert.equal(drafts, 0, "read-only GET never drafts or auto-splits legacy answers");
sessionRender().find((node) => node.type === "input").props.onChange({ target: { value: "3/4" } });
assert.deepEqual(JSON.parse(JSON.stringify(record.answers)), { "blank-1": "3/4" });
assert(sessionRender().some((node) => node.type === "p" && node.props.children === "3/4，1/2"), "legacy history survives an explicit native edit");
// An entirely new session can read independently persisted old text even after
// the active native answer contains only its current per-blank fields.
slots.length=0;
progress.getLegacyAnswers=()=>({"old-combined":"retained-after-new-session"});
let schemaReads=0;progress.observeQuestion=()=>{schemaReads++;};
assert(sessionRender().some((node)=>node.type==="p"&&node.props.children==="retained-after-new-session"));
assert(schemaReads>0);assert.equal(drafts,1,"schema observation and historic display must not draft");
// A legal reused text field is not proof that a historic aggregate belongs to
// the first new blank. Render the full history and require fresh explicit input.
slots.length=0;progress.getLegacyAnswers=()=>({});
question.inputs=[{id:"answer-1",label:"第一空",kind:"text"},{id:"blank-2",label:"第二空",kind:"text"}];question.native.blocks=[{type:"paragraph",content:[{type:"blank",fieldId:"answer-1"},{type:"blank",fieldId:"blank-2"}]}];
record.answers={};record.revision++;assert(!sessionRender().some(node=>node.type==="details"));
record.answers={"answer-1":"旧的完整聚合作答"};record.revision++;const sameNameDrafts=drafts;
const aggregateNodes=sessionRender();assert(aggregateNodes.some(node=>node.type==="p"&&node.props.children==="旧的完整聚合作答"));
assert.deepEqual(aggregateNodes.filter(node=>node.type==="input"&&node.props["data-field"]).map(node=>node.props.value),["",""]);
assert.equal(drafts,sameNameDrafts,"late clean GET containing reused text key remains read-only");
aggregateNodes.find(node=>node.type==="input"&&node.props["data-field"]==="answer-1").props.onChange({target:{value:"新第一空"}});
assert.deepEqual(JSON.parse(JSON.stringify(record.answers)),{"answer-1":"新第一空"},"explicit new first blank never spreads historic aggregate into any native field");
record.nativeInputSchema=dependencies["grade6-bank-input-schema"].bankNativeInputSchema(question);
assert.deepEqual(sessionRender().filter(node=>node.type==="input"&&node.props["data-field"]).map(node=>node.props.value),["新第一空",""]);
assert(sessionRender().some(node=>node.type==="p"&&node.props.children==="旧的完整聚合作答"));
delete record.nativeInputSchema;
// A reused answer-1 field can change from aggregate text to a choice; preserve
// the old non-choice value as history instead of selecting or sending it.
slots.length=0;progress.getLegacyAnswers=()=>({});question.inputs=[{id:"answer-1",label:"选择",kind:"choice",choices:["A","B","C","D"]}];question.native.blocks=[{type:"paragraph",content:[{type:"blank",fieldId:"answer-1"}]}];
record.answers={"answer-1":"旧作答3/4，1/2"};record.revision++;
const choiceDrafts=drafts;const choiceNodes=sessionRender();
assert(choiceNodes.some(node=>node.type==="p"&&node.props.children==="旧作答3/4，1/2"));
assert.equal(choiceNodes.find(node=>node.type==="select").props.value,"");assert.equal(drafts,choiceDrafts,"invalid legacy choice displays without writing");
sessionRender().find(node=>node.type==="select").props.onChange({target:{value:"C"}});
assert.deepEqual(JSON.parse(JSON.stringify(record.answers)),{"answer-1":"C"});
assert(sessionRender().some(node=>node.type==="p"&&node.props.children==="旧作答3/4，1/2"));
// Run the actual renderer against EVERY authored row, not only synthetic examples.
// Input callbacks exercise independent fields; no network or persisted learner state.
const { validateAuthoring } = await import("./grade6-bank-native-authoring.mjs");
const authored = await validateAuthoring();
let authoredControls = 0, authoredDrawings = 0;
for (const { row } of authored.entries) {
  slots.length = 0;
  const edits = [];
  const originalProps = { content: row.native, inputs: row.inputs, answers: {}, disabled: false, onChange: (id, value) => edits.push({ id, value }) };
  const initial = render(originalProps);
  assert(!initial.some(node => node.type === "img" || node.props.className === "mathFallback"), row.id + " must be native");
  const values = {};
  for (const field of row.inputs) {
    if (field.kind === "drawing") {
      assert.equal(initial.filter(node => node.props["data-drawing-field"] === field.id).length, 1, row.id + " drawing " + field.id);
      authoredDrawings++;
      continue;
    }
    const controls = initial.filter(node => node.props["data-field"] === field.id);
    assert.equal(controls.length, 1, row.id + " field " + field.id);
    values[field.id] = field.kind === "choice" ? field.choices[0] : "独立作答";
    controls[0].props.onChange({ target: { value: values[field.id] } });
    assert.deepEqual(edits.at(-1), { id: field.id, value: values[field.id] });
    authoredControls++;
  }
  slots.length = 0;
  const disabled = render({ ...originalProps, answers: values, disabled: true });
  for (const field of row.inputs.filter(field => field.kind !== "drawing")) {
    const control = disabled.find(node => node.props["data-field"] === field.id);
    assert.equal(control.props.value, values[field.id], row.id);
    assert.equal(control.props.disabled, true, row.id);
  }
}
console.log(JSON.stringify({ authoredRendererRows: authored.entries.length, independentControls: authoredControls, drawingControls: authoredDrawings, studentWrites: 0 }));
console.log(JSON.stringify({ passed: true, checks: ["six original-position blanks", "field-specific controlled edits", "hidden pre-submit results", "per-field feedback", "pending disabled controls", "table inline controls", "choice and multiline controls", "native SVG shape allowlist", "KaTeX trust false", "drawing read-only mount", "keyboard line circle rectangle pen and annotation", "keyboard filled polygon", "precise filled cells and toggle", "undo and clear", "pointer drawing", "pending blocks drawing", "drawing bounds / field allowlist / caps / canvas match", "late read-only GET legacy history", "legacy history survives explicit edit", "history restored in a new session", "schema observation never drafts", "same-name invalid choice retained as history", "explicit selection does not include old aggregate", "no automatic navigation"], studentWrites: 0 }));
