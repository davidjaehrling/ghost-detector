# Instrument Bible: Velden FS-4

Owner: Art Director · 2026-10-13 · Deliverable P1-02 · Binding inputs: `docs/MASTER-PLAN.md` §1, §6, §7; `docs/psych-brief.md`; `docs/research/2026-10-research-digest.md` §3, §5.

This is the spec sheet for the one instrument the app copies. Every screen is a view of this device. If a design choice cannot be justified by the device, it does not ship. The manufacturer and model below are the instrument's identity inside the fiction; the app's store name is picked separately at Gate 1.

Inspiration folder at time of writing: `inspiration/README.md` only, no reference images. References in §10 come from the plan and the digest. Re-check this bible when David adds images.

## 1. The device

| Field | Value |
|---|---|
| Manufacturer | Velden Messtechnik GmbH |
| Origin | Wetzlar, plate reads `MADE IN W.-GERMANY` |
| Model | FS-4 Feldsonde (field probe), sales name `FS-4 FIELD SPECTROMETER` |
| Model number | `FS-4/87`, variant `FS-4/87-P` (P = Parapsychologie conversion) |
| Production run | 1986 to 1989, 4,800 units |
| Serial scheme | `FS4-YYWW-NNNNN-C`: build year and week (8601 to 8952), unit number 00001 to 04800, Luhn check digit. Seeded once per install, e.g. `FS4-8711-00417-9` |
| Firmware string | `FW 3.1.7 · ROM C2-8811 · SELFTEST OK` (boot line) |
| Calibration | `CAL 2026-10-13 · DUE 2027-10 · PRÜF 07`: CAL is the install date, DUE is 12 months later, PRÜF is the inspector stamp 01 to 12 seeded per install |
| Sticker format | Paper label 64 × 30 px at 390 width, off-white, black ink, ISO dates, one rubber-stamp inspector number in a 14 px circle |

Backstory, ten lines:
1. Velden built survey instruments for West German utilities: fluxgate meters for power-line and transformer surveys.
2. After 1986, demand for portable field gear rose and Velden released the FS-4, a combined flux, thermal and acoustic logger.
3. It used a surplus 3-inch P1 phosphor oscilloscope tube because it was cheap and readable in sunlight.
4. The housing is painted cast aluminium with rubber keys, so linemen could use it in gloves.
5. In 1987 a private research society in Freiburg ordered 60 units converted for haunting surveys.
6. The conversion added a composite readout, the Spectral Presence Index (SPI), weighting flux anomalies, cold gradients and infrasound.
7. Conversion units got a second nameplate, a 5-LED ladder bolted beside the tube and a hand-stamped fault card.
8. The society folded in 1991; the units went to collectors and field crews with their calibration stickers still on.
9. What it measures in-fiction: flux density in mG, thermal gradient ΔT in °C, dominant frequency in Hz and level in dBFS, and SPI from 0 to 100.
10. It looks the way it does because every part was the cheapest robust option in 1987; nothing on it is decorative.

## 2. Physical form on a phone

Frame at 390 × 844 (scale linearly for 360 and 428):
- Housing fills the whole screen behind the status bar. Colour `n3` with a 1 px `n4` top-edge highlight and a 2 px `n1` bottom shadow line. No gradients beyond a 6% lightness falloff toward the corners (cast metal, lit from above).
- Nameplate: riveted aluminium strip, 358 × 28 px, top of the housing, 16 px side gutter. Fill `n5`, engraved text `n2`, two 4 px rivets at 8 px from each end. Text: `VELDEN  FS-4/87-P` left, serial right.
- Screen window: one rounded rectangle, 362 × 420 px on the main views, corner radius 18 px, inset 14 px from the housing edge. The glass shows 2 px of `n1` inner shadow on the top and left (the tube sits recessed), plus a barrel curvature of 1.5% applied by the CRT shader.
- Fasteners: four Phillips screws on the bezel at the window's corners, 10 px heads, slots rotated to fixed seeded angles (never all aligned). One screw per install is seeded as slightly burred: a 1 px brighter notch.
- LED ladder plate: bolted to the right of the window on the scan and result views, see §3.
- Key row: rubber keys 72 × 44 px, radius 6 px, legend in B612 Mono caps, 88 px band at the bottom above the gesture area. Keys are Pressable views on a Skia-drawn key face.
- Calibration sticker: bottom-left of the housing, rotated -1.5°, one corner lifted 2 px with a shadow.
- Wear: paint rubbed through to `n4` on both long edges where thumbs grip (two 40 to 70 px streaks, seeded), legend on the most-used key 15% fainter, a 6 px scuff on the nameplate. Wear is fixed per install and never changes during use.

