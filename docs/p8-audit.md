# P8-01 Impeccable audit and fix list

Owner: Art Director · 2026-10-14 · branch `claude/p8-polish` at 0111236 · read-only round, nothing built.

## Method and material

- Material: the committed goldens in `e2e/screenshots/golden/android-{360x800,390x844,428x926}/` (en), plus the `-de`, `-es`, `-pt` (390) and `-de-360` files. Each finding names the file it was seen in. Crops were enlarged with ffmpeg where a detail was too small to judge (EMF dial, boot trace).
- Binding specs: plan §6, `docs/instrument-bible.md`, decisions D-022, D-023, D-029, D-034, D-035, D-036, D-044.
- `inspiration/` holds only its README; no reference images. References are the bible's §10 list.
- Impeccable ran as critique plus native audit, single-context: no sub-agent tool is exposed in this session, so assessments A and B were not isolated. The source-level detector (`impeccable detect --json app src/ui`) returned `[]`; it does not parse React Native files. A scratch web export was built (`scratchpad/ad-dist`), but the in-page detector pass was not completed in this round. P8-03/P8-04 or the wave-3 panel should run it once on the export (port 4190, never 4173).
- Severity: **blocks 8** (the screen cannot reach 8 with it), **under a point** (costs less than a point on one dimension), **cosmetic**.
- Owner trees: Builder A `app/`, `src/ui/`, `src/ads/`; FX `src/fx/`; Copy `locales/`; Builder B `src/engine/`; QA `e2e/web/`; Compliance reads anything that touches disclosure or ads.
- Rubric dimensions: real equipment (REAL), tension (TEN), clarity of next action (CLR), shareability (SHR), craft (CRF), no AI tells (TELL), ad intrusiveness (AD, lower is better).

## Plan §6 drift check

| Rule | State |
|---|---|
| One instrument | Holds on boot, scan, result. Drifts on history and settings: the window widens and the LED plate and housing sticker disappear (A-01, A-02); on history the key row moves (A-60). |
| One phosphor hue | **Drifts.** The captured photo is shown in natural colour on the result and on the share card (cream bright room, amber bulb), while the viewfinder tints the same photo (A-08). Red is correct: CRITICAL only. |
| Two faces | Holds: VT323 and B612 Mono only. |
| Banned tells | Mostly clean. Web-shaped controls on the glass: DEEP SCAN outlined button (A-43), 9:16 / 1:1 format boxes (A-50), relay keyline dialog (A-80), tab underline on location chips (A-24). Middle-dot joins everywhere (A-05). `MODE 4` / `MODE 5` numbers on two screens only read as markers on a non-sequence (A-72). No gradients, no emoji, no bounce, no soft-shadow cards, not centred. |

## Global (every screen)

**A-01** · all widths, history and settings · The window widens and the LED plate vanishes on history and settings, so the hardware changes shape between modes. · REAL · under a point · Bolt the LED plate on every screen (power LED only outside scan and result) and keep the window at bible geometry everywhere. · Builder A (`src/ui/screens/Housing.tsx`) · **fix-now**: one device, cheap.

**A-02** · all widths, history and settings · The housing calibration sticker is missing on history and settings (bible §2: it stays for the life of the install). · REAL · cosmetic · Render the housing sticker on every screen after first ACK. · Builder A · **fix-now**.

**A-03** (D-022 boot "blank engraved dummies") · all screens · Unused keys carry a centred dot glyph that reads as an icon placeholder. · TELL · cosmetic · Blank moulded caps: no glyph, a 1 px recess ring in `n2`, not focusable, no accessibility label. · Builder A · **fix-now**.

**A-04** (D-022 viewfinder "dummy keys with in-fiction legends") · all screens · Legends on dead keys. · CLR · n/a · Not built. · Builder A · **rule-out**: legends promise functions that do not exist, cost clarity of the next action and add four locales of copy. A-03 covers the look.

