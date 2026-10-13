# PROGRESS

Live state. The plan is `docs/MASTER-PLAN.md`; this file is what is done, what is next, what blocks.

## Current phase
**P2 Vertical slice** on branch `claude/p2-vertical-slice` (from `main` at e6757ff, the P1 squash merge). **Gate 1 is open**: David picks the name, icon direction and package ID. Work that does not depend on them proceeds (navigation, engine v0, viewfinder, scan theatre, result, boot round 3). P2-11 (identity applied) and P2-10 (first AAB) wait on the owner.

P0 merged as PR #1, P1 as PR #2 (2026-10-13). Carried forward: P0-06, P0-09 (expo.dev allowlist, EXPO_TOKEN); P1-08 boot screen loop at 6.05 (continues as P2-08).

## Last thing done
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
1. Round 3 (running): Builder A on the D-009 screen list and Refuter defects; FX Engineer on placement margins, matte edges and tier opacity caps. Then re-score and a light Refuter pass.
2. Flip P2-04, 07, 08, 09 as verified; open the P2 PR; squash merge when CI is green.
3. When Gate 1 closes: apply identity (P2-11). When expo.dev and the Play items are cleared: first AAB and Maestro video (P2-10), then Phone check 1. P3 starts with the Skia FX stack, which the loop needs to pass 8.

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
