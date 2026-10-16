# Six-upper English

Home: `/subjects/[id]/english/six`. New and legacy editions have separate Unit
1-8 navigation. The learning order is textbook listening/reading, explanation,
basic practice, targeted consolidation, assessment, and advanced practice.
Reference answers and teacher materials have separate categories. Whole-book,
midterm, and final resources are available from the whole-book filter.

## Local Import

Use the bundled Python runtime with pypdf and Pillow:

```text
python scripts/import-english-six.py
python scripts/complete-english-six-pdfs.py
python scripts/finish-english-six.py
```

The second command uses Windows OCR and the existing audit's OCR helper. It
requires Windows OCR permission. The cached audit text is in
`../_question_bank_scan/grade6-english-20261011`. Source files are never edited.
The password-protected grammar ZIP is intentionally excluded at the user's
request. Exact binary duplicates are collapsed; differing PDF/Word or
student/teacher editions are retained rather than falsely deduplicated.

The importer generates `content/english-six/`: native page blocks, extracted
illustrations, media, source metadata, and eight 66-question interactive unit
papers. Original PDFs are not published. Old Word and Flash/WMV/WMA formats are
retained as download-only sources where no safe native conversion is available.
PPTX text, images and playable media are extracted; original PPTX files are
retained because animations and exact slide layout are not reconstructed.

All content and media are served behind family authentication. Media support
byte ranges for seeking; opaque IDs are resolved only through a private
manifest. Interactive answers are server-only and returned after a nonempty,
valid submission. Appended answers are removed from the interactive source
reader. Open responses receive references for self-assessment, not unreliable
exact-string grading. Objective accuracy excludes open responses. Drafts and
results are saved in browser-local storage; this feature does not claim
cross-device synchronization. Mistake review is a separate attempt and does
not rewrite the original result.

## Editorial Limits

OCR text can have spacing/column/character errors. Extracted source images
are retained as visual references. A successful import is not a manual
editorial validation of all 3,804 PDF pages. Source answer keys are not assumed
infallible: Unit 1 question 3 has been corrected to B `to speak`, because
`be afraid of speaking` requires `of`, which is missing from the original stem.
Unit 6 question 10 and Unit 7 question 9 originally had two grammatically valid
options. Their D distractors have been revised in the web practice only, with
the reason recorded in feedback; the original source files remain unchanged.
Underlines in the unit papers are retained. Writing and sentence conversion
use self-assessment against references. Missing paper audio is not replaced
with unrelated textbook recordings. The eight interactive unit papers are
written practice and have no matching local audio.

## QA And Deployment

```text
node scripts/test-english-six.mjs
node scripts/test-english-six-browser.mjs --playwright=<absolute runtime module>
```

Browser QA uses disposable storage and no real student writes. The development
server can be the existing project preview on port 3006. Build with
`STUDY_PLAN_BUILD_DIR=.next-six-qa` to avoid overwriting an active `.next` preview.

Private content is intentionally git-ignored, so a code-only GitHub checkout
cannot install the corpus. Deployment must independently transfer the content
directory, verify file counts/checksums and available disk capacity, preserve
the old code/content release, build and restart `study-plan`, then verify HTTPS,
family authentication, native reading, objective grading and media range
responses. The Actions rsync excludes this private runtime directory to keep
later code-only deployments from deleting it. Never upload deployment keys,
environment files, raw audit paths, or the excluded ZIP to the public site.

The production corpus is on `/www/study-plan-data/english-six`, with a symlink
from the application's content directory. Use `next build --webpack` when
building this layout: Turbopack rejects the cross-root content symlink.
`upload-english-six.mjs upload` resumes transfers; its `verify` mode checks
every asset's size and SHA-256 against the private manifest before publishing.
`release-english-six.sh` backs up code and PostgreSQL, builds separately from
the running release, and rolls back the compiled application on failed startup.
The data disk expires on 2026-11-11 and has no automatic renewal enabled.

## Published Release: 2026-10-11

Live entry: `https://congcong-study.cn/subjects/8bd6f79b-99f5-4e68-a961-872d60d260b1/english/six`.
The 1,845 included source files produce 1,391 deduplicated resources: 1,297
native/playable resources and 94 legacy download-only resources. The eight
interactive papers have 528 questions in total, including 320 objectively
graded questions. Remaining source papers are native readers, not a claim that
all source questions have been converted into interactive exercises.

