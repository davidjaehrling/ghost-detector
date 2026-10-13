# src/engine

Pure TypeScript. No React, no native imports. Import from `src/engine` (index).

## API
- `downsampleLuma(rgba, w, h, 64..96)` -> `{ luma, width, height }` (Rec.709 weights, box average).
- `findDarkRegion(luma, width, height, opts?)` -> `DarkRegion | null`. Normalised 0..1 box, centroid,
  `score`, `meanLuma`, `areaFraction`, `fallback`. `null` = frame too bright for a region.
  `fallback: true` = pitch-black frame, darkest 30% window inside a 10% margin. Run once per photo.
- `seedFrom(photoHash, timestampMs)` -> uint32. Different photo or time, different seed.
- `drawOutcome(seed, intensity, history)` -> `{ tier, spi, figureShown, smudge, jumpScare, scanDurationMs }`.
- `generateProfile(seed, tier, recentNames)` -> `{ class, era, name, traits, signatureDecodedPct }`.
- `TIER_BOUNDS`, `tierBand`, `tierOf` mirror `src/ui/tokens.ts` (tested).

## Seeds
One scan, one seed: `const seed = seedFrom(hash, Date.now())`. Use it for `drawOutcome`;
use `seed ^ 0x9e3779b9` (as uint32) for `generateProfile` so the two do not correlate.

## History the UI must persist
`OutcomeHistory`: `scanCount` (scans before this one, 0 = first ever), `scansSinceCritical`
(1 = previous scan was CRITICAL, null = never), `dryStreak` (consecutive scans at or below ACTIVE),
`nowMs`, `lastJumpScareMs`, `jumpScareThisSession`. After each scan: increment `scanCount`,
update the streaks, store `lastJumpScareMs` and the session flag if `jumpScare` fired, and push
`profile.name` onto the recent list (the engine reads the last 20).

## Call order
`findDarkRegion` (once) -> `drawOutcome` -> if `tier` is ACTIVE or higher place the figure in the
region; `smudge` on TRACE; `generateProfile` -> animate for `scanDurationMs`.
Jump-scare also needs the Settings toggle: the engine only applies the brief's caps.
Priming shift (brief 2.1) is not applied here.