Drawn in Skia: housing, bezel, screws, nameplate, sticker, screen glass, graticule, needle, LED ladder, scale bars, all phosphor text inside the screen, and every effect in §6. One Canvas per screen, one shader stack for the glass.

Plain React Native views: key hit areas (Pressable with `accessibilityRole="button"` and a label), settings rows, consent and legal text, the history list, and any text a screen reader must reach. Text inside the glass is Skia, so its container carries an `accessibilityLabel` with the current reading.

## 3. Readouts and units

| Readout | Unit | Range | Resolution | Format |
|---|---|---|---|---|
| Flux density | mG | 0 to 2000, pegs at 2000 | 1 mG below 1000, 10 mG above | `482 mG` |
| Thermal gradient | ΔT °C | -12.0 to +6.0 | 0.1 °C | `-4.7 °C` |
| Dominant frequency | Hz | 18 to 22000 | 1 Hz below 1 kHz, then `4.3k` | `214 Hz` |
| Audio level | dBFS | -60 to 0 | 1 dB | `-38 dBFS` |
| Spectral presence | SPI | 0 to 100 | 1 | `84 STRONG` |

Flux uses the real magnetometer (1 µT = 10 mG). Earth's field reads 250 to 650 mG. Minus signs are ASCII hyphen-minus in both faces. VT323 coverage of `Δ` is unverified [U]; Builder A checks on first render and falls back to `dT` if the glyph is missing.

SPI tiers (from `docs/psych-brief.md` §2.4):

| Tier | Range | LEDs lit | Colour |
|---|---|---|---|
| QUIET | 0 to 19 | 1 (power) | `p3` |
| TRACE | 20 to 44 | 2 | `p3`, `p4` |
| ACTIVE | 45 to 69 | 3 | `p3`, `p4`, `p4` |
| STRONG | 70 to 89 | 4 | `p3`, `p4`, `p4`, `p5` |
| CRITICAL | 90 to 100 | 5 | first four as STRONG, fifth `red` |

Tick spacing rules (nothing is evenly spaced unless the quantity is linear):
- Flux gauge: 100° arc, logarithmic. Major ticks at 10, 20, 50, 100, 200, 500, 1000, 2000 mG; minor ticks at 2 to 9 of each decade. Major 9 px long, 1.5 px; minor 5 px, 1 px. Labels only on 10, 100, 1000 and 2000.
- Earth band: a 2 px `p1` arc from 250 to 650 mG on the inner edge of the gauge, labelled `GEO`.
- SPI bar: linear 0 to 100, with tier boundaries at 20, 45, 70 and 90 drawn as major ticks. The ticks are uneven because the tiers are. Minor ticks every 5.
- ΔT scale: piecewise linear, 1 °C per minor tick from -4 to +2, 2 °C per minor tick outside that band. The scale compresses at the ends like a hand-ruled card.
- Frequency axis on the spectrum view: log, decades at 20, 200, 2k, 20k Hz, 1-2-5 minors.

Oscilloscope graticule (scan theatre and spectrum view):
- 10 horizontal divisions by 8 vertical divisions, 34 px per division, 340 × 272 px, centred in the window horizontally and top-aligned 24 px below the window edge.
- Grid lines 1 px `p1` at 60% alpha, dotted 1 on 3 px. Centre axes solid 1 px `p1`, with 5 minor ticks per division, 4 px long.
- Corner text sits outside the grid: timebase bottom-left (`50 ms/DIV`), sensitivity bottom-right (`10 mG/DIV`), trigger top-right (`TRIG AUTO`).
- The trace is 1.5 px `p4` with persistence (§6). It never has a fill underneath.

