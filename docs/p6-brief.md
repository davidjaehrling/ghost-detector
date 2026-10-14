# P6 Brief: Retention and Share (workstream I)

Owner: Dr. Hollow · 2026-10-14 · Binding inputs: `docs/MASTER-PLAN.md` §5 (P6 row), §6, §7, §8; `docs/psych-brief.md` §2.1, §2.6, §2.7, §2.9, §4, §5; `docs/voice-guide.md`; `docs/instrument-bible.md` §1, §3, §11; `docs/research/2026-10-research-digest.md` §4; `docs/decisions.md` D-017, D-022, D-026, D-028.

P6 builds three things: the share card, opt-in notifications and the investigation log. This brief says what each one must do to the user, which lever it pulls, and how much. Numbers are starting values for P10 to tune; any change goes through the panel and into `docs/decisions.md`. The store name is open at Gate 1, so this brief writes `[STORE NAME]` where it will go.

## 0. What P6 is for

The digest gives two facts that set the whole phase. The viral unit on TikTok is a shareable capture, not the app. Five-star reviews say "scary moments, fun with friends", one-star reviews say "too many ads" and "same result every time". So the share card is the product that leaves the phone, and it has to carry the peak with no ad on it. Notifications and the log exist to bring a user back to a new scan, and they fail the moment they feel like nagging, because nagging is how this category earns its one-star reviews.

Session shape after P6:
- Scan, reveal (the peak), then 3 s of nothing but the result.
- The share offer lights up. The user sends a card or starts a new scan.
- On a later evening, at most one field-log line arrives. It names a number and a reason to scan. It never claims something happened.
- The log holds every case, the peak of every session and the unresolved signatures.

## 1. The share card

### 1.1 Levers
- Peak-end rule (Kahneman 1993). The card is the end of the session and a frozen copy of its peak. Whatever is on it becomes the memory and the retelling. That is the reason nothing on it may be an ad, a prompt or a button.
- Pareidolia (Riekki 2013). Viewers in a feed get the same faint, partly hidden figure the user got. The card must not sharpen or label the figure: an arrow or a circle tells the viewer what to see and kills the effect for believers, who do the work themselves.
- Curiosity gap (Loewenstein 1994), aimed at the viewer. A card that says `SIGNATURE 58% DECODED` leaves a specific, nearly closed gap for a stranger, and the only way to close it is a scan of their own.
- Authority cues. Case number, SPI, ΔT in °C and a 24 h timestamp make the card read as instrument output. The same data strip burned into the photo since D-017 is the core of the card.
- Variable ratio, for the group. Every card carries its own case ID and values, so a chat thread of cards from five friends shows five different readings. This answers "same result every time" in public.

