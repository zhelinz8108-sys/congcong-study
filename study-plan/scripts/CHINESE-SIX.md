# Six-upper Chinese materials

The homepage entry is `/subjects/[id]/chinese/six`. The importer reads the four
PDFs in `../六上/语文` without modifying them.

## Import

Run `python scripts/import-chinese-six.py` with `pdfplumber`, `pypdfium2`, and
Pillow available. Use `--skip-images` to rebuild metadata and text without
rendering the pages again.

- `src/data/chinese-six-index.json`: public titles, groups, pages and counts.
- `content/chinese-six/bank.private.json`: server-side content and references.
- `content/chinese-six/import-report.private.json`: import counts and warnings.
- `content/chinese-six/pages/`: 276 original-page WebP images, served only
  through the authenticated source route.

The private bank and images are intentionally git-ignored. Run
`npm run chinese:seal:six` using the existing `HOLIDAY_MATH_700_KEY` to produce
AES-256-GCM encrypted assets under `content/chinese-six/sealed/`. Commit only
those encrypted assets, never the plaintext bank or source images. Production
reads the encrypted version only, with a distinct salt and namespace from the
math bank. No key is generated or printed. `--check` compares all decrypted
bytes to local originals; `npm run test:chinese-six:sealed` verifies the
deployment assets without requiring plaintext sources. Both reject tampering.
The deployment workflow verifies the assets and answer transitions before
building and restarting. Do not place any of these assets in `public/`.

## Source caveats

- The source materials have different unit names. Writing themes are grouped
  independently; the school textbook is the authority for class progress.
- The 80 writing models are image-only. Their pages, manually checked titles,
  theme-specific reading guidance and practice tasks are provided, not OCR text.
- The source's pronunciation for `云裳` was corrected to `cháng` in extracted
  lesson notes. Original page images remain unchanged.
- The Cao Chong sorting exercise lacked a transition explaining the proposed
  method. The web exercise is explicitly marked as adapted: proposing the
  method precedes approval and execution. Its order is `②③⑤①④` (positions in
  printed order: `4,1,2,5,3`); the source image remains unchanged.
- The last reading passage repeats a printed question number. Internal IDs
  follow the question order and the reference-answer numbering.
- Automated checks establish mapping and structure, not a complete independent
  editorial review of every supplied reference answer.

## Progress and verification

Progress uses the existing student profile, family access and cloud-state table.
Every answer and self-rating is an immutable server-side transition. A new
practice creates a new attempt without rewriting older attempts. PostgreSQL
serializes transitions with a transaction lock. Local fallback is restricted to
development or an explicitly configured local host.

Run `npm run test:chinese-six`. Browser QA uses a disposable Chrome context,
mocked student storage, and the real transitions. Start the app on port 3006,
then run `npm run test:chinese-six:browser` with Playwright installed or pass
`-- --playwright=<absolute path to playwright/index.mjs>`. Screenshots and the
report are written under `tmp/chinese-six-qa`. Browser tests never write real
student progress.