**A-05** · all, strongest in the result strip and history rows · Meta strings joined with ` · ` are a known generator tell and not how a 1987 data back prints. · TELL · cosmetic · Use fixed columns with two spaces in the result strip, history rows and mode legends; keep the dot only in the firmware line where the bible writes it. · Copy + Builder A · **fix-now**.

**A-06** · 428 · Type does not scale with width (bible §5 says linear); readouts sit at 390 sizes. · CRF · cosmetic · Amend the bible: type stays fixed in dp, extra width goes to the photo window. · Art Director (bible) · **rule-out**: +10% is not visible as a defect, and P8-04 font scaling to 1.3 would compound it.

**A-07** · 360 all screens · Nameplate serial truncates to `00417-9`, losing the authority cue. · REAL · cosmetic · Set plate text at 11 px with 0.4 tracking at 360 so the full `FS4-8711-00417-9` fits. · Builder A · **fix-now**.

**A-08** · result-active-bright, all result goldens, share-story(-es/-de/-pt), share-square · The photo shows in natural colour on the result and card, a second hue on the glass, and the photo changes colour between viewfinder and result. · REAL, TELL · **blocks 8** on result-bright and the share cards · Apply the viewfinder's FeedTint duotone (n0 to p5, 35% mix, highlight knee at 0.7) to the result photo and the card photo, after compositing and before grain; measure the ghost clamp after the tint. · FX (`src/fx/glass/feed.ts`, compositor) · **fix-now**; believability re-judged in P8-07 on real photos.

## Boot and boot-calib

**A-10** (D-022 "sticker onto the housing on the first stage too") · boot · The housing sticker is absent while the full disclosure sticker is on the glass. · REAL · n/a · Not built. · **rule-out**: two copies of the disclosure at once duplicate it; the sticker appearing on the housing after ACK reads as the label being applied.

**A-11** (D-022 "visible transient spike with afterglow") · boot, all widths and locales · The glass says `TRANSIENT 1 · LOGGED` but the trace is flat. · TEN, REAL · under a point · One 2-division spike at about 60% of the sweep with the τ 180 ms afterglow tail, frozen in static mode for the golden. · FX (`src/fx/scope`) · **fix-now**.

**A-12** (D-022 "ACT IDX bloom halo") · boot, boot-calib · `ACT IDX 3/5` sits at p5 with bloom and outranks `SELFTEST OK`; p5 is brief use only. · CRF · cosmetic · Line at p4; only the value peaks at p5 for 400 ms, then decays. · Builder A (`src/ui/boot`) · **fix-now**.

**A-13** (D-022 "boot-calib dead band") · boot-calib all widths, worst at 428 · A flat-trace graticule fills about 55% of the glass while the question is the job; SKIP is a floating text link while key 4 is empty. · CLR · under a point · On calib the graticule keeps 4 divisions of height; the question block moves up under ACT IDX; SKIP becomes key 4. · Builder A · **fix-now**.

**A-14** · boot-calib-de-360 · SKIP is localised as `WEITER` (continue), which changes its meaning. · CLR · cosmetic · Copy picks a key-width word that means skip. · Copy · **fix-now**.

## Viewfinder

**A-20** (D-022 "feed tint under 25% on bright scenes") · viewfinder-bright · The bright feed washes pale, a warm lamp patch leaks a second hue, and `IDX 3/5` loses contrast. · REAL, CRF · under a point · Tint mix to 35% with highlight compression; top strip on a 60% n0 scrim. · FX (`src/fx/glass/feed.ts`) · **fix-now** (same change as A-08).

**A-21** (D-022 "GEO arc visible at 390, label off the needle path") · viewfinder 360/390/428 · The GEO band is a faint short p2 dash and its label sits on the 10 to 20 mG side, far from the band; `1000` and `2000` crowd each other. · REAL, CRF · under a point · Arc 3 px at p2 on the inner edge from 250 to 650 mG; GEO label inside the arc at its midpoint, clear of the needle's 200 to 1000 path; push `2000` outward. · Builder A (`src/ui/viewfinder/EmfDial.tsx`, `dialLabels`) · **fix-now**.