### 1.2 What the card contains
In draw order, all from the same Skia stack the result screen uses, captured with view-shot:
1. The ghost composite at the high-resolution render (`HIRES_SCALE` 2), cropped on the figure with the existing `cropOnFigure` rule, grain applied after compositing exactly as on screen. No extra lift in opacity: the card shows what the user saw, so the peak and the memory match.
2. The data strip, bottom-left of the photo, burned under the grain, in VT323 p3 with the 40% n0 scrim from D-022. Its text gains one field: `CASE 0041 · SPI 84 · ΔT -6.3 °C · 23:41 · SIMULATED`. Putting the SIMULATED mark inside the strip means a crop that removes the mark also removes the case data, which is the part people want to keep.
3. The reading row under the photo: tier word and SPI in rdXL (`84 STRONG`), and one second line:
   - not deep-scanned: `SIGNATURE 58% DECODED` (the viewer's gap);
   - deep-scanned: `CLASS: RESIDUAL · ERA EST. 1890 TO 1940` and, on CRITICAL or when an EVP exists, `EVP "behind the door"` in quotes. The EVP line is the strongest single share hook we have; it appears on the card only after the user ran the Deep Scan, so the reward travels with them.
4. The nameplate band: `VELDEN FS-4/87-P`, engraved, top of the card. No serial: it is seeded per install and has no value to a viewer.
5. Footer, one line in lbXS: `[STORE NAME] · READINGS ARE SIMULATED`. This is the second SIMULATED mark and the only place the store name appears.

The SIMULATED mark (Compliance launch blocker, D-026): at least 2.0% of the card height in cap height (22 px on a 1920 px card, 22 px on 1080), contrast at least 4.5:1 against what sits behind it, never rotated, always at 100% opacity, present on every aspect ratio.

### 1.3 What the card must not contain
- No ad, no DEEP SCAN key, no `SPONSORED VIDEO PLAYS FIRST` sublabel, no banner residue, no QR code, no "download now" line, no rating stars.
- No word that claims detection or truth: detected, proof, verified, confirmed, accurate, real (the D-028 list applies to the card as it does to the key).
- No arrows, circles, boxes or labels pointing at the figure.
- No GPS, no address, no EXIF. The exported file is re-encoded from pixels, so photo metadata never travels.
- No redacted profile bars. Bars on a card read as a broken screenshot to a stranger; the single decoded-percentage line carries the gap more cleanly.
- No second colour. One phosphor hue, with the semantic red only on the word CRITICAL on a CRITICAL card.

### 1.4 Aspect ratios
Two exports, both PNG at 1080 px wide:

| Format | Size | Use | Layout |
|---|---|---|---|
| Story | 1080 × 1920 (9:16) | TikTok, Instagram and WhatsApp status | Nameplate y 240 to 300; photo 1000 × 1250 (4:5) from y 320; reading row y 1590 to 1700; footer y 1720. Housing texture fills the rest. |
| Square | 1080 × 1080 (1:1) | Chats, Instagram feed, X | Nameplate y 0 to 60; photo 1080 × 760 from y 60; reading row y 840 to 980; footer y 1020. |

Safe zones on the story card: the platforms lay their own controls over the top 200 to 250 px and the bottom 250 to 400 px [U, measure on a real TikTok and Instagram upload at phone check 3]. The photo and the strip sit inside y 250 to 1580, where nothing covers them; the reading row and footer accept partial overlap by a caption. Feed compression is the other risk: a figure at 8 to 14% opacity may flatten after re-encoding. QA should upload one STRONG card from each fixture to a private story at phone check 3 and look; if the figure vanishes, the fix is a higher card resolution or less card-level grain, never a brighter ghost.

### 1.5 When it is offered
- The SHARE key in slot 2 works on every result once the SPI digit has landed. Before that it is dark and inert. It is never live during the scan theatre or the 1.2 s hold.
- The proactive offer appears only on ACTIVE, STRONG and CRITICAL, 3.0 s after the reveal has settled (needle at rest, figure faded in), which keeps the psych-brief rule of nothing on the peak or 3 s after it. QUIET and TRACE keep a working key with no proactive line: offering a card with nothing on it teaches users the offer is empty.
- Dose: one proactive line per result. After a Deep Scan completes, the line comes back once, 3.0 s after the high-resolution reveal settles, because the Deep Scan is a second peak and the updated card is its end.
- Never with an ad on the same screen. The offer line does not appear while a rewarded video is loading, playing, or for 3.0 s after it closes. The share flow never shows on a screen that holds the banner (the log). The interstitial is skipped on the return from any result the user shared (psych-brief §5, "mid-share").
- No modal. The offer is a glass line plus the backlit key; it never blocks NEW SCAN.

### 1.6 Copy
In-fiction offer, glass line above the key row in rdXS p4, with SHARE backlit p5:
- `Field card ready. CASE 0041.`
- After a Deep Scan: `Field card updated. Class and EVP added.`

On SHARE, the glass shows the format choice in place of the result lines, two keys and one line:
- Line: `Print field card. Format?`
- Keys: `9:16` and `1:1`. BACK legend reads `CANCEL`.
- While rendering (target under 800 ms): `PRINTING CARD.` with the blinking block.

Android share sheet:
- Chooser title: `Send field card · CASE 0041`
- Accompanying text, for apps that take it: `CASE 0041 · SPI 84 STRONG. Readings are simulated. [STORE NAME] on Google Play.` The link is added at P9 once the listing URL exists.

Failure: `E-31 PRINTER FAULT. CARD NOT SAVED.` No retry loop; the key stays live.

## 2. Opt-in notifications

### 2.1 Levers
- Priming (Wiseman 2002). A line that says the index is high after 22:00 sets an expectation before the user picks up the phone, which is the same mechanism the viewfinder lore uses. It is the only lever notifications pull hard.
- Curiosity gap (Loewenstein 1994), for unresolved cases, at a low dose (§2.4, template 4).
- Variable ratio stays out. Notifications are sent on predictable conditions (moon, logged tags), never on a random schedule designed to make the user check the phone. That is the line between a field log and a slot machine.

### 2.2 The one opt-in moment
Trigger: the first return to the viewfinder after the 3rd scan or the first STRONG result, whichever comes first (psych-brief §4). Conditions: never in the same session as the first launch's calibration sticker; never on the reveal or the result screen; never on a return that shows an interstitial (the opt-in waits for the next return); never twice.

It is a module on the viewfinder glass in the unit's voice, before any system dialog:
- Header: `FIELD LOG RELAY`
- Body: `Fit the relay? The unit posts at most one field-log line a night: the index, the moon or an open case. 18:00 to 22:00 only. Lines are simulated, like every reading.`
- Keys: `FIT RELAY` and `NOT NOW`.
- `FIT RELAY` opens the Android 13+ notification permission dialog. Granted: `Relay fitted. Change in Settings.` Denied by the system: `Relay not fitted. Change in Settings.`
- `NOT NOW`: no follow-up, no second ask. The only way back is `Field log relay: OFF` in Settings and one passive row at the foot of the log.

### 2.3 Cadence and quiet hours
- Opt-in only. No notification before the user taps FIT RELAY and grants the system permission.
- None in the first session. The first delivery is no earlier than the next calendar day and at least 20 h after install.
- At most one per night and at most 3 per week (Brave), 2 (Standard), 1 (Calm); see §4.
- Delivery window 18:00 to 22:00 local. Quiet hours are 22:00 to 18:00, every day, with no exception for the 03:00 window: the lore may talk about 03:00, the phone never buzzes then.
- Back-off: two deliveries in a row with no open drop the user one cap level; 7 days with no open stop the relay until the next open (psych-brief §4).
- Built as local scheduled notifications computed on the device from moon phase, clock and the local log. No push service, no token, nothing leaves the phone, so the Data safety form does not change.

Never posing as a system alert (plan §7 red line, voice rules 10 and 11):
- One channel named `Field log`, default importance, no heads-up, no full-screen intent, no alarm or call category, no custom vibration pattern, no sound by default.
- App name and icon on every notification. Small icon is the monochrome nameplate glyph, never a warning triangle, shield, battery or bell.
- Titles open with `FIELD LOG`. Never Warning, Alert, Detected, Urgent or Security, and never a line saying something happened in the home while the app was closed.
- Tapping opens the app on the named screen (viewfinder or case). No ad on a notification open: it counts as an app launch under plan §8.

### 2.4 Templates
Each template is one title and one body, voice rules 1 to 13, values from the device. `[n]` marks a value.

| # | Condition | Title | Body |
|---|---|---|---|
| 1 | Activity index 4 or 5 tonight from the 03:00 window and moon | `FIELD LOG · IDX [4]/5` | `03:00 window after midnight. Moon [81]%. Conditions favourable after 22:00.` |
| 2 | Full moon ±1 day, sent once per cycle | `FIELD LOG · MOON [98]%` | `Full moon. Forecast index 5/5 from 22:00 to 04:00.` |
| 3 | A tag the user has logged 2+ times, on an index 4+ evening | `FIELD LOG · [CELLAR]` | `[Cellar] on file, [3] cases. Forecast index [4]/5 after 22:00.` |
| 4 | An unresolved case (not declined) from the last 7 days, once per case | `FIELD LOG · CASE [0041]` | `Signature [63]% decoded. Unresolved.` |
| 5 | Catalogue progress, after a Deep Scan logged a new class in the last 7 days | `FIELD LOG · CATALOGUE [7]/24` | `[17] classes unlogged. Index [3]/5 after 22:00.` |

On template 3. The task phrase "a location you logged is active tonight" crosses voice rule 11 and the §7 red line: "active" reads as a claim that something is happening in the user's home now. The nearest safe version is a forecast, built from the same moon and clock inputs as the viewfinder index, attached to a tag the user chose. It keeps the personal pull (their cellar, their case count) and claims nothing.

On template 4. It leads toward a rewarded ad, so it carries the lowest dose: once per case, never for a declined case (D-028), never on Calm, and the tap opens the case with the standing DEEP SCAN key, no autoplay. Its text never mentions a reward, video, ad, unlock, free or watch, and it sets no deadline.

Selection when several apply on one evening: 2, then 3, then 1, then 5, then 4. One line per night.

## 3. The investigation log

### 3.1 What makes a return visit worth it
- Locations. Group cases by tag with a record per tag: `CELLAR · 7 CASES · PEAK 84 STRONG · 2026-10-13 23:41`. This is the personal record, and it is what template 3 points at. Lever: authority cues plus self-relevance; the user's own rooms become case files.
- Peaks, never averages. Each session line shows its peak (`Peak: 84 STRONG, Cellar, 23:41`). The log header shows `BEST ON FILE` across all sessions. Peak-end applied to memory: the log replays the best moments.
- Unresolved signatures. Cases at 41 to 73% decoded that the user left without declining show `UNRESOLVED 58%` in the row, in p4. The DEEP SCAN key lives only inside the reopened case, never in the list, so the list is a reading surface and the banner (plan §8) never sits beside an ad-starting key. Declined cases show `ARCHIVED 58%` with no offer. Decodes never expire, decay or count down. Lever: curiosity gap at the dose the brief set, once per result.
- Entity catalogue. 24 classes, each `UNLOGGED` until a Deep Scan logs it (psych-brief §4). Slow completion with no deadline.
- Moon table. The next 7 nights with the forecast index and the next full moon date. It gives a reason to come back on a date the user picks, with no pressure from the app.

### 3.2 Streaks
No streak counter that resets. A reset streak works through loss aversion: the user returns to avoid losing a number, which is the daily-login pattern this category already gets punished for. Allowed instead: cumulative counts that only ever rise, `NIGHTS LOGGED 12` and `FULL MOONS LOGGED 2`. They record effort without a penalty for a missed day.

### 3.3 What to avoid
- Daily-login rewards, "come back tomorrow" lines, missed-day messages, guilt framing ("Your cellar misses you").
- Red badges on the app icon or a tab. The badge is a system convention for something that needs attention.
- Countdown timers, expiring decodes, "signal fades in 24 h". False urgency, and voice rule 12 forbids it.
- Any notification or log line that counts days since the last open.
- An interstitial when entering or leaving the log. The banner is the log's only ad, kept away from rows and keys (plan §8).

## 4. Belief calibration and intensity carry-over

The onboarding answer and the intensity setting already shape the scans (psych-brief §2.9, §3). They carry into notifications on the same inverted U (Clasen 2020): a Calm user chose less arousal, and a 21:00 line on the lock screen is arousal they did not ask for.

| Setting | Cap per week | Templates | Register |
|---|---|---|---|
| Calm | 1 | 2, 5 | Data only: moon, catalogue. No 03:00 window, no unresolved cases. |
| Standard | 2 | 1, 2, 3, 5, 4 | Field-log lines as written. |
| Brave | 3 | all | Field-log lines as written. |

Belief answer, on top of intensity:
- "Yes" (believer): body may add one lore line from the location's pool, max 8 words (`Cellars hold cold air.`). Priming at full strength, matching the viewfinder.
- "Not sure": as written.
- "No" (sceptic): numbers only, no lore line. Sceptics answer to telemetry, the same reason they get more instrument data on screen.

Carry-over rules:
- The cap and template set follow the current intensity at scheduling time. A switch to Calm (including from the "Too much? Set CALM." slider after a jump-scare) cancels and reschedules all pending lines at once.
- Turning jump-scares off drops one cap level, since it is a signal the user wants less.
- No EVP quote ever appears in a notification, at any intensity. A quoted voice on a lock screen at 21:00 can alarm someone who did not open the app, and it moves too close to posing as a real event.

## 5. Panel rubric and open questions

### 5.1 Scoring rubric for the P6 panel
Score each surface (share card in both formats, the share flow, the opt-in module, each notification template, the log) on four dimensions, 1 to 10. Exit at a weighted mean of 8 with no dimension under 7, as in earlier phases. Honesty under 7 blocks the surface regardless of the mean.

| Dimension | 1 | 5 | 10 |
|---|---|---|---|
| Shareability | Nobody would post it; reads as an app screenshot | Postable among friends who know the app | A stranger in a feed stops, reads the case data and wants their own reading |
| Curiosity gap | No open question, or a vague one ("something is here") | A gap exists but feels manufactured or far from closed | One specific, nearly closed gap (a percentage, a class) that a single action closes |
| Honesty | Implies real detection, hides the SIMULATED mark, poses as a system message | Disclosed, but the mark is weak or a line leans toward a claim | Every line is a plain instrument statement, SIMULATED visible on every card, no banned claim word |
| Intrusiveness (10 = none) | Unasked notifications, nags, badges, an ad beside the peak or the share | Opt-in but frequent or slightly pushy wording | Opt-in, capped, quiet hours kept, no ad within reach of the peak or the share |

Judging setup: the share card judged at feed size (360 px wide) and full size side by side, plus one card after a re-encode at quality 70, since that is how most viewers meet it.

### 5.2 Open questions for the Director
1. Store name on the card. The footer carries `[STORE NAME]` for discoverability, the nameplate carries Velden for the fiction. If Gate 1 picks option 1 ("Velden FS-4 Field Probe"), the two merge and the footer shortens to `READINGS ARE SIMULATED · Google Play`. Default: build both slots now and fill the name at Gate 1.
2. Template 4 (unresolved signature) is the only notification that leads toward a rewarded ad. Default: keep it at once per case, Standard and Brave only, and ask Compliance for a ruling before the build, since a notification that opens onto an ad offer could be read as an incentive under AdMob policy.
3. Proactive share offer on TRACE results with a smudge. Default: no; the key works, the line stays off. Revisit at P10 if analytics show TRACE cards being shared at more than half the rate of ACTIVE cards, which would mean the smudge alone is enough of a hook.
