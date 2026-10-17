# Cloud operation and deployment verification

Work only in the selected cloud checkout. The local D drive is outside this
workflow. Verify `origin` is `https://github.com/zhelinz8108-sys/congcong-study.git`
and record the current remote `main` SHA before creating a review branch.
Push changes to that branch and open a PR against `main`. The owner reviews and
merges; do not deploy the review branch or dispatch a deployment manually.

After merge, the existing main workflow uploads a fresh isolated release tree.
`release-production.sh` builds it, then writes `release-metadata.json` in that
tree using the workflow's validated full commit SHA and the new `.next/BUILD_ID`.
Only `commit` and `buildId` are stored. This generated file is not tracked or
copied from the previous app, and moves with the application during activation
and rollback. Do not create it from the build machine's Git state or env values.

`GET /api/version` is public, read-only and sends `Cache-Control: no-store`:

```json
{"commit":"0123456789012345678901234567890123456789","buildId":"example-build-id"}
```

Each missing or invalid field is `"unknown"`; an absent, unreadable or malformed
file yields both fields as `"unknown"`. Unstamped development builds therefore
cannot be mistaken for verified releases. The endpoint reads only this metadata
file and exposes no database state, environment, paths or diagnostics.

The release verifies the exact two-field response against its metadata and
BUILD_ID on localhost:3002 before activation and localhost:3001 afterward.
Existing database/storage health checks, resource checks, limits, backup and
rollback remain in place. For external verification after the owner merges, run
`curl --fail --silent --show-error https://congcong-study.cn/api/version` and
compare both fields with the successful main workflow's commit and build ID.
Version identity alone does not establish database or storage health.

Cloud checks: `npx next typegen`, `npx tsc --noEmit`, `npm run test:version`,
`npm run test:version:http`, and the focused isolated regressions:

```sh
node --test scripts/test-national-day-math-content.mjs scripts/test-national-day-math-submission.mjs scripts/test-national-day-math-answer.mjs scripts/test-national-day-math-colors.mjs scripts/test-first-submission.mjs scripts/test-english-final-review-vocab-lock.mjs scripts/test-grade6-bank-native-renderer.mjs
```

The first six do not need production keys. The final native-renderer script
needs the 92 private `native-*.mjs` author files, which are unavailable until the
separate encrypted handoff. Do not substitute partial or synthetic authored rows.
Never import production keys,
configuration or student databases to run these checks. Report fixture-dependent
tests as blocked when their real fixtures are missing. In particular, grade6
coverage is not a pass without the private native-author files and all 2394
authored rows. No private fixture retrieval or publication is part of this PR;
an encrypted cloud-only handoff and backup/recovery operations are follow-up work.