**A-22** (D-022 "scope ring dimmer or tick-marked") · viewfinder · The plain ring reads as decoration. · TELL · cosmetic · 12 ticks at 30°, 4 px, p2; drop the inner ring. · Builder A (`src/ui/viewfinder/Sweep.tsx`) · **fix-now**.

**A-23** (D-022 "countdown in the top strip") · viewfinder · The 03:00 countdown shown at boot is gone once you aim. · TEN · under a point · Right-align `03:00 IN 4 H 12` in the top strip beside IDX. · Builder A + Copy · **fix-now**.

**A-24** · viewfinder, relay-module · Location chips use a web tab underline. · TELL · cosmetic · Selected chip in inverse video (p4 block, n0 text), others p3. · Builder A · **fix-now**.

**A-25** · viewfinder 360 vs 390 · Chip vocabulary changes with width (`HALLWAY`/`OUTDOORS` at 390, `HALL`/`OUTSIDE` at 360). · CLR · cosmetic · One short set at every width. · Copy · **fix-now**.

**A-26** · viewfinder 360, viewfinder-de-360 · `GEO +11% ΔT-0.7°C` drops the spaces, which breaks the bible's unit format. · CRF · cosmetic · Put ΔT on its own line at 360. · Builder A · **fix-now**.

**A-27** · viewfinder (2/5) vs boot (3/5) vs viewfinder-de (3/5) · The index differs between goldens because the harness clock is not pinned per capture. · CRF · cosmetic · Pin `date` and `time` in every capture that shows IDX. · QA (`e2e/web`) · **fix-now**.

## Scan (phase 2, hold, fault)

**A-30** (D-022 "keep the last ΔT during the fault and dim held lines to p2") · scan-fault · The ΔT block vanishes during a fault and leaves a hole. · TEN, CRF · under a point · Hold the last ΔT with a `HOLD` tag; dim held lines p4 to **p3**, not p2 (bible §4 bans text in p0 to p2, so the D-022 wording is amended). · Builder A (`src/ui/scan`) · **fix-now**.

**A-31** (D-022 "keep the percentage") · scan-hold · The hold phase swaps `43%` for a lit block. · CLR · cosmetic · Show `100%`, then `HOLD`. · Builder A · **fix-now**.

**A-32** (D-022 "steeper persistence decay with a brighter leading edge") · scan-phase2, scan-hold · The sweep tail is a wide flat green wash that reads as a gradient fill (bible: the trace never has a fill). · CRF, TELL · under a point · A 1 px p5 head, then an exponential tail through p3, p2, p1 within about 60 px (τ 450 ms). · FX (`src/fx/scope`) · **fix-now**.

**A-33** (D-022 "tighter readout columns") · scan-phase2/hold, all widths · `ΔT` and its value sit about 100 px apart, with a dead band above. · CRF · cosmetic · Value right-aligned in a fixed field 64 px after the label, unit at rdXS; close the gap above. · Builder A · **fix-now**.

## Result (active, deep-scan locked/offline/unlocked, share offer, format, thermal)

**A-40** (D-022 "THERM labelled as ambient") · result-active, -deepscan-unlocked, -critical (+de/es/pt) · `THERM -4.4`, `COLD SPOT ΔT -5.5` and the strip ΔT read as three unnamed versions of one quantity. · CLR · under a point · Row label `ΔT AVG`, cold spot `ΔT MIN`; the strip carries ΔT MIN. · Copy + Builder A · **fix-now**.

**A-41** (D-022 "strip contrast") · result-active-bright · On bright photos the top-left CASE label is unreadable and the strip is thin. · CRF · under a point · Strip scrim driven by the card's 5:1 contrast target (`MARK_CONTRAST_TARGET`), not a fixed alpha. · Builder A · **fix-now**.

