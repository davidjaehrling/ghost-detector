# PROGRESS

Live state. The plan is `docs/MASTER-PLAN.md`; this file is what is done, what is next, what blocks.

## Current phase
**P2 Vertical slice** on branch `claude/p2-vertical-slice` (from `main` at e6757ff, the P1 squash merge). **Gate 1 is open**: David picks the name, icon direction and package ID. Work that does not depend on them proceeds (navigation, engine v0, viewfinder, scan theatre, result, boot round 3). P2-11 (identity applied) and P2-10 (first AAB) wait on the owner.

P0 merged as PR #1, P1 as PR #2 (2026-10-13). Carried forward: P0-06, P0-09 (expo.dev allowlist, EXPO_TOKEN); P1-08 boot screen loop at 6.05 (continues as P2-08).

## Last thing done
- P1 complete except P1-08 (boot screen loop at 6.05, carried over). Panel D-004, rounds D-005, Refuter D-006. PR #2 open, CI green.
- P1 wave 1 committed: docs/instrument-bible.md (Velden FS-4/87-P), docs/competitor-teardown.md, docs/voice-guide.md, docs/sound-palette.md. Decisions D-002, D-003 logged.
- P0: Refuter sweep: 7 of 9 P0 claims hold and are flipped to passes:true; P0-06 unverified and P0-09 blocked (both need expo.dev and EXPO_TOKEN). Defects it found are fixed (Maestro selector, screenshot diff, copy linter stems and framing, init.sh pnpm pin).
- CI green on PR #1 first run (checks and web-screenshots, artifact uploaded). `docs/psych-brief.md` written by Dr. Hollow.
- Scaffold committed (Builder A): expo 57.0.28, expo-router 57.0.26, react-native 0.86.3, TypeScript strict, pnpm hoisted, ESLint 0 warnings, banned-copy linter with fixture test, Vitest with `src/engine/rng.ts`, `init.sh` runs clean, `pnpm web:export` produces `dist/`.
- EAS files committed (Release Manager): `eas.json` profiles incl. `e2e-test`, `.eas/workflows/e2e-android.yml`, `e2e/maestro/boot.yml`, `docs/release-runbook.md`. `eas workflow:validate` not run (expo.dev blocked).
- Skills installed at project scope (Expo plugin, frontend-design, Impeccable via its GitHub marketplace); agent roster with pinned models; state files.

## Next 3 things
1. Wave 1 (parallel): Builder B engine v0 (P2-02, 03, 04); Builder A navigation skeleton and boot round 3 (P2-01, P2-08).
2. Wave 2: viewfinder, scan theatre, result with v0 ghost (P2-05, 06, 07); design loop on four screens (P2-09).
3. When Gate 1 closes: apply identity (P2-11). When expo.dev and the Play items are cleared: first AAB and Maestro video (P2-10), then Phone check 1.

## Blockers (owner)
- **Gate 1**: name (panel recommends option 1 "Velden FS-4 Field Probe", alternative option 5), icon (panel recommends concept 3 nameplate), Android package ID (permanent; must not contain "detector" if option 2 is chosen).
- `expo.dev` and `*.expo.dev` are blocked by the environment network policy. Needed for EAS (L3). Flagged to David.
- `EXPO_TOKEN` is not set as an environment secret.
- Play Console account, AdMob and Firebase not yet created (needed by end of P2 and by P5).

## Budget
| Phase | Tokens (approx.) | Notes |
|---|---|---|
| P0 | ~0.75M | Subagents ~0.45M (scaffold 59k, EAS 55k, psych brief 72k, harness 58k, Refuter 101k, fixes and two CI font-drift fixes ~220k); Director context ~0.2M at merge |
| P1 | ~1.6M | Subagents ~1.45M (wave 1 ~290k, wave 2 ~260k, panel 509k, round 2 105k + re-score 125k, Refuter ~100k, fixes ~90k); Director context ~0.1M |
| P2 | in progress | |
