#!/usr/bin/env bash
# Run as root after uploading a fresh study-plan/ tree to the release directory.
# This deliberately preserves the installed HTTPS, systemd and secret settings.
set -Eeuo pipefail
umask 077

fail() { printf 'Release stopped: %s\n' "$*" >&2; exit 1; }

# Internal modes run under transient systemd services, with the same environment
# file as production. No secrets are interpolated into command lines or logs.
if [[ ${1:-} == --worker ]]; then
  [[ $# == 4 ]] || fail 'Invalid worker arguments.'
  mode=$2; work=$3; argument=$4
  cd -- "$work"
  export NODE_ENV=production STORAGE_ROOT=${STORAGE_ROOT:-/var/lib/study-plan/uploads}
  export ALLOW_LOCAL_DATA_FALLBACK=false STUDY_PLAN_BUILD_DIR=.next
  export ASSET_BASE_URL=${ASSET_BASE_URL:-https://media.githubusercontent.com/media/zhelinz8108-sys/congcong-study/main/study-plan/public}
  export NODE_OPTIONS=--max-old-space-size=768 STUDY_PLAN_LOW_MEMORY_BUILD=1
  export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=on"
  case "$mode" in
    build)
      # nginx reads .next/static directly; application output needs normal read
      # permissions. Preserved environment files retain their original modes.
      umask 022
      build_check() {
        local step=$1; shift
        if "$@"; then return 0; fi
        printf '::error title=Release validation stage::%s\n' "$step"
        return 1
      }
      build_check dependencies npm ci --include=dev
      build_check version npm run test:version
      build_check mathematics npm run test:grade6-bank
      build_check final-results node scripts/test-grade6-bank-result-release.mjs
      build_check chinese-seal npm run test:chinese-six:sealed
      build_check chinese npm run test:chinese-six
      build_check grammar-reader node scripts/test-english-six-reader-practice.mjs --source
      build_check english-six-new-only node scripts/test-english-six-new-only.mjs
      build_check next-build npm run build -- --webpack
      ;;
    serve)
      [[ $argument == 3002 ]] || fail 'Invalid preflight port.'
      exec /usr/bin/node node_modules/next/dist/bin/next start -p 3002 -H 127.0.0.1
      ;;
    verify)
      [[ $argument == 3001 || $argument == 3002 ]] || fail 'Invalid verification port.'
      /usr/bin/node scripts/check-release-version.mjs "$argument"
      /usr/bin/node --input-type=module - "$argument" <<'NODE'
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const port = process.argv[2];
const base = `http://127.0.0.1:${port}`;
const health = await fetch(`${base}/api/health`, {signal: AbortSignal.timeout(10000)});
assert.equal(health.status, 200);
const result = await health.json();
assert.equal(result.status, 'ok');
assert.equal(result.checks.database, true);
assert.equal(result.checks.storage, true);
const secret = (process.env.FAMILY_ACCESS_SECRET || '').trim() || (process.env.FAMILY_ACCESS_PASSWORD || '').trim();
assert.ok(secret && (process.env.FAMILY_ACCESS_PASSWORD || '').trim(), 'Family access must be configured.');
const payload = `v1.${Date.now() + 30 * 60 * 1000}`;
const token = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
const headers = {Cookie: `congcong_family_access=${token}`};
for (const route of ['/', '/subjects/8bd6f79b-99f5-4e68-a961-872d60d260b1/chinese/six',
  '/subjects/8bd6f79b-99f5-4e68-a961-872d60d260b1/math/problem-bank']) {
  const response = await fetch(`${base}${route}`, {headers, signal: AbortSignal.timeout(20000)});
  assert.equal(response.status, 200, route);
  await response.arrayBuffer();
}
// Exercise the compiled public question route with both assessment forms.
// These authenticated GETs never create drafts or learner submissions.
const { loadHolidayTestModule } = await import(pathToFileURL(path.resolve('scripts/holiday-math-test-utils.mjs')));
const { getBankManifest, getBankQuestion } = await loadHolidayTestModule('src/server/grade6-bank/bank.ts');
const samples = new Map();
for (const { id } of (await getBankManifest()).collections.flatMap(collection => collection.questions)) {
  const question = await getBankQuestion(id);
  assert.ok(question?.resultInputIds?.length);
  const kind = question.resultAssessment === 'closed-v1' ? 'choice' : 'final';
  if (!samples.has(kind)) samples.set(kind, question);
  if (samples.size === 2) break;
}
assert.equal(samples.size, 2);
for (const expected of samples.values()) {
  const response = await fetch(`${base}/api/math/grade6-bank/questions/${encodeURIComponent(expected.id)}`, {headers, signal: AbortSignal.timeout(20000)});
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('cache-control')?.includes('no-store'));
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(expected)));
}
const audio = await fetch(`${base}/api/english/toefl/media/clip-01`, {
  method: 'HEAD', headers, signal: AbortSignal.timeout(10000)
});
assert.equal(audio.status, 200, 'Existing TOEFL audio must remain available.');
assert.ok(Number(audio.headers.get('content-length')) > 0);
process.argv = [process.execPath, path.resolve('scripts/check-english-layout-release.mjs'), port];
await import(pathToFileURL(process.argv[1]));
process.argv = [process.execPath, path.resolve('scripts/check-toefl-temp-release.mjs'), port];
await import(pathToFileURL(process.argv[1]));
console.log('Database, storage, Chinese, mathematics result assessments, English and TOEFL GET checks passed.');
NODE
      ;;
    backup)
      /usr/bin/node --input-type=module - "$argument" <<'NODE'
