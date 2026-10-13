# PROGRESS

Live state. The plan is `docs/MASTER-PLAN.md`; this file is what is done, what is next, what blocks.

## Current phase
**P3 Ghost engine & FX** on branch `claude/p3-ghost-fx` (from `main` at fc2a14a, the P2 squash merge). Runs in parallel with P4 (sensors, sound, haptics) once P3-01 lands. **Gate 1 is still open** (name, icon, package ID). P2-10 (first AAB) and P2-11 (identity) wait on the owner.

P0 merged as PR #1, P1 as PR #2, P2 as PR #3 (2026-10-13). Carried forward: P0-06, P0-09 (expo.dev allowlist, EXPO_TOKEN); P1-08 boot screen loop at 6.05 (continues as P2-08).

## Last thing done
- P3: Skia 2.14 installed (P3-01), glass stack (P3-02), thermal view (P3-05) committed; P4 audio engine (P4-01..03) committed. Compositor v1 (P3-03/04) and Builder A's three-screen integration running. Decisions D-013, D-014.
- P2 merged as PR #3: 7 of 11 claims pass; 08/09 re-enter the loop in P3; 10/11 wait on the owner. Decisions D-007 to D-012.
- P2 rounds: engine v0 verified (P2-01..03 pass), viewfinder and scan theatre verified (P2-05, 06 pass), v0 ghost adds light and native region detection exists (P2-07 pending round-3 check). Design loop round 2 means: boot 7.24, viewfinder 7.0, scan 7.43, result 6.9; ghost believability 5. Round 3 running (last plain-view round; Skia in P3). Decisions D-007 to D-010.
- P2 wave 1 merged into the branch: engine v0 (dark-region finder, seeded outcome matching the psych-brief tables within 0.7 points, profile generator; 55 engine tests), navigation skeleton with flow spec, boot screen round 3 (seeded install identity with Luhn serial, contrast test, key row, graticule per §3). 71 unit tests, 15 goldens.
- Wave 2 running: viewfinder + scan theatre + state store (Builder A), v0 ghost compositor (FX Engineer).
- P1 complete except P1-08 (boot screen loop at 6.05, carried over). Panel D-004, rounds D-005, Refuter D-006. PR #2 open, CI green.
- P1 wave 1 committed: docs/instrument-bible.md (Velden FS-4/87-P), docs/competitor-teardown.md, docs/voice-guide.md, docs/sound-palette.md. Decisions D-002, D-003 logged.
- P0: Refuter sweep: 7 of 9 P0 claims hold and are flipped to passes:true; P0-06 unverified and P0-09 blocked (both need expo.dev and EXPO_TOKEN). Defects it found are fixed (Maestro selector, screenshot diff, copy linter stems and framing, init.sh pnpm pin).
- CI green on PR #1 first run (checks and web-screenshots, artifact uploaded). `docs/psych-brief.md` written by Dr. Hollow.
- Scaffold committed (Builder A): expo 57.0.28, expo-router 57.0.26, react-native 0.86.3, TypeScript strict, pnpm hoisted, ESLint 0 warnings, banned-copy linter with fixture test, Vitest with `src/engine/rng.ts`, `init.sh` runs clean, `pnpm web:export` produces `dist/`.
- EAS files committed (Release Manager): `eas.json` profiles incl. `e2e-test`, `.eas/workflows/e2e-android.yml`, `e2e/maestro/boot.yml`, `docs/release-runbook.md`. `eas workflow:validate` not run (expo.dev blocked).
- Skills installed at project scope (Expo plugin, frontend-design, Impeccable via its GitHub marketplace); agent roster with pinned models; state files.

## Next 3 things
1. Compositor v1 (running) and Builder A's integration of glass, leftovers, magnetometer needle, sweep, audio and jump-scare on boot, viewfinder and scan (running).
2. Result screen: compositor v1, thermal toggle, warp (Builder A, second task). Then believability scoring on the five fixtures (P3-07) and the four-screen loop (P3-08), Refuter, PR.
3. Still open on the owner: Gate 1 picks, expo.dev allowlist, EXPO_TOKEN, Play Console.

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
| P2 | ~3.6M | Subagents: engine 89k+74k, nav/boot 144k, viewfinder/scan 192k, result 128k, FX 108k+152k+136k, rounds 2 and 3 of screens 297k+266k, loop scoring 203k+170k+160k, Refuter 141k+115k+99k, misc; Director context ~0.25M |
| P3 | in progress | |
| P4 | in progress (parallel with P3) | |
