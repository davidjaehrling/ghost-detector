# Voice Guide

Owner: Copy & Localization. Binding sources: `docs/MASTER-PLAN.md` §6 and §7, `docs/psych-brief.md` §2.7, §2.9, §4, §5.

The app speaks like a 1980s field manual and a calibration sticker. It states a reading, gives a unit, gives a code, and stops. It never sells, never reassures, never chats.

## 1. Voice rules

1. Short sentences. One fact per sentence, 8 words on average, 14 at most. Fragments are fine.
   - Good: `Cold spot. -5 ΔT °C. Hallway.`
   - Bad: `We noticed an unusually cold area in your hallway that might be interesting.`
2. ALL CAPS for status words, tier names, mode names and button verbs: `QUIET`, `DEEP SCAN`, `RECALIBRATING`. Sentence case for every full sentence.
   - Good: `Signature partially decoded.` and a button `RESCAN`.
   - Bad: `SIGNATURE PARTIALLY DECODED AND MORE!` and a button `Rescan Now!`
3. Numbers are numerals, always. Unit follows after a space: `412 mG`, `-5 ΔT °C`, `50 Hz`, `-6 dBFS`. Use the minus sign for negatives. Percent has no space: `58%`.
   - Good: `Field 412 mG. Baseline 360 mG.`
   - Bad: `The field is about four hundred milligauss.`
4. Timestamps are 24 h, local, `HH:MM`. Dates are `YYYY-MM-DD`. Never "tonight" or "5 minutes ago" in the log.
   - Good: `2026-10-13 23:41`
   - Bad: `Late last night`
5. Codes carry the authority. Case numbers are four digits (`CASE 0041`), faults are `E-` plus two digits (`E-07`), the serial is on the sticker and nowhere invented elsewhere. Codes are fixed strings and never translated.
   - Good: `E-07 SENSOR DRIFT. RECALIBRATING.`
   - Bad: `Oops, the sensor had a little hiccup!`
6. The app never says "I" or "we". It reports as the unit. It addresses the user only through imperatives or not at all.
   - Good: `Sweep slowly. Hold at 30 cm.`
   - Bad: `We think you'll love sweeping your room!`
7. The app never praises or promises. No "amazing", "enjoy", "you'll love", "get ready".
   - Good: `Scan complete. 84 STRONG.`
   - Bad: `Awesome scan! Get ready for something incredible!`
8. Uncertainty is a number or a qualifier from the instrument: percentages, ranges, "est.", "unconfirmed". Never a promise or a guarantee.
   - Good: `Era est. 1890 to 1940. Confidence 61%.`
   - Bad: `This ghost definitely lived in 1912.`
9. Real detection is never claimed. The magnetometer is described as what it is, a field reading in mG. Nothing says the unit finds, senses or proves spirits. Entities are "signatures", "readings" and "classes".
   - Good: `Field reading 412 mG. Signature class: RESIDUAL.`
   - Bad: `Spirit detected in your home.`
10. Nothing poses as the operating system. No lines styled as battery, storage, security or carrier messages. The app name is on every notification and prompt.
    - Good: `GHOST DETECTOR. Field log. Moon 96%.`
    - Bad: `System alert: unknown device nearby.`
11. Notifications and prompts use field-log phrasing. They never use "Warning", "Alert" or "Detected" as a title or opener, and never say something happened in the home while the app was closed.
    - Good: `FIELD LOG. Case 0041 unresolved. Signature 63% decoded.`
    - Bad: `Warning: activity detected in your house!`
12. Say what a button does and what it costs. A rewarded video is called a video. No timers, no "last chance".
    - Good: `Run DEEP SCAN. Short video plays first.`
    - Bad: `Unlock the secret before it vanishes!`
13. No marketing adjectives and no hedging filler. Cut "very", "really", "just", "simply", "unique", "powerful".
    - Good: `Intensity set to STANDARD. Change in Settings.`
    - Bad: `We've just set a really powerful intensity for you.`
14. Every sentence is a plain statement of fact. State what is true and stop.
    - Good: `Readings are simulated.`
    - Bad: `It is more than a toy, and less than a lab.`

## 2. Register per surface

- Boot: firmware line, then the sticker. Pure instrument. Uppercase codes, no prose. `FW 2.31 CAL 2026-03-14 OK`.
- Calibration sticker: the mandatory disclosure. Flat, label-like, under 25 words, no jokes and no "prank". It reads as a legal sticker and it is one.
- Viewfinder HUD: labels of 1 to 3 words plus a live value. `FIELD`, `ΔT`, `IDX 3/5`. No sentences. Lore notes below are two-line manual entries.
- Scan theatre: telemetry lines of 3 to 6 words, present tense, fully mechanical. `Sweeping band 2.` `Rate rising.` Silence is part of the voice: the 1.2 s hold carries no text.
- Result reveal, by tier:
  - QUIET (0 to 19): flat and bureaucratic. `Baseline. No signature.`
  - TRACE (20 to 44): hedged. `Trace only. Below threshold for class.`
  - ACTIVE (45 to 69): confident, still partial. `Activity logged. Signature partially decoded.`
  - STRONG (70 to 89): shorter, harder. `Strong. Signature resolving.`
  - CRITICAL (90 to 100): fewest words of all, the only tier with a semantic red. `CRITICAL. 94.`
