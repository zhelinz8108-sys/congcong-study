import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// Local source/content audit only. No environment files, network, database,
// student progress is loaded. Teacher source/answer material is hashed in memory
// through the same release helper; no private answer payload is ever emitted.
// Authoring modules are inspected for native structure and verification status;
// their private explanations / grading values are deliberately never copied.
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.resolve(app, "..");
// The shared release helpers intentionally resolve paths from the app directory.
// Use their exact digest and strict validation contracts, not an audit-only clone.
process.chdir(app);
const { sourceDigest, teacherDigest, validateAuthoring } = await import("./grade6-bank-native-authoring.mjs");
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
if (args.includes("--help")) {
  console.log("Local native conversion backlog: node scripts/audit-grade6-bank-native-coverage.mjs [--python=path] [--output=path] [--native-files=file1,file2] [--geometry-cache=previous-audit.json]");
  process.exit(0);
}
const destination = path.resolve(workspace, option("output") ?? "tmp/grade6-bank-native/audit.json");
const readJson = async (filename) => JSON.parse(await fs.readFile(filename, "utf8"));
const questions = await readJson(path.join(app, "content/grade6-bank/questions.public.json"));
const manifest = await readJson(path.join(app, "content/grade6-bank/manifest.json"));
assert.equal(questions.length, manifest.total, "Public manifest / question counts differ");
const byId = new Map(questions.map((q) => [q.id, q]));
assert.equal(byId.size, questions.length, "Duplicate public question IDs");

const nativeRoot = path.join(app, "content/grade6-bank/private");
const requestedFiles = option("native-files")?.split(",").filter(Boolean);
const nativeFiles = requestedFiles
  ? requestedFiles.map((filename) => path.resolve(workspace, filename))
  : (await fs.readdir(nativeRoot)).filter((filename) => /^native-[a-z0-9-]+\.mjs$/i.test(filename)).sort().map((filename) => path.join(nativeRoot, filename));
