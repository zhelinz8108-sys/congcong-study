#!/usr/bin/env bash
set -euo pipefail
app=/www/study-plan
disk=/www/study-plan-data
release=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
name=$(basename "$release")
[[ "$name" =~ ^english-six-bank-[a-z0-9-]{1,64}$ ]]
test "$release" = "$disk/$name"
backup=$disk/backups/before-$name
stage=$release/stage
mode=${1:?Use prepare or activate}
test "$(readlink -f "$app/content/english-six")" = "$disk/english-six"
cd "$app"
sha256sum -c "$release/runtime.sha256"
load_env() {
  if [ -r /etc/study-plan.env ]; then set -a; . /etc/study-plan.env; set +a; fi
}
load_env
resources=$(node -e 'for(const id of (require(process.argv[1]).resourceIds||[])){if(!/^[a-f0-9]{12}$/.test(id))process.exit(1);console.log(id)}' "$release/release.json")
if [ "$mode" = prepare ]; then
  test ! -e "$stage"
  test ! -e "$backup"
  sha256sum -c "$release/before.sha256"
  install -d -m 700 "$stage/content/english-six/bank"
  tar -xzf "$release/bank.tar.gz" -C "$stage/content/english-six/bank"
  (cd "$stage/content/english-six/bank"; sha256sum -c "$release/bank.sha256" >/dev/null)
  if [ -n "$resources" ]; then
    cp -a "$disk/english-six/resources" "$stage/content/english-six/resources"
    cp "$disk/english-six/index.json" "$stage/content/english-six/index.json"
    tar -xzf "$release/resources.tar.gz" -C "$stage/content/english-six"
    (cd "$stage/content/english-six"; sha256sum -c "$release/resources.sha256")
    node - "$release" "$stage/content/english-six" <<'NODE'
const fs = require('node:fs');
const [release, root] = process.argv.slice(2);
const ids = JSON.parse(fs.readFileSync(release + '/release.json')).resourceIds;
const index = JSON.parse(fs.readFileSync(root + '/index.json'));
for (const id of ids) {
  const meta = JSON.parse(fs.readFileSync(root + '/resources/' + id + '.json')).meta;
  const entry = index.resources.find(r => r.id === id);
  if (!entry || meta.id !== id) throw new Error('Unknown resource');
  Object.assign(entry, meta);
}
fs.writeFileSync(root + '/index.json', JSON.stringify(index));
NODE
  else
    ln -s "$disk/english-six/resources" "$stage/content/english-six/resources"
  fi
  NODE_ENV=production node --env-file=.env.local "$release/check-english-six-bank-data.mjs" "$release" "$stage" "$disk/english-six/bank"
  printf 'REVIEWED_BANK_DATA_PREFLIGHT_PASSED\n'
elif [ "$mode" = activate ]; then
  test -f "$stage/content/english-six/bank/index.json"
  test ! -e "$backup"
  sha256sum -c "$release/before.sha256"
  (cd "$stage/content/english-six/bank"; sha256sum -c "$release/bank.sha256" >/dev/null)
  install -d -m 700 "$backup"
  cp -a "$disk/english-six/bank" "$backup/bank"
  cp .next/BUILD_ID "$backup/build-id"
  if [ -n "$resources" ]; then
    install -d -m 700 "$backup/resources"
    cp "$disk/english-six/index.json" "$backup/index.json"
    for id in $resources; do cp "$disk/english-six/resources/$id.json" "$backup/resources/"; done
    (cd "$stage/content/english-six"; sha256sum -c "$release/resources.sha256")
  fi
  rollback() {
    sudo systemctl stop study-plan || true
    if [ -d "$disk/english-six/bank" ]; then mv "$disk/english-six/bank" "$release/failed-bank"; fi
    mv "$release/previous-bank" "$disk/english-six/bank"
    if [ -n "$resources" ]; then
      cp "$backup/index.json" "$disk/english-six/index.json"
      for id in $resources; do cp "$backup/resources/$id.json" "$disk/english-six/resources/"; done
    fi
    sudo systemctl start study-plan
    printf 'Previous bank data restored.\n' >&2
  }
  sudo systemctl stop study-plan
  mv "$disk/english-six/bank" "$release/previous-bank"
  trap rollback ERR
  mv "$stage/content/english-six/bank" "$disk/english-six/bank"
  if [ -n "$resources" ]; then
    cp "$stage/content/english-six/index.json" "$disk/english-six/index.json.next-$name"
    mv "$disk/english-six/index.json.next-$name" "$disk/english-six/index.json"
    for id in $resources; do
      cp "$stage/content/english-six/resources/$id.json" "$disk/english-six/resources/$id.json.next-$name"
      mv "$disk/english-six/resources/$id.json.next-$name" "$disk/english-six/resources/$id.json"
    done
  fi
  sudo systemctl start study-plan
  ready=0
  for attempt in 1 2 3 4 5 6; do
    if curl --fail --silent --max-time 5 http://127.0.0.1:3001/api/health >/dev/null; then ready=1; break; fi
    sleep 3
  done
  test "$ready" = 1
  NODE_ENV=production node --env-file=.env.local "$release/check-english-six-bank-data.mjs" "$release" "$app" "$backup/bank" 3001
  cmp .next/BUILD_ID "$backup/build-id"
  trap - ERR
  sudo systemctl is-active study-plan
  printf 'REVIEWED_BANK_DATA_ACTIVATED\n'
else
  printf 'Unknown mode\n' >&2
  exit 1
fi
