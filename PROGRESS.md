# PROGRESS

Live state. The plan is `docs/MASTER-PLAN.md`; this file is what is done, what is next, what blocks.

## Current phase
**P6 Retention & share** on branch `claude/p6-retention` (from `main` at c4e8954, the P5 squash merge). P7 localisation follows; P8 carries the design-loop leftovers and the believability loop on real photographs. **Gate 1 is still open** (name, icon, package ID). P2-10 (first AAB), P2-11 (identity) and P4-07 (phone check 2) wait on the owner.

P0 merged as PR #1, P1 as PR #2, P2 as PR #3 (2026-10-13), P3 with the P4 sensory layer as PR #4, P5 as PR #5 (2026-10-14). Carried forward: P0-06, P0-09 (expo.dev allowlist, EXPO_TOKEN); P3-07 believability (4.8 to 6 on synthetic fixtures, resumes in P8 on real photographs); P3-08 screen leftovers (D-022, D-023).

## Last thing done
- P6 verified: panel rounds (D-034, D-035; five of six surfaces at 8+), Compliance diff review (FCM veto fixed by a config plugin, lifted pending device check), Refuter sweep and re-check (D-035, D-036). P6-01..08 flipped; P6-05 device clauses owner-blocked. Merge PR #6 on CI green after the test hardening commit.
- P5 merged as PR #5 (c4e8954). P6 contract P6-01 to P6-08 written from docs/p6-brief.md (D-031); wave 1 launched: Compliance pre-review, share card renderer, notification scheduler, investigation log and opt-in module.
- P5 verified: Compliance diff review (D-028, veto fixed), Refuter sweep and re-check (D-029, D-030), boot flake fixed with readiness signals and a spec wait verified at CPU throttle x12 (D-027). P5-01..06, 08, 09, 11 flipped; P5-07 facade built, native backend owner-blocked; P5-10 owner-blocked. PR #5 ready; merge on CI green at 9f08f1a. Dr. Hollow's P6 brief in docs/p6-brief.md.
- P5 waves 1a and 1b committed (aea4a25..0d7d771): consent-gated ads facade with web no-op backend, analytics allowlist, LEGAL/ABOUT, production gate, cadence machine (441d782), rewarded DEEP SCAN, interstitial runtime, banner on history; 435 unit tests, 242 e2e x2. PR #5 open (draft). Boot golden flake diagnosed (D-027), FX signals landed (e3f1b26); Builder A wiring the boot screen, Compliance diff review running.
- P3 merged as PR #4 (208dbbe). P5 contract P5-01 to P5-11 written (D-025); Compliance contract review and Builder B cadence machine launched.
- P3 round 2 built: FX (density, smear, occlusion, tier extent, thermal blocks, wedge sweep, fault tear, feed tint, warp capture, 60 fps on the harness), Builder A (per-case seeds, locked photo window, one thermal number, data strip, housing sticker, priming transient, countdown, session index), goldens regenerated at 81c1c7c (173 e2e x2, 338 unit tests). Clamp measured before the warp (D-021). Re-score running. PR #4 open.
- P3/P4 build complete except the result screen: compositor v1 (3a29431), glass on all screens, D-011 leftovers, magnetometer needle, sweep, audio and haptics wiring, jump-scare, Settings (dbe3248..d948f73; 302 unit tests, 122 e2e). Result-screen integration (compositor, thermal toggle, warp) running.
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
1. Merge PR #6; open `claude/p7-localisation` with the P7 contract (DE/ES/PT written per culture, `locales/`, key parity, layout at the longest strings, L2 in four locales, second-model check).
2. P6 share card, notifications and investigation log (parallel with P5 once wave 1 lands); P7 localisation after.
3. Owner items unchanged: Gate 1 picks, expo.dev allowlist, EXPO_TOKEN, Play Console, AdMob, Firebase; plus 5 to 8 real dark-room photos for `e2e/fixtures/real/` (D-023).

## Blockers (owner)
- **Gate 1**: name (panel recommends option 1 "Velden FS-4 Field Probe", alternative option 5), icon (panel recommends concept 3 nameplate), Android package ID (permanent; must not contain "detector" if option 2 is chosen).
- `expo.dev` and `*.expo.dev` are blocked by the environment network policy. Needed for EAS (L3). Flagged to David.
- `EXPO_TOKEN` is not set as an environment secret.
- Play Console account, AdMob and Firebase not yet created (needed by end of P2 and by P5). P5 builds on Google's test IDs; the Firebase native backend waits on `google-services.json`.
- Real photographs for the believability loop: 5 to 8 phone photos of dark rooms (cellar, attic, hallway, bedroom at night, outdoors at dusk) into `e2e/fixtures/real/`, licensed to the project.

## Budget
| Phase | Tokens (approx.) | Notes |
|---|---|---|
| P0 | ~0.75M | Subagents ~0.45M (scaffold 59k, EAS 55k, psych brief 72k, harness 58k, Refuter 101k, fixes and two CI font-drift fixes ~220k); Director context ~0.2M at merge |
| P1 | ~1.6M | Subagents ~1.45M (wave 1 ~290k, wave 2 ~260k, panel 509k, round 2 105k + re-score 125k, Refuter ~100k, fixes ~90k); Director context ~0.1M |
| P2 | ~3.6M | Subagents: engine 89k+74k, nav/boot 144k, viewfinder/scan 192k, result 128k, FX 108k+152k+136k, rounds 2 and 3 of screens 297k+266k, loop scoring 203k+170k+160k, Refuter 141k+115k+99k, misc; Director context ~0.25M |
| P3 | ~4.3M | Subagents: Skia 106k, glass 208k, apparition/compositor 343k, thermal 167k, Builder A integration 376k + 274k, round 2 FX 531k + 94k + Builder A 385k, round 3 FX 361k + defects, scoring 167k + 182k (void) + 168k + 135k, Refuter 167k + 141k; Director context ~0.3M |
| P4 | ~0.25M (engine 133k, test fix 61k; the screen wiring is counted under P3) | P4-07 phone check waits on the owner |
| P5 | ~2.3M | Subagents: compliance 76k+147k+151k, cadence 76k, Builder A 140k+286k+79k+85k+84k, release 60k, QA diagnosis 126k + fix 102k, FX 84k, Refuter 148k+69k, Hollow P6 brief 106k; Director context ~0.15M |
| P6 | ~3.3M | Subagents: Hollow brief 110k, Compliance 84k+149k+155k, FX 248k+165k, Builder B 106k+79k+71k, Builder A 186k+214k+171k+200k+143k+162k, panel 220k+265k, Refuter 137k+83k, Release 68k; Director context ~0.2M |