All 9,330 assets (25,711,726,622 bytes) passed size and SHA-256 verification.
Production build, isolated server preflight, service health, and HTTPS browser
QA passed. QA covered answer privacy, grading, audio ranges and real playback,
chapter navigation, reload restoration, and 390px/320px mobile layouts, without
writing real student database records. The online QA report and screenshots
are in the ignored `tmp/english-six-online-qa/` directory.

The previous code, compiled application and PostgreSQL dump are protected in
`/www/study-plan-data/backups/before-english-six-20261011`. Do not overwrite this
backup during later deployments. Renew the data disk before 2026-11-11; the
site's content symlink depends on this mounted volume.

## Resource Organization

The directory has three independent collections: unit learning, whole-book /
cross-unit material, and midterm / final revision. Unit views contain only
single-unit resources; an eight-unit book is not repeated in all eight views.
All 1,391 resources remain available. Filenames take precedence over batch
folder ranges and noisy OCR markers. Nearest unit folders resolve media with
generic filenames; ambiguous material stays in the general collection.

Collection, edition, unit, stage, period and search are preserved in the URL.
Whole-book links use `unit=all` and start at page 1; chapter navigation remains
available inside the reader. Desktop and 390px / 320px browser QA checks these
paths and the original grading, audio, progress and answer privacy behavior.

`deploy-english-six-organization.mjs prepare|activate` updates only the four
English directory / reader files, with source hash guards, a separate Webpack
build, and rollback on failed startup. It does not transfer assets or modify
the database or Nginx configuration.

The organization release is live. Source backup:
`/www/study-plan-data/backups/before-english-six-organization-20261011`;
previous compiled release:
`/www/study-plan/.next-before-english-six-organization-20261011`.
Isolated production preflight, HTTPS organization / practice / media QA, and
the login / document-navigation guard regression passed with zero real student
writes. Updated screenshots are in `tmp/english-six-online-qa/`.

## Original-Question Bank: Partial Conversion

`python scripts/import-english-six-bank.py` builds an additional 2,575 source
questions in 287 section-sized papers. This includes all 944 course exercises
(118 per Unit), matched grammar sections, translation/dictation, and reviewed
phrase/sentence sections. The existing 528 Unit assessment questions remain.
The audit found at least 10,623 questions; this is a lower bound, not a final
denominator. The index deliberately keeps `complete: false`. Scanned books,
picture/table exercises, most legacy documents and unmatched sections still
need extraction, answer alignment and editorial review.

Each question keeps its original page/block and answer-source page/block.
Counts must align exactly before a section can enter the bank. Missing keys,
missing explanations and unsupported figures are quarantined in
`bank/audit.private.json`. Matching keys is not a guarantee that every source
answer is correct. Reviewed corrections and additions are in
`scripts/english_six_bank_editorial.py`, including a wrong double-a exclamation
key, a mismatched dialogue question, and ambiguous What/How choices. Original
documents are not modified. Ambiguous and open responses use reference-only
feedback and are excluded from objective accuracy.

Bank pages are under `/english/six/bank` and `/english/six/bank/[paper]`.
Questions are shown one at a time. Multi-blank fields are all required before
submission. No keys or explanations occur in the public question payload.
Feedback is returned after submitting. Drafts/position use local storage;
submitted responses use the site's existing immutable cloud first-submission
records, so refreshing or switching devices cannot overwrite a submission.

```text
node scripts/test-english-six-bank.mjs
node scripts/test-english-six-bank-browser.mjs --playwright=<absolute runtime module>
node scripts/deploy-english-six-bank.mjs prepare
node scripts/deploy-english-six-bank.mjs preflight
node scripts/deploy-english-six-bank.mjs activate
```

The dedicated release updates only the new bank files and five shared English
files. It transfers a small private question-data archive, not all media.
Source hash guards protect unrelated deployments. Build/preflight/activation
are separated, with code, data and compiled-release rollback; no database
migration or new purchases are required. Browser QA uses a mocked lock API and
therefore does not create real student responses.

This partial bank is now live. Backup:
`/www/study-plan-data/backups/before-english-six-bank-20261011`;
previous compiled release:
`/www/study-plan/.next-before-english-six-bank-20261011`.
The corpus archives passed SHA-256 checks. TypeScript, data/grading tests and
the shared first-submission integration harness passed. The local production
build ran out of Windows committed memory; the separate Tencent Cloud Webpack
production build and isolated preflight completed successfully. HTTPS browser
QA passed for choice/fill/reference/ambiguous questions, persistence, original
page links, and desktop/390px/320px layouts with no page errors or real student
writes. The new-device/login/document-navigation guard regression also passed.
Reports/screenshots: `tmp/english-six-bank-online-qa/` and
`tmp/navigation-guard-qa/`. Full source conversion remains incomplete.