**A-42** (D-022 "drop the duplicate CASE band") · all result goldens · `CASE 0007` prints top-left on the photo and again in the strip (and a third time in the share offer). · CRF · cosmetic · Remove the top-left label. · Builder A · **fix-now**.

**A-43** · result-active, -critical, -deepscan-locked/offline, all widths and locales · DEEP SCAN is an outlined, centred software button on the glass while key 4 sits empty on every result; it is the one web-shaped control on the device. · REAL, CLR · under a point on three dimensions · DEEP SCAN becomes hardware key 4 (legend states WARMING / OFFLINE as today); `SPONSORED VIDEO PLAYS FIRST` prints right-aligned on the glass directly above key 4; the decode bar closes the glass. · Builder A; **Compliance re-reads** the rewarded disclosure adjacency · **fix-now**.

**A-44** (D-023 "decode bar gap above the DEEP SCAN copy") · result-active · Gap between the bar and the button. · CRF · cosmetic · Solved by A-43. · Builder A · **fix-now** (via A-43).

**A-45** (D-023 "QUIET dead panel and the empty fourth slot") · result-quiet · On the black fixture the photo window is empty n0 with the VELDEN burn-in legible, which reads as broken, not quiet; key 4 is empty. · REAL, TEN · under a point · Auto-gain near-black photos (lift to about p1 mean, heavier grain, strip notes `GAIN +18 dB`); key 4 on QUIET is `LOG`. · FX (compositor) + Builder A · **fix-now**.

**A-46** (D-023 "thermal cold spot as a figure-height column") · result-therm-critical · The crosshair sits on nothing; no cold spot is visible. · REAL · under a point (thermal) · Cold spot as a figure-height p0 to p1 column under the crosshair. · FX (`src/fx/thermal`) · **fix-now**.

**A-47** (D-023 "CRITICAL distinct from STRONG at phone size") · result-critical vs -strong · The doubled CRITICAL figure is invisible at 390. · TEN · under a point · Second copy offset from 6 to about 14 px with alpha up within the 25% ceiling. · FX · **fix-now** for the offset; full judgement stays in P8-07.

**A-48** · result-therm-critical · The scale bar is about 28 px wide with labels inside; the bible says 10 × 220 with labels outside. · REAL · cosmetic · Bible geometry. · FX (`src/fx/thermal`) · **fix-now**.

**A-49** (D-036 "THERM inert during share") · result-share-format · THERM stays live in format mode. · CLR · cosmetic · THERM goes dark like SHARE. · Builder A · **fix-now**.

**A-50** (D-035 "format keys on the hardware row") · result-share-format · `9:16` and `1:1` are outlined boxes on the glass. · REAL, CLR · under a point · Keys read CANCEL / 9:16 STORY / 1:1 SQUARE / dark; the glass keeps only `Print field card. Format?`. · Builder A · **fix-now**.

**A-51** · result-share-offer (+de/es/pt) · The offer is one body line with a dead band where DEEP SCAN was. · SHR · cosmetic · After A-43 the line reads `Field card ready. SHARE prints it.` at rdS p4. · Copy · **fix-now**.

**A-52** · result-deepscan-unlocked-de-360 · `ENTITÄTSPROFIL` collides with the rule above; `SIMULIERT` and the behaviour line touch the window edge. · CRF · cosmetic · 4 px clear above section labels; 8 px right padding on the strip and profile values at 360. · Builder A · **fix-now**.

**A-53** · result-share-offer-pt, boot-pt · The housing sticker text runs to the sticker edge. · CRF · cosmetic · Sticker padding 4 px; Copy shortens if still tight. · Builder A + Copy · **fix-now**.

**A-54** · result-active (all) · The figure reads as a pale cut-out blob on the synthetic cellar. · REAL · blocks 8 on believability · Not in this round. · **rule-out** here: P8-07, owner-blocked on real photographs (D-023).

## History (3 tags, empty)

