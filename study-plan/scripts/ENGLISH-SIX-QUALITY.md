# Six English Correctness Review: 2026-10-15

## Scope And Limits

This review covers all **5,572 existing interactive questions**: 5,044 bank
questions in 581 papers, plus 528 original Unit assessments. It does not mean
that every scanned resource in the folder has been converted, or that every
open-ended response can be objectively scored. The bank retains `complete:false`.

Every question received structural and selected language-pattern checks. Manual
review inspected the eight Units' standalone choices, shared reading/cloze/dialogue
contexts and answer sequences, sentence transformations, reorderings and glossary
mappings. This is an editorial review with regression tests, not a guarantee that
an automated grammar scan proves every possible interpretation correct.

## Corrections

The private, coordinate-stable change manifest is
`content/english-six/quality-review.private.json`, revision `20261015-quality-1`.
It contains before/after fields and reasons for **214 revised questions in 92
files**. Shared passage changes affect several questions and are counted per
question, not as separate unrelated errors.

- 18 questions have changed answer/model text, including incorrect keys,
  a mismatched Chinese translation and truncated years.
- 29 missing targets in underlined-question transformations are now marked.
- 25 formerly exact questions are now reference-only because more than one
  reasonable answer exists; two duplicate-option questions regain unique grading.
- Other changes repair missing words, duplicate articles, word-list/model
  mismatches, tense and speaker consistency, and insufficient reading conditions.
- British floor numbering, lunar leap months and year-specific Earth Hour dates
  have explicit conditions rather than misleading generalizations.

All question IDs, source coordinates and counts are preserved. Raw source
documents remain unmodified; corrections apply to interactive questions and
their feedback. A future importer reapplies the manifest and refuses unexpected
source drift instead of silently dropping corrections.

The current grading distribution is 3,371 automatically graded questions and
2,201 reference-only questions. Most reference-only questions predate this review
and are full-sentence, translation or writing tasks. They are not all defective
questions and are not included in automatic accuracy.

## Existing Student Records

First responses and timestamps remain immutable. A private revision is attached
only to submitted feedback. Reading older corrected records projects current
answers and explanations without writing the database. Fifteen key/explanation
corrections can re-evaluate the original response. The other 199 revisions affect
wording, conditions or options, so older responses receive reference feedback
with `correct:null` rather than an unfair mark. New submissions use current
content. Repeated submissions never replace the first response.

## Checks

- All-question data, accepted-variant and rendered-run invariants.
- Private answers, accepted variants and editorial manifest absent from public
  question responses before submission.
- Filled-back cloze article checks and reordered-word multiset checks.
- Historical-feedback projection, changed blank shapes and immutable records.
- In-memory first-submission integration: 2,520 checks across 13 English modules.
- Regeneration into a temporary directory: all 5,044 bank questions exactly
  match the reviewed bank after the import hook reapplies corrections.
- Existing bank, original assessments, practice-plan and interactive-control
  tests; TypeScript and scoped ESLint.
- Browser checks at desktop, 390px and 320px. The quality extension explicitly
  tests corrected articles/cloze keys, British floors, restored underlines and
  valid alternatives. All student writes are intercepted by the test harness.

Commands:

```text
node scripts/review-english-six-quality.mjs --apply
node scripts/audit-english-six-quality.mjs
node scripts/test-english-six-quality.mjs
node scripts/test-english-six-bank.mjs
node scripts/test-english-six.mjs
node scripts/test-english-six-interactive.mjs
node scripts/test-english-answer-lock.mjs
```

Keep `tmp/english-six-quality/baseline` while editing this review. It holds the
original local before-images; it must not be rebuilt from corrected data.

## Reference Checks

Primary references used to resolve specific disputed rules and facts:

- [Cambridge: Exclamations](https://dictionary.cambridge.org/grammar/british-grammar/exclamations)
- [Cambridge: First Floor](https://dictionary.cambridge.org/dictionary/english/first-floor)
- [Cambridge: Chat](https://dictionary.cambridge.org/us/dictionary/english/chat)
- [Earth Hour: Official FAQ And Dates](https://www.earthhour.org/faqs)
- [Hong Kong Observatory: Calendar Years](https://www.hko.gov.hk/sc/education/astronomy-and-time/time-service/00506-what-year-is-it-today.html)

## Release Status: Not Activated

Use `--quality-only --low-memory --temporary-swap` with a fresh
`english-layout-...` release name. The helper backs up the existing source and
92 affected data files, checks their original hashes, and stages the private
manifest separately. Corrected data is installed only during activation with
the matching build; rollback restores both code and data. Home, other English
modules, question lookup and source indexes have retained-file hash guards.

Two initial builds were OOM-killed inside their cgroups. A third serial attempt
with extra temporary swap was explicitly stopped without activation. Source
rollback, old build ID, old data hashes, active service and HTTP health were
verified; temporary swap was removed. Review found a new broad dynamic read
under the content root that could cause file-tracing fanout. The fallback now
uses existing bounded practice/bank readers instead. The scoped retry restored
the previously successful worker configuration with 1,280 MiB physical memory
and 3 GiB swap boundaries, but also hit its cgroup limit. The broad path was
removed as a precaution; it has not been established as the cause of the OOM.
No further publication was attempted. No paid instance plan or disk was changed.

The revisions are **local and tested, not live**. Final checks confirm the old
build `Avn2Yc1NFMvonTaiRMoGH`, active service, healthy database/storage endpoint,
unchanged guarded source/data hashes, and absence of the new helper/manifest on
the live app. Only the original `/swap.img` remains active. The last backup is
`/www/study-plan-data/backups/before-english-layout-quality-scoped-20261015`.
Publishing this patch requires a successful build in a suitably provisioned
Linux build environment, followed by activation and authenticated online QA.