## Reviewed Data Expansion: 2026-10-11

This data-expansion release contained **4,692 questions in 544 papers**. Together
with the original 528 Unit assessments, there are **5,220 interactive items**.
This release added 2,117 questions without changing any of the previous 2,575
question IDs, prompts, options, answers or source locations. Existing student
first-submission records remain intact.

Newly reviewed source families include vocabulary (1,040 items), phrase and
sentence drills (535), protected basic/reinforcement sheets (638), knowledge
checklists (248), lecture exercises (155), and composition tasks (16). Those
counts describe entire source families, not just the increment in this release.
The extra bank has 2,767 objectively graded questions and 1,925 reference-response
questions. Open writing, translation and underdetermined source questions show
models/explanations after submission and do not falsely lower objective accuracy.

Editorial modules preserve original files and provenance while correcting
identified key/prompt defects, including `didn't felt`, `ask ... practised`,
plural `books ... was`, duplicated `What a a`, missing `sides`, wrong question
targets, duplicated `e-`, date ordinals, omitted blanks and inconsistent word
banks. Checked writing models include translations and meet the specified
50-60-word body range; open drafts need not match a model verbatim.

The importer keeps `complete: false`. Many scanned books, image/table exercises
and legacy files still require verified extraction, answer matching and review.
The remaining key-only Unit 8 lecture entry is quarantined rather than creating
an invented question. Source PDFs and equivalent DOCX versions are not counted
twice in the published question bank.

Data-only deployment:

```text
node scripts/deploy-english-six-bank-data.mjs prepare english-six-bank-<fresh-release-id>
node scripts/deploy-english-six-bank-data.mjs activate english-six-bank-<fresh-release-id>
```

Runtime hash guards, SHA-256 data checks, staged pure-grading/provenance checks,
old-ID continuity and post-restart authenticated HTTP privacy checks passed.
Backup: `/www/study-plan-data/backups/before-english-six-bank-reviewed-20261011`.
The compiled application was unchanged, so this data-only update needed no new
Next.js build. TypeScript, all-question grading tests, the shared first-submission
harness and original 528-question/media regression passed. HTTPS browser QA
covered new corrected cloze/checklist questions, writing feedback, draft reload,
answer privacy, desktop/390px/320px layouts and zero real student writes.

## Legacy Checklist Review: 2026-10-11

The live additional bank now contains **4,923 questions in 573 papers**, or
**5,451 interactive items** including the original 528 Unit assessments.
The legacy checklist expansion added 231 native-document questions across all
eight Units, kept under `edition: legacy`, with 186 objective and 45 reference
responses. Existing 4,692 question IDs, prompts, options, answers and source
locations were unchanged. In total the extra bank has 2,953 objective and
1,970 reference responses. Full source conversion is still incomplete.

The new extraction matches student blocks to teacher blocks before parsing.
It retains packed questions, multi-line C/D options and original blank groups.
Reviewed corrections include past `Was`/present `aren't`, `Did ... visit`,
`wants to`, `there is a girl singing`, `visit the Great Wall`, the Easter
holiday translation, the environmental `pick it up; is good` option, present
`is ... not much oil`, and the energy/effort mistranslation. Regional spellings,
initial-letter suffix responses and applicable contracted/full forms are
accepted. Duplicate choices and unspecified tenses are reference-graded rather
than falsely treated as uniquely correct. Image-dependent questions are not
silently converted without their figures.

Data-only preflight and activation passed all 4,923 grading/provenance/privacy
checks and continuity against the previous 4,692 items. Backup:
`/www/study-plan-data/backups/before-english-six-bank-legacy-20261011`.
The compiled application was unchanged. HTTPS browser QA also passed for the
corrected legacy options, four-blank transformation, `did not` variant, hidden
pre-submit feedback and 320/390px layouts; screenshots and report remain under
`tmp/english-six-bank-online-qa/`. Tests did not write real student records.
Each further data release must use a fresh validated release-directory name.

## Unit 1 Dictation Repair: 2026-10-12

