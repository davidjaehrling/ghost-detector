#!/usr/bin/env bash
# One command to install and run the smoke test from a clean clone. Idempotent.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable && corepack prepare pnpm@10.28.0 --activate
  else
    npm install -g pnpm@10.28.0
  fi
fi

pnpm install --frozen-lockfile
pnpm smoke
