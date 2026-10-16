#!/usr/bin/env bash
set -euo pipefail
name=${1:?Use a fresh release name}
[[ "$name" =~ ^english-layout-[a-z0-9-]{1,48}$ ]]
cd /www/study-plan
if [ -r /etc/study-plan.env ]; then set -a; . /etc/study-plan.env; set +a; fi
# Isolated Next workers may reset V8 flags; the systemd cgroup enforces the limit.
export NODE_OPTIONS=--max-old-space-size=768
export STUDY_PLAN_LOW_MEMORY_BUILD=1
export STUDY_PLAN_BUILD_DIR=.next-$name
exec node node_modules/next/dist/bin/next build --webpack