**A-60** · history-3tags, history-empty, all widths and locales · The key row sits higher than on every other screen, with an empty housing band and a hairline seam below it (the banner slot, empty on web and before consent). Keys are hardware and must not move. · REAL · under a point · Keep the key row at its standard position; put the banner slot between the window bottom and the key row with at least 24 dp to the keys, and let the window shorten; the empty slot is plain housing paint with no seam. · Builder A (`app/history.tsx`, `src/ads/Banner*.tsx`); **Compliance** signs off the placement · **fix-now**.

**A-61** (D-029 "banner list clauses untestable until the log lands; re-run the 24 dp spec") · history · The log exists now. · AD · n/a · Re-run the 24 dp spec against A-60's layout with a populated log. · QA (`e2e/web/banner.spec.ts`) · **fix-now**.

**A-62** (D-029 "history key legend wraps as SETTING S at 360") · history-3tags 360, -de-360 · The key now reads `SETUP` on one line. · n/a · Already resolved. · **rule-out**: done in P6/P7, verified in both 360 goldens.

**A-63** (D-029 "copy lives in code until P7") · n/a · Resolved by P7's `locales/`. · **rule-out**: done.

**A-64** · history-3tags · With cases logged there is no key back to the viewfinder (VIEWFINDER exists only in the empty state). · CLR · under a point · VIEWFINDER in slot 1 always. · Builder A · **fix-now**.

**A-65** · history-3tags 390 · The scroll viewport cuts a catalogue row in half above the mode legend. · CRF · cosmetic · Snap the viewport height to the row pitch. · Builder A · **fix-now**.

**A-66** (D-036 Refuter design question) · history-empty · The moon table shows `3/5` on all seven nights, which reads as fake. · CRF · cosmetic · Drop the IDX column; keep moon % and mark the full-moon row in p4. · Builder A · **fix-now**.

## Settings

**A-70** · settings (+de/es/pt, -de-360) · The lower 40% of the glass is dead. · REAL · cosmetic · Add a UNIT block from existing strings: model, serial, FW, CAL, DUE, PRÜF. · Builder A + Copy · **fix-now**.

**A-71** (D-036 "settings help line with the intensity link") · settings · The relay help line does not say that intensity changes how often lines arrive. · CLR · cosmetic · `Max 1 line a night. 18:00 to 22:00. CALM sends fewer.`, after Builder B confirms the engine does this. · Copy · **fix-now**.

**A-72** · history, settings · `MODE 4` / `MODE 5` appear on two screens only, so the number reads as a marker on a non-sequence. · TELL · cosmetic · Drop the number; keep `HISTORY` / `SETTINGS` as the bottom-left legend. · Copy + Builder A · **fix-now**.

## Relay module

**A-80** (D-035 "module keyline") · relay-module, -de/-es/-pt, -de-360 · A 1 px p3 box over the feed reads as a web dialog and hides a corner bracket. · TELL, REAL · under a point · No keyline: a full-width n0 band at 85%, a p1 top rule, title rdS p4, body p3; corner brackets stay visible. · Builder A (`src/ui/relay`) · **fix-now**.

**A-81** (D-036 "dimmed chips") · relay-module · Chips behind the module at full brightness. · n/a · Not built. · **rule-out**: D-035 keeps chips and CAPTURE live; dimming would signal disabled, and text under p3 breaks the bible.

**A-82** (D-036 "catalogue in the opt-in body") · relay-module · The body lists index, moon and open case, but template 5 also sends catalogue lines. · CLR (honesty) · under a point · `Index, moon, an open case or the catalogue.` · Copy; **Compliance re-reads** · **fix-now**.

**A-83** (D-035 "two-night spacing between templates") · engine · Lines can arrive on consecutive nights. · TEN (fatigue) · cosmetic · No line on the night after a sent line, with a unit test that fails when the gap is removed; "at most one a night" stays true. · Builder B (`src/engine/notify.ts`) · **fix-now**.

