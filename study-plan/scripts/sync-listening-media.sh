#!/usr/bin/env bash
set -euo pipefail

manifest_path="${1:?manifest path is required}"
base_url="${2:?media base URL is required}"
destination="${3:?destination is required}"
worker_limit="${4:-8}"

if [[ "$destination" != "/www/study-plan/public/listening" ]]; then
  echo "Unexpected media destination: $destination" >&2
  exit 1
fi

mkdir -p "$destination"

download_one() {
  local relative_path="$1"
  local expected_sha="$2"
  local expected_size="$3"
  local target="$destination/$relative_path"
  local partial="$target.part"
  local actual_sha
  local actual_size

  if [[ "$relative_path" == /* || "$relative_path" == *".."* ]]; then
    echo "Unsafe media path: $relative_path" >&2
    return 1
  fi

  if [[ -f "$target" ]]; then
    actual_size="$(stat -c '%s' "$target")"
    if [[ "$actual_size" == "$expected_size" ]]; then
      actual_sha="$(sha256sum "$target" | cut -d ' ' -f 1)"
      if [[ "$actual_sha" == "$expected_sha" ]]; then
        echo "Verified existing: $relative_path"
        return 0
      fi
    fi
  fi

  mkdir -p "$(dirname "$target")"
  curl --fail --location \
    --retry 6 --retry-all-errors --retry-delay 2 \
    --connect-timeout 20 --max-time 1800 \
    --speed-limit 1024 --speed-time 120 \
    --continue-at - --output "$partial" \
    "$base_url/$relative_path"

  actual_size="$(stat -c '%s' "$partial")"
  actual_sha="$(sha256sum "$partial" | cut -d ' ' -f 1)"
  if [[ "$actual_size" != "$expected_size" || "$actual_sha" != "$expected_sha" ]]; then
    echo "Verification failed: $relative_path" >&2
    rm -f "$partial"
    return 1
  fi

  mv -f "$partial" "$target"
  chmod 0644 "$target"
  echo "Downloaded: $relative_path"
}

export base_url destination
export -f download_one

declare -a active_pids=()
failed=0

while IFS=$'\t' read -r relative_path expected_sha expected_size; do
  download_one "$relative_path" "$expected_sha" "$expected_size" &
  active_pids+=("$!")

  if (( ${#active_pids[@]} >= worker_limit )); then
    if ! wait "${active_pids[0]}"; then
      failed=1
    fi
    active_pids=("${active_pids[@]:1}")
  fi
done < "$manifest_path"

for pid in "${active_pids[@]}"; do
  if ! wait "$pid"; then
    failed=1
  fi
done

if (( failed != 0 )); then
  echo "One or more media downloads failed." >&2
  exit 1
fi

verified_count=0
while IFS=$'\t' read -r relative_path expected_sha expected_size; do
  target="$destination/$relative_path"
  [[ -f "$target" ]]
  [[ "$(stat -c '%s' "$target")" == "$expected_size" ]]
  [[ "$(sha256sum "$target" | cut -d ' ' -f 1)" == "$expected_sha" ]]
  verified_count=$((verified_count + 1))
done < "$manifest_path"

echo "Verified media files: $verified_count"
