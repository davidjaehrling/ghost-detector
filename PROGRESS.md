# PROGRESS

Live state. The plan is `docs/MASTER-PLAN.md`; this file is what is done, what is next, what blocks.

## Current phase
**P1 Identity** on branch `claude/p1-identity` (from `main` at dc7fc4e, the P0 squash merge). Ends at Gate 1 (David picks name and icon direction).

P0 merged 2026-10-13 as PR #1. Open P0 items carried forward: P0-06 (`eas workflow:validate`) and P0-09 (first L3 screenshot) wait on the expo.dev allowlist and EXPO_TOKEN.

## Last thing done
- P1 complete except P1-08 (boot screen loop at 6.05, carried over). Panel D-004, rounds D-005, Refuter D-006. PR #2 open, CI green.
- P1 wave 1 committed: docs/instrument-bible.md (Velden FS-4/87-P), docs/competitor-teardown.md, docs/voice-guide.md, docs/sound-palette.md. Decisions D-002, D-003 logged.
- P0: Refuter sweep: 7 of 9 P0 claims hold and are flipped to passes:true; P0-06 unverified and P0-09 blocked (both need expo.dev and EXPO_TOKEN). Defects it found are fixed (Maestro selector, screenshot diff, copy linter stems and framing, init.sh pnpm pin).
- CI green on PR #1 first run (checks and web-screenshots, artifact uploaded). `docs/psych-brief.md` written by Dr. Hollow.
- Scaffold committed (Builder A): expo 57.0.28, expo-router 57.0.26, react-native 0.86.3, TypeScript strict, pnpm hoisted, ESLint 0 warnings, banned-copy linter with fixture test, Vitest with `src/engine/rng.ts`, `init.sh` runs clean, `pnpm web:export` produces `dist/`.
- EAS files committed (Release Manager): `eas.json` profiles incl. `e2e-test`, `.eas/workflows/e2e-android.yml`, `e2e/maestro/boot.yml`, `docs/release-runbook.md`. `eas workflow:validate` not run (expo.dev blocked).
- Skills installed at project scope (Expo plugin, frontend-design, Impeccable via its GitHub marketplace); agent roster with pinned models; state files.

## Next 3 things
1. Merge PR #2 once Compliance's verdict lines land and CI is green; send the Gate 1 message (names, icons, package ID).
2. **Gate 1 open**: wait for David's name and icon pick. Do not start P2 screens that depend on the name; P2 scaffolding that does not (navigation, camera permission flow, scan theatre skeleton, engine v0) may start on `claude/p2-vertical-slice`.
3. P2 first task for Builder A: boot screen round 3 from the D-005 and D-006 carry-over lists.

## Blockers (owner)
- `expo.dev` and `*.expo.dev` are blocked by the environment network policy. Needed for EAS (L3). Flagged to David.
- `EXPO_TOKEN` is not set as an environment secret.
- Play Console account, AdMob and Firebase not yet created (needed by end of P2 and by P5).

## Budget
| Phase | Tokens (approx.) | Notes |
|---|---|---|
| P0 | ~0.75M | Subagents ~0.45M (scaffold 59k, EAS 55k, psych brief 72k, harness 58k, Refuter 101k, fixes and two CI font-drift fixes ~220k); Director context ~0.2M at merge |
| P1 | ~1.5M | Subagents ~1.45M (wave 1 ~290k, wave 2 ~260k, panel 509k, round 2 105k + re-score 125k, Refuter ~100k, fixes ~90k); Director context ~0.1M |
