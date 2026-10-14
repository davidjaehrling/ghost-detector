# src/engine

Pure TypeScript. No React, no native imports. Import from `src/engine` (index).

## API
- `downsampleLuma(rgba, w, h, 64..96)` -> `{ luma, width, height }` (Rec.709 weights, box average).
- `findDarkRegion(luma, width, height, opts?)` -> `DarkRegion | null`. Normalised 0..1 box, centroid,
  `score`, `meanLuma`, `areaFraction`, `fallback`. `null` = frame too bright for a region.
  Components thinner than 6% of the short side, or longer than 4:1, are ignored (edge slivers); if nothing else qualifies the result is `null`, or the fallback window for a pitch-black frame.
  `fallback: true` = pitch-black frame, darkest 30% window inside a 10% margin. Run once per photo.
- `seedFrom(photoHash, timestampMs)` -> uint32. Different photo or time, different seed.
- `drawOutcome(seed, intensity, history)` -> `{ tier, spi, figureShown, smudge, jumpScare, scanDurationMs }`.
- `generateProfile(seed, tier, recent: { names: string[]; lines: string[] })` -> `{ class, era, name, traits, signatureDecodedPct }`.
  `recent` is the last 20 results, oldest first: their `name`s and all their `traits` lines flattened.
  No name or trait line repeats inside that window (least-recently-used line if a bank runs out).
  Deprecated: a bare `string[]` is still accepted and means names only (no line avoidance).
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

## Interstitial cadence (`adCadence.ts`, plan section 8)
A pure, serialisable state machine that answers two questions: load an interstitial now
(`preload`), and display it now (`show`). `createCadence(config?)` -> `State`;
`reduce(state, event)` -> `{ state, decision: { preload, show } }`. No clock inside: every event
carries `atMs` from one clock the app picks (monotonic ms). `State` is a plain object; persist it
with `JSON.stringify` and feed it back after `JSON.parse`.

Events: `appLaunch`, `sessionStart { sessionIndex }`, `scanComplete`, `resultShown` (the reveal),
`returnToViewfinder`, `rewardedShown`, `interstitialShown`, `tick` (any heartbeat, e.g. once a
second on the viewfinder). All carry `atMs`.

How the app feeds it: send `appLaunch` once per process, then `sessionStart` with the install's
0-based session index (0 = first session ever; the session store keeps no such counter yet, so the
app persists a launch counter). Send `scanComplete` when a scan finishes, `resultShown` when the
result reveal appears, `returnToViewfinder` when the user leaves the result for the viewfinder,
`rewardedShown` after a rewarded ad was displayed, and `interstitialShown` when an interstitial
actually appeared. Act on the decision: `preload` -> start loading; `show` -> display the loaded ad
(and ignore it if the load failed; the machine retries after `preloadTtlMs`).

Invariants (each covered by a 10,000-sequence property test in `__tests__/adCadence.test.ts`):
- never `show` when `sessionIndex` is 0 (the first session);
- `show` only on `returnToViewfinder`, and only when a `resultShown` came before it, so never on
  `appLaunch`, `sessionStart`, `scanComplete`, `resultShown` (the reveal), `rewardedShown`;
- two `scanComplete` events since the last show (since install for the first);
- at least `MIN_INTERVAL_MS` (180 s) since the last show;
- at least `REWARDED_COOLDOWN_MS` (60 s) since `rewardedShown`;
- `show` needs a `preload: true` from an earlier event, not stale; `preload` is not requested
  twice without an intervening show, `appLaunch` (the loaded ad is gone) or `PRELOAD_TTL_MS`
  (1 h, the AdMob expiry); a decision never has `preload` and `show` both true.
A backwards clock on `appLaunch` (reboot) clamps the last show and rewarded times to the new now,
so gaps can only grow. `show` also resets the counters itself; `interstitialShown` re-syncs them.

## Notification scheduler (`notify.ts`, docs/p6-brief.md section 2 and 4, D-032)
Pure and seeded (mulberry32). No clock: the caller passes `nowMs` and `utcOffsetMin` (local offset from UTC at `nowMs`).

- `nextNotification(state: NotifyState, seed) -> Notification | null` where
  `Notification = { templateId: 1..5, title, body, fireAtMs, caseId? }`. Returns the next single item to schedule.
  After scheduling, append it to `state.sent` (`sentAtMs = fireAtMs`, `opened: false`) and call again for the one after.
  `sent` items with `sentAtMs > nowMs` count as pending for the night and weekly rules. Update `opened` when a tap lands.
  Use a fresh seed per call (for example `seedFrom(installId, nowMs)`).
- `applyIntensityChange(prev, next: NotifyState, pending: PendingItem[]) -> { cancelIds, reschedule }`. A switch to Calm cancels all pending;
  otherwise items the new template set or cap no longer allow are cancelled (earliest kept first). Call it whenever intensity or the jump-scare toggle changes, then call `nextNotification` if `reschedule`.
- `NotifyState`: `intensity`, `belief` ('yes' | 'unsure' | 'no'), `jumpScaresOff`, `sessionCount` (sessions started, current included), `optedIn`,
  `installMs`, `lastAppOpenMs`, `scans: ScanSummary[]` (`caseId, atMs, tier, spi, decodedPct, decoded, declined, newClass, tags`),
  `loggedTags` (one entry per logged case), `catalogueCount` (of 24), `sent: SentItem[]`, `nowMs`, `utcOffsetMin`.
- Rules: opt-in and `sessionCount >= 2`; first delivery on a later calendar day and 20 h after install; fire time 18:00 to 21:59 local;
  one per local night; caps Brave 3, Standard 2, Calm 1 over every 7 day window; jump-scares off and two ignored in a row each drop one level (floor 1);
  no scheduling once `nowMs - lastAppOpenMs >= 7 days`, and nothing lands past that mark. Calm sends templates 2 and 5 only.
  Template 4: unresolved (41..73% decoded, not deep-scanned, not declined), case under 7 days old, once per case, not on Calm.
  Priority 2, 3, 1, 5, 4. Believers get one lore line on template 3; sceptics and "not sure" get numbers only.
- Sky: `forecastIndex(ms, utcOffsetMin)` is a port of `activityIndex` in `src/ui/boot/activity.ts` (tested equal over 1,000 timestamps) and returns `{ index, moonPct }`. Templates quote the 22:00 index of the night ("after 22:00") and, for template 1, the 03:00 index. Template 1 needs the 22:00 index at 4 (moon lift), because the 03:00 index alone is 4 on every night.
- Copy: titles open with `FIELD LOG`; no EVP text; no claim words (`CLAIM_WORDS`); tags are sanitised and dropped if they contain a banned or claim word.