import nextEnv from '@next/env';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
nextEnv.loadEnvConfig(process.cwd());
// Match src/lib/db.ts defaults rather than pg_dump's operating-system defaults.
process.env.PGHOST ??= '127.0.0.1';
process.env.PGPORT ??= '5432';
process.env.PGDATABASE ??= 'study_plan';
process.env.PGUSER ??= 'study_plan';
process.argv = [process.execPath, 'scripts/backup-postgres.mjs', '--output', process.argv[2]];
await import(pathToFileURL(path.resolve('scripts/backup-postgres.mjs')));
NODE
      ;;
    migrate)
      # Only the reviewed, additive and idempotent migration is allowed here.
      [[ $(sha256sum scripts/migrate-postgres.mjs | cut -d' ' -f1) == 81962036a657d97c9ac1cfe459fde675553398e5d1bf609f8720f274d44be49f ]] || fail 'Migration changed; review it before releasing.'
      export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=off"
      exec /usr/bin/node scripts/migrate-postgres.mjs
      ;;
    *) fail 'Unknown worker mode.' ;;
  esac
  exit 0
fi

[[ $EUID == 0 ]] || fail 'Run this script as root.'
[[ $# == 2 && $1 =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$ && $2 =~ ^[0-9a-f]{40}$ ]] || fail 'Expected a safe release ID and a lowercase 40-character commit SHA.'
release=$1; commit=$2
app=/www/study-plan
releases=/www/study-plan-releases
stage=$releases/$release
previous=$releases/previous-$release
backup=/www/study-plan-data/backups/before-main-$release
preflight_unit=study-plan-preflight-$release.service
service_stop_started=0; finished=0; backup_ready=0; preflight_started=0
old_build=; new_build=

# Workers must keep using this reviewed script even when their working directory
# is the old app, or when staging is moved during activation. Keep a non-secret,
# root-owned copy outside both application directories and re-exec it before npm.
control_dir=/run/study-plan-release-code
control=$control_dir/$release.sh
[[ ! -L $control_dir ]] || fail 'Invalid control-script directory.'
if [[ ! -e $control_dir ]]; then install -d -m 0755 -o root -g root "$control_dir"; fi
[[ $(stat -c '%u:%a' "$control_dir") == 0:755 ]] || fail 'Control-script directory must be root-owned mode 755.'
if [[ $0 != "$control" ]]; then
  [[ ! -e $control && ! -L $control ]] || fail 'This release ID already has a control script; use a new ID.'
  install -m 0644 -o root -g root -- "$0" "$control"
  exec /bin/bash "$control" "$release" "$commit"
fi

for command in flock systemd-run systemctl python3 curl pg_dump pg_restore node npm realpath stat sha256sum; do
  command -v "$command" >/dev/null || fail "Required command is unavailable: $command"
done
[[ -d $app && ! -L $app && $(realpath -- "$app") == "$app" ]] || fail 'The current app must be a real directory.'
[[ -d $releases && ! -L $releases && $(realpath -- "$releases") == "$releases" ]] || fail 'Invalid releases directory.'
[[ -d $stage && ! -L $stage && $(realpath -- "$stage") == "$stage" ]] || fail 'Invalid staging directory.'
[[ ! -e $previous && ! -L $previous && ! -e $backup && ! -L $backup ]] || fail 'This release already has a backup or rollback directory; use a new release ID.'
[[ $(stat -c %d "$app") == $(stat -c %d "$stage") && $(stat -c %d "$app") == $(stat -c %d "$releases") ]] || fail 'Both activation moves must remain on the same filesystem.'
[[ -f $stage/package-lock.json && -f $stage/scripts/check-english-layout-release.mjs && -f $app/.next/BUILD_ID ]] || fail 'Required source or existing build is missing.'
[[ ! -e $stage/node_modules && ! -L $stage/node_modules && ! -e $stage/.next && ! -L $stage/.next ]] || fail 'Stage must have fresh dependencies and no existing build.'
[[ $(systemctl show study-plan.service -p User --value) == ubuntu && $(systemctl show study-plan.service -p WorkingDirectory --value) == "$app" ]] || fail 'Unexpected production service identity or working directory.'
systemctl is-active --quiet study-plan.service || fail 'Production must be healthy before preparing a release.'
[[ -d /var/lib/study-plan/uploads && ! -L /var/lib/study-plan/uploads ]] || fail 'The persistent upload directory is missing or is a symlink.'
[[ $(systemctl show "$preflight_unit" -p LoadState --value) == not-found ]] || fail 'A preflight unit already uses this release ID.'
python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 3002))
PY

