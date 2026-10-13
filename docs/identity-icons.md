# Identity: app icon concepts

Owner: Art Director · 2026-10-13 · Contract P1-07 · Inputs: `docs/instrument-bible.md` §1, §2, §3, §4, §8; `docs/MASTER-PLAN.md` §6; `docs/competitor-teardown.md` (visual tells).

Inspiration folder at time of writing: `inspiration/README.md` only, still no reference images. The references below are the ones named in the plan and the Bible.

All icon concepts are original SVG, no external assets. No fonts are used: every letter and numeral is drawn as stroked geometry, so `assets/LICENSES.md` is unchanged.

## Format

Each concept is drawn on a 1024 × 1024 artboard standing in for the 108 dp adaptive canvas. Everything that matters sits inside the centred circle of diameter 683 (the inner 72 dp). The background is the housing paint `n3` edge to edge, so any launcher mask cuts into painted metal, never into a transparent hole. Colours come only from the Bible palette; the red is unused in all three.

Renders: `<name>.png` is the full artboard at 512 × 512. `<name>-48.png` crops to the inner 72 dp and renders it at 48 × 48, which is what a launcher actually shows at 48 dp. The `-mono.svg` files are one colour (`p4`) on transparent for Android 13 themed icons; the launcher tints them, so only the alpha shape matters. Renders were made with Playwright Chromium from `file://` URLs at device scale factor 1.

Checks applied to all three: no emoji, no purple or blue gradient (the only gradient-like effect is the blur on lit LED bloom), no ghost figure, no eyes, no centred face. Each shows a part of the Velden FS-4.

## Concept 1: device face

Files: `assets/icon-concepts/concept-1-device-face.svg`, `concept-1-device-face-mono.svg`, `concept-1-device-face.png`, `concept-1-device-face-48.png`.

The screen window from Bible §2, recessed into the bezel with its inner shadow on the top and left, holding the logarithmic flux gauge from §3: a 100° arc with majors at 10, 20, 50, 100, 200, 500, 1000 and 2000 mG and the 2 to 9 minors, the GEO band as a `p2` arc on the inner edge, and the dotted 10 × 8 oscilloscope graticule behind it. The needle is parked at about 1450 mG, close enough to the 2000 peg that it reads as a reading worth worrying about, with its `p1` shadow offset down and right because it sits above the scale. It borrows the panel-meter window of an analogue oscilloscope and the Pip-Boy habit of a screen sunk in a screwed housing. It reads as equipment because the scale is uneven and the needle has a pivot cap and a shadow; a stock gauge glyph has even ticks and no depth. At 48 px the graticule and minors dissolve into texture, leaving a dark window, a bright arc and a diagonal needle, which still reads as a meter. In the adaptive circle the window corners just touch the mask, and the four screws sit outside the safe zone on purpose: they show in squircle and rounded-square masks and drop out cleanly in a circle. The weakness is that at launcher size it collapses toward the generic gauge silhouette the teardown lists as a clone tell.

| Rubric | Score | Reason |
|---|---|---|
| Reads as real equipment | 8 | Log scale, recessed glass and needle shadow are all lifted from the spec. |
| Legible at 48 px | 7 | Needle and arc survive; the window is busy for its size. |
| Distinct from the category's clip-art | 6 | At 512 it is ours; at 48 it nears the stock gauge icon. |
| No AI tells | 8 | Off-centre needle, one hue, uneven ticks. |
| Works in the adaptive circle | 7 | Tight fit; screws only appear in non-circular masks. |

## Concept 2: LED ladder

Files: `assets/icon-concepts/concept-2-led-ladder.svg`, `concept-2-led-ladder-mono.svg`, `concept-2-led-ladder.png`, `concept-2-led-ladder-48.png`.

The bolted LED plate from Bible §3 reading STRONG: LED 1 at `p3` as the power lamp, LEDs 2 and 3 at `p4`, LED 4 at `p5`, and the CRITICAL lens dark with its `n4` specular dot at 10 o'clock. The ladder is one step short of red, which is the tension this mark sells. Beside the plate an engraved SPI scale runs 0 to 100 with tier ticks at 20, 45, 70 and 90 and leader lines into the gaps between lamps, so the uneven tier boundaries from the psych brief are visible next to evenly spaced lamps. It borrows the K-II meter's ladder and its habit of being read from arm's length. Lit lamps differ by brightness only, with a soft bloom and no glossy highlight, and the plate carries two screws, one of them burred. At 48 px it is the most legible of the three: four bright dots over a dark one inside a plate. The tall plate sits just inside the 683 circle and fits every mask. Its problem is the category: the teardown names a K-II LED strip as a common clone tell, and at small sizes it can read as a traffic light or a battery meter.

| Rubric | Score | Reason |
|---|---|---|
| Reads as real equipment | 7 | Plate, screws and scale help; the lamps alone are generic. |
| Legible at 48 px | 9 | Strong bright-and-dark pattern at any size. |
| Distinct from the category's clip-art | 5 | LED strips are already common on competitor icons. |
| No AI tells | 8 | Off-centre composition with the scale to the left, no gloss. |
| Works in the adaptive circle | 9 | Fully inside the safe circle in every mask. |

## Concept 3: nameplate

Files: `assets/icon-concepts/concept-3-nameplate.svg`, `concept-3-nameplate-mono.svg`, `concept-3-nameplate.png`, `concept-3-nameplate-48.png`.

The riveted aluminium nameplate from Bible §2, filled by the model number `FS-4` engraved in `n2` with a faint `n6` lip on the lower edge of each cut. The letters are drawn as round-ended strokes, which is how a rotary engraving cutter leaves them, and the plate carries two rivets, a few brushing hairlines and a scuff in the upper left. Over its lower right corner sits a round paper inspection sticker in `paper` and `ink`, rotated with a lifted shadow, carrying a twelve-month ring and the inspector stamp `07` from the Bible's PRÜF scheme. It borrows the identification and calibration labels found on surplus test gear, the same paper the first-launch sticker uses. It reads as equipment because nothing in it is a symbol: it is a part you could unscrew. At 48 px `FS-4` stays readable and the sticker turns into a pale disc that keeps the corner asymmetric. The plate is wider than tall but stays inside the 683 circle with margin, and the mono version cuts the letters out of a solid plate so themed icons keep the engraved look. Its risk is that the letterforms are plain geometric strokes; if the Gate 1 name differs from the in-fiction model, the plate legend changes and has to be redrawn.

| Rubric | Score | Reason |
|---|---|---|
| Reads as real equipment | 8 | Plate, rivets and inspection sticker are hardware, never icons. |
| Legible at 48 px | 8 | Four strong glyphs; sticker detail is lost but the shape holds. |
| Distinct from the category's clip-art | 9 | No competitor uses a nameplate; no radar, ghost or skull. |
| No AI tells | 8 | Off-centre sticker, wear marks; plain letterforms are the soft spot. |
| Works in the adaptive circle | 9 | Comfortably inside the safe circle in every mask. |

## Recommendation

Concept 3. It is the only one that cannot be mistaken for another app in the category, and it speaks the same paper-and-aluminium language as the calibration sticker the user meets at first launch. Concept 1 is the fallback if David wants the icon to show a reading; it would need the window simplified for launcher size.