**A-84** (D-036 "template 4 with tag and clock") · notifications · Template 4 lacks the location tag and HH:MM. · CLR · cosmetic · Add both. · Builder B + Copy · **fix-now**.

## Share card (story, square)

**A-90** (D-035 "card strip order") · share-story, share-square · SPI repeats in the strip and the reading row. · CRF · cosmetic · Data-back order: `22:48  2026-10-13` / `CASE 0004  ΔT -9.9 °C` / `SIMULATED`; SPI only in the reading row; mark size unchanged. · FX (`src/fx/share`) · **fix-now**.

**A-91** (D-035 "footer size") · share-story (+de/es/pt) · The footer is two centred lines. · CRF · cosmetic · One left-aligned run at the mark's floor size; two left-aligned lines only where a locale overflows. · FX; **Compliance re-reads** · **fix-now**.

**A-92** (D-035 "housing plate") · share-story · The top band shows an unexplained grille glyph; the bands carry none of the bible's details. · REAL · cosmetic · Miniature calibration sticker (CAL, PRÜF, no serial) rotated -1.5° in the top band; engraved `FIELD SPECTROMETER  MADE IN W.-GERMANY` on the bottom band. · FX · **fix-now**.

**A-93** (D-034 "LED plate on the square card") · share-square, share-story · No LED ladder, the one device part that reads at thumbnail size. · SHR · under a point · 5-LED plate on the right band lit to the tier (red LED 5 on CRITICAL only). · FX · **fix-now**.

**A-94** (D-034 "print time gate at phone check 3") · device · Needs a phone. · **rule-out** here: goes on the P8-08 phone check 3 list (over 1.5 s: cut card grain first).

**A-95** (D-034 "re-encode at quality 70") · share cards · The figure has not been checked after platform re-encoding. · SHR · cosmetic · L2 test: JPEG q70 re-encode, SSIM of the figure box at 0.9 or more. · FX + QA evidence · **fix-now**.

**A-96** (D-034 "fixed per-install time vs the user's median open time") · relay · **rule-out**: needs analytics data (P10), and behavioural timing would need a fresh Compliance review; the seeded minute stays.

**A-97** · share-story · SPI and tier sit near 63 px on the 1080 card; D-034 b asked about 96 px. · SHR · under a point · Reading row type to about 96 px; the EVP line stays at 44 px or more. · FX · **fix-now**.

**A-98** · share-story, share-story-es (360 preview) · A dark jagged fringe shows under the figure's hem, like the D-023 (a) regression. · TELL · cosmetic · Check at full resolution; if present, the hem dissolve wins over the occluder. · FX · **fix-now**.

**A-99** · all cards · `[STORE NAME]` placeholder. · **rule-out**: Gate 1, owner-blocked.

## Carried leftovers index (P8-02 answers)

