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