K-II style LED ladder:
- 5 round LEDs, 12 px diameter, 22 px centre spacing, vertical, bottom to top, on a 28 × 132 px plate with two screws.
- LED 1 is always lit while the device is on (power, like the K-II).
- Lit LEDs differ by brightness, never hue: `p3`, `p4`, `p4`, `p5`. LED 5 is the only coloured part of the device: `red`, lit for CRITICAL only.
- Unlit LEDs: lens `n2` with a 1 px `n4` specular dot at 10 o'clock. Lit LEDs add a 6 px bloom at 35% alpha.
- Live mode: the ladder follows the flux deviation from the GEO band. LED 5 never lights in live mode, only on a CRITICAL result.

FLIR-style scale bar (thermal view):
- Vertical bar on the right edge of the thermal image, 10 × 220 px, with 1 px `n4` keyline.
- Palette `PH-WHT` (phosphor white-hot): coldest `p0`, then `p1` to `p5` for the warmest. The ironbow palette in the digest is not used; it would add five hues.
- Max temperature label at the top, min at the bottom, both in `p4` VT323 16 px. A 6 px triangle pointer on the left edge marks the cold-spot value.
- Centre crosshair 15 px with a spot readout box (`SP1 -5.9 °C`) top-left of the image, palette name bottom-left.

## 4. Colour

One phosphor hue, a P1-type yellow-green near 135°. Hierarchy comes from these six steps only.

| Token | Hex | Contrast on `n0` | Use |
|---|---|---|---|
| `p0` | `#0F2416` | 1.18 | Burn-in ghosts, coldest thermal, unlit segments. Never text |
| `p1` | `#1C4A2A` | 1.90 | Graticule, GEO band, dim persistence tail. Never text |
| `p2` | `#2F7A45` | 3.67 | Minor ticks, disabled marks, persistence mid-tail. Never text |
| `p3` | `#4FB46A` | 7.43 | Labels, units, secondary readouts |
| `p4` | `#7CE895` | 12.74 | Primary readouts, trace, needle |
| `p5` | `#D4FFDC` | 17.62 | Peak values, beam head, bloom core. Brief use only |

Persistence: anything that moves on the glass leaves a trail. The trail starts at the element's step and decays one step down per persistence interval (§6) until `p0`, then fades out. A bright element never decays faster than a dim one.

