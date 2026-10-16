#!/usr/bin/env bash
set -euo pipefail
mode=${1:?Use prepare or activate}
name=${2:?Use a fresh release name}
[[ "$name" =~ ^english-layout-[a-z0-9-]{1,48}$ ]]
app=/www/study-plan
disk=/www/study-plan-data
deploy=$disk/$name
backup=$disk/backups/before-$name
build=.next-$name
previous=.next-before-$name
existing=('src/app/subjects/[id]/page.tsx' src/components/english-six-hub.tsx src/components/english-six-bank.tsx src/components/english-six.module.css)
added=(src/components/english-subject-home.tsx src/components/english-subject-home.module.css)
retired=()
scope=$(cat "$deploy/update-mode")
low_memory=$(cat "$deploy/low-memory-build" 2>/dev/null || printf 0)
temporary_swap=$(cat "$deploy/temporary-swap" 2>/dev/null || printf 0)
swap_file=$deploy/build.swap
swap_owned=0
swap_active=0
cleanup_swap() {
  if [ "$swap_active" = 1 ]; then
    sudo swapoff "$swap_file" || { printf 'Temporary swap retained: %s\n' "$swap_file" >&2; return 1; }
  fi
  if [ "$swap_owned" = 1 ]; then sudo rm -- "$swap_file"; fi
}
trap cleanup_swap EXIT
quality_existing=()
quality_added=()
if [ "$scope" = quality ]; then
  existing=(src/lib/english-six.ts src/lib/english-locked-types.ts src/server/english-six.ts src/server/english-locked.ts src/components/english-six-answer-fields.tsx)
  added=(src/server/english-six-quality.ts)
  mapfile -t quality_existing < "$deploy/quality-existing"
  mapfile -t quality_added < "$deploy/quality-added"
  for file in "${quality_existing[@]}"; do [[ "$file" =~ ^content/english-six/(practice/[1-8]|bank/papers/[a-f0-9]{12}-[a-f0-9]{8})\.json$ ]]; done
  test "${quality_added[*]}" = content/english-six/quality-review.private.json
elif [ "$scope" = practice ]; then
  existing=(src/lib/english-six.ts src/lib/english-six-bank.ts src/server/english-six.ts src/server/english-six-bank.ts
    src/components/english-six-hub.tsx src/components/english-six-reader.tsx src/components/english-six-bank-practice.tsx src/components/english-six-practice.tsx src/components/english-six.module.css
    src/app/api/english/six/index/route.ts 'src/app/api/english/six/resource/[resource]/route.ts')
  added=(src/lib/english-six-answer.ts src/components/english-six-answer-fields.tsx src/server/english-six-practice.ts 'src/app/api/english/six/resource/[resource]/practice/route.ts')
elif [ "$scope" = reader ]; then
  existing=(src/components/english-six-reader.tsx)
  added=(src/lib/english-six-document.ts src/components/english-six-document.tsx src/components/english-six-document.module.css src/data/english-six-reader-layouts.public.json)
elif [ "$scope" = home ]; then
  existing=('src/app/subjects/[id]/page.tsx')
  retired=("${added[@]}")
  added=()
elif [ "$scope" = update ]; then
  existing+=("${added[@]}")
  added=()