The `6AU1Cartoon time` and `6AU1Story time` PDFs use drawn rules for
initial-letter blanks. PDF text extraction lost those rules, retained positioning
spaces, and interleaved the two panel captions on the Cartoon time second page.
The repaired reader data has complete single-column sentences with explicit
blanks, restored word boundaries, all ten original illustrations in scene order,
and Unit 1 metadata. Source PDFs remain unchanged.

`english_six_bank_dictation.py` restores those two resources and provides 15
Cartoon time and 13 Story time sentence questions. Every filled sentence must
match the supplied course-translation resource `4142293e2e55`; prompts, missing
initials and answer-slot counts are also asserted. Full words and missing
suffixes are accepted, including `practised`/`practiced` and `don't`/`do not`.
Each question has a course sentence and a specific grammar explanation. The
reader now exposes its existing interactive-practice entry; feedback stays
hidden until submission, with one question at a time and objective accuracy.

Reimport sequence:

```text
python scripts/english_six_bank_dictation.py
python scripts/import-english-six-bank.py
```

The live additional bank has 4,951 questions in 575 papers, plus the original
528 Unit assessment questions (5,479 interactive items). All previous 4,923
questions and IDs remain unchanged. Full folder conversion is still incomplete.
Only these two reader resources were repaired in this release.

Data releases can include reviewed source patches using
`--resources=cd846e3d3d6f,370dbef9fd22` on `prepare`. Hash guards cover the live
bank, catalog and selected resources. Staging preserves unrelated catalog
entries, and activation backs up both the bank and patched reader files before
restarting. No compiled runtime or database changes were required. Backups:
`/www/study-plan-data/backups/before-english-six-bank-dictation-20261012` and
`/www/study-plan-data/backups/before-english-six-bank-dictation-art-20261012`.

All-question grading/privacy/provenance tests, the original 528-question/media
regression and TypeScript passed. HTTPS browser QA covers restored reader text,
separated dialogue, illustration ordering, the reader-to-practice link,
initial-letter/full-answer grading, required blank completion, submission-only
feedback, next question, accuracy and persisted first submissions at desktop,
390px and 320px sizes. QA intercepts submissions and does not write student data.

## Whole-Corpus Audit And Unit 2-4 Repair: 2026-10-12

`audit-english-six-content.py` scans all 1,391 resources and every active bank
question for missing answers/explanations, duplicate IDs, invalid option keys,
blank/answer-slot mismatches, suspicious word joins and PDF positioning spaces.
The JSON report is saved to `tmp/english-six-content-audit.json`. This is a
structural/text audit, not a claim that all source files have been converted or
that every reference response has a unique automatically graded answer.

Six more Cartoon/Story time dictation readers in Units 2-4 had the same lost
drawn-rule and interleaved-dialogue defects. Their original eleven PDF pages
were rendered and reviewed. `english_six_bank_dictation_more.py` contains the
reviewed sentences, per-blank keys, grammar explanations and original scene
order. Every completed sentence is checked against the English cells in the
U1-U8 core-text translation DOCX resource `bd6cc1bc4a5d`, including the lines
omitted from the PDF translation. Original source files are not modified.

Decorative numeric image markers are omitted from these native readers;
actual story illustrations are retained in scene order. Mixed initial-letter
and unprompted blanks remain separate required inputs. Only initial-letter
blanks accept suffix-only input; unprompted blanks require the full word.
Repeated identical dialogue has distinct source-block anchors. Important keys
include present `call`, plural possessive `grandparents'`, and the three separate
words in `take care of`.

The data-only release `english-six-bank-dictation-audit-20261012` adds 93
questions: U2 Cartoon/Story 14/13, U3 Cartoon/Story 14/18, U4 Cartoon/Story
15/19. The additional bank contains 5,044 questions in 581 papers (3,074 exact
and 1,970 reference responses), plus the original 528 assessments: 5,572 items.
All previous 4,951 question IDs, prompts, options, keys and source locations
were retained. Backup:
`/www/study-plan-data/backups/before-english-six-bank-dictation-audit-20261012`.

All-question grading/privacy/provenance tests, the original assessment/media
regression, TypeScript, staged validation and authenticated post-restart checks
passed. The post-repair content audit has zero structural errors and zero
suspect active questions. It still flags 130 reader resources as candidates for
manual inspection; these can include legitimate layout spaces and answer sheets,
so the number is not a count of confirmed defective questions. The broader
source-conversion status remains incomplete.