assert(nativeFiles.every((filename) => path.dirname(filename) === nativeRoot && /^native-[a-z0-9-]+\.mjs$/i.test(path.basename(filename))), "Only direct reviewed-authoring modules are eligible; candidates are never verification inputs");
const strictAuthoring = await validateAuthoring();
const eligibleFiles = new Set(nativeFiles.map((filename) => path.basename(filename)));
const nativeAuthoring = new Map();
let reviewLedger = {};
try { reviewLedger = await readJson(path.join(nativeRoot, "native-review-ledger.json")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
function inspectNative(native, inputs) {
  const fields = [], counts = {}, invalidNodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "string") {
      counts[node.type] = (counts[node.type] ?? 0) + 1;
      if (["image", "html", "script", "foreignObject"].includes(node.type)) invalidNodes.push(node.type);
      if (["blank", "response", "drawing"].includes(node.type)) fields.push(node.fieldId);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };
  visit(native);
  const ids = inputs.map((field) => field.id);
  const uniqueIds = new Set(ids), used = new Set(fields);
  const valid = native?.version === 1 && Array.isArray(native.blocks) && native.blocks.length > 0 && !invalidNodes.length && uniqueIds.size === ids.length && fields.length === ids.length && used.size === ids.length && ids.every((id) => used.has(id));
  return { valid, fieldCount: ids.length, blockCount: native?.blocks?.length ?? 0, nodeCounts: counts, forbiddenNodes: invalidNodes };
}
for (const { row, file, authorDigest } of strictAuthoring.entries.filter((entry) => eligibleFiles.has(entry.file))) {
    const filename = path.join(nativeRoot, file);
    assert(byId.has(row.id), "Authoring contains an unknown question ID");
    assert(!nativeAuthoring.has(row.id), "Duplicate native authoring question ID");
    const inspection = inspectNative(row.native, row.inputs ?? []);
    // validateAuthoring already enforces strict AST/rules/KaTeX/choice contracts.
    const privateVerified = true;
    const proof = reviewLedger[row.id];
    const authorDigestMatches = proof?.authorDigest === authorDigest;
    const sourceDigestMatches = proof?.sourceDigest === await sourceDigest(byId.get(row.id));
    const teacherDigestMatches = proof?.teacherDigest === await teacherDigest(byId.get(row.id));
    const ledgerReviewed = proof?.questionReviewed === true && proof?.answerReviewed === true && proof?.figuresReviewed === true;
    nativeAuthoring.set(row.id, {
      authoringFile: path.relative(workspace, filename).replaceAll("\\", "/"),
      authoredValid: inspection.valid && privateVerified,
      verified: inspection.valid && privateVerified && ledgerReviewed && authorDigestMatches && sourceDigestMatches && teacherDigestMatches,
      ledgerReviewed, authorDigestMatches, sourceDigestMatches, teacherDigestMatches,
      reviewRequired: row.private?.reviewRequired === true,
      ...inspection,
    });
}

// Candidate JSON is a non-release workspace aid. Inspect only its state and
// diagnostics, never import its AST or let a candidate satisfy the review gate.
const candidateRoot = path.join(workspace, "tmp/grade6-bank-native/candidates");
const candidateById = new Map();
let candidateFilesChecked = 0, candidateQaFilesChecked = 0;
function assertUnreviewedCandidatePayload(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert(!["private", "answerText", "answerImages", "correctAnswer", "expected", "rules"].includes(key), "Candidate contains a private-answer payload key");
    assert(!(["verified", "verifiedNative", "releaseReady"].includes(key) && child === true) && !(key === "answerStatus" && child === "verified_native"), "Candidate contains a verified/release claim");
    if (Array.isArray(child)) child.forEach(assertUnreviewedCandidatePayload);
    else if (child && typeof child === "object") assertUnreviewedCandidatePayload(child);
  }
}
async function inspectCandidates(folder, isQa = false) {
  let entries;
  try { entries = await fs.readdir(folder, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  for (const entry of entries) {
    const filename = path.join(folder, entry.name);
    if (entry.isDirectory()) { await inspectCandidates(filename, true); continue; }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const value = await readJson(filename);
    if (entry.name === "summary.json") {
      assert(value.verifiedByThisScript === 0 && value.releaseReady === false, "Candidate summary must never claim verified/release ready");
      continue;
    }
    assert(byId.has(value.id), "Candidate contains an unknown question ID");
    assert(["candidate", "pending"].includes(value.status) && value.reviewStatus === "unreviewed" && value.notReleaseArtifact === true && value.containsPrivateAnswers === false, "Candidate cannot claim a reviewed/release/answer-bearing state");
    assert(value.verifiedNative !== true && value.verified !== true && value.releaseReady !== true && !Object.hasOwn(value, "private"), "Candidate is never a verified authoring or private-answer artifact");
    assertUnreviewedCandidatePayload(value);
    candidateFilesChecked++;
    if (isQa) { candidateQaFilesChecked++; continue; }
    assert(!candidateById.has(value.id), "Duplicate conversion candidate ID");
    candidateById.set(value.id, {
      status: value.status, reviewStatus: "unreviewed", notReleaseArtifact: true,
      reasons: Array.isArray(value.reasons) ? value.reasons : [],
    });
  }
}
await inspectCandidates(candidateRoot);

// A raw PDF is inspected only at recorded public-question rectangles. Scan
// classification uses an entire source's QUESTION pages, never prompt length.
// The character > 20 signal below is explicitly a weak text-quality heuristic:
// a perfectly readable short native equation can fall below it, not a scan.
const pythonSource = String.raw`
from pathlib import Path
import sys, json, importlib.util, collections, ast
sys.stdout.reconfigure(encoding='utf-8')
sys.stdin.reconfigure(encoding='utf-8')
cfg=json.load(sys.stdin)
root=Path(cfg['workspace'])
sys.path.insert(0,str(root/'tmp/grade6-bank-import/sync/deps'))
import pymupdf as fitz
fitz.TOOLS.mupdf_display_errors(False)
fitz.TOOLS.mupdf_display_warnings(False)
qs=cfg['questions']
rawroot=root/'tmp/grade6-bank-import'
sync=json.loads((rawroot/'sync/audit.json').read_text(encoding='utf-8'))
tests=json.loads((rawroot/'tests/audit.json').read_text(encoding='utf-8'))
test_sources=json.loads((rawroot/'tests/sources.json').read_text(encoding='utf-8'))
test_import_tree=ast.parse((rawroot/'tests/extract_tests.py').read_text(encoding='utf-8'))
reviewed_scan_ids=next(ast.literal_eval(node.value) for node in test_import_tree.body if isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id=='SCANS' for target in node.targets))
reviewed_scan_names={item['spec']['name'] for item in test_sources if item['spec']['id'] in reviewed_scan_ids}
source_paths={Path(x).name:str(Path(x)) for x in sync['sourceHashes']}
for item in test_sources: source_paths[item['spec']['name']]=item['spec']['path']
segments={}
for item in sync['items']:
    segments[item['id']]=[{'page':im['sourcePage'],'rect':im['sourceRect'],'imagePath':im['path'],'rectMethod':'import-audit-sourceRect'} for im in item['questionImages']]
for item in tests['boundaryChecks']:
    segments[item['id']]=[{'page':clip['page'],'rect':clip['rect'],'column':clip.get('column'),'rectMethod':'reviewed-source-boundary'} for clip in item['segments']]
spec=importlib.util.spec_from_file_location('enrichment_source_geometry',rawroot/'enrichment/extract_enrichment.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
cached=json.loads((root/'tmp/grade6-audit/count-enrichment/extraction.json').read_text(encoding='utf-8'))
cached_by_source={item['file']:item for item in cached}
blank_records=json.loads((root/'tmp/grade6-audit/count-enrichment/audit.json').read_text(encoding='utf-8'))['blank']
for record in blank_records:
    source_paths[Path(record['source']).name]=record['source']
    regions,_=mod.prepare(record,cached_by_source[record['source']])
    for ordinal,region in enumerate(regions,1):
        qid='G6E-CH%02d-Q%03d'%(record['unit'],ordinal)
        segments[qid]=[{'page':clip['page'],'rect':clip['bbox'],'rectMethod':'recomputed-original-import-prepare'} for clip in region['clips']]

docs={};pages={};warnings_by_source=collections.defaultdict(set)
def remember_warnings(name):
    messages=[line for line in fitz.TOOLS.mupdf_warnings().splitlines() if line.strip()]
    warnings_by_source[name].update(messages)
    return messages
def source_doc(name):
    filename=source_paths.get(name)
    if not filename or not Path(filename).is_file():
        matches=[p for p in (root/'六上/数学').rglob('*.pdf') if p.name==name]
        if len(matches)!=1: raise ValueError('Cannot uniquely locate question PDF: '+name)
        filename=str(matches[0]);source_paths[name]=filename
    if filename not in docs:
        docs[filename]=fitz.open(filename)
        remember_warnings(name)
    return docs[filename],filename
def source_page(name,page_number):
    doc,filename=source_doc(name);key=(filename,page_number)
    if key not in pages:
        p=doc[page_number-1]
        raw=p.get_text('rawdict')
        chars=[c for block in raw['blocks'] for line in block.get('lines',[]) for span in line['spans'] for c in span.get('chars',[])]
        usable_chars=sum(bool(c['c'].strip()) and c['c']!='\ufffd' and not 0xe000<=ord(c['c'][0])<=0xf8ff for c in chars if c['c'])
        drawing_objects=p.get_drawings()
        pages[key]={'page':p,'chars':chars,'usableChars':usable_chars,'raster':[x['bbox'] for x in p.get_image_info()], 'vector':[tuple(x['rect']) for x in drawing_objects], 'drawingObjects':[{'bbox':list(x['rect']),'strokeWidth':x.get('width') or 0,'type':x.get('type')} for x in drawing_objects]}
        pages[key]['inspectionWarnings']=remember_warnings(name)
    return pages[key],filename
all_source_pages=collections.defaultdict(set)
for q in qs:
    if q['id'] not in segments: raise ValueError('Missing public-question source rectangle: '+q['id'])
    for clip in segments[q['id']]: all_source_pages[q['sourceName']].add(clip['page'])
source_scan={};scan_page_evidence={}
for name,page_numbers in all_source_pages.items():
    evidence=[]
    for n in sorted(page_numbers):
        item,_=source_page(name,n)
        evidence.append({'page':n,'usableNativeCharacters':item['usableChars'],'rasterObjectCount':len(item['raster']),'vectorObjectCount':len(item['vector']),'inspectionWarningCount':len(item['inspectionWarnings'])})
    # The original import's reviewed SCANS source list differentiates full scans
    # with native page numbers / cover decoration from short native equations.
    # It must also agree with raster-only geometry across question pages.
    raster_only=bool(evidence) and all(x['vectorObjectCount']==0 and x['rasterObjectCount']>0 for x in evidence)
    if name in reviewed_scan_names and not raster_only: raise ValueError('Reviewed scan source geometry changed: '+name)
    scanned=raster_only and (name in reviewed_scan_names or all(x['usableNativeCharacters']==0 for x in evidence))
    source_scan[name]=scanned;scan_page_evidence[name]=evidence
def overlaps(rect,other):
    return max(rect[0],other[0])<min(rect[2],other[2]) and max(rect[1],other[1])<min(rect[3],other[3])
records=[]
for q in qs:
    clips=[];char_total=0;pua_total=0;raster=False;vector=False;positive_area_vector=False
    for clip in segments[q['id']]:
        item,filename=source_page(q['sourceName'],clip['page']);rect=clip['rect'];p=item['page']
        raw=p.get_text('rawdict',clip=fitz.Rect(rect))
        clip_warnings=remember_warnings(q['sourceName'])
        chars=[c['c'] for block in raw['blocks'] for line in block.get('lines',[]) for span in line['spans'] for c in span.get('chars',[])]
        pua=sum(0xe000<=ord(c[0])<=0xf8ff for c in chars if c)
        images=[list(bb) for bb in item['raster'] if overlaps(rect,bb)]
        drawings=[list(bb) for bb in item['vector'] if overlaps(rect,bb)]
        stroke_drawings=[]
        for obj in item['drawingObjects']:
            bbox=obj['bbox'];padding=obj['strokeWidth']/2+0.25
            stroke_bbox=[bbox[0]-padding,bbox[1]-padding,bbox[2]+padding,bbox[3]+padding]
            if overlaps(rect,stroke_bbox): stroke_drawings.append({**obj,'strokeBbox':stroke_bbox})
        char_total+=len(chars);pua_total+=pua;raster|=bool(images);vector|=bool(stroke_drawings);positive_area_vector|=bool(drawings)
        clips.append({**clip,'sourcePdf':filename,'pageSize':[p.rect.width,p.rect.height],'nativeCharacterCount':len(chars),'privateUseCharacterCount':pua,'rasterBboxes':images,'vectorBboxes':drawings,'vectorDrawingObjects':stroke_drawings,'vectorDrawingCount':len(stroke_drawings),'hasRaster':bool(images),'hasVector':bool(stroke_drawings),'hasPositiveAreaVector':bool(drawings),'inspectionWarningCount':len(clip_warnings)+len(item['inspectionWarnings'])})
    records.append({'id':q['id'],'sourcePdf':clips[0]['sourcePdf'],'sourceName':q['sourceName'],'sourcePage':q['sourcePage'],'sourcePages':sorted(set(clip['page'] for clip in clips)),'segments':clips,'scanned':source_scan[q['sourceName']],'hasRaster':raster,'hasLocalRaster':raster and not source_scan[q['sourceName']],'hasVector':vector,'hasPositiveAreaVector':positive_area_vector,'nativeCharacterCount':char_total,'privateUseCharacterCount':pua_total,'textQualityHeuristic':'usable-text' if char_total>20 else 'short-or-text-poor','classificationEvidence':'reviewed-original-import-SCANS-source-and-raster-only-question-pages' if q['sourceName'] in reviewed_scan_names else 'source-question-pages-no-native-text-and-no-vector' if source_scan[q['sourceName']] else 'source-PDF-objects-not-prompt-length'})
for record in records: record['sourceInspectionWarningCount']=len(warnings_by_source[record['sourceName']])
source_rows=[{'sourceName':name,'sourcePdf':source_paths[name],'scanned':source_scan[name],'originalImportReviewedScan':name in reviewed_scan_names,'questionPageEvidence':scan_page_evidence[name],'inspectionWarnings':sorted(warnings_by_source[name])} for name in sorted(all_source_pages)]
for doc in docs.values(): doc.close()
json.dump({'records':records,'sources':source_rows},sys.stdout,ensure_ascii=False)
`;

async function inspectSourceGeometry() {
  if (option("geometry-cache")) {
    const cached = await readJson(path.resolve(workspace, option("geometry-cache")));
    assert.equal(cached.records.length, questions.length, "Cached geometry question count differs");
    assert(cached.records.every((r) => byId.has(r.id) && r.segments?.length && typeof r.scanned === "boolean"), "Cached geometry lacks exact source evidence");
    return { records: cached.records, sources: cached.sources };
  }
  const candidates = [option("python"), path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"), "python3", "python"].filter(Boolean);
  let executable = candidates[0];
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) continue;
    try { await fs.access(candidate); executable = candidate; break; } catch { /* Try next known runtime. */ }
  }
  const stdout = [], stderr = [];
  const child = spawn(executable, ["-c", pythonSource], { cwd: workspace, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const complete = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error("Source geometry inspection failed: " + Buffer.concat(stderr).toString("utf8").slice(-3000))));
  });
  child.stdin.end(JSON.stringify({ workspace, questions: questions.map((q) => ({ id: q.id, sourceName: q.sourceName, sourcePage: q.sourcePage })) }));
  await complete;
  return JSON.parse(Buffer.concat(stdout).toString("utf8"));
}

