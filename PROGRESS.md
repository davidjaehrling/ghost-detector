# PROGRESS

Live state. The plan is `docs/MASTER-PLAN.md`; this file is what is done, what is next, what blocks.

## Current phase
**P1 Identity** on branch `claude/p1-identity` (from `main` at dc7fc4e, the P0 squash merge). Ends at Gate 1 (David picks name and icon direction).

P0 merged 2026-10-13 as PR #1. Open P0 items carried forward: P0-06 (`eas workflow:validate`) and P0-09 (first L3 screenshot) wait on the expo.dev allowlist and EXPO_TOKEN.

## Last thing done
- Refuter sweep: 7 of 9 P0 claims hold and are flipped to passes:true; P0-06 unverified and P0-09 blocked (both need expo.dev and EXPO_TOKEN). Defects it found are fixed (Maestro selector, screenshot diff, copy linter stems and framing, init.sh pnpm pin).
- CI green on PR #1 first run (checks and web-screenshots, artifact uploaded). `docs/psych-brief.md` written by Dr. Hollow.
- Scaffold committed (Builder A): expo 57.0.28, expo-router 57.0.26, react-native 0.86.3, TypeScript strict, pnpm hoisted, ESLint 0 warnings, banned-copy linter with fixture test, Vitest with `src/engine/rng.ts`, `init.sh` runs clean, `pnpm web:export` produces `dist/`.
- EAS files committed (Release Manager): `eas.json` profiles incl. `e2e-test`, `.eas/workflows/e2e-android.yml`, `e2e/maestro/boot.yml`, `docs/release-runbook.md`. `eas workflow:validate` not run (expo.dev blocked).
- Skills installed at project scope (Expo plugin, frontend-design, Impeccable via its GitHub marketplace); agent roster with pinned models; state files.

## Next 3 things
1. Wave 1 (parallel): Instrument Bible (Art Director), competitor teardown (Dr. Hollow), voice guide (Copy), sound palette (Sound & Haptics).
2. Wave 2: tokens, type and the boot screen per the Bible (Builder A); 5 names (Copy); 3 icon concepts (Art Director). Design loop on the boot screen.
3. Panel vote (Workflow) on names and icons; Refuter sweep; PR; Gate 1 message to David.

## Blockers (owner)
- `expo.dev` and `*.expo.dev` are blocked by the environment network policy. Needed for EAS (L3). Flagged to David.
- `EXPO_TOKEN` is not set as an environment secret.
- Play Console account, AdMob and Firebase not yet created (needed by end of P2 and by P5).

## Budget
| Phase | Tokens (approx.) | Notes |
|---|---|---|
| P0 | ~0.75M | Subagents ~0.45M (scaffold 59k, EAS 55k, psych brief 72k, harness 58k, Refuter 101k, fixes and two CI font-drift fixes ~220k); Director context ~0.2M at merge |
| P1 | in progress | |