HTTPS browser regression also passed with zero JavaScript errors and zero real
student writes. It covers all six new readers at 390px/320px, first-question
submissions, incomplete-input blocking, mixed initial/unprompted blanks,
`cannot` acceptance, hidden pre-submit feedback, objective accuracy and existing
Unit 1/legacy/cloze/writing flows. Desktop and mobile screenshots were inspected
under `tmp/english-six-bank-online-qa/`; no horizontal overflow was found.

## English Layout: 2026-10-15

Release `english-layout-20261015` updates only the subject-home presentation,
Six hub, bank directory and shared Six stylesheet. The home retains every
existing destination under course, skills, vocabulary/expression, grammar and
review headings. The add-unit action stays available at the bottom rather than
floating over lessons. Scope, unit, learning stage, practice and source resources
have separate visual hierarchy. Bank papers are grouped by source and Unit in
expandable sections; options and primary learning content stay in one column.
Feedback is distinct from the prompt and preserves the submission-only reveal.

The production build uses the existing live checkout with six scoped UI files,
not unrelated local changes. Source and data hash guards, preserved compiled
backup, HTTP privacy/route checks and rollback protect the release. The catalog,
bank and private lookup hashes are unchanged. Backup:
`/www/study-plan-data/backups/before-english-layout-20261015`.

`test-english-layout-browser.mjs` checks retained homepage destinations, grouped
source expansion, full mobile width, no floating add button, single-column
options, collection separation and 1440/390/320px screenshots. Before/after
screenshots live in `tmp/english-layout-{local,online}-{before,after}/`. QA
intercepts student submissions; no real student progress is written. The full
bank/browser, original 528-question/media and first-submission regressions must
continue to pass after layout changes.

The scoped follow-up `english-layout-profile-20261015` makes the existing profile
bar absolute rather than fixed on mobile, only while the English home or Six
workspace is mounted. It scrolls away instead of masking prompts and resources;
the Six reader's own pagination stays sticky at the top. Other subjects retain
their existing profile behavior. CSS is scoped through the current profile
element's `fixed top-4 right-4` classes; the browser test verifies its computed
position and will catch a future shared-header class change. The follow-up
backup is `/www/study-plan-data/backups/before-english-layout-profile-20261015`.

### Scope Correction

The user's clarification limits this layout work to pages entered through 六上.
`english-layout-six-only-20261015` restores the subject page exactly to its saved
pre-redesign live source, including the original skill cards, vocabulary/grammar
entries and controls. The unused `english-subject-home` component and stylesheet
are removed locally and retired to the release backup on the server. No new home
grouping remains. Six hub, bank and stylesheet optimizations are retained.

Use `--home-only` for this scoped restoration. The release hashes and preserves
the Six UI, listening panel and reading/vocabulary/grammar/phrase pages, in
addition to all guarded content files. Browser QA now expects the original home
and its fixed profile bar, while Six keeps the organized workspace and mobile
scroll-away profile behavior. Screenshots/report:
`tmp/english-layout-online-six-only-after/`.

The restored online homepage screenshots at 1440px, 390px and 320px have the
same SHA-256 hashes as the pre-redesign online screenshots. The original home
has therefore been restored pixel-for-pixel in those viewports, not approximated
with a new layout. Production build, TypeScript, retained-file/content hash
guards and authenticated HTTP/privacy checks passed.

### Six Reader Knowledge-Point Layout

`english-layout-reader-colors-20261015` changes only the Six resource reader.
Each numbered knowledge point has its own blue, rose or teal heading, matching
rule-table accents, and a direct navigation control. Core rules, caution notes,
mnemonics and wrong/correct examples have distinct labels and treatments; color
is not the only distinguishing signal. Main content remains one vertical column.
Single-unit resources omit the redundant Unit selector from the sticky pager.

`build-english-six-reader-layouts.py` recovers 24 native tables and 24 headings
from the eight original 易错语法讲义 PDFs. It maps every recovered table to its
exact consecutive source-block signature and records the source JSON SHA-256.
The original resource JSON, question anchors, bank, keys and progress are not
rewritten. Runtime rendering restores a table only when its signature matches;
otherwise it keeps the original text. Desktop uses real table headers and rows;
phones display the same cells as labeled single-column entries. Non-lesson
readers retain their existing block renderer, including underlines and media.

