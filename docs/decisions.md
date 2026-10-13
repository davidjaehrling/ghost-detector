# Decisions

Append-only log of panel decisions (plan §3). Format: date, topic, options, scores per judge (Dr. Hollow x2), veto status, result, Director note.

## 2026-10-13 · D-000 · Verification layers and tooling for P0
- Options: as specified in plan §2 and §5. No panel needed; the plan is the owner's decision.
- Result: Expo SDK 57, expo-router, expo-dev-client, pnpm, TypeScript strict, ESLint 0 warnings, Vitest for the pure engine, Playwright for L2 web screenshots, EAS Workflows with Maestro for L3.
- Director note: Impeccable installed via its GitHub marketplace because `impeccable.style` is blocked by the network policy; the detector binary runs.

## 2026-10-13 · D-001 · P0 Refuter sweep and merge policy
- Refuter (Opus, read-only) re-ran every P0 acceptance command on a444c08 and opened the goldens. Verdicts: P0-01, 02, 03, 04, 05, 07, 08 HOLD; P0-06 UNVERIFIED (`eas workflow:validate` cannot run until expo.dev is allowed); P0-09 blocked.
- Defects fixed before merge: Maestro selector `FIELD UNIT` would not match the whole text `FIELD UNIT · BOOT`; screenshot diff too loose (now `maxDiffPixels: 150` plus console-error assertions); copy linter matched exact word forms only (now stems plus "not X but Y" framing); `init.sh` fallback pinned to pnpm 10.28.0; `features.json` evidence kind fixed to match its schema.
- Deferred: the boot screen is a plain placeholder that breaks §6 craft rules; P1 Identity replaces it and regenerates the goldens.
- Director rulings: (a) no AI model name in any commit trailer either; phase PRs are squash-merged so earlier trailers do not reach `main`; (b) `e2e/maestro/` belongs to the Release Manager, the rest of `e2e/` to QA.
- Compliance: no review needed in P0 (no copy, ads, notifications or art exist). Refuter confirmed nothing violates §7 yet.
- Panel vote: none required; no taste decision was made in P0.

## 2026-10-13 · D-002 · P0 merged; screenshot determinism
- PR #1 squash-merged as dc7fc4e after CI went green on c444f75. Two fixes landed after the Refuter sweep and were verified by CI rather than a second sweep: bundling VT323 via expo-font (system fonts differed between the container and the runner) and launching Chromium with `--font-render-hinting=none --disable-font-subpixel-positioning --disable-lcd-text` (host fontconfig differed). Goldens are now identical on both machines.
- Fallback kept: `.github/workflows/update-goldens.yml` regenerates goldens on the runner and uploads them as an artifact. Note that artifact downloads are blocked from the container by the network policy (Azure blob host), so goldens are generated locally and verified by CI.
- P1 Identity contract written to features.json (P1-01 to P1-08).

## 2026-10-13 · D-003 · Instrument identity and disclosure wording
- Instrument Bible (Art Director) defines the device: Velden Messtechnik GmbH, Wetzlar; model FS-4/87-P; serial `FS4-YYWW-NNNNN-C` with Luhn check; firmware `FW 3.1.7 · ROM C2-8811`; one yellow-green phosphor in six steps (p0 `#0F2416` to p5 `#D4FFDC`), tinted neutrals n0..n6, red `#FF4A3A` for CRITICAL only; VT323 readouts, B612 Mono labels (both OFL). Thermal view uses a phosphor white-hot palette instead of ironbow to keep one hue; panel may revisit at P3 if shareability suffers.
- Two disclosure stickers were proposed. Director ruling: use the Bible §11 wording, "SIMULATION UNIT · ENTERTAINMENT USE ONLY. All readings are generated in software. This unit detects nothing." (plain, no joke, fits the §7 red line). The voice guide is aligned to it. Compliance reviews the final string with the names in the P1 panel.
- Wave 1 delivered: instrument-bible.md, competitor-teardown.md (32 [U] tags; Play store unreachable from the container), voice-guide.md, sound-palette.md. Costs: roughly 96k, 66k, 64k, 66k subagent tokens.

## 2026-10-13 · D-004 · P1 panel: names, icons, disclosure, boot screen round 1
Workflow run with six agents: Dr. Hollow x2 instances and Art Director x2 instances (orders swapped to cancel position bias), Compliance, Refuter. Weighted score = (2·Hollow + Art) / 3.