lockdir=/run/study-plan-release
[[ ! -L $lockdir ]] || fail 'Invalid lock directory.'
if [[ ! -e $lockdir ]]; then install -d -m 0700 -o root -g root "$lockdir"; fi
[[ $(stat -c '%u:%a' "$lockdir") == 0:700 ]] || fail 'The release lock directory must be root-owned mode 700.'
[[ ! -L $lockdir/lock ]] || fail 'Invalid lock file.'
exec 9>"$lockdir/lock"
flock -n 9 || fail 'Another production release is running.'

receipt() {
  (( backup_ready )) || return 0
  python3 - "$backup/receipt.json" "$1" "$release" "$commit" "$old_build" "$new_build" "$previous" <<'PY'
import json, os, sys, datetime
target, status, release, sha, old, new, previous = sys.argv[1:]
data = dict(status=status, release=release, commit=sha, oldBuildId=old,
            newBuildId=new, previousDirectory=previous,
            databaseRestorePerformed=False, timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat())
temporary = target + '.tmp'
with open(temporary, 'w', encoding='utf-8') as out:
    json.dump(data, out, indent=2); out.write('\n'); out.flush(); os.fsync(out.fileno())
os.chmod(temporary, 0o600)
os.replace(temporary, target)
PY
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM HUP
  set +e
  if (( preflight_started )); then systemctl stop "$preflight_unit" >/dev/null 2>&1; fi
  for mode in build verify backup migrate; do
    systemctl stop "study-plan-release-$release-$mode.service" >/dev/null 2>&1
  done
  if (( ! finished )) && [[ -d $previous && ! -L $previous ]]; then
    printf 'Activation failed; restoring the previous application without restoring the database.\n' >&2
    systemctl stop study-plan.service
    if [[ ! -f $previous/.next/BUILD_ID || $(cat "$previous/.next/BUILD_ID") != "$old_build" ]]; then
      printf 'Rollback needs manual recovery: the preserved application has an unexpected BUILD_ID.\n' >&2
      receipt rollback-failed
      exit 1
    fi
    # Directory facts handle a signal before or after either atomic rename.
    if [[ -e $app || -L $app ]]; then
      if [[ -e $stage || -L $stage || -L $app ]] || ! mv -T -- "$app" "$stage"; then
        printf 'Rollback needs manual recovery: could not move the new application back to staging.\n' >&2
        receipt rollback-failed
        exit 1
      fi
    fi
    if mv -T -- "$previous" "$app" && systemctl start study-plan.service && wait_healthy 3001; then
      receipt rolled-back
      printf 'Previous application restored. Private diagnostic files: %s\n' "$backup" >&2
    else
      receipt rollback-failed
      printf 'Rollback needs manual recovery; existing directories and database backup were retained: %s\n' "$backup" >&2
    fi
  elif (( ! finished )); then
    if (( service_stop_started )); then
      if ! systemctl start study-plan.service || ! wait_healthy 3001; then
        receipt rollback-failed
        printf 'The original app is still in place but needs a service-health check.\n' >&2
        exit 1
      fi
    fi
    receipt preparation-failed
    printf 'The running application was retained. Private diagnostic files: %s\n' "$backup" >&2
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

wait_healthy() {
  local port=$1
  for ((attempt=0; attempt<60; attempt++)); do
    if curl --fail --silent --max-time 3 "http://127.0.0.1:$port/api/health" >"$backup/health-$port.json" &&
      python3 - "$backup/health-$port.json" <<'PY'
import json, sys
try:
    value = json.load(open(sys.argv[1], encoding='utf-8'))
    assert value['status'] == 'ok' and value['checks']['database'] is True and value['checks']['storage'] is True
except Exception:
    sys.exit(1)
PY
    then return 0; fi
    sleep 2
  done
  return 1
}

run_worker() {
  local mode=$1 work=$2 argument=$3 user=${4:-ubuntu}
  if ! systemd-run --quiet --wait --collect --pipe --unit="study-plan-release-$release-$mode" \
    --uid="$user" --gid="$user" --working-directory="$work" \
    --property=EnvironmentFile=-/etc/study-plan.env \
    --property=MemoryHigh=1280M --property=MemoryMax=1280M --property=MemorySwapMax=2048M \
    --property=CPUQuota=100% --property=Nice=10 --property=RuntimeMaxSec=1800 \
    /bin/bash "$control" --worker "$mode" "$work" "$argument" \
    >>"$backup/$mode.log" 2>&1; then
    # Forward only bounded, allowlisted counters and stage names. Full worker
    # logs remain private because they may contain production configuration.
    python3 - "$backup/$mode.log" "$mode" <<'PY'
import json, re, sys
stages = {'dependencies', 'version', 'mathematics', 'final-results', 'chinese-seal', 'chinese', 'grammar-reader', 'next-build'}
prefix = '::error title=Grammar lecture verification::'
for line in open(sys.argv[1], encoding='utf-8', errors='replace'):
    line = line.strip()
    if line.startswith('::error title=Release validation stage::') and line.rsplit('::', 1)[-1] in stages:
        print(line)
    if not line.startswith(prefix) or len(line) > 16000:
        continue
    try:
        value = json.loads(line[len(prefix):]); safe = {}
        for key in ('questions', 'unmatched', 'page', 'block', 'inputCount', 'answerParts'):
            if type(value.get(key)) is int and 0 <= value[key] <= 100000: safe[key] = value[key]
        for key, pattern in {'resource': r'[a-f0-9]{12}', 'stage': r'load-source|verify-screenshot-exercises|submit-source-answer', 'kind': r'choice|judgment|fill|sentence|writing', 'grading': r'exact|reference'}.items():
            if isinstance(value.get(key), str) and re.fullmatch(pattern, value[key]): safe[key] = value[key]
        if isinstance(value.get('groups'), list):
            safe['groups'] = [{key: [n for n in group.get(key, [])[:1000] if type(n) is int and 0 <= n <= 100000] for key in ('questions', 'keys', 'pages')} for group in value['groups'][:100] if isinstance(group, dict)]
        if safe: print(prefix + json.dumps(safe, separators=(',', ':')))
    except (ValueError, TypeError, AttributeError):
        pass
print('::error title=Isolated release worker::' + sys.argv[2] + ' failed; full diagnostics remain private on the server.')
PY
    return 1
  fi
}

# Only these staging destinations may be replaced; never remove live resources.
prepare_stage_parent() {
  local parent
  parent=$(dirname -- "$1")
  [[ $(realpath -m -- "$parent") == "$parent" ]] || fail 'A staging destination has a symlinked parent.'
  mkdir -p -- "$parent"
}

replace_runtime() {
  local relative=$1 source=$app/$1 target=$stage/$1 resolved
  [[ -d $source ]] || fail "Current runtime resource is missing: $relative"
  resolved=$(realpath -- "$source")
  prepare_stage_parent "$target"
  rm -rf -- "$target"
  case "$resolved/" in
    "$app/"*|"$stage/"*) cp -aL -- "$source" "$target" ;;
    *) ln -s -- "$resolved" "$target" ;;
  esac
}