`test-english-six-document.mjs` checks all 1,391 resources, 9,235 pages and
228,772 source blocks for complete, non-duplicated source coverage. The reader
browser test checks all 24 tables/topic jumps, three distinct topic colors,
1440/390/320px overflow, mobile table adaptation and retained dictation blanks.
Screenshots and reports are in `tmp/english-reader-{local,online}/`.

Deploy with `--reader-only`. The package contains the reader plus its planner,
document component, stylesheet and public table-layout metadata. Before building,
the helper requires all eight live raw-resource hashes to match the metadata.
Hash guards preserve the homepage, other English modules, Six hub/bank/shared
CSS, content indexes and private lookup. No database migration or student write
is involved. The compiled/source backup is
`/www/study-plan-data/backups/before-english-layout-reader-colors-20261015`.

Deployment status: local TypeScript, ESLint, planner/source-coverage and all
reader/layout/bank browser regressions passed. Remote source/data hash guards
and backup completed, but the production build timed out after 300 seconds
during webpack compilation. HTTP and SSH subsequently timed out, including
SSH banner exchange. No activation command ran and the compiled live build
was not swapped. This release is **not confirmed deployed**. Before retrying,
inspect the server and any remaining build processes, verify its live service,
and reconcile prepared source/build state with the saved backup. Do not repeat
prepare with this existing release name or assume the server rolled back.

### Build Recovery

SSH access recovered at 13:30 CST. The kernel journal records a global OOM at
13:13:43 that killed the Node compiler (about 1.6 GiB resident memory). The
server has 1,967 MiB RAM and 1,987 MiB swap. The old compiled site and service
remained in place, the failed prepare restored all five source files, and all
guarded data/source hashes match. TAT Agent is running; the earlier screenshot's
suggested missing-agent diagnosis was not the cause established by these logs.

The retry `english-layout-reader-safe-20261015` uses `--reader-only --low-memory`.
It additionally backs up the live-matching Next config and enables memory-saving
Webpack options only with `STUDY_PLAN_LOW_MEMORY_BUILD=1`. The build runs as
`ubuntu` in a separate transient systemd unit: CPU quota 100%, nice 10,
MemoryHigh 1,280 MiB, MemoryMax 1,280 MiB, MemorySwapMax 1,024 MiB, 900-second
deadline, and a 768 MiB launcher heap setting. Next's isolated compiler workers
reset the inherited V8 heap setting, so the cgroup is the enforced boundary,
not `NODE_OPTIONS`. A failed compiler is contained
inside this unit; the prepare error trap restores source/config without swapping
the running site. Type checking stays enabled. Deployment streams build output
and uses bounded SSH keepalive/upload timeouts instead of a silent 300-second
wait. A short probe confirmed that these cgroup limits can be applied.

The first isolated retry exceeded its limit and rolled back cleanly while the
site continued returning HTTP 200. The successful retry is
`english-layout-reader-final-20261015`, prepared with `--reader-only
--low-memory --temporary-swap`. A root-owned mode-600 2 GiB swap file was created
inside this release's directory on the already provisioned data disk. The
transient build unit's swap limit was raised to 3 GiB using the combined existing
and temporary swap; its physical memory hard limit remained 1,280 MiB. This does
not add a disk, alter fstab, resize the instance or change source content.

Compilation, enabled TypeScript checking, static generation and tracing all
passed. The full constrained build took 5m56s, with reported peak resident
memory 1.2 GiB and peak swap 1.8 GiB. The temporary swap was then disabled and
removed; `swapon --show` confirms only the original `/swap.img` remains.

The final release was activated successfully. Authenticated HTTP checks confirm
5,044 questions in 581 papers, private answers hidden before submission,
working reader/routes and unchanged guarded content/module hashes. Backups:
`/www/study-plan-data/backups/before-english-layout-reader-final-20261015` and
the former compiled build `/www/study-plan/.next-before-english-layout-reader-final-20261015`.
The two earlier failed attempts were never activated.

Post-activation HTTPS browser QA passed with zero JavaScript errors and zero
real student writes: all 24 topic jumps and restored tables; three topic colors;
desktop/390/320px overflow and mobile table checks; original homepage/navigation;
collection separation; submission-only feedback, drafts, first-response locking,
accuracy, next-question, cloze, writing and repaired dictation/media regressions.
The original homepage PNG SHA-256 hashes are identical at all three widths.
Production screenshots in `tmp/english-reader-online/` were visually inspected.
After QA, the instance reports about 605 MiB RAM used and 1,362 MiB available,
with only its original swap active. No TAT, SSH key, firewall, database or
authentication settings were changed during recovery.

