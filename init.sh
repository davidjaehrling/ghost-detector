#!/usr/bin/env bash
# One command to install and run the smoke test from a clean clone. Idempotent.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@latest --activate
fi

pnpm install --frozen-lockfile
pnpm smoke