copy_private_tree() {
  local relative=$1 source=$app/$1 target=$stage/$1
  [[ -e $source || -L $source ]] || return 0
  [[ ! -L $source && -z $(find "$source" -type l -print -quit) ]] || fail "Private runtime tree contains symlinks; review before copying: $relative"
  prepare_stage_parent "$target"
  rm -rf -- "$target"
  cp -a -- "$source" "$target"
}

printf 'Preparing isolated release %s.\n' "$release"
[[ -d /www/study-plan-data && ! -L /www/study-plan-data ]] || fail 'The private data directory is unavailable.'
python3 - "$stage" /www/study-plan-data <<'PY'
import shutil, sys
assert shutil.disk_usage(sys.argv[1]).free >= 4 * 1024**3, 'At least 4 GiB must be available for the isolated app build.'
assert shutil.disk_usage(sys.argv[2]).free >= 10 * 1024**3, 'Retain at least 10 GiB of data-disk headroom.'
PY
install -d -m 0700 -o root -g root "$backup"
backup_ready=1
install -d -m 0700 "$backup/env"
old_build=$(cat "$app/.next/BUILD_ID")
printf '%s\n' "$old_build" >"$backup/previous-BUILD_ID"
systemctl cat study-plan.service >"$backup/study-plan.service.txt"
if [[ -f /etc/study-plan.env ]]; then cp -L -- /etc/study-plan.env "$backup/env/etc-study-plan.env"; fi
if [[ -f /etc/nginx/sites-enabled/study-plan ]]; then cp -L -- /etc/nginx/sites-enabled/study-plan "$backup/nginx-study-plan.conf"; fi
if [[ -f /etc/nginx/nginx.conf ]]; then cp -L -- /etc/nginx/nginx.conf "$backup/nginx.conf"; fi