| Item | Hollow | Art | Weighted | Compliance |
|---|---|---|---|---|
| Name 1 Velden FS-4 Field Probe | 7.0 | 7.5 | **7.17** | PASS (phone-check "Velden" trademark [U]) |
| Name 2 Ghost Detector: FS-4 Simulator | 5.0 | 5.5 | 5.17 | conditional PASS, highest risk |
| Name 3 Residual Field | 6.5 | 5.0 | 6.0 | PASS with subtitle change ("generated in software") |
| Name 4 SPI-87 Presence Index | 4.0 | 5.0 | 4.33 | **VETO** as titled; retitled "SPI-87 Index Simulator" |
| Name 5 Velden Ghost Meter Simulator | 6.5 | 7.0 | 6.67 | PASS, lowest risk |
| Icon 1 device face | 5.5 | 5.5 | 5.5 | PASS |
| Icon 2 LED ladder | 5.5 | 5.0 | 5.33 | PASS |
| Icon 3 nameplate | 8.0 | 7.0 | **7.67** | PASS |
| Disclosure sticker wording | 8.5 | 6.0 | 7.67 | PASS |

- Panel recommendation for Gate 1: name option 1, with option 5 as the findable alternative; icon concept 3. The owner decides.
- Boot screen round 1: weighted mean 4.6 (equipment 4.7, tension 3, next action 2, shareability 3, craft 5, no AI tells 6.2, ad intrusiveness 8.5). Fails the loop. Consolidated fixes sent to Builder A for round 2: ACKNOWLEDGE key band, housing with nameplate and screws, graticule and burn-in ghost filling the glass, typed self-test replacing the ΔT readout, activity index line on boot, LED ladder with only LED 1 lit and moved onto the housing, sticker on two controlled headline lines with the full §11 metadata.
- Director ruling: Skia glass effects (scanlines, grain, vignette, barrel, warm-up roll, bloom) are P3 FX scope. P1 runs at most 2 rounds with plain views; if the mean stays under 8 for lack of FX, the leftovers are logged and this screen re-enters the loop in P3.
- Refuter: all identity claims hold except two literal ones. (a) `concept-3-nameplate-mono.svg` uses #fff/#000 inside a `<mask>`; those are alpha values, never painted, accepted as is. (b) the `Claude-Session:` trailer contains the word "Claude"; ruling: the rule bans model names (Opus, Sonnet, Fable, Haiku and version strings), not the session link; unchanged. Accepted fixes: tokens test must compare to the Bible table (round 2), sticker metadata line must follow §11 (round 2), voice-guide firmware string aligned to the Bible (Copy).
- Cost: 509k subagent tokens for the panel run.

## 2026-10-13 · D-005 · Boot screen design loop, round 2 result and carry-over
- Round 2 (Dr. Hollow x2, Art Director): equipment 6.67, tension 4.0, next action 6.0, shareability 5.0, craft 5.67, no AI tells 6.0, ad intrusiveness 9.0. Weighted mean 6.05, minimum 4. Not the exit (8 / 7). Per D-004 the P1 loop stops at two rounds.
- Both judges attribute the remaining gap mainly to the Skia glass stack (scanlines, grain, dust, bloom and afterglow, barrel and vignette, warm-up roll, typing persistence) and the cast-metal housing pass, all P3 FX scope. Those are logged as deferred.
- Plain-view fixes carried into P2 as the first Builder A task on this screen, in impact order: (1) ACKNOWLEDGE key legible and seated in a key row (about 120x44, 11 to 12 px B612 Bold legend, darker n2 rubber face, offset from centre, with blank dummy caps); (2) self-test lines carry readings with units (FLUX 412 mG, THERM +0.3 °C, ACOUST -52 dBFS), seeded per boot, fixed columns, label the index line ACT IDX; (3) replace the centred VELDEN wordmark ghost with an off-centre burn-in of the scan view furniture at p0 and lower contrast; (4) graticule to Bible §3 (10x8 at 34 px, dotted 1-on-3, solid centre axes with minor ticks, corner labels TRIG AUTO and 50 ms/DIV) plus a flat idle trace with seeded jitter; (5) a forward pointer under the activity line (NEXT PEAK FULL MOON +9 D) for the daily-return hook; (6) sticker inset 8 px from the glass edges with a real lifted corner; (7) screws at 10 px on the bezel, clear of the glass and the nameplate; (8) thumb-wear streaks at 1 to 2 px, low alpha, tapered, or dropped until the Skia housing pass; (9) LED plate aligned with the glass top and its two screws visible; (10) check the dimmed readout contrast (p3 at 60% on n0) against WCAG.
- Costs: round 2 build 105k, re-score 125k subagent tokens.
