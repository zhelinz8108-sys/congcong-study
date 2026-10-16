#!/usr/bin/env bash
set -euo pipefail

app=/www/study-plan
disk=/www/study-plan-data
deploy=$disk/english-six-deploy
backup=$disk/backups/before-english-six-20261011
build=.next-english-six-release
mode=${1:?Use prepare, build, or activate}
test "$(findmnt -no UUID "$disk")" = afce062a-8570-4341-9fe0-3abac42d210a
cd "$app"

if [ "$mode" = prepare ]; then
  sha256sum -c "$deploy/expected-server.sha256"
  test ! -e "$backup"
  test ! -e "content/english-six"
  test ! -e "$build"
  install -d -m 700 "$backup"
  cp -a src next.config.ts package.json package-lock.json tsconfig.json next-env.d.ts .next "$backup/"
  if [ -r /etc/study-plan.env ]; then
    set -a
    . /etc/study-plan.env
    set +a
  fi
  node scripts/backup-postgres.mjs --output "$backup/study-plan.dump"
  chmod -R go-rwx "$backup"
  tar -xzf "$deploy/code.tar.gz"
  sha256sum -c english-six-release.sha256
  ln -s "$disk/english-six" content/english-six
  NODE_OPTIONS=--max-old-space-size=1536 STUDY_PLAN_BUILD_DIR="$build" node node_modules/next/dist/bin/next build --webpack
  printf 'PREPARE_COMPLETE\n'
elif [ "$mode" = build ]; then
  test -s "$backup/study-plan.dump"
  test "$(readlink content/english-six)" = "$disk/english-six"
  sha256sum -c english-six-release.sha256
  NODE_OPTIONS=--max-old-space-size=1536 STUDY_PLAN_BUILD_DIR="$build" node node_modules/next/dist/bin/next build --webpack
  printf 'PREPARE_COMPLETE\n'
elif [ "$mode" = activate ]; then
  test -f "$build/BUILD_ID"
  test "$(readlink content/english-six)" = "$disk/english-six"
  sha256sum -c english-six-release.sha256
  cd "$disk/english-six"
  sha256sum -c metadata.sha256 >/dev/null
  python3 - <<'PY'
import hashlib,json,pathlib
p=pathlib.Path('.')
report=json.loads((p/'verified.private.json').read_text())
manifest=(p/'assets.private.json').read_bytes()
assert not report['errors']
assert report['manifestSha256']==hashlib.sha256(manifest).hexdigest()
assert report['assets']==len(json.loads(manifest))
PY
  cd "$app"
  test ! -e .next-before-english-six
  cmp "$backup/.next/BUILD_ID" .next/BUILD_ID
  sudo systemctl stop study-plan
  mv .next .next-before-english-six
  mv "$build" .next
  sudo systemctl start study-plan || true
  ready=0
  for attempt in 1 2 3 4 5 6; do
    if curl --fail --silent http://127.0.0.1:3001/api/health >/dev/null; then
      ready=1
      break
    fi
    sleep 3
  done
  if [ "$ready" != 1 ]; then
    sudo systemctl stop study-plan
    mv .next .next-failed-english-six
    mv .next-before-english-six .next
    cp -a "$backup/next.config.ts" "$backup/package.json" "$backup/tsconfig.json" "$backup/next-env.d.ts" .
    cp -a "$backup/src/app/subjects/[id]/page.tsx" 'src/app/subjects/[id]/page.tsx'
    sudo systemctl start study-plan
    printf 'Activation failed; previous compiled site restored.\n' >&2
    exit 1
  fi
  sudo systemctl is-active study-plan
  curl --fail --silent --show-error http://127.0.0.1:3001/api/health
  printf '\nACTIVATE_COMPLETE\n'
else
  printf 'Unknown mode\n' >&2
  exit 1
fi