# The uploaded tree is new. Set ownership before bringing in private runtime files
# whose original modes and ownership must be retained.
chown -hR ubuntu:ubuntu -- "$stage"
chmod 0755 "$stage"
shopt -s nullglob
env_files=("$app"/.env*)
for source in "${env_files[@]}"; do
  [[ -f $source ]] || fail 'A top-level environment entry is not a regular file.'
  cp -pL -- "$source" "$stage/$(basename -- "$source")"
  cp -L -- "$source" "$backup/env/$(basename -- "$source")"
done
if (( ${#env_files[@]} )); then sha256sum -- "${env_files[@]}" >"$backup/live-env.sha256"; fi
chmod -R go-rwx "$backup"
copy_private_tree .data
copy_private_tree content/chinese-six/pages
for source in "$app"/content/chinese-six/*.private.json; do copy_private_tree "${source#"$app/"}"; done
for relative in content/grade6-bank/answers.private.json content/grade6-bank/import-audit.private.json content/grade6-bank/private; do copy_private_tree "$relative"; done
replace_runtime content/english-six
replace_runtime content/toefl-listening
replace_runtime public/listening
prepare_stage_parent "$stage/public/uploads"
rm -rf -- "$stage/public/uploads"
ln -s /var/lib/study-plan/uploads "$stage/public/uploads"

printf 'Installing dependencies, running non-database tests, and building in staging.\n'
run_worker build "$stage" -
[[ -s $stage/.next/BUILD_ID ]] || fail 'The staged build has no BUILD_ID.'
new_build=$(cat "$stage/.next/BUILD_ID")
/usr/bin/node "$stage/scripts/write-release-metadata.mjs" "$commit" "$stage"
chmod 0644 "$stage/release-metadata.json"
printf '%s\n' "$new_build" >"$backup/new-BUILD_ID"
receipt built

printf 'Starting read-only preflight on localhost:3002.\n'
preflight_started=1
systemd-run --quiet --collect --unit="$preflight_unit" --uid=ubuntu --gid=ubuntu \
  --working-directory="$stage" --property=EnvironmentFile=-/etc/study-plan.env \
  --property=MemoryHigh=512M --property=MemoryMax=768M --property=MemorySwapMax=512M \
  --property=RuntimeMaxSec=600 \
  /bin/bash "$control" --worker serve "$stage" 3002
wait_healthy 3002 || fail 'Staged database/storage health failed.'
run_worker verify "$stage" 3002
systemctl stop "$preflight_unit"

printf 'Creating fresh PostgreSQL backup before the additive migration and activation.\n'
run_worker backup "$app" "$backup/database.dump" root
[[ -s $backup/database.dump ]] || fail 'The PostgreSQL backup is empty.'
chmod 0600 "$backup/database.dump"
pg_restore --list "$backup/database.dump" >"$backup/database-contents.txt"
[[ $(cat "$app/.next/BUILD_ID") == "$old_build" ]] || fail 'The running build changed during preparation.'
if [[ -f $backup/live-env.sha256 ]]; then sha256sum --check --status "$backup/live-env.sha256" || fail 'A live environment file changed during preparation.'; fi
run_worker migrate "$stage" - root
receipt prepared

printf 'Activating the verified release.\n'
service_stop_started=1
systemctl stop study-plan.service
mv -T -- "$app" "$previous"
mv -T -- "$stage" "$app"
systemctl start study-plan.service
wait_healthy 3001 || fail 'Activated database/storage health failed.'
run_worker verify "$app" 3001
receipt deployed
finished=1
printf 'Release deployed: commit=%s BUILD_ID=%s; private receipt=%s/receipt.json\n' "$commit" "$new_build" "$backup"
