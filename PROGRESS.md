# PROGRESS

Live state. The plan is `docs/MASTER-PLAN.md`; this file is what is done, what is next, what blocks.

## Current phase
**P0 Foundations** on branch `claude/p0-foundations` (from `claude/determined-goodall-d3kthm`, which holds the plan docs).

## Last thing done
- Installed skills at project scope: Expo plugin, frontend-design, Impeccable (via the `pbakaus/impeccable` marketplace; the `impeccable.style` download host is blocked).
- Wrote the agent roster in `.claude/agents/` (12 roles, every model pinned).
- Wrote CLAUDE.md, PROGRESS.md, features.json, docs/decisions.md, init.sh skeleton.

## Next 3 things
1. Expo SDK 57 scaffold (expo-router, dev client, TypeScript strict, pnpm, ESLint, Vitest) with `init.sh` and a smoke test.
2. GitHub Actions CI (lint, typecheck, test, web export, Playwright screenshots) and the Playwright L2 harness at 360x800, 390x844, 428x926.
3. `eas.json` e2e profile, `.eas/workflows/e2e-android.yml`, a first Maestro flow. Refuter sweep, then PR.

## Blockers (owner)
- `expo.dev` and `*.expo.dev` are blocked by the environment network policy. Needed for EAS (L3). Flagged to David.
- `EXPO_TOKEN` is not set as an environment secret.
- Play Console account, AdMob and Firebase not yet created (needed by end of P2 and by P5).

## Budget
| Phase | Tokens (approx.) | Notes |
|---|---|---|
| P0 | in progress | Director context plus subagents; updated at phase end |