### Direct Interactive Exercise Entry: 2026-10-15

`english-layout-interactive-20261015` is live. Exercise-resource URLs with a
verified practice plan now open their questions directly, rather than showing
a static source page above a separate practice link. The eight 118-question
course worksheets preserve all 944 questions in their original section order.
Equivalent PDF/Word routes share the same canonical question IDs only when
their edition, normalized title and meaningful source stems agree. Knowledge
lectures remain readers; `mode=source` explicitly opens original material.

The public index identifies 75 resources with practice plans. Coverage remains
5,044 bank questions plus 528 original Unit assessments, not a new conversion
of the whole folder. Unsupported exercise documents are explicitly labeled raw
source material. The bank's `complete: false`, all question data/private keys,
source blocks and existing student records are unchanged.

Both practice components use shared answer controls: clickable letter options,
inline inputs for individual blanks, separate required fields when necessary,
and larger fields for sentence/writing responses. Every required blank must be
filled before submit. Answers and explanations are shown after submission;
the original response and controls stay locked on previous/next, refresh and
equivalent source/section routes. Open responses reveal their model without
pretending that arbitrary wording can be objectively graded. The existing
immutable cloud first-submission implementation is preserved by hash guards.

Local all-question tests cover 5,044 bank questions, 528 assessments, 672
multi-input bank questions and all eight course-resource plans. TypeScript and
scoped ESLint passed. The first-submission in-memory integration harness passed
2,508 checks across 13 English modules. Local and HTTPS browser QA passed seven
direct-entry/control checks and eleven broader bank/media regressions, with no
JavaScript errors or real student writes. Production screenshots at desktop,
390px and 320px were checked; reports are in
`tmp/english-six-interactive-online/` and `tmp/english-six-bank-qa/`.

Deploy with `--practice-only --low-memory --temporary-swap`. The constrained
separate build passed compilation, enabled type checking, tracing and an
isolated production preflight before activation. All guarded original-home,
reading/listening/vocabulary/grammar/phrase and document-layout hashes match.
Source backup: `/www/study-plan-data/backups/before-english-layout-interactive-20261015`.
Former compiled build: `/www/study-plan/.next-before-english-layout-interactive-20261015`.
Post-activation checks confirm active service, about 607 MiB RAM used and
1,359 MiB available. Temporary swap was removed; only the original `/swap.img`
remains. No authentication, database, SSH or firewall change was required.

### Correctness Review: Local, Not Activated

The 2026-10-15 review scans all 5,572 existing interactive questions and revises
214 in 92 files. This includes 18 answer/model changes, 29 restored underline
targets, 25 newly reference-only ambiguous questions, two restored unique-option
questions, and shared passage/dialogue/word-list/condition corrections. IDs and
counts are unchanged. The private manifest records before/after fields and
historical-feedback policy; details and limitations are in `ENGLISH-SIX-QUALITY.md`.

Local bank/assessment/control tests, TypeScript and scoped ESLint passed.
The quality suite checks every question plus all 214 corrections and read-only
historic feedback projection. The in-memory first-response suite passed 2,520
checks across 13 modules. Regenerating all 5,044 bank questions into a temporary
directory produces exactly the reviewed data. Local browser QA passed nine
interactive/quality checks and eleven broader bank/media checks, with zero page
errors and no real student writes. Screenshots include desktop, 390px and 320px.

The planned quality release is **not live**. Of four isolated prepare attempts,
three hit their memory/swap cgroup limits and one extra-swap serial attempt was
explicitly stopped without activation.
All prepare failures restored source/config. Corrected data was staged separately
and was never installed. The final attempted release was
`english-layout-quality-scoped-20261015`; its source/data backup is under
`/www/study-plan-data/backups/before-english-layout-quality-scoped-20261015`.

After the final attempt, guarded source/data hashes match the previous release,
the service and database/storage health checks pass, and live BUILD_ID remains
`Avn2Yc1NFMvonTaiRMoGH`. The new helper and private revision manifest are absent
from the live app. Temporary swap was removed; only `/swap.img` remains. No
student record, database schema, authentication setting or paid resource plan
was changed. A successful build and online QA are still required before these
corrections can be described as deployed.
