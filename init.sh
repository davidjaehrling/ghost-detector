#!/usr/bin/env bash
# One command to install, build and run the smoke test. Idempotent.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable && corepack prepare pnpm@latest --activate
fi

if [ -f package.json ]; then
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm smoke
else
  echo "init.sh: no package.json yet (P0 scaffold pending)"
fi