Tinted neutrals (olive grey of the housing paint and the tube's dark glass):

| Token | Hex | Use |
|---|---|---|
| `n0` | `#0A0F0B` | Screen glass, darkest surface in the app |
| `n1` | `#121712` | Shadows, recesses, inner glass shadow |
| `n2` | `#1E221C` | Unlit LED lens, engraved text, key face shadow |
| `n3` | `#2E3229` | Housing and bezel paint |
| `n4` | `#4A4D42` | Edge highlights, worn paint, keylines |
| `n5` | `#8A8B7C` | Nameplate aluminium |
| `n6` | `#C9C7B6` | Body text on `n1`, key legends on rubber |
| `paper` | `#E8E2C8` | Calibration sticker and fault card paper |
| `ink` | `#23211A` | Sticker and fault card print |

Semantic red: `red` `#FF4A3A`. Used for CRITICAL only: LED 5, the tier word `CRITICAL`, and the SPI bar segment above 90. No red for errors, fault codes, delete buttons or warnings. Faults use `p5` and blinking.

Contrast checks (WCAG 2.x relative luminance, computed):
- `p3` on `n0` 7.43, on `n1` 6.97: AAA for text at any size.
- `p4` on `n0` 12.74. `p5` on `n0` 17.62.
- `red` on `n0` 5.79, on `n1` 5.44: AA for text.
- `n5` on `n0` 5.58. `n2` engraving on the `n5` plate 4.66: AA, so plate text is 11 px or more.
- `n6` on `n1` 10.66 (settings and legal body). `n6` on `n3` 7.68 (key legends on rubber). `n5` on `n3` is 3.78, so `n5` is never used for key legends.
- `ink` on `paper` 12.38.
- `p2` on `n0` 3.67 passes 3:1 for non-text marks only. Text never uses `p0` to `p2`.

## 5. Type

Two faces, no third.
- Readouts: VT323 (bundled, `@expo-google-fonts/vt323`, OFL 1.1). Numbers, units beside numbers, tier words, telemetry lines, fault codes.
- Labels: **B612 Mono**. Key legends, nameplate, axis labels, settings, legal text.

Why B612 Mono over IBM Plex Mono: B612 was drawn for Airbus cockpit displays, tuned for legibility at small sizes under poor viewing conditions, which is the job of a label on field gear. Its open apertures and distinct `0/O`, `1/l/I` survive the CRT blur and grain. Plex Mono is a corporate brand face with a softer, editorial feel, and it is now common in developer-tool UI, which reads as software, not hardware. B612 Mono ships Regular and Bold; we use both, no italics.

Licences, both SIL OFL 1.1:
- IBM Plex Mono: https://github.com/google/fonts/tree/main/ofl/ibmplexmono (not used)
- B612 Mono: https://github.com/google/fonts/tree/main/ofl/b612mono (resolves the digest's [licence U]). Builder A adds it to `assets/LICENSES.md` when bundling.

Type scale at 390 px width (px, scale linearly with width):

| Token | Face | Size | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `rdXL` | VT323 | 72 | 64 | 0 | SPI number on reveal |
| `rdL` | VT323 | 48 | 44 | 0 | Primary live readout (mG) |
| `rdM` | VT323 | 28 | 28 | 0 | Secondary readouts, tier word |
| `rdS` | VT323 | 20 | 22 | 0.5 | Telemetry lines, fault codes |
| `rdXS` | VT323 | 16 | 18 | 0.5 | Scale labels on glass, units |
| `lbM` | B612 Mono Bold | 13 | 16 | 0.6 | Key legends, nameplate |
| `lbS` | B612 Mono Regular | 11 | 14 | 0.8 | Axis labels, plate text |
| `lbXS` | B612 Mono Regular | 10 | 12 | 1.0 | Sticker, fine print on plates |
| `body` | B612 Mono Regular | 14 | 21 | 0 | Settings, legal, onboarding |

Casing: every label and legend on the device is upper case. Units keep their SI casing: `mG`, `Hz`, `dBFS`, `°C`. Body text in settings and legal is sentence case. No title case anywhere. Numbers are right-aligned in fixed-width fields with leading spaces, never leading zeros, except serials and case numbers.

## 6. Imperfections

These are part of the spec. Builders do not clean them up.

Needle (live flux gauge and SPI dial), a damped spring with mass `m = 1`:
- Reveal: natural frequency 11 rad/s, damping ratio 0.45. Reanimated `withSpring({ mass: 1, stiffness: 121, damping: 9.9 })`. Overshoot about 20%, settles within 2% in about 810 ms (brief §2.6 asks 600 to 900 ms).
- Live: 8 rad/s, damping ratio 0.70, `stiffness: 64, damping: 11.2`. Overshoot about 5%.
- Hard stops at both ends: on hitting a stop the needle rebounds at 30% of its speed, once.
- Needle is 1.5 px `p4` with a 3 px `p1` shadow offset 2 px down-right on the glass (it sits above the scale).

Sensor jitter:
- Needle: ±0.6% of full scale, pink-ish noise sampled at 8 Hz and smoothed by the spring. Added on top of real magnetometer noise.
- Digits: the last digit of mG wanders ±1 count at 4 Hz. ΔT wanders ±0.1 °C at 2 Hz. SPI on the result screen is fixed and never jitters.

Phosphor persistence:
- Trace and needle: decay τ = 180 ms, one brightness step per 60 ms.
- Radar sweep and scan line: τ = 450 ms, visible tail about 1.2 s.
- Readout digit changes: the old glyph lingers at `p1` for 90 ms under the new one.

Burn-in ghost: the boot wordmark `VELDEN` and the graticule outline sit at `p0` on every screen, 3% opacity, offset 1 px right. Fixed position; screens that have no graticule still show its faint ghost.

Glass layer: one static overlay per install seed, 40 to 60 dust specks (1 to 3 px, 2 to 5% alpha), 2 to 4 hairline scratches (30 to 120 px, 4% alpha), corner vignette to 18% darkening, scanlines at 2 px pitch, 6% alpha. Film grain at 4% on the glass, re-seeded per frame at 24 fps.

Fault codes. Shown on about 1 in 15 scans (brief §2.8), add 1.5 s, printed in VT323 `rdS` at `p5`, blinking 2 Hz, 500 ms on, 3 cycles, then clear.

| Code | Text | Meaning in-fiction |
|---|---|---|
| `E-02` | `PROBE SAT. RANGING` | Flux above 2000 mG, auto-range step |
| `E-05` | `THERMOPILE REF LOST` | Thermal reference drifted, ΔT re-zeroed |
| `E-07` | `SENSOR DRIFT. RECALIBRATING.` | Fluxgate offset drift (brief §2.8 wording) |
| `E-11` | `ADC CLIP CH3` | Acoustic channel overloaded, gain halved |
| `E-14` | `TUBE HV LOW` | CRT high voltage sag, screen dims 30% for 400 ms |
| `E-19` | `LOG BUFFER FULL. FLUSH.` | Internal log written out, scan pauses |

`E-14` is the only fault that changes the picture. None of them use red.

## 7. Motion

Physical parts follow physics (§6). UI transitions follow these rules.
- No bounce, no elastic, no spring on layout. Overshoot exists only on needles.
- Default easing: `cubic-bezier(0.2, 0, 0, 1)` (fast out, long settle). Exits: `cubic-bezier(0.4, 0, 1, 1)`.
- Screen changes are a CRT cut: old screen collapses to `p5` horizontal line in 80 ms, black `n0` for 40 ms, new screen at full brightness with 120 ms of persistence decay. No slides, no cross-fades between screens.
- Boot: relay click, tube warm-up 900 ms (brightness from 0 to 100% with a 2 px vertical roll), then text types at 40 characters per second.
- Key press: key face drops 2 px and darkens one neutral step for 60 ms down, 90 ms up. No ripple.
- Readout numbers step, they never tween. A changing value redraws at up to 12 Hz.
- Reveal: 1.2 s silent hold, number lands in one frame, needle overshoots and settles, figure fades in over 1.5 s linear.

Never animates: labels, units, nameplate, screws, sticker, wear, the key row layout, tier words (they snap), list rows (no fade-up, no stagger), settings.

Reduced motion (`AccessibilityInfo.isReduceMotionEnabled`): jitter off, persistence τ capped at 60 ms, needles use damping ratio 1.0, CRT cut becomes a 120 ms dissolve, scanlines stay.

## 8. Banned tells: reviewer checklist

Fail the screen if any box is ticked.
- [ ] A second hue anywhere on the glass or housing (blue, purple, amber, cyan), or red outside CRITICAL.
- [ ] Any purple or blue gradient, or a gradient used as decoration.
- [ ] Cards with one shared radius and a soft drop shadow.
- [ ] Emoji, or icon-font glyphs standing in for hardware.
- [ ] Everything centred. The device is laid out left-aligned with readouts in fixed columns.
- [ ] Bouncy or elastic easing on any UI element.
- [ ] 01/02/03 markers on items that are not a real sequence.
- [ ] Arrows on every button.
- [ ] Big-number hero outside the reveal, eyebrow labels, fade-up on scroll.
- [ ] Pure black `#000000` or neutral grey with no tint.
- [ ] A third type face, or Inter, Space Mono or JetBrains Mono.
- [ ] Copy that trips `node scripts/lint-copy.mjs`: the nine banned words, contrast framing that negates X to assert Y, em-dash asides.
- [ ] Lists on a screen that always run to three items.
- [ ] Imperfections removed or smoothed away "for cleanliness".
- [ ] Text in `p0` to `p2`.

## 9. Design tokens

Builder A transcribes this table into `src/ui/tokens.ts`. Names are camelCase keys under the group shown.

| Group | Name | Value | Purpose |
|---|---|---|---|
| color | `p0` | `#0F2416` | Phosphor step 0: burn-in, unlit |
| color | `p1` | `#1C4A2A` | Phosphor step 1: graticule |
| color | `p2` | `#2F7A45` | Phosphor step 2: minor ticks |
| color | `p3` | `#4FB46A` | Phosphor step 3: labels |
| color | `p4` | `#7CE895` | Phosphor step 4: readouts |
| color | `p5` | `#D4FFDC` | Phosphor step 5: peaks |
| color | `n0` | `#0A0F0B` | Glass |
| color | `n1` | `#121712` | Shadow |
| color | `n2` | `#1E221C` | Recess, unlit lens |
| color | `n3` | `#2E3229` | Housing |
| color | `n4` | `#4A4D42` | Edge, wear |
| color | `n5` | `#8A8B7C` | Plate |
| color | `n6` | `#C9C7B6` | Body text on `n1` |
| color | `paper` | `#E8E2C8` | Sticker |
| color | `ink` | `#23211A` | Sticker print |
| color | `red` | `#FF4A3A` | CRITICAL only |
| font | `readout` | `VT323_400Regular` | Readouts |
| font | `label` | `B612Mono_400Regular` | Labels |
| font | `labelBold` | `B612Mono_700Bold` | Key legends |
| type | `rdXL` `rdL` `rdM` `rdS` `rdXS` | see §5 | Readout sizes |
| type | `lbM` `lbS` `lbXS` `body` | see §5 | Label sizes |
| space | `gutter` | 16 | Side gutter at 390 |
| space | `unit` | 4 | Base grid |
| space | `div` | 34 | Graticule division |
| radius | `window` | 18 | Screen window |
| radius | `key` | 6 | Rubber key |
| radius | `plate` | 2 | Nameplate, LED plate |
| size | `led` | 12 | LED diameter |
| size | `ledPitch` | 22 | LED spacing |
| size | `screw` | 10 | Screw head |
| size | `keyH` | 44 | Key height (touch target with 4 px slop) |
| motion | `easeOut` | `[0.2, 0, 0, 1]` | Default |
| motion | `easeIn` | `[0.4, 0, 1, 1]` | Exits |
| motion | `cut` | 80 / 40 / 120 ms | CRT cut phases |
| motion | `press` | 60 / 90 ms | Key down / up |
| motion | `warmup` | 900 ms | Tube warm-up |
| motion | `hold` | 1200 ms | Pre-reveal silence |
| needle | `reveal` | `{ mass: 1, stiffness: 121, damping: 9.9 }` | Reveal spring |
| needle | `live` | `{ mass: 1, stiffness: 64, damping: 11.2 }` | Live spring |
| needle | `jitter` | 0.006 | Fraction of full scale |
| fx | `tauTrace` | 180 ms | Trace persistence |
| fx | `tauSweep` | 450 ms | Sweep persistence |
| fx | `burnIn` | 0.03 | Burn-in alpha |
| fx | `grain` | 0.04 | Grain alpha |
| fx | `scanline` | 0.06 | Scanline alpha, 2 px pitch |
| fx | `vignette` | 0.18 | Corner darkening |
| fx | `barrel` | 0.015 | Glass curvature |
| tier | `quiet` `trace` `active` `strong` `critical` | 0 / 20 / 45 / 70 / 90 | Lower bounds of SPI tiers |

## 10. References

- Alien: Isolation motion tracker: borrow the clunky physical box around a small screen and the sense that the hardware is slightly failing (signal drop, roll, noise routed through real tape), so the fault codes and `E-14` dimming feel native.
- K-II meter: borrow the 5-LED ladder with one always-lit power LED and the habit of reading it at a glance from arm's length.
- FLIR thermal cameras: borrow the scale bar layout with min and max at the ends, the centre crosshair with a spot readout box and the palette name in the corner; the palette itself stays in phosphor.
- Analogue oscilloscopes: borrow the 10 × 8 graticule with minor ticks on the centre axes, timebase and sensitivity text outside the grid, and beam persistence.
- Pip-Boy bezel: borrow the screen recessed into a thick screwed housing with physical keys underneath and the way the bezel frames every view.

## 11. First-launch calibration sticker

Shown once at first launch after boot, full-width on the glass, as a paper label on `paper` with `ink` text, `lbXS` for the metadata line and `body` Bold caps for the main lines. One key below it: `ACKNOWLEDGE`.

Wording (15 words, the disclosure required by plan §7):

> SIMULATION UNIT · ENTERTAINMENT USE ONLY. All readings are generated in software. This unit detects nothing.

Metadata line beneath, not part of the disclosure: `VELDEN FS-4/87-P · FS4-8711-00417-9 · CAL 2026-10-13 · PRÜF 07`.

The same sticker, smaller, stays on the housing for the life of the install (§2). Copy & Localization owns the DE, ES and PT versions; each must keep the meaning of all three sentences and stay at 25 words or fewer.