- Entity profile: five slots in manual style, high base-rate lines plus one checkable-sounding code. `Class: RESIDUAL. Era est. 1890 to 1940. Most active when the house is quiet.` No dead relatives, illness, real deaths or real names.
- Deep Scan offer: the curiosity gap, specific and nearly closed. Name the percentage, the contents and the video. `Signature 58% decoded. Run DEEP SCAN to resolve class, era and EVP. Short video plays.` Offered once per result, never on QUIET or TRACE.
- History log: case-file rows. Case number, time, tag, score, tier. The session line shows the peak, never an average: `Peak: 84 STRONG, Cellar, 23:41`.
- Settings: label, then state, in capitals. `Jump-scares: ON`. Help text is one factual sentence. Calm is described by its limits: `Geiger cap 6 clicks/s.`
- Errors and permission prompts: fault code first, plain cause second, next step third. The permission rationale states what the sensor does and that nothing leaves the device. `Camera access required for capture. Frames stay on this device.`
- Notifications: opt-in only, asked after the 3rd scan or first STRONG, on an in-voice screen before the system dialog. One per day, three per week, delivered 18:00 to 22:00 local. Field-log lines with data. No urgency, no icons that mimic the system.

## 3. Example strings

Key form is `surface.key`. All are EN.

| Key | String |
|---|---|
| `sticker.disclosure` | SIMULATION UNIT. Readings are generated for entertainment. Magnetometer data is real. Spirits are not included. |
| `boot.firmware` | FW 2.31 / CAL 2026-03-14 / SELF-TEST OK |
| `onboarding.question` | Have you ever experienced something you couldn't explain? |
| `onboarding.intensitySet` | Intensity set to STANDARD. Change any time in Settings. |
| `hud.field` | FIELD 412 mG |
| `hud.activityIndex` | Activity index 3/5. Moon 96%. |
| `lore.cellar` | Cellars hold cold air. Readings below grade run 12% high. |
| `theatre.telemetry1` | Sweeping band 2. Rate rising. |
| `theatre.fault` | E-07 SENSOR DRIFT. RECALIBRATING. |
| `result.quiet` | Baseline. No signature. |
| `result.trace` | Trace only. Below threshold for class. |
| `result.active` | Activity logged. Signature partially decoded: 58%. |
| `result.strong` | Strong. Signature resolving. Cold spot -5 ΔT °C. |
| `result.critical` | CRITICAL. 94. Cold spot -8 ΔT °C. EVP fragment logged. |
| `profile.era` | Era est. 1890 to 1940. Confidence 61%. |
| `deepscan.offer` | Signature 58% decoded. Run DEEP SCAN to resolve class, era and EVP. Short video plays. |
| `log.peak` | Peak: 84 STRONG, Cellar, 23:41 |
| `settings.jumpscare` | Jump-scares: ON |
| `permission.camera` | Camera access required for capture. Frames stay on this device. |
| `notify.fieldLog` | FIELD LOG. Moon 96%. Conditions favourable after 22:00. |

## 4. Localization notes

Locales: DE, ES, PT. Each is written for its culture and checked by a separate review pass. Key parity across all four is enforced by the parity lint.

Carries over unchanged:
- Codes and serials: `E-07`, `CASE 0041`, `FW 2.31`, model and serial text.
- Units and symbols: mG, ΔT °C, Hz, dBFS, `%`. Decimal marks follow the locale (`61,5%` in DE, ES, PT) while code strings keep the original.
- Tier names QUIET, TRACE, ACTIVE, STRONG and CRITICAL stay in English as instrument labels, with a short local gloss only where a screen has room.
- Timestamps stay 24 h and ISO dates.

Rewritten per culture:
- No idiom is translated. Lore notes, profile lines and the onboarding question are composed again in each language from the intent.
- DE: use the impersonal infinitive or noun style of a technical manual (`Langsam schwenken.`, `Kalibrierung läuft.`). Where the user must be addressed, use du, since the audience is 16 to 30, and keep it flat. Avoid the long compounds that break the HUD; split them.
- ES: neutral Latin American Spanish with tú forms in imperatives (`Barre lento.`). Spain-specific slang and vosotros forms are out. Instrument labels stay short, so use infinitives for HUD text.
- PT: Brazilian Portuguese is the base (você, imperative in 3rd person: `Varra devagar.`). European Portuguese needs a separate pass before any PT-PT release.
- Uncertainty and tone rules (rules 7 to 11) apply in full. The disclosure keeps the same meaning and stays under 25 words in each language.

String length allowances against EN:

| Locale | Allowance | Note |
|---|---|---|
| DE | up to +35% | HUD and buttons need abbreviation tests |
| ES | up to +25% | |
| PT | up to +25% | |

HUD labels have a hard width, so they are budgeted at EN length +10% and any overflow is fixed by rewriting the label, never by shrinking type.

## 5. Banned list and enforcement

Banned words (plan §6), spelled here with hyphens so this file passes its own lint: d-e-l-v-e, t-a-p-e-s-t-r-y, p-i-v-o-t-a-l, c-r-u-c-i-a-l, i-n-t-r-i-c-a-t-e, t-e-s-t-a-m-e-n-t, f-o-s-t-e-r, l-a-n-d-s-c-a-p-e, u-n-d-e-r-s-c-o-r-e. The ban covers every inflection, in EN copy and in the guide.

Banned patterns:
- The contrast framing that negates one thing to assert another, written "not X" then "but Y", with or without "just" or "only".
- Em-dash asides. Use a full stop, a colon or brackets.
- Lists that always hold exactly three items. Vary the count, or write prose.

Two further framing bans for notifications and prompts: no title that opens with Warning, Alert or Detected, and no line claiming activity was found while the app was closed. A reviewer enforces these two, since word lists would catch legitimate uses elsewhere.

Enforcement: `pnpm lint:copy` runs `node scripts/lint-copy.mjs`. With no arguments it scans `app/`, `src/` and `locales/`. With paths it scans those. It reports banned words, the framing pattern and em-dashes by file and line, and exits 1 on any hit. CI fails on a hit. The check for exactly-three lists and for the two framing bans is a manual item in the copy review.