const geometry = await inspectSourceGeometry();
const geometryById = new Map(geometry.records.map((record) => [record.id, record]));
const records = questions.map((q) => {
  const evidence = geometryById.get(q.id);
  assert(evidence?.segments?.length, "Missing audited source geometry");
  const authored = nativeAuthoring.get(q.id) ?? null;
  const runtime = q.native ? inspectNative(q.native, q.inputs) : null;
  return {
    ...evidence,
    collectionId: q.collectionId, chapter: q.chapter, number: q.number,
    sourceOrder: q.sourceOrder, originalNumber: q.originalNumber, difficulty: q.difficulty,
    sourceQuestionImages: q.questionImages,
    verifiedNative: authored?.verified === true,
    authoredValid: authored?.authoredValid === true,
    runtimeNative: runtime?.valid === true,
    conversionStatus: runtime?.valid ? "native-present-in-local-runtime" : authored?.verified ? "verified-authoring-pending-integration" : authored?.authoredValid ? "authoring-awaiting-current-review-ledger" : authored ? "authoring-needs-validation" : "not-yet-verified",
    nativeAuthoring: authored,
    nativeRuntime: runtime,
    conversionCandidate: candidateById.get(q.id) ?? null,
  };
});
const count = (fn) => records.filter(fn).length;
const unverified = records.filter((record) => !record.verifiedNative);
const pendingReasonCounts = {};
for (const record of unverified) for (const reason of new Set(record.conversionCandidate?.reasons ?? [])) pendingReasonCounts[reason] = (pendingReasonCounts[reason] ?? 0) + 1;
const summary = {
  total: records.length,
  verifiedAuthoring: count((r) => r.verifiedNative),
  validAuthoring: count((r) => r.authoredValid),
  runtimeNative: count((r) => r.runtimeNative),
  awaitingVerifiedNative: count((r) => !r.verifiedNative),
  pendingRuntimeIntegration: count((r) => !r.runtimeNative),
  sourcePdfCount: geometry.sources.length,
  scanned: count((r) => r.scanned),
  anyRaster: count((r) => r.hasRaster),
  nonScannedLocalRaster: count((r) => r.hasLocalRaster),
  vector: count((r) => r.hasVector),
  positiveAreaVector: count((r) => r.hasPositiveAreaVector),
  nativeCharactersOver20: count((r) => r.nativeCharacterCount > 20),
  shortOrTextPoor: count((r) => r.nativeCharacterCount <= 20),
  textOver20WithoutRaster: count((r) => r.nativeCharacterCount > 20 && !r.hasRaster),
  privateUseCharacterQuestions: count((r) => r.privateUseCharacterCount > 0),
  sourcePdfWithInspectionWarnings: geometry.sources.filter((source) => source.inspectionWarnings?.length > 0).length,
  questionsFromSourcesWithInspectionWarnings: count((r) => r.sourceInspectionWarningCount > 0),
  unreviewedCandidates: unverified.filter((r) => r.conversionCandidate?.status === "candidate").length,
  candidatePending: unverified.filter((r) => r.conversionCandidate?.status === "pending").length,
  candidateFilesChecked, candidateQaFilesChecked, candidatesCountedAsVerified: 0,
};
const report = {
  version: 1, generatedAt: new Date().toISOString(), summary,
  unverifiedBacklog: {
    total: unverified.length,
    authoredAwaitingCurrentLedger: unverified.filter((r) => r.authoredValid).length,
    candidateUnreviewed: summary.unreviewedCandidates,
    conversionPending: summary.candidatePending,
    withoutCandidateIndex: unverified.filter((r) => !r.conversionCandidate).length,
    pendingReasonCounts,
    reasonsMayOverlap: true,
  },
  methodology: {
    sourceRectangles: "Exact public-question import source rectangles, including every multi-page segment; enrichment uses the original import prepare function read-only.",
    scanned: "Original import's reviewed 8-source SCANS list plus actual raster objects and zero vectors across question pages. Native page-number/cover decoration is not question text. Unlisted sources qualify only with zero usable native page characters and raster-only geometry. Never inferred from prompt length or a short equation.",
    raster: "At least one source-PDF raster bbox intersects a question segment with positive area; anyRaster includes scanned sources.",
    vector: "Actual PDF drawing rect expanded by strokeWidth/2 + 0.25 intersects the question segment, preserving zero-height fraction bars and zero-width strokes. vectorDrawingObjects contains both original bbox and expanded strokeBbox.",
    positiveAreaVector: "Legacy coarse statistic: at least one unexpanded source-PDF drawing bbox intersects the question segment with positive area. This excludes zero-area lines and is NOT a no-vector guarantee.",
    textHeuristic: "More than 20 native characters is only a coarse extraction-quality flag; short-or-text-poor does not mean scanned or incorrect.",
    sourceWarnings: "MuPDF repair/xref warnings remain explicit source evidence; suppressing console warnings only keeps machine-readable JSON intact and never certifies faithful automatic conversion.",
    verifiedNative: "Same strict validateAuthoring/sourceDigest/teacherDigest helper as the release gate. Current ledger must explicitly attest questions, answers and figures and match author-file, source question/image and paired teacher answer/audit/image/PDF SHA-256. A teacher source or answer change invalidates review. Not a deployment or learner mastery claim.",
    candidates: "Every candidate and QA sample must remain unreviewed, non-release, answer-free, and never counted verified. Candidate state/reasons inform backlog only; no candidate AST is imported into eligible authoring.",
    runtimeNative: "Native AST is present and field-complete in the LOCAL runtime question JSON; this is not confirmation that production was deployed.",
  },
  sources: geometry.sources,
  records,
};
assert.equal(records.length, manifest.total);
assert.equal(new Set(records.map((r) => r.id)).size, manifest.total);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ passed: true, output: path.relative(workspace, destination).replaceAll("\\", "/"), ...summary, privateAnswersEmitted: false, studentDataRead: false, studentWrites: 0 }));
