#!/usr/bin/env bash
set -euo pipefail
app=/www/study-plan
disk=/www/study-plan-data
deploy=$disk/english-six-organization-20261011
backup=$disk/backups/before-english-six-organization-20261011
build=.next-english-six-organization-20261011
previous=.next-before-english-six-organization-20261011
mode=${1:?Use prepare or activate}
files=(src/components/english-six-hub.tsx src/components/english-six-reader.tsx src/components/english-six.module.css src/lib/english-six.ts)
test "$(readlink "$app/content/english-six")" = "$disk/english-six"
cd "$app"
restore_sources() {
  for file in "${files[@]}" tsconfig.json next-env.d.ts; do cp -a "$backup/$file" "$file"; done
}
if [ "$mode" = prepare ]; then
  test ! -e "$backup"
  test ! -e "$build"
  test ! -e "$previous"
  sha256sum -c "$deploy/before.sha256"
  install -d -m 700 "$backup"
  cp --parents -a "${files[@]}" tsconfig.json next-env.d.ts "$backup/"
  cp .next/BUILD_ID "$backup/old-build-id"
  trap 'restore_sources' ERR
  tar -xzf "$deploy/code.tar.gz"
  sha256sum -c "$deploy/after.sha256"
  if [ -r /etc/study-plan.env ]; then set -a; . /etc/study-plan.env; set +a; fi
  NODE_OPTIONS=--max-old-space-size=1536 STUDY_PLAN_BUILD_DIR="$build" node node_modules/next/dist/bin/next build --webpack
  cp -a "$backup/tsconfig.json" "$backup/next-env.d.ts" .
  trap - ERR
  printf 'ORGANIZATION_BUILD_COMPLETE\n'
elif [ "$mode" = activate ]; then
  test -f "$build/BUILD_ID"
  test ! -e "$previous"
  sha256sum -c "$deploy/after.sha256"
  cmp "$backup/old-build-id" .next/BUILD_ID
  rollback() {
    sudo systemctl stop study-plan || true
    if [ -d .next ]; then mv .next .next-failed-english-six-organization-20261011; fi
    mv "$previous" .next
    restore_sources
    sudo systemctl start study-plan
    printf 'Previous compiled site restored.\n' >&2
  }
  sudo systemctl stop study-plan
  mv .next "$previous"
  mv "$build" .next
  trap rollback ERR
  sudo systemctl start study-plan
  ready=0
  for attempt in 1 2 3 4 5 6; do
    if curl --fail --silent http://127.0.0.1:3001/api/health >/dev/null; then ready=1; break; fi
    sleep 3
  done
  test "$ready" = 1
  if [ -r /etc/study-plan.env ]; then set -a; . /etc/study-plan.env; set +a; fi
  node --env-file=.env.local "$deploy/check-english-six-release.mjs" 3001
  trap - ERR
  sudo systemctl is-active study-plan
  printf 'ORGANIZATION_ACTIVATED\n'
else
  printf 'Unknown mode\n' >&2
  exit 1
fi
