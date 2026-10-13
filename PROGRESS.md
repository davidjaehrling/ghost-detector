# PROGRESS

Live state. The plan is `docs/MASTER-PLAN.md`; this file is what is done, what is next, what blocks.

## Current phase
**P0 Foundations**, PR #1 (`claude/p0-foundations` into `main`). Merging once CI is green on the final head. P1 Identity starts next.

## Last thing done
- Refuter sweep: 7 of 9 P0 claims hold and are flipped to passes:true; P0-06 unverified and P0-09 blocked (both need expo.dev and EXPO_TOKEN). Defects it found are fixed (Maestro selector, screenshot diff, copy linter stems and framing, init.sh pnpm pin).
- CI green on PR #1 first run (checks and web-screenshots, artifact uploaded). `docs/psych-brief.md` written by Dr. Hollow.
- Scaffold committed (Builder A): expo 57.0.28, expo-router 57.0.26, react-native 0.86.3, TypeScript strict, pnpm hoisted, ESLint 0 warnings, banned-copy linter with fixture test, Vitest with `src/engine/rng.ts`, `init.sh` runs clean, `pnpm web:export` produces `dist/`.
- EAS files committed (Release Manager): `eas.json` profiles incl. `e2e-test`, `.eas/workflows/e2e-android.yml`, `e2e/maestro/boot.yml`, `docs/release-runbook.md`. `eas workflow:validate` not run (expo.dev blocked).
- Skills installed at project scope (Expo plugin, frontend-design, Impeccable via its GitHub marketplace); agent roster with pinned models; state files.

## Next 3 things
1. Merge PR #1 (squash) once CI is green on the final head.
2. P1 Identity: competitor teardown, Instrument Bible, tokens, type (licence check), voice guide, sound palette, 5 names, 3 icon concepts, panel scores. Branch `claude/p1-identity`.
3. Gate 1 message to David with name options and icon concepts.

## Blockers (owner)
- `expo.dev` and `*.expo.dev` are blocked by the environment network policy. Needed for EAS (L3). Flagged to David.
- `EXPO_TOKEN` is not set as an environment secret.
- Play Console account, AdMob and Firebase not yet created (needed by end of P2 and by P5).

## Budget
| Phase | Tokens (approx.) | Notes |
|---|---|---|
| P0 | ~0.6M | Subagents ~0.45M (scaffold 59k, EAS 55k, psych brief 72k, harness 58k, Refuter 101k, fixes ~60k); Director context ~0.17M at merge |