| Source | Leftover | Id | Tag |
|---|---|---|---|
| D-022 boot | sticker on housing at first stage | A-10 | rule-out |
| D-022 boot | transient spike with afterglow | A-11 | fix-now |
| D-022 boot | blank engraved dummies | A-03 | fix-now |
| D-022 boot | boot-calib dead band | A-13 | fix-now |
| D-022 boot | ACT IDX bloom halo | A-12 | fix-now |
| D-022 viewfinder | feed tint on bright scenes | A-20 (A-08) | fix-now |
| D-022 viewfinder | GEO arc and label | A-21 | fix-now |
| D-022 viewfinder | scope ring | A-22 | fix-now |
| D-022 viewfinder | countdown in top strip | A-23 | fix-now |
| D-022 viewfinder | dummy keys with legends | A-04 | rule-out |
| D-022 scan | last ΔT during fault, dim held lines | A-30 | fix-now (p3, not p2) |
| D-022 scan | keep the percentage | A-31 | fix-now |
| D-022 scan | persistence decay, bright leading edge | A-32 | fix-now |
| D-022 scan | tighter readout columns | A-33 | fix-now |
| D-022 result | THERM as ambient | A-40 | fix-now |
| D-022 result | strip contrast | A-41 | fix-now |
| D-022 result | duplicate CASE band | A-42 | fix-now |
| D-023 result | decode bar gap | A-44 | fix-now (via A-43) |
| D-023 result | QUIET dead panel, empty fourth slot | A-45 | fix-now |
| D-023 result | thermal cold spot column | A-46 | fix-now |
| D-023 result | CRITICAL vs STRONG | A-47 | fix-now |
| D-029 | SETTING S wrap at 360 | A-62 | rule-out (done) |
| D-029 | banner 24 dp spec with the log | A-61 | fix-now |
| D-029 | copy in code until P7 | A-63 | rule-out (done) |
| D-034 | print time gate | A-94 | rule-out (phone list) |
| D-034 | re-encode q70 | A-95 | fix-now |
| D-034 | LED plate on square card | A-93 | fix-now |
| D-034 | per-install time vs median open | A-96 | rule-out |
| D-035 | card strip order | A-90 | fix-now |
| D-035 | footer size | A-91 | fix-now |
| D-035 | housing plate | A-92 | fix-now |
| D-035 | format keys on hardware row | A-50 | fix-now |
| D-035 | module keyline | A-80 | fix-now |
| D-035 | two-night spacing | A-83 | fix-now |
| D-036 | settings help line, intensity | A-71 | fix-now |
| D-036 | dimmed chips | A-81 | rule-out |
| D-036 | THERM inert during share | A-49 | fix-now |
| D-036 | template 4 tag and clock | A-84 | fix-now |
| D-036 | "catalogue" in opt-in body | A-82 | fix-now |

Totals: 65 findings, **55 fix-now**, **10 rule-out** (A-04, A-06, A-10, A-54, A-62, A-63, A-81, A-94, A-96, A-99). The share-card tolerance change below is one more fix-now for QA.

## Share-card golden tolerance (D-044)

Today `share.spec.ts` screenshots the card scaled into a 360 × 640 element (story) or 360 × 360 (square) and allows 400 differing pixels. The downscale is 3× per axis, so every card pixel change shrinks about 9× in area, and antialiasing then pushes small glyph edits under the per-pixel threshold. That is how a whole English class line passed (D-044). 400 px is 0.17% of the story preview, which is more than one whole line of the card's smallest text after scaling.

Proposal:
1. **Compare the full-resolution PNG, not the preview.** The spec already holds the data URL: decode it to a Buffer and `expect(buffer).toMatchSnapshot('share-story.full.png', { maxDiffPixels, threshold: 0.1 })`. CanvasKit renders on the CPU in the pinned CI image, so the noise floor should be close to 0.
2. **Tolerance from the smallest meaningful change.** The smallest text on the card (class line and footer, about 30 px cap at 1080) changes about 250 to 300 px per glyph. The cap must sit well below that: **`maxDiffPixels: 100`** at full resolution (0.005% of 2.07 Mpx), after QA measures the floor over 5 CI runs. If the floor is above 30 px, find the source of non-determinism (seeded grain, font hinting) before raising the cap.
3. **Repo weight.** Six full PNGs at 1080 × 1920 cost roughly 12 to 18 MB. If that is too much, compare full-resolution **crops** of the text bands only (plate, the strip box, reading row plus footer: story y 1540 to 1920) at `maxDiffPixels: 60`, and keep the preview compare as a layout smoke at `maxDiffPixels: 150`, in line with the other screen goldens.
4. The P6-01 mark-size and contrast checks already read rendered pixels and stay as they are.

Owner: QA (`e2e/web/share.spec.ts`). Tag: **fix-now**.

## Scores (current estimate, from the goldens)

Scale 1 to 10. AD is lower-is-better. SHR is n/a on surfaces that are not shared. Mean excludes AD.