fi
if [ "$low_memory" = 1 ]; then existing+=(next.config.ts); fi
cd "$app"
restore_sources() {
  for file in "${existing[@]}" "${retired[@]}" tsconfig.json next-env.d.ts; do cp -a "$backup/$file" "$file"; done
  for file in "${added[@]}"; do if [ -f "$file" ]; then mv "$file" "$deploy/$(basename "$file").not-active"; fi; done
}
restore_quality() {
  for file in "${quality_existing[@]}"; do cp -a "$backup/$file" "$file"; done
  for file in "${quality_added[@]}"; do if [ -f "$file" ]; then mv "$file" "$deploy/quality-not-active.json"; fi; done
}
if [ "$mode" = prepare ]; then
  test ! -e "$backup" && test ! -e "$build" && test ! -e "$previous"
  for file in "${added[@]}"; do test ! -e "$file"; done
  sha256sum -c "$deploy/before.sha256"
  sha256sum -c "$deploy/data.sha256"
  if [ "$scope" = quality ]; then
    sha256sum -c "$deploy/quality-before.sha256"
    for file in "${quality_added[@]}"; do test ! -e "$file"; done
  fi
  install -d -m 700 "$backup"
  cp --parents -a "${existing[@]}" "${retired[@]}" tsconfig.json next-env.d.ts "$backup/"
  if [ "$scope" = quality ]; then cp --parents -a "${quality_existing[@]}" "$backup/"; fi
  cp .next/BUILD_ID "$backup/old-build-id"
  trap restore_sources ERR
  tar -xzf "$deploy/code.tar.gz"
  if [ "${#retired[@]}" -gt 0 ]; then
    install -d "$deploy/retired"
    for file in "${retired[@]}"; do mv "$file" "$deploy/retired/$(basename "$file")"; done
  fi
  sha256sum -c "$deploy/after.sha256"
  if [ -r /etc/study-plan.env ]; then set -a; . /etc/study-plan.env; set +a; fi
  if [ "$low_memory" = 1 ]; then
    swap_limit=1024M
    if [ "$temporary_swap" = 1 ]; then
      test ! -e "$swap_file"
      sudo install -m 600 /dev/null "$swap_file"
      swap_owned=1
      sudo fallocate -l 2G "$swap_file"
      sudo mkswap "$swap_file" >/dev/null
      sudo swapon --priority 10 "$swap_file"
      swap_active=1
      swap_limit=3072M
    fi
    sudo systemd-run --wait --pipe --collect --unit="$name-build" --uid=ubuntu --gid=ubuntu \
      --working-directory="$app" --property=Nice=10 --property=CPUQuota=100% \
      --property=MemoryHigh=1280M --property=MemoryMax=1280M --property=MemorySwapMax="$swap_limit" \
      --property=OOMPolicy=kill --property=RuntimeMaxSec=900 \
      /usr/bin/bash "$deploy/build-english-layout.sh" "$name"
  else
    NODE_OPTIONS=--max-old-space-size=1536 STUDY_PLAN_BUILD_DIR="$build" node node_modules/next/dist/bin/next build --webpack
  fi
  cp -a "$backup/tsconfig.json" "$backup/next-env.d.ts" .
  sha256sum -c "$deploy/data.sha256"
  trap - ERR
  printf 'ENGLISH_LAYOUT_BUILD_COMPLETE\n'
elif [ "$mode" = activate ]; then
  test -f "$build/BUILD_ID" && test ! -e "$previous"
  sha256sum -c "$deploy/after.sha256"
  sha256sum -c "$deploy/data.sha256"
  for file in "${retired[@]}"; do test ! -e "$file"; done
  cmp "$backup/old-build-id" .next/BUILD_ID
  if [ "$scope" = quality ]; then sha256sum -c "$deploy/quality-before.sha256"; fi
  rollback() {
    sudo systemctl stop study-plan || true
    if [ -d .next ]; then mv .next ".next-failed-$name"; fi
    mv "$previous" .next
    restore_sources
    if [ "$scope" = quality ]; then restore_quality; fi
    sudo systemctl start study-plan
    printf 'Previous site restored.\n' >&2
  }
  trap rollback ERR
  sudo systemctl stop study-plan
  mv .next "$previous"
  if [ "$scope" = quality ]; then
    tar -xzf "$deploy/quality.tar.gz"
    sha256sum -c "$deploy/quality-after.sha256"
  fi
  mv "$build" .next
  sudo systemctl start study-plan
  ready=0
  for attempt in 1 2 3 4 5 6 7 8; do
    if curl --fail --silent http://127.0.0.1:3001/api/health >/dev/null; then ready=1; break; fi
    sleep 3
  done
  test "$ready" = 1
  if [ -r /etc/study-plan.env ]; then set -a; . /etc/study-plan.env; set +a; fi
  node --env-file=.env.local "$deploy/check-english-layout-release.mjs" 3001
  sha256sum -c "$deploy/data.sha256"
  if [ "$scope" = quality ]; then sha256sum -c "$deploy/quality-after.sha256"; fi
  trap - ERR
  sudo systemctl is-active study-plan
  printf 'ENGLISH_LAYOUT_ACTIVATED\n'
else
  exit 1
fi
