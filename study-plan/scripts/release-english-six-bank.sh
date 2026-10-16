#!/usr/bin/env bash
set -euo pipefail
app=/www/study-plan
disk=/www/study-plan-data
deploy=$disk/english-six-bank-20261011
backup=$disk/backups/before-english-six-bank-20261011
build=.next-english-six-bank-20261011
previous=.next-before-english-six-bank-20261011
mode=${1:?Use prepare, preflight or activate}
files=(src/components/english-six-hub.tsx src/components/english-six-reader.tsx src/components/english-six.module.css 'src/app/api/english/six/resource/[resource]/route.ts' src/server/english-locked.ts)

test "$(readlink "$app/content/english-six")" = "$disk/english-six"
cd "$app"
restore_sources() {
  for file in "${files[@]}" tsconfig.json next-env.d.ts; do cp -a "$backup/$file" "$file"; done
  while IFS= read -r file; do
    case "$file" in src/*) ;; *) return 1 ;; esac
    case "$file" in *..*) return 1 ;; esac
    rm -f -- "$app/$file"
  done < "$deploy/added-files.txt"
}
restore_bank() {
  if [ -d "$disk/english-six/bank" ]; then mv "$disk/english-six/bank" "$deploy/failed-bank"; fi
}
load_env() {
  if [ -r /etc/study-plan.env ]; then set -a; . /etc/study-plan.env; set +a; fi
}
if [ "$mode" = prepare ]; then
  test ! -e "$backup"
  test ! -e "$build"
  test ! -e "$previous"
  test ! -e "$disk/english-six/bank"
  while IFS= read -r file; do test ! -e "$file"; done < "$deploy/added-files.txt"
  sha256sum -c "$deploy/before.sha256"
  install -d -m 700 "$backup" "$deploy/bank"
  cp --parents -a "${files[@]}" tsconfig.json next-env.d.ts "$backup/"
  cp .next/BUILD_ID "$backup/old-build-id"
  tar -xzf "$deploy/bank.tar.gz" -C "$deploy/bank"
  (cd "$deploy/bank" && sha256sum -c "$deploy/bank.sha256" >/dev/null)
  mv "$deploy/bank" "$disk/english-six/bank"
  trap 'restore_sources; restore_bank' ERR
  tar -xzf "$deploy/code.tar.gz"
  sha256sum -c "$deploy/after.sha256"
  load_env
  NODE_OPTIONS=--max-old-space-size=1536 STUDY_PLAN_BUILD_DIR="$build" node node_modules/next/dist/bin/next build --webpack
  cp -a "$backup/tsconfig.json" "$backup/next-env.d.ts" .
  trap - ERR
  printf 'BANK_BUILD_COMPLETE\n'
elif [ "$mode" = preflight ]; then
  test -f "$build/BUILD_ID"
  sha256sum -c "$deploy/after.sha256"
  ! curl --silent --max-time 1 http://127.0.0.1:3002/api/health >/dev/null
  load_env
  STUDY_PLAN_BUILD_DIR="$build" node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3002 >"$deploy/preflight.log" 2>&1 &
  pid=$!
  trap 'kill "$pid" 2>/dev/null || true' EXIT
  ready=0
  for attempt in 1 2 3 4 5 6; do
    if curl --fail --silent http://127.0.0.1:3002/api/health >/dev/null; then ready=1; break; fi
    sleep 3
  done
  test "$ready" = 1
  node --env-file=.env.local "$deploy/check-english-six-release.mjs" 3002
  node --env-file=.env.local "$deploy/check-english-six-bank-release.mjs" 3002
  kill "$pid"
  wait "$pid" || true
  trap - EXIT
  printf 'BANK_PREFLIGHT_PASSED\n'
elif [ "$mode" = activate ]; then
  test -f "$build/BUILD_ID"
  test ! -e "$previous"
  sha256sum -c "$deploy/after.sha256"
  cmp "$backup/old-build-id" .next/BUILD_ID
  rollback() {
    sudo systemctl stop study-plan || true
    if [ -d .next ]; then mv .next .next-failed-english-six-bank-20261011; fi
    mv "$previous" .next
    restore_sources
    restore_bank
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
  load_env
  node --env-file=.env.local "$deploy/check-english-six-release.mjs" 3001
  node --env-file=.env.local "$deploy/check-english-six-bank-release.mjs" 3001
  trap - ERR
  sudo systemctl is-active study-plan
  printf 'BANK_ACTIVATED\n'
else
  printf 'Unknown mode\n' >&2
  exit 1
fi