| Screen | REAL | TEN | CLR | SHR | CRF | TELL | AD | Mean | Reason in one line |
|---|---|---|---|---|---|---|---|---|---|
| Boot | 8 | 6 | 8 | n/a | 7 | 8 | 1 | 7.4 | Strong device read; flat trace contradicts TRANSIENT, ACT IDX shouts |
| Boot-calib | 8 | 6 | 7 | n/a | 7 | 7 | 1 | 7.0 | Dead graticule takes the glass; SKIP is a text link |
| Viewfinder | 8 | 7 | 8 | n/a | 7 | 7 | 1 | 7.4 | Good dial and sweep; tab underline, faint GEO band, washed bright feed |
| Scan (phase 2, hold) | 8 | 8 | 8 | n/a | 7 | 7 | 1 | 7.6 | Best screen; sweep wash and loose columns; fault drops ΔT |
| Result active / locked | 7 | 7 | 7 | 7 | 7 | 7 | 2 | 7.0 | On-glass DEEP SCAN button, three unnamed temperatures, natural-colour photo |
| Result deep-scan unlocked | 7 | 6 | 8 | 8 | 7 | 7 | 1 | 7.2 | Payoff reads; same strip and photo issues |
| Result share offer / format | 7 | 6 | 6 | 7 | 6 | 6 | 1 | 6.3 | Format boxes on the glass, THERM live, dead band |
| History (3 tags) | 6 | 5 | 6 | n/a | 7 | 8 | 3 | 6.4 | Key row moves, empty band, no way back to the viewfinder |
| Settings | 6 | n/a | 8 | n/a | 7 | 8 | 1 | 7.3 | Clear but a software list with a dead half; device parts missing |
| Relay module | 7 | 5 | 8 | n/a | 6 | 6 | 1 | 6.4 | Keyline dialog over the feed; honest copy |
| Share card story | 7 | 7 | 8 | 8 | 7 | 7 | 1 | 7.3 | Strong photo and mark; amber second hue, small reading row |
| Share card square | 7 | 7 | 8 | 7 | 7 | 7 | 1 | 7.2 | No LED plate, SPI duplicated, natural-colour photo |

Every screen is estimated under 8. Lowest: share offer/format 6.3, history 6.4, relay module 6.4.

## The ten fixes that move scores most

1. **A-43** DEEP SCAN onto hardware key 4, with the sublabel on the glass above it (result: REAL, CLR, TELL). Builder A; Compliance re-reads.
2. **A-08 + A-20** One phosphor hue on every photo: the viewfinder tint on the result and the card (result, cards, viewfinder-bright). FX.
3. **A-60 + A-64** History key row fixed in place, banner slot between window and keys, VIEWFINDER key always in slot 1 (history: REAL, CLR). Builder A; Compliance; QA A-61.
4. **A-01 + A-02 + A-03** One housing everywhere: LED plate, window geometry, sticker, blank dummy caps (history, settings, all). Builder A.
5. **A-50 + A-49** Format keys on the hardware row, THERM dark (share flow). Builder A.
6. **A-80** Relay module as a screen message, not a keyline dialog (relay: TELL, REAL). Builder A.
7. **A-40 + A-42 + A-41** Name the temperatures, drop the duplicate CASE, contrast-driven strip scrim (result: CLR, CRF). Builder A + Copy.
8. **A-32 + A-11** Scope persistence with a bright head and no wash; a visible boot transient (scan, boot: CRF, TEN). FX.
9. **A-93 + A-97 + A-90** LED plate on both cards, reading row near 96 px, data-back strip order (cards: SHR). FX.
10. **A-13 + A-12** Boot-calib layout with SKIP as key 4, ACT IDX at p4 (boot-calib: CLR). Builder A.

Projected after these ten: scan, viewfinder, boot, result and both cards at 8 or above; history, relay module and the share flow near 8, confirmed only by the wave-3 panel on fresh goldens. Result believability (A-54) stays capped until P8-07 gets real photographs.
