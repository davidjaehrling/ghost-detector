# src/fx

Visual effects. `ghostV0/` is the P2 ghost compositor, built on plain RN `Image` and `View`
so it runs before Skia lands. P3 swaps the internals; the props stay.

## ghostV0: what it does
- `regionFromImage(uri)` -> `{ region, meanLuma, p90Luma } | null`. Both platforms end in
  `regionFromRgba` (`regionFromPixels.ts`): `downsampleLuma` to 96 px, `findDarkRegion`, then the
  region box's mean and 90th-percentile luma.
  - Web (`regionFromImage.web.ts`): canvas `getImageData` at 384 px.
  - Native (`regionFromImage.ts`): `expo-image-manipulator` resizes to 96 px on the long side and
    saves a base64 JPEG; `jpeg-js` decodes it in JS (`regionFromJpegBase64`). No Skia. Needs a dev
    client build that includes `expo-image-manipulator`.
- `placeGhost(region | null, frame, seed, { opacityRange?, tier?, tierCap? })` -> `Placement`. Pure,
  seeded, tested. Figure plus motion copies cover at most 15% of the frame and stay inside it.
  Centre 10 to 30% of the region size off the centroid, inside the region box where the margins
  allow, otherwise as close to it as they allow (the figure box still overlaps the region).
  - Margins (D-009): the centre sits 15 to 40% in from the left or right frame edge
    (`EDGE_MARGIN_X`) and at least 10% from the top and bottom (`EDGE_MARGIN_Y`), so it is never
    jammed against the bezel and never within 8% of the midline (the band leaves 10% clear).
    A region flush with one side edge pushes the offset to its inner side.
  - Opacity: `opacityRange` clamped to 0.08 to 0.25; without one the band is
    `DEFAULT_OPACITY_RANGE` = 0.17 to 0.25 (0.13 in round 1; raised because the interior density
    patches take light back and the result screen's ACTIVE ladder sits in the band's lower half).
  - Extent by tier (round 2, D-017): with `tier`, the union of the figure, its copies and the echo
    is sized to `TIER_EXTENT` of the frame: ACTIVE 11%, STRONG 13%, CRITICAL 14.5% (the panel
    asked for about 11, 14 and 17%; plan section 6 caps the ghost at 15%, so STRONG and CRITICAL
    are scaled into the cap: a ruling for the Director). QUIET and TRACE keep the region size.
  - `echo` (CRITICAL only): a second copy of the whole figure 8 to 12 px off (`ECHO_PX`, round 3,
    D-022; 6 to 10 in round 2), mostly sideways, direction seeded, at 45% of the main figure's
    alpha (`ECHO_ALPHA`; 0.15 in round 2, which vanished under the blur and smear). It takes
    `ECHO_SHARE` 0.15 out of the copies' `COPY_ALPHA_SUM` budget, so the stacked alpha is at most
    1.65 x opacity (0.297 at the CRITICAL cap of 0.18); the per-pixel clamp bounds the light.
    Optional field: older callers ignore it.
  - `tier` (the result screen should pass `outcome.tier`): caps the band's top at
    `TIER_OPACITY_CAP` (quiet 0.10, trace 0.10, active 0.22, strong 0.20, critical 0.18; override
    per tier with `tierCap`). The tier shows in the SPI, not in the ghost's brightness. CRITICAL
    also drops one motion copy (2 to 4 instead of 3 to 5) so it smears less.
  - 3 to 5 offset copies along one drift direction at falling alpha. No region: lower third,
    left or right of the midline, inside the same margins.
- `<GhostV0 placement regionMeanLuma />` draws the matte copies inside one absolute-fill layer
  over the photo. Optional props: `fadeInMs` (linear `Animated.timing` 0 to 1, default 0 = final
  state at once; `?static=1` on web always shows the final state), `regionP90Luma` (tint fallback
  only), `disabled`, `blend` (`'screen' | 'tint'`).
- Mattes: `assets/ghost/matte-{1,2,3}.png` from `scripts/gen-ghost-mattes.mjs` (seeded, no source
  images). Alpha is normalised so the densest 0.5% of each matte is fully opaque, eased
  (`1 - (1 - a)^2`), and the figure is cropped to its box (at most 1.3x stretch per axis).
  - No enclosed holes (D-009): the noise mask may cut gaps only near the silhouette edge; deep
    inside the body it only varies density (floor 0.4), so every gap bites in from outside. A
    flood fill from the border finds no enclosed component below alpha 40, 80 or 128 in the top
    60% of any matte.
  - Edge feather: a 34 px blur of the same alpha at 0.6 strength is laid under the body (max), so
    the outer falloff (90% to 5% of the row peak) runs over 99 to 197 px of the 512 px matte width,
    wider than the body's own soft edge.
  - Head: a second, finer noise field warps it and bites its outer band (the core keeps at least
    60%), and it is drawn at 72% of the torso density so it never pops out as a bright ball.
  - Asymmetry: uneven shoulders, a lean, one faint arm hint on mattes 1 and 2; matte 3 is cut by
    a ragged occluder at 62% of its height.

## Blend: the ghost adds light
The layer has `mixBlendMode: 'screen'`; the copies stack with normal alpha inside it. Screen gives
`out = b + A * s * (255 - b) / 255` (backdrop `b`, layer alpha `A`, matte grey `s` = 255), so it
can only lift, most over black and least over near-white, which is how light in a photo behaves.
- Native: RN 0.77+ on the new architecture supports `mixBlendMode` on views.
- Web: react-native-web 0.21 passes `mixBlendMode` through as CSS `mix-blend-mode`. It sits on the
  layer, not on the images, because every RN web view is its own stacking context (`z-index: 0`):
  a blend on an image would only mix with the empty layer.
- Fallback (`blend="tint"`, or web without `CSS.supports('mix-blend-mode', 'screen')`): normal
  alpha with a neutral grey at `p90 + 18` (`ghostTint`, `FALLBACK_LIFT`), so the figure lifts the
  region's brighter pixels too. Weaker: pixels brighter than the tint still darken. Without
  `regionP90Luma` it estimates p90 as mean + 30.

## Alpha cap (Refuter D4)
Copies (and the CRITICAL echo) share a fixed budget: their alpha multipliers sum to
`COPY_ALPHA_SUM` = 0.35, falling by 0.72 per step. Where the figure and every copy overlap, the layer alpha is
`1 - (1 - o) * prod(1 - o * a_i) <= o * (1 + sum a_i) = 1.35 o <= 1.35 * 0.25 = 0.3375`
(union bound; `stackedAlpha` computes the exact value, tested for 2000 placements).

## L2 harness flags (web only, read inside `GhostV0`)
- `?ghost=0` hides the ghost (with/without difference images).
- `?ghostblend=tint` forces the fallback path.

## Measured (L2, Chromium, 390x844 at 1x, `fixture=cellar`, `static=1`)
Screenshot of the photo panel (318x303) with and without the ghost (`&ghost=0`), luma difference
(Rec. 601) per pixel. Mean lift is over the main figure box; the union box is the figure plus its
copies, as a share of the visible panel (`frame` is the panel, so the 15% cap applies to it).

| demo | build | matte opacity | copies | mean lift in figure box | max lift | darkened px | lifted px (>= 2) | union box | centre (x, y) |
|---|---|---|---|---|---|---|---|---|---|
| active | as shipped (no `tier`) | 0.196 | 3 | 12.0 | 64 | 0 | 5.5% | 13.9% | 0.29, 0.62 |
| critical | as shipped (no `tier`) | 0.137 | 5 | 10.9 | 45 | 0 | 6.1% | 13.9% | 0.31, 0.62 |
| active | with `tier` passed | 0.180 | 3 | 10.9 | 58 | 0 | 5.4% | 13.9% | 0.29, 0.62 |
| critical | with `tier` passed | 0.133 | 4 | 10.6 | 44 | 0 | 6.0% | 13.6% | 0.31, 0.62 |

CRITICAL lifts no more than ACTIVE in either build. "With `tier`" is a scratch build whose result
screen passes `tier: outcome.tier`; the shipped screen does not pass it yet.

## Stable contract (P3 keeps these)
- `placeGhost` signature and the `Placement` shape (pixels in the photo view's space).
- `<GhostV0 placement regionMeanLuma />` required props; P3 may add optional ones (a `photo`
  for the grain pass) but must not require new ones.
- `regionFromImage(uri): Promise<{ region, meanLuma, p90Luma } | null>`.

## What P3 replaces
- RN `mixBlendMode` -> Skia Screen or Plus blend mode.
- Offset copies -> real Gaussian blur on the ghost (more than the scene) plus directional blur.
- Baked noise in the matte -> live FractalNoise mask for feathering, displacement per photo.
- No grain today -> one grain pass applied after compositing, over photo and ghost together.
- JPEG round trip in `regionFromImage` -> Skia raster image read back on the device.

## Thermal
P3-05. `src/fx/thermal/`: a seeded temperature field from the photo's luma, drawn in the Bible's
phosphor white-hot palette (`PH-WHT`, one hue, D-003) at sensor resolution and upscaled in hard
blocks, with the cold spot's ΔT readout and a FLIR-style scale bar.

### API (`import { ... } from '../src/fx/thermal'`)
- `lumaFromImage(uri)` -> `Promise<{ grid, region } | null>`. One pixel read gives both the 96 px
  luma grid (`downsampleLuma`) and the engine's dark region (ghostV0's `regionFromRgba`), so the
  cold spot and the figure use the same region. Web: 2D canvas at 384 px. Native: the ghostV0
  route (expo-image-manipulator, base64 JPEG, jpeg-js).
- `buildThermalField(grid, region | null, { seed, tier, deltaC? })` -> `ThermalField`. Pure,
  seeded, tested (`__tests__/thermalField.test.ts`).
  - Size 160 x 120, or 120 x 160 for a portrait photo (digest section 5).
  - `T = ambient + base(luma) + noise - dip`. Ambient seeded 17 to 23 °C. Base: smoothed luma
    around its median over its own 5 to 95% spread, bright = warm, soft-clamped to ±4 °C.
    Edge: the luma's high-pass (light blur minus a heavy one) adds up to ±1.8 °C (`EDGE_C`), a warm
    rim on the lit side of an edge and a cold rim on the dark side (round 2).
    Noise: two octaves of seeded value noise plus a fixed per-pixel sensor pattern (`FPN_SHARE`
    30% of the budget, its own stream), never beyond ±0.4 °C; the pattern is what makes the
    160 x 120 blocks visible through the nearest upscale.
  - Cold spot: Gaussian dip (sigma 0.6 of the radius), radius 8 to 14% of the short side, centred
    on the region centroid with up to 15% seeded jitter and kept inside the region box. No region
    (bright frames): the darkest smoothed point inside a 15% margin. Depth by tier
    (`TIER_DEPTH`): quiet 0 (no spot), trace 1.5, active 3, strong 6, critical 9 °C. From STRONG
    up 75% of the dip is an upright body-height smudge (`SMUDGE_ASPECT` 1.6:1, half-width 0.55
    sigma, narrower at the head end, a seeded lean) inside a tightened round rest; both are 1 at
    the centre, so ΔT is unchanged. Second moments of the dip: 1.3 to 1.9:1 (tested on 29 rooms).
  - The dip uses its own random stream, so QUIET and CRITICAL on one seed are the same room with
    and without it; the test measures the dip at the centre against that room (within 0.3 °C).
  - `deltaC` pins the ΔT to a reading the screen already shows (clamped -12..0; 0 or above means
    no spot; ignored on QUIET).
  - Fields: `width, height, data` (°C, row-major), `ambientC, minC, maxC`,
    `coldSpot { x, y, radius, depthC } | null` (normalised to the frame), and
    **`coldSpotC`**: the signed ΔT rounded to 0.1 °C (for example `-9.0`), null on QUIET.
- `<ThermalView field width height top? static? testID? />` (default testID `thermal-view`).
  - Draws the field at the panel width and the photo's aspect, offset by `top` (the same `top`
    the photo panel uses, so the thermal frame covers the photo pixel for pixel; default: centred
    on the cold spot with the result screen's crop rule).
  - Offscreen pass (`render.ts`): field -> grey RGBA bytes -> runtime shader (SkSL, `PH_WHT_SKSL`)
    on a 160 x 120 CPU raster surface -> image, drawn with `FilterMode.Nearest` so each sensor
    pixel is a hard block (2.65 px at 318 wide).
  - `PH-WHT`: six even stops `p0, p1, p2, p3, p4, p5` (Bible section 3: coldest `p0`). The view
    sits on an `n0` ground. Display scale: FLIR-style histogram equalisation at full strength
    (`EQUALISE` 1, the pixel's rank; half in round 1, which left the room soft), otherwise a 9 °C
    spot squeezes the room into the top two stops. The scale bar ticks use the same mapping
    (`displayPos`), so their labels stay true. The view draws in a `SnapshotCanvas` (warp capture).
  - Reticle: 15 px crosshair on the cold spot, 1 px `p4` over a 3 px `n0` outline. Spot readout
    box top-left `SP1 ΔT -9.0 °C` in VT323 16 `p4` (Skia text, `useFont` on the bundled TTF; falls
    back to `dT` if the font has no `Δ` glyph). Palette name `PH-WHT` bottom-left, B612 Mono 10 `p3`.
  - Scale bar (Bible section 3): 10 x 220 px at the right on an `n0` plate, PH-WHT gradient warm
    at the top, 1 px `n4` keyline; max at the top and min at the bottom in VT323 16 `p4`; ambient
    tick and label at its left in VT323 16 `p3`; a 6 px `p4` triangle marks the cold-spot value.
  - Live (no `static`): 9 Hz refresh with ±0.12 °C per-pixel sensor shimmer. `static` freezes it
    (L2 goldens; pass it under reduced motion too).
  - The wrapper is `role="img"` with the readout in its label (`Thermal view PH-WHT, SP1 ΔT -9.0 °C`).

### Result screen toggle (Builder A integrates)
- A `THERM` key in the result row swaps the photo panel's contents for `<ThermalView>` over the
  same frame: same `width`, `height` and `top` as the photo, ghost layer hidden while it shows.
  Pressing it again returns to the photo. Static under `?static=1` and reduced motion.
- Build the field once per record: `lumaFromImage(record.photoUri)` (or reuse its region for the
  ghost), then `buildThermalField(grid, region, { seed: record.seed, tier: outcome.tier, deltaC })`.
- One reading on screen: the ΔT in the view must equal the THERM line. Either pass
  `deltaC: reading.thermalC` so the view prints exactly the existing line, or print
  `field.coldSpotC` in the THERM row. Do not show two different numbers. On QUIET the view has
  no spot and no readout box. The `COLD SPOT dT` line (STRONG and CRITICAL) uses
  `reading.coldSpotC`; if it should be the view's reading, pass that as `deltaC` instead and
  keep THERM as the room reading.

### Performance (L2 web harness, headless Chromium, software GL, 390 x 844)
`/thermal-probe?fixture=<f>&tier=critical&bench=1` times 60 runs each:

| fixture | `buildThermalField` | offscreen pass (encode + shader + snapshot) |
|---|---|---|
| cellar | 5.95 to 6.08 ms | 7.9 to 10.4 ms |
| bright | 4.75 to 6.33 ms | 7.2 to 8.5 ms |

rAF intervals over 5 s after mount (quick evaluate script), static and live views on both
fixtures: 300 to 301 frames, mean 16.67 ms, p95 16.8 ms, max 16.8 ms, no frame over 33 ms. The
build runs once per record; only the pass repeats (9 Hz live, never when static), about 7% of
the main thread at 9 x 8 ms. `encodeField` alone is about 1.1 ms in Node after the rank lookup
moved to a 1024-bin histogram (3.8 ms with a binary search per pixel).

### Unverified
- Native: nothing here has run on a device. The CPU raster surface, runtime shader and
  `useFont` on the bundled TTFs are the same Skia calls on both backends, but L3 has not seen them;
  native `lumaFromImage` is the untested ghostV0 route plus the luma grid. No Android frame-time
  numbers yet.
- VT323 `Δ`: renders on CanvasKit in the goldens; the `dT` fallback path is untested.
- Shareability of one-hue thermal (D-003 says the panel may revisit at P3).
- The block look at 2.65 px per sensor pixel: round 2 adds the fixed pattern, so it shows at 1x
  as a mottle with stepped edges; the hard blocks are plain zoomed in (nearest sampling checked).
- Goldens only at 390 (`thermal-cellar.png`, `thermal-bright.png`, critical tier).

## Glass
`src/fx/glass/` is the P3-02 glass stack (Bible §2, §4, §6, §7; numbers from `fx` and `motion`
in `src/ui/tokens.ts`). Everything is Skia (SkSL runtime shaders and primitives) and renders on
web through CanvasKit. Import from `src/fx/glass`.

### Components
- `<Glass>` is the one component for the four screens. It wraps the window content and adds the
  burn-in, the glass layers (flat or warped) and optionally the warm-up. Props: `warp`,
  `refreshKey`, `warmUp`, `warmUpKey`, `onWarmUpDone`, `burnIn` (default true), `burnInLabels`,
  `seed`, `static`, `reduceMotion`, `intensity`, `grainHz`, `grainScale`, `radius` (default 18),
  the layer flags below, `style`, `testID`. Size it with `style` like the window it replaces.
- `<GlassOverlay>`: a pointer-transparent canvas that fills its parent and draws over the RN views
  beneath it. Layers, each with a flag (all default true):
  - `scanlines`: every second 1 px row of a 2 px pitch gets p0 at 6% (darkens lit content and
    tints it toward the phosphor; measured on the golden: p4 digits 225.7 vs 214.2 G on even vs
    odd rows, p1 72.8 vs 70.4).
  - `vignette`: n0 rising with distance^2.5 to 18% in the corners.
  - `grain`: seeded FractalNoise (freq 0.9, 2 octaves) mapped to signed grain at 4%: positive adds
    p4 light, negative darkens. Re-seeded at `grainHz` (12) unless static.
  - `dust`: 40 to 60 specks (1 to 3 px, 2 to 5%) and 2 to 4 hairline scratches (30 to 120 px,
    4%) in n4, from `dustField(seed)` (Bible §6 ranges, unit-tested over 500 seeds). Positions are
    fractions of the box, fixed per install seed.
  - `shadow`: 2 px n1 inner shadow on the top and left edges.
  Other props: `seed` (install seed), `static`, `intensity` (scales every alpha; 0 hides),
  `grainHz`, `grainScale` (1 or 2, default 2), `radius` (clip). The static layers sit in one
  canvas that draws once; grain has its own canvas so a grain tick redraws only the grain.
  `GlassOverlay` and `BurnIn` are memoised: a parent re-rendering at 10 to 20 Hz (flux, scan
  clock) no longer redraws the window-sized canvas (see "Frame time" below).
- `<FeedTint image? mix? lift? barrel?>` (round 2): the camera feed through the tube. With
  `image` (URI or SkImage: the fixture, a stored frame) Skia draws it through `FEED_SKSL`: luma on
  the phosphor ramp mixed `FEED_MIX` 30% over the colour, blacks lifted toward p0 (`FEED_LIFT`),
  the glass barrel (k 1.5%). Without `image` it wraps its children (the live `CameraView`, which
  Skia cannot sample) under a p3 `color` blend at the mix and a p0 `screen` lift: no barrel on
  that path. Scanlines and grain come from the Glass overlay on top. `feedColor` is the tested TS
  twin. Probe: `/probe?static=1&layer=feed` (golden `glass-feed.png`: shader left, RN right).
- `<SnapshotCanvas>` (round 2): a drop-in `<Canvas>` the web warp can read. On web a Skia canvas
  is WebGL and reads back blank with `toDataURL` once its frame is done, so the warped boot and
  result lost every Skia canvas (photo, thermal, SPI digit). A SnapshotCanvas registers itself and
  the rasteriser pastes `makeImageSnapshot()` in its place. `Composite` and `ThermalView` use it;
  probe `/probe?static=1&layer=warpcanvas` (golden `glass-warp-canvas.png`, plus a pixel check).
- `<GlassLayers width height ...>`: the same layers as Skia nodes for a screen that already has
  a canvas (put it last). Grain then redraws that whole canvas at 12 Hz; prefer `<GlassOverlay>`
  unless the canvas is cheap.
- `<GlassWarp>`: barrel curvature (k = 1.5%: the output pixel at normalised radius r samples
  r(1 + k r^2), outside shows n0 with a 1 px soft edge). It snapshots its children once with
  `makeImageFromView` (and again when `refreshKey` changes), draws the snapshot through the
  barrel shader, then the glass layers, with grain in its own canvas. Children stay mounted
  underneath for layout, touches (the canvas is pointer-transparent; the bend moves content by
  up to about 6 px at the corners) and screen readers. Until the first snapshot it shows the
  children under a flat overlay. **For static-ish screens only (boot, result)**: anything that
  animates under it freezes until the next refresh. The viewfinder's live camera and the scan
  theatre use `<GlassOverlay>` only.
  - Native: `makeImageFromView` reads the view by tag (`collapsable={false}` is set).
  - Web: Skia needs a caller-supplied rasteriser (`snapshotView.web.ts`): the DOM is cloned
    into an SVG `foreignObject` with the page's CSS rules (react-native-web keeps them in CSSOM)
    and the @font-face sources inlined as data URLs, drawn on a 2D canvas and handed to Skia as
    RGBA. Child `<canvas>` elements: a `SnapshotCanvas` is asked for its Skia image; any other is
    copied with `toDataURL` (RN Skia web canvases are WebGL and come out blank that way: use
    `SnapshotCanvas` for every Skia canvas under a warped glass). Cross-origin images and sheets
    are skipped.
  - `onSnapshot(key)` (also on `<Glass warp>`): called with `String(refreshKey)` two frames after each
    snapshot lands (barrel drawn); not called on failure. On web the `${testID}-warped` node then
    carries `data-warped="<key>"`, so the harness waits on that attribute instead of sleeping.
- Phosphor (`Phosphor.tsx`, `persistence.ts`):
  - `usePersistence(value, { tau, step, static, reduceMotion })` returns the trail oldest first,
    ending with the live sample: `{ value, step, color, opacity }[]`. A sample drops one phosphor
    step per tau/3 (60 ms for traces at tau 180, 150 ms for the sweep at tau 450) down to p0,
    then fades over tau; lifetime (step + 1) tau/3 + tau (480 ms trace, 1.2 s sweep from p4).
    Reduced motion caps tau at 60 ms. `TAU.trace`, `TAU.sweep`. Static: the live sample only.
  - `<Bloom radius strength>`: children drawn, then again blurred (decal) and added (Plus) at
    `strength` (0.35).
  - `<PhosphorText text x y size step align bloom lingerMs static>`: VT323 from the bundled
    `@expo-google-fonts/vt323` TTF via `useFont`, with bloom; on a change the old text lingers
    at p1 for 90 ms (Bible §6). Draws nothing until the font is loaded. `useVT323(size)` gives
    the font for other Skia text.
    `onReady()`: called once per mount, one frame after the font has loaded (glyphs drawn); a
    warped parent bumps its `refreshKey` on it so the snapshot never misses the row.
- `<WarmUp durationMs static reduceMotion runKey onDone>`: the 900 ms power-on: an n0 veil that
  lifts with an ease-out cubic while a 2 px p5 band rolls down once, then nothing. Each frame
  advances at most 50 ms, so a start-up stall slows it instead of skipping it. `static` and
  `reduceMotion` render the finished state (nothing) and still call `onDone`.
- `<BurnIn>` / `<BurnInLayer>`: the flux gauge (log arc 100 degrees, 10 to 1000 mG, ticks,
  labels) and the wordmark, off-centre (gauge centre at 62%, 66% of the box), 1 px right, never
  animated. Strength: p4 added (Plus) at `fx.burnIn` (3%), which lifts n0 by about 2 to 7 levels,
  just under p0. A literal p0 at 3% alpha lifts n0 by under half a level and would never show;
  this reading of the Bible's "p0, 3%" is a judgement call for the panel. Labels are a prop.

### Which screen uses what (Builder A applies)
| Screen | Use | Notes |
|---|---|---|
| Boot | `<Glass warp warmUp refreshKey={…}>` | Bump `refreshKey` after the typed text finishes (and on each line if it types inside the glass); during typing the flat overlay is shown. |
| Viewfinder | `<Glass>` (flat) | Live camera: never `warp`. Readouts that move can use `usePersistence` and `<PhosphorText>`. |
| Scan theatre | `<Glass>` (flat) | Traces, needle and sweep: `usePersistence` with `TAU.trace` / `TAU.sweep`, wrapped in `<Bloom>`. |
| Result | `<Glass warp refreshKey={`${id}-${tier}-${photoLoaded}`}>` | Re-snapshot when the photo has loaded and when the reveal lands; before that it is flat. The big SPI digit: `<PhosphorText size={72} step={5}>` for CRITICAL (p5), 4 otherwise. |

All four pass the install seed as `seed` (dust and scratches are fixed per install) and
`reduceMotion` from `AccessibilityInfo.isReduceMotionEnabled`.

### Determinism
- `static` defaults to the harness flag (`?static=1`, read through `readHarness`). Under it no
  timer or animation frame starts: grain uses `seed` (tick 0), trails return the live sample,
  the warm-up and the digit linger are skipped. No layer has a time uniform.
- Every shader is compiled in `useMemo`, never at module load (CanvasKit is not ready then).
- Checked: three loads x two captures of each probe under `?static=1` are byte-identical
  (overlay, warp, phosphor).
- L2: `/probe?layer=overlay|warp|phosphor` (in `SkiaProbe.tsx`, the existing `/probe` route) draws a
  sample RN view (a p1 block near the edges and p4 VT323 text) under `<Glass>`. `e2e/web/glass.spec.ts`
  takes `glass-overlay.png` and `glass-warp.png` at 390 only (`maxDiffPixels: 400`), checks the
  overlay does not take touches (`elementFromPoint` is not the canvas) and that there are no console
  or page errors. On `glass-warp.png` the block's top edge sits at y = 11 at the centre and 13 at
  both ends, its left edge at x = 12 near the top and 10 near the middle (the barrel bow); the
  block's top-left corner averages G 56.0 against 71.4 at its centre (vignette).

### Measured (L2, headless Chromium on SwiftShader, 390 x 844 at 1x, `/probe`, grain animating)
rAF deltas over 3 s after a 1.5 s settle, 3 runs each; busy is main-thread non-idle time from
the CPU profiler over 3 s, minus the static page's ~180 ms, per grain tick (36 ticks).

| Build | median | p95 | max | long tasks | busy per grain tick |
|---|---|---|---|---|---|
| overlay, grain full resolution (`grainScale` 1) | 16.7 ms | 16.8 to 33.4 ms | 33.5 ms | 0 | ~33 ms |
| overlay, grain half resolution (shipped default) | 16.7 ms | 16.7 ms | 16.8 ms | 0 | ~12 to 15 ms |
| warp, half-resolution grain | 16.7 ms | 16.7 to 16.8 ms | 16.8 ms | 0 | ~12 ms |
| same, CPU throttled 4x: overlay full res | 16.7 ms | 33.4 ms | 50 to 67 ms | 2 to 5 | |
| same, CPU throttled 4x: overlay half res | 16.7 ms | 16.7 to 16.8 ms | 33.3 ms | 0 | |
| same, CPU throttled 4x: warp | 16.7 ms | 16.8 ms | 33 to 50 ms | 0 | |

The median sits on the 60 Hz vsync cap in every case, so the p95, long tasks and busy time
are the useful signal. Full-resolution grain dropped a frame on many grain ticks (SwiftShader runs
the noise shader on the CPU, so the cost scales with pixels); a half-size grain canvas stretched
back up by a view transform runs it on a quarter of the pixels and holds 60 fps. The grain is
slightly coarser and softer, which reads as film. The machine was shared with other test runs,
so single runs vary.

### Unverified on native
- No device run yet: `makeImageFromView` timing and scale, the overlay over `CameraView` (Android
  must back it with a TextureView, the default for a non-opaque canvas; a SurfaceView would sit
  above or below the camera), the cost of grain at 12 Hz on a mid-range GPU, the
  `transformOrigin` upscale of the grain canvas, and Plus blending of the burn-in over the
  camera. Phone check 2 measures these.
- The Bible says grain re-seeds at 24 fps; P3-02 asked for 12 Hz. `grainHz` switches it.

## Apparition and compositor v1
P3-03 and P3-04. `ghostV0/` stays as the fallback and is unchanged.

### API
- `src/fx/apparition/`
  - `buildSilhouette(variant, seed)`: pure TS geometry. Six variants (`VARIANT_NAMES`: lean, hunch,
    hood, turned, behind, trail), each a union of skewed, wobbling ellipses and Catmull-Rom blobs
    (cubic Beziers through anchors, flattened): head, uneven shoulders, a lean, a drape with a
    ragged hem. Hunch has a raised shoulder, turned has one soft arm hint (weight 0.45), hood and
    behind carry a seeded ragged occluder (`OCCLUDED_VARIANTS` = 2 and 4) that crosses the body
    above the hem dissolve. Round 3 (D-022): two or three seeded tendrils (`TENDRIL_*`) leave the
    side the figure leans toward between 25 and 55% of its height, drooping and tapering, so the
    outline breaks at a scale the ghost layer's blur, copies and smear keep. No features.
  - `renderApparition({ variant, seed, width, height }) -> SkImage | null`: draws the polygons into
    an offscreen surface (native `Skia.Surface.MakeOffscreen`, snapshot made non-texture; web the
    CanvasKit CPU surface, because `MakeOffscreen` there opens a WebGL context per call whose
    textures the on-screen canvas cannot use). Pass 1: union minus the cut, `DisplacementMap` by
    `FractalNoise`, Gaussian feather. Pass 2: SkSL noise alpha mask: (round 3) the feathered shape
    sampled through a high-frequency displacement (`RAG_CYCLES` 24 per width, `RAG_DISPLACE` 0.12
    of the width peak to peak, so 2 to 6 px at the drawn sizes) and eroded where a vertically
    stretched noise is high (`RAG_ERODE`, teeth and notches), edge erosion, a fine density
    term (floor 0.88 to 0.95), the lower-body fade, and (round 2) the interior density: a
    low-frequency FractalNoise (`DENSITY_CYCLES` 1.6 per width) mapped to 40 to 100%
    (`DENSITY_FLOOR`, `DENSITY_EDGES`) times a seeded one-sided thinning (`lateral` 20 to 35%),
    on the interior only (`INTERIOR`: feathered coverage 0.45 to 0.8, eased out through the hem
    fade, so the outline keeps its density and no dark patch is ever enclosed). The alpha carries
    the outline; the interior density rides in the colour (premultiplied grey), which the
    compositor applies after its clamp. Pass 3 (round 3): a second, fine feather (`FEATHER2`, 0.8%
    of the width). Cached per variant, seed and size (24 entries). Skia is only touched when
    called, never at module load.
  - Every variant dissolves (round 3, D-022; round 2 did only lean): a feathered fade to nothing
    that starts and ends between 50 and 70% of the body's height (`HEM_DISSOLVE`, feather
    `HEM_FEATHER` 12 to 16%, both seeded). The fade line is ragged: it moves by up to `HEM_RAG`
    0.12 box heights with a noise stretched down the body, so the body ends in wisps. The box is
    fitted to what stays visible, with the fade's end `HEM_RAG / 2` above the box bottom so the
    wisps end inside it. No drape, no flare, no tail on any variant (alpha below the fade is 0,
    tested for all six over 20 seeds).
  - `metrics.ts`: the same steps on a 40 x 80 alpha grid in pure TS (value noise stands in for
    FractalNoise at the same frequency and amplitude): `mirrorCorrelation`, `largestHoleFraction`,
    `areaFraction`, `edgeIrregularity` (round 3: marching-squares outline length over its convex
    hull's perimeter; about 1.0 for a smooth blob, tested at 1.25 or more for all six variants
    over 20 seeds), `silhouetteMetrics(variant, seed)`. The grid measures the apparition image,
    before the ghost layer's blur, copies and smear, which soften the finest teeth on screen.
  - `FIT_W`, `FIT_H`, `imageRectFor(box)`: the silhouette fills the centre 80 x 88% of its image;
    the compositor draws the image larger so the silhouette fills the placement box and the feather
    spills past it. Width may stretch up to 1.45x the height scale (1.25 in round 1; v0 mattes
    allowed 1.3x), so the narrow variants fill their box.
- `src/fx/compositor/`
  - `<Composite photo width height photoRect? region meanLuma p90Luma? p80Luma? grid? placement tier? seed static? fadeInMs? disabled? variant? pop? />`.
    `photo` is an `SkImage` or a URI; `placement` is the unchanged `placeGhost` output in panel
    pixels; `photoRect` is where the photo sits in the panel (default centred cover); `grid` is
    `RegionStats.grid`; `variant` is 0..5 or `'png'` (the v0 matte `placement.matte`), default
    `seed % 6`. Web flags read inside it: `?static=1` (no fade), `?ghost=0` (photo and grain only).
    `pop` (0..1, `useScare`'s value; D-023): on the pop frame the layer's stacked peak alpha goes to
    `POP_ALPHA` 0.30 (a cap), the clamp opens by `POP_LIFT` 40 luma on a linear curve (`POP_GAMMA`
    1, so the hem dissolve keeps its gradient), and the pop layer (built as soon as the scare is
    armed) adds a 6 to 10 px smear along the figure's motion (`popSmearFor`) followed by the
    variants' ragged-edge pass again (`POP_RAG_SKSL`), so the smear never rounds the hem off.
    Under `?static=1` it publishes `window.__composite` (`CompositeInfo`: placement, panel, clamp
    reference and lift, occlusion threshold and ramp, gradient under the figure, synthesised mass,
    share of the figure cut, medians, near-black flag, grain, peak alpha, variant, seed, tier, pop) for
    `scripts/measure-ghost.mjs`, on the probe and the result route alike.
  - `wantsCompositorV1()`: true when the web URL has `v=1`.
  - `regionFromImage(uri) -> RegionStats | null`: `{ region, meanLuma, p80Luma, p90Luma, grid }`.
    Native: `Skia.Data.fromURI` + `MakeImageFromEncoded`, halved on CPU raster surfaces to at most
    192 px, `makeNonTextureImage().readPixels` as RGBA, then the shared `statsFromRgba` (96 px grid,
    `findDarkRegion`). Falls back to the v0 path (expo-image-manipulator + jpeg-js) with the same
    stats when Skia cannot read the file. Web: the v0 2D-canvas read of the photo.
  - Pure, tested helpers: `plusClamped`, `compositePixel`, `occlusion`, `bandVisibility`,
    `grainOffset` (`blend.ts`, the TS twin of the SkSL), `motionCopies`, `layerCopies`,
    `ghostBlurSigma` (`motion.ts`), `reference`, `gradientEnergy`, `makeBand`, `bandCut`, `unionBox`
    (`reference.ts`), `statsFromRgba`, `lumaUnder`, `halvingSteps`, `estimateP80`.

### What v1 does that v0 did not
- One Skia canvas: the photo and the ghost go through one runtime shader, so the grain lands on
  both. v0 stacked RN images over an RN image and had no grain.
- Procedural figures (six seeded variants) instead of three baked PNG mattes; PNGs are the fallback.
- Real Gaussian blur on the ghost layer (2.5% of the figure width, 2.4x for the TRACE and QUIET
  smudge) on top of the 3 to 5 directional copies; the photo is not blurred. CRITICAL's 2 to 4
  `placeGhost` copies are split to 3 without reaching further or adding alpha.
- One-sided vertical motion smear (round 2): every copy is drawn at 6 offsets from 0 to 6 to 10 px
  (`smearFor(seed)`, three in four downward), added with exponentially falling weights that sum
  to 1, so it spreads alpha without adding any.
- Plus blend at the layer alpha (the `placeGhost` opacity, 8 to 25%), light only. Screen was tried
  first and lifted the bright fixture's figure box by 2.4 luma, because it adds `a * (1 - bg)`.
- Per-pixel clamp in the shader (round 2): with `peak` the layer's highest alpha
  (`stackedAlpha(placement)`) and `t = a / peak`, the lift is `min(lift, min(allowed, peak) *
  t^GAMMA)`, `GAMMA` 0.35, `allowed = reference + CLAMP_LIFT - bg luma`, `CLAMP_LIFT` 34 (24 in
  round 1). The core lands on the limit, faint parts pass unchanged, and fades, feather and
  density keep their gradient. Round 1's `allowed * (1 - exp(-6 lift / allowed))` saturated every
  pixel above a third of the core's alpha, which turned the feather and every fade into a hard
  edge (the cut-out look). The interior density (the layer's grey / alpha) then scales the lift.
  Never negative, never more than the plain blend.
- Partial occlusion by the scene: the ghost fades out above a threshold of the scene luma. With
  the grid (round 2) the scene is the photo's 96 px luma grid box-blurred (`occlusionGrid`) and
  sampled bilinear, so cuts are coherent patches that follow the scene; the threshold starts at
  the 80th percentile of the area and is lowered (`adaptOcclusion`) until at least 11% of the
  figure's footprint (the ellipse in its box) is cut (`OCC_CUT_MIN` 10% is the tested floor); the
  ramp narrows to the scene's spread (3 to 10 luma), so a flat dark scene is cut in patches, not
  dimmed. Without the grid: 9 taps, 3 px radius, 80th percentile, 10 luma ramp, as before.
- Synthesised foreground mass on flat interiors only (D-023, replacing round 3's band): when the
  mean luma gradient of the raw grid under the figure's ellipse is under `FLAT_GRADIENT` (2.5) and
  the photo's median luma is 12 to 200 (`INTERIOR_LUMA`), a soft, out-of-focus mound rises from
  below into the figure's lower third (`makeBand`: its top edge 76 to 84% down the box, raised
  until it hides 11% of the ellipse, never above 2/3; crown sinking 4 to 10% of the figure height
  at its sides; gentle long-wave edge noise; 12 px soft edges, `BAND_SOFT` 6). It is drawn in the
  scene's own colour, sampled from the photo just under the figure and averaged across 48 px
  (`BAND_MIX` 0.85), and is part of the scene (drawn with or without the ghost). Edge-rich scenes
  (outdoors), blown-out frames (bright, median 233) and near-black frames keep only the adaptive
  scene-edge occlusion above. Note: the dark spiky fringe along the top of the outdoors fixture
  is the fixture's own tree line (`scripts/gen-fixtures.mjs`), not a compositor layer.
- Near-black fallback (D-023): when the photo's median luma is under 12 (`NEAR_BLACK`), the figure
  becomes the TRACE-style smudge (`smudgePlacement`: 0.7 scale about its centre, opacity 0.10,
  the top of the lowest band; TRACE's blur times `NEAR_BLACK_BLUR` 4; no density patches) under a
  hard ceiling of the local mean + 18 (`NEAR_BLACK_LIFT`; the shader holds it at 16,
  `NEAR_BLACK_CAP`, which also caps every pixel's lift, leaving room for the glass laid over the
  result panel), with the grain after compositing at 1.5x. It is the scene's median, not the
  median under the figure: the cellar's floor under the figure is 6 to 7 luma in a room whose
  median is 41, and there the normal figure is right.
- Grain 4% after compositing, seeded FractalNoise, added equally with and without the ghost, so the
  with/without difference never goes negative.

### Deviation to rule on: the clamp reference
The contract says region mean + 24. The dark region is a threshold component, so its mean sits
under everything around it, and `placeGhost` (margins, off-centroid offset) puts part of the figure
outside it: on attic the scene under the figure box is 18.7 luma against a region mean of 3.1, on
outdoors 94.7 against 49.5. Clamping at region mean + 24 left the attic and outdoors figures at a
mean lift of 4.5 to 4.7. With `grid` passed, `reference.ts` uses the scene under the figure's union
box instead (mean for the clamp, its 80th percentile for the occlusion), never below the region's
own values; without `grid` it uses the region statistics as specified. The "clamp ref" column
below shows which value was used.

### Measured (L2, `node scripts/measure-ghost.mjs`, Chromium 390 x 844 at 1x, panel 318 x 303)
Screenshots of the panel with and without the ghost (`&ghost=0`), luma difference (Rec. 601).
Figure box = the `placeGhost` box; union box = figure plus copies (and echo) as a share of the
panel; over clamp = pixels lifted past clamp ref + 34 (with the grain slack), from the published
`window.__composite`. Round 2, ACTIVE, both routes:

Probe (`--route probe`):

| fixture | variant | opacity | region mean | clamp ref | box bg | mean lift in figure box | max lift | darkened px | over clamp px | lifted px (>= 2) | union box | centre (x, y) | target |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cellar | 0 | 0.217 | 6.4 | 7.8 | 9.3 | 12.4 | 39 | 0 | 0 | 6.5% | 11.0% | 0.26, 0.62 | PASS |
| attic | 2 | 0.173 | 3.1 | 16.4 | 17.8 | 14.6 | 51 | 0 | 0 | 6.3% | 11.0% | 0.40, 0.62 | PASS |
| bright | 3 | 0.183 | 220.6 | 220.6 | 203.0 | 13.5 | 59 | 0 | 0 | 5.6% | 11.0% | 0.76, 0.62 | PASS |
| black | 0 | 0.202 | 1.4 | 1.5 | 3.4 | 12.6 | 35 | 0 | 0 | 6.5% | 11.0% | 0.76, 0.38 | PASS |
| outdoors | 4 | 0.173 | 49.5 | 124.6 | 117.3 | 13.8 | 56 | 0 | 0 | 4.1% | 11.0% | 0.78, 0.62 | PASS |

Result screen (`--route result`, `/result/demo?static=1&demo=active`, Builder A's per-case seeds):

| fixture | variant | opacity | region mean | clamp ref | box bg | mean lift in figure box | max lift | darkened px | over clamp px | lifted px (>= 2) | union box | centre (x, y) | target |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cellar | 3 | 0.191 | 6.4 | 9.8 | 11.7 | 8.2 | 39 | 0 | 0 | 4.6% | 11.0% | 0.31, 0.62 | PASS |
| attic | 5 | 0.188 | 3.1 | 35.2 | 37.6 | 8.5 | 47 | 0 | 0 | 4.6% | 11.0% | 0.60, 0.38 | PASS |
| bright | 5 | 0.208 | 220.6 | 220.6 | 189.1 | 11.3 | 58 | 0 | 0 | 5.4% | 11.0% | 0.35, 0.62 | PASS |
| black | 5 | 0.208 | 1.4 | 1.5 | 4.1 | 11.2 | 33 | 0 | 0 | 6.2% | 11.0% | 0.60, 0.38 | PASS |
| outdoors | 2 | 0.204 | 49.5 | 118.4 | 101.0 | 11.5 | 61 | 0 | 0 | 4.2% | 11.0% | 0.78, 0.62 | PASS |

Cellar and attic on the result route sit near the floor: their figures stand behind the crate
and the lit wall, which occlude a large part of them. Max lift exceeds 34 where a pixel is darker
than the reference. Every variant forced on every fixture (probe, `--variant N`), mean lift:

| variant | cellar | attic | bright | black | outdoors |
|---|---|---|---|---|---|
| 0 lean | 12.4 | 12.1 | 14.6 | 12.6 | 15.5 |
| 1 hunch | 7.8 (fail) | 11.4 | 12.6 | 9.8 | 10.2 |
| 2 hood | 9.9 | 14.6 | 15.5 | 11.1 | 10.7 |
| 3 turned | 13.0 | 12.3 | 13.5 | 9.7 | 15.5 |
| 4 behind | 7.4 (fail) | 13.2 | 10.2 | 9.2 | 13.8 |
| 5 trail | 12.0 | 11.3 | 9.6 | 10.9 | 12.6 |
| png (v0 matte) | 7.5 (fail) | 7.5 (fail) | 11.5 | 7.0 (fail) | 9.5 |

28 of 30 procedural combinations reach 8 (hunch and behind on cellar fail, under the crate's
occlusion); every default pick passes on both routes. Darkened is 0 everywhere.

Silhouette metrics (Vitest, 6 variants x 20 seeds, round 2 shapes): mirror correlation at most
0.49 (test: 0.55), no enclosed hole, area 34 to 59% of the box (test: 30 to 60%). Round 1 (old shapes): a wider hand check over 500 other seeds per variant (3000
figures) found mirror at most 0.71, no hole over 1%, and one figure at area 0.602 (just over the
60% rule). The occluders hide 7 to 21% (hood) and 3.5 to 24% (behind) of the body.

Goldens: `e2e/screenshots/golden/android-390x844/composite-<fixture>.png` from
`e2e/web/compositor.spec.ts` (390 only, `maxDiffPixels: 400`). Judged against plan section 6: light
added, faint, off-centre, under 15%, no features, asymmetric, grain over the whole panel, occlusion
visible on attic, outdoors and cellar. Round 2 (regenerated, opened and judged against D-017):
the figures carry thicker and thinner patches and soft fades (no flat wash, no cut-out edge), the
lean figure on cellar and black dissolves below the waist (no tail), the attic beam cuts the hood
figure, the smear shows as a short vertical drag. Weak spot left: on bright the figure is still a
pale highlight beside the lamp. Note: the goldens' default threshold (0.2 per pixel) does not see
a ghost change of a few luma; `measure-ghost.mjs` is the check for the figure itself.

Round 3 (D-022), result route (`node scripts/measure-ghost.mjs --no-export --out dist --route
result`, flat glass, gating pass; the table now carries the gradient under the figure, which
occluder cut it and the share of the figure's ellipse cut):

| fixture | variant | clamp ref | mean lift | max lift | darkened px | over clamp px | union box | centre (x, y) | gradient | occluder | cut | target |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cellar | 3 | 9.8 | 8.5 | 37 | 0 | 0 | 11.0% | 0.31, 0.62 | 0.84 | band | 26.6% | PASS |
| attic | 5 | 35.2 | 9.4 | 47 | 0 | 0 | 11.0% | 0.60, 0.38 | 4.82 | scene | 14.2% | PASS |
| bright | 5 | 220.6 | 11.1 | 58 | 0 | 0 | 11.0% | 0.35, 0.62 | 2.12 | band | 12.8% | PASS |
| black | 5 | 1.5 | 9.6 | 34 | 0 | 0 | 11.0% | 0.60, 0.38 | 0.23 | band | 24.4% | PASS |
| outdoors | 2 | 118.4 | 14.4 | 59 | 0 | 0 | 11.0% | 0.78, 0.62 | 11.74 | scene | 11.0% | PASS |

Two runs per fixture, spread 0.00. The warped pass (information only, the warp is a lens over the
finished screen) shows 20 px over the clamp on outdoors, at the tree's bright edge (no-ghost luma
155 to 196, lift 1 to 11). Silhouette metrics (6 variants x 20 seeds, round 3 shapes): edge
irregularity at least 1.30 (test: 1.25), mirror at most 0.54, area 39 to 59%, largest enclosed
hole under 1%. The grid measures the apparition image; on screen the ghost layer's blur, motion
copies and smear soften the finest teeth, so the outline reads as lumpy and broken (tendrils, a
ragged hem, the band's ragged edge) rather than toothed.

Round 4 (D-023 defect fixes), same command and route:

| fixture | variant | clamp ref | mean lift | max lift | darkened px | over clamp px | union box | centre (x, y) | gradient | scene median | occluder | cut | target |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cellar | 3 | 9.8 | 9.0 | 37 | 0 | 0 | 11.0% | 0.31, 0.62 | 0.84 | 41 | mass | 22.2% | PASS |
| attic | 5 | 35.2 | 9.4 | 47 | 0 | 0 | 11.0% | 0.60, 0.38 | 4.82 | 35 | scene | 14.2% | PASS |
| bright | 5 | 220.6 | 11.1 | 58 | 0 | 0 | 11.0% | 0.35, 0.62 | 2.12 | 233 | scene | 11.0% | PASS |
| black | 5 | 1.5 | 6.2 | 16 | 0 | 0 | 5.4% | 0.60, 0.38 | 0.23 | 1 (smudge) | scene | 11.0% | PASS |
| outdoors | 2 | 118.4 | 14.4 | 59 | 0 | 0 | 11.0% | 0.78, 0.62 | 11.74 | 114 | scene | 11.0% | PASS |

Two runs, spread 0.00. Black's target is 6 to 12 with max lift 18 (the smudge); 6.2 is near the
floor of what a 0.7-scale figure at 10% opacity can lift over its box (the Plus blend adds at
most the layer alpha). The warped pass still shows the 20 px on the outdoors tree edge.

### What Builder A changes in the result screen
1. Import from `src/fx/compositor`: `Composite`, `regionFromImage` (it returns a superset of the v0
   result, so `RegionResult` users keep working), `wantsCompositorV1`.
2. Keep `placeGhost`, `panelTop`, `panelRegion`, `cropOnFigure` and the smudge scaling exactly as
   they are; the placement contract is unchanged.
3. In `PhotoPanel`, when `wantsCompositorV1()` (later: always), render instead of the `Image` plus
   `GhostV0`:
   ```tsx
   <Composite
     photo={photoUri}
     width={W}
     height={height}
     photoRect={{ x: 0, y: composite.top, width: W, height: imgH }}
     region={panelRegion(...)}   // the region given to placeGhost
     meanLuma={composite.meanLuma}
     p90Luma={read.result?.p90Luma}
     p80Luma={read.result?.p80Luma}
     grid={read.result?.grid}
     placement={composite.placement}
     tier={outcome.tier}
     seed={seed}
     static={isStatic}
     fadeInMs={FADE_MS}
   />
   ```
   It draws the photo itself, so drop the RN `Image` on that path. It renders nothing until the
   photo is decoded and the ghost layer is built; `testID="composite"` appears when it is drawn.
   For a QUIET result with no figure, either keep the RN `Image` or pass `disabled`.
4. Mount it once and let `static` / `fadeInMs` handle the reveal (it fades the ghost, not the
   photo). The needle-settle gating can stay outside, as now.
5. `scripts/measure-ghost.mjs --route result` measures the result screen; the `Composite` there
   publishes `window.__composite` under `?static=1`, so the clamp and the box are checked exactly.
   The gating pass carries `&warp=0` (flat glass) on both shots: the clamp is accepted before the
   barrel warp, which is a lens over the finished screen, not part of the composite. With the warp
   on, the bilinear resample carries part of a lifted dark pixel into its bright neighbour, so on
   outdoors 12 pixels on rows 164 and 182 (x 244 to 269, no-ghost luma 155 to 182, already above
   the 152.4 limit) read 1 to 10 luma over; with `warp=0` the same fixture reads 0. A second pass
   with the warp on prints these numbers and never fails the run. Each fixture is captured twice
   (fonts, `window.__composite`, the warped layer, two frames, then screenshots repeated until two
   in a row are identical, both shots of a pair from the same clip); a target fails only when it
   fails in both runs, and a mean lift that moves by more than 0.5 luma between runs fails too.

### Unverified
- Native: `regionFromImage` via Skia (decode, raster halving, `readPixels`), `MakeOffscreen` plus
  `makeNonTextureImage` for the apparition and ghost layer, the reanimated-driven fade uniform, and
  frame cost. All need a phone build. The probe and goldens are web (CanvasKit) only.
- Cost of building the ghost layer: a CPU blur of a panel-sized layer once per result on web; not
  profiled on a device.
- Round 2 measures both routes (tables above); the result route's cellar and attic sit near the
  8 luma floor because their per-case placements stand behind the crate and the wall.

## Round 2 (D-017, D-018)

### Scope (`src/fx/scope`, the scan theatre)
`<ScopeLayer seed frame left top gw gh div flat dim still />`, mounted by `src/ui/scan/Theatre.tsx`
in place of its old view-based trace and five stepped sweep bars.
- Trace: the same seeded polyline as before (points every 6 px), with the previous tick's trace at
  p2 as afterglow. Plain views, re-rendered only when the 10 Hz tick changes.
- Sweep: one static strip (a 2 px p5 line and a tail fading as `exp(-4 d / tail)`, tail a third
  of the grid: continuous, no steps) moved by a reanimated `translateX`. The 20 Hz scan clock sets
  the next position and a 50 ms linear timing fills the frames between.
- Fault beat (`scope.ts`, tested): the first 120 ms (2 to 3 clock frames) tear the grid into 4 to
  6 bands, every other band offset 4 to 12 px, grid lines, trace and sweep redrawn in the bands;
  an n0 dip at 30% over the whole glass for 400 ms; the frozen sweep decays in place
  (`exp(-t / 450 ms)`, floor 12%) and comes back when the scan resumes. The `scan-fault` golden
  (faultT 100 ms) shows the tear and the dip.
- Hold: trace and sweep stay where they stopped, at p2.

### Viewfinder sweep and dial (`src/ui/viewfinder/Sweep.tsx`, `EmfDial.tsx`, FX this round)
- Sweep: a wedge about the reticle centre: leading edge p4 (with bloom) over a 3 px n0 outline
  (it holds on the bright fixture), a 28 degree sector behind it (the arc the line covers in
  450 ms at the slow turn) fading as `exp(-3 d)`, clipped to a scope ring (inset 6 px from the
  camera area) with a faint ring graticule (the ring at p2 45%, a half-radius ring at p1 55%,
  plain views). Reduced motion: an 8 degree sector. Drawn once, turned by a reanimated transform
  from `useFrameCallback`; speed from the flux as before. `aria-valuetext` is sampled at 4 Hz.
- Dial: the needle, its 2 px offset shadow and its afterglow are views turned by shared values
  (`withSpring` on the Bible's live spring; three copies that follow it with time constants of
  TAU.trace / 3, 2/3 and 1 in p3, p2, p1). The scale is memoised and the GEO arc is a canvas
  drawn once (`emf-needle` still holds one canvas).

### Frame time (P3-09; Playwright rAF deltas, 390 x 844, live, 3 s after a 2.5 s settle, 3 runs)
Cause, from a Chrome trace on SwiftShader: every Skia canvas redraw on web ends in a GPU read-back
(`GLES2::ReadPixels`, `CommandBufferHelper::Finish` on the main thread), about 15 to 30 ms each
whatever the canvas holds. The live viewfinder redrew the full-area sweep canvas and the dial
canvas every frame (React state per frame), and the flux tick (10 Hz) and the scan clock (20 Hz)
re-rendered the housing, which redrew the window-sized glass overlay (new uniform objects).
Fixes: one-time drawings turned or moved by reanimated transforms, `GlassOverlay`/`BurnIn`
memoised, the scan trace as views on the 10 Hz tick (a 10 Hz trace canvas alone kept the scan
at a p95 of 33 to 50 ms), the graticule memoised.

Same machine, before (the build at the start of round 2) and after, run back to back. The
machine was shared with other agents' test runs (load average 5 to 9 on 4 cores) for the paired
runs, so the after p95 is pessimistic; on a quiet machine earlier in the round the after numbers
were median 16.7 and p95 16.7 to 16.8 on viewfinder and scan.

| route | before median | before p95 | after median | after p95 |
|---|---|---|---|---|
| `/viewfinder?fixture=cellar` (live) | 217 to 267 ms | 317 to 633 ms | 16.7 ms | 33.3 to 49.9 ms |
| `/scan?seed=20261013` (live) | 33.4 to 66.6 ms | 100 to 150 ms | 16.7 ms | 33.3 to 33.4 ms |
| `/result/demo?demo=active&fixture=cellar` | 16.7 ms | 16.8 to 33.3 ms | 16.7 ms | 16.8 to 33.3 ms |
| quiet machine, after only: viewfinder / scan | | | 16.7 / 16.7 ms | 16.7 to 16.8 / 16.7 to 16.8 ms |

Script: Playwright opens the route at 390 x 844 (1x), waits 2.5 s, records
`requestAnimationFrame` deltas for 3 s, three fresh pages per route.

### What Builder A changes (round 2)
1. Nothing for tier extent or the CRITICAL echo: `placeGhost` reads the `tier` the result screen
   already passes. Expect the ACTIVE figure a little smaller (11% union) than round 1 (13.5%).
2. Scare pop: pass `pop={scareView.pop}` to `<Composite>` and drop the `GhostV0` pop layer (it
   showed a near-opaque sprite). The compositor caps the pop at 40% peak alpha, soft.
3. Camera feed: wrap the viewfinder's camera and fixture in `<FeedTint>` (from `src/fx/glass`):
   `<FeedTint image={fixtureUri(fixture)} />` instead of the fixture `Image` (it draws the cover
   crop itself), and `<FeedTint><CameraView ... /></FeedTint>` around the camera. Keep the 22% dim
   or lower it, judged on the golden.
4. Warp capture: any Skia `<Canvas>` under a warped glass (the SPI digit canvas on the result,
   `Transient` on boot) should become `<SnapshotCanvas>` (same props) or it stays blank in the
   web snapshot. `Composite` and `ThermalView` already are.
5. Screen goldens to regenerate after this round: viewfinder (`viewfinder.png`,
   `viewfinder-cellar`, `viewfinder-bright`), scan (`scan-phase2`, `scan-hold`, `scan-fault`),
   result (`result-active`, `-strong`, `-critical`, `-quiet` if it shows the smudge,
   `result-active-bright`, `result-active-outdoors`, `result-therm-critical`, `result-scare`).

### Unverified (round 2)
- Native: reanimated transforms on the sweep and the needle, `useFrameCallback`, the `color` and
  `screen` blend layers over `CameraView`, and every frame-time number (web proxy only).
- The `FeedTint` RN path has no barrel; a frame processor would be needed for the shader path on
  the live camera.
- Tier extent 14 and 17% (D-017) cannot be met under the 15% cap; implemented as 13 and 14.5%.

## Share card (P6-01)
`src/fx/share/`: the field card from docs/p6-brief.md section 1, drawn offscreen with Skia.

### API (Builder A)
```ts
import { renderShareCard, STORE_NAME } from '../src/fx/share';
renderShareCard(record: ScanRecord, opts: { format: 'story' | 'square'; beliefBand?: [number, number]; store?: string }): Promise<ShareCard>
// ShareCard: { uri, png: Uint8Array, fileName, width, height, image: SkImage, texts, marks, strip, figure, ... }
```
- `uri`: native writes `field-card-<case>-simulated.png` to `Paths.cache` (expo-file-system `File`) and
  returns its `file://` URI; web returns a `data:image/png;base64,` URL (`save.ts` / `save.web.ts`).
  The PNG is re-encoded from pixels, so no EXIF or location travels.
- Pass `beliefBand: BELIEF_PROFILE[getBelief()].opacityRange` when the user answered, exactly as the
  result screen does, so the figure keeps the opacity the user saw. Throws on failure (show
  `E-31 PRINTER FAULT. CARD NOT SAVED.`).
- `STORE_NAME = '[STORE NAME]'` in `constants.ts`, filled at Gate 1. Nameplate `VELDEN  FS-4/87-P` (Bible section 2), no serial.
- `expo-file-system` (57.0.7) is installed as a dependency of `expo`, not listed in package.json;
  Builder A should add it with `npx expo install expo-file-system` when wiring the share flow.

### What it draws (layouts in `constants.ts`, brief section 1.4)
Housing (n3, 6% corner falloff, 2.5% seeded noise, two worn edge streaks), the n5 nameplate with
rivets and engraved n2 B612 Mono Bold text, the photo, the reading row (n0 window: `SPI TIER` in
VT323, CRITICAL in red, then `SIGNATURE n% DECODED`, or `CLASS: ... · ERA ...` plus `EVP "..."`
after a Deep Scan, `NO SIGNATURE` on QUIET), and the footer `[STORE NAME] · READINGS ARE SIMULATED`
in B612 Mono. Every string comes from `text.ts` (`cardTexts` lists them); the renderer has no path,
line or arc drawing.
- Photo: the compositor drawn with no React tree (`compositor/offscreen.ts`, `drawComposite`) with
  the same set-up, ghost layer, shader and uniforms as `<Composite>` in its final state. The panel
  is laid out at half the card's photo size and drawn at 2x (HIRES_SCALE). `figure.ts` repeats the
  result screen's placement rule (caseSeed, belief band, tier ladder, TRACE smudge, crop on figure);
  only the frame differs, so the opacity is the screen's (tested).
- Data strip: bottom-left of the photo, VT323 p3 with a 2 px n0 drop copy, drawn before the grain
  (the composite runs with grain 0, then `GRAIN_SKSL` adds the compositor's grain step over the
  photo, figure and strip together, FractalNoise at 0.9 / 2 per card pixel, same seed).
- SIMULATED mark: sized so its cap height is 1.1 x 2% of the card height (VT323 cap 0.56 em,
  B612 Mono 0.76 em): VT323 76 px and B612 56 px on story, 47 and 32 px on square; the text before it
  keeps the screen's proportions (shrunk to fit). The strip scrim starts at the on-screen 40% n0 and
  rises until p3 holds 5:1 over the brightest channels under the strip with the grain against it
  (0.91 on the bright fixture). Deviation: the brief's fixed 40% scrim cannot hold 4.5:1 on a bright
  photo; the acceptance governs.
- CPU raster surfaces throughout, so two renders of a record are byte-identical.

### Measured (Vitest on CanvasKit in Node, `src/fx/share/__tests__/shareCard.test.ts`)
Cap height = ink rows of the mark; contrast = 10th-percentile glyph-core luminance against the
95th-percentile luminance of pixels more than 3 px from any glyph, after scrim and grain.

| format | fixture | strip cap | strip contrast | footer cap | footer contrast | floor |
|---|---|---|---|---|---|---|
| story | cellar critical deep | 43 | 6.11 | 43 | 7.57 | 38.4 |
| story | bright strong | 43 | 5.50 | 43 | 7.57 | 38.4 |
| story | outdoors active | 43 | 6.01 | 43 | 7.57 | 38.4 |
| story | black quiet | 43 | 6.40 | 43 | 7.57 | 38.4 |
| square | cellar critical deep | 27 | 5.92 | 24 | 7.57 | 21.6 |
| square | bright strong | 27 | 5.51 | 24 | 7.57 | 21.6 |
| square | outdoors active | 27 | 5.78 | 24 | 7.57 | 21.6 |
| square | black quiet | 27 | 6.32 | 24 | 7.57 | 21.6 |

Story strip scrim y 1477 to 1550 (safe zone 250 to 1580). Render time on CanvasKit CPU (Node):
about 5 s square and 8 s story, most of it the composite shader on 1.25 M pixels. 

### L2
`/share-probe?format=story|square&case=<demo>[-deep]&fixture=<f>` renders through
`renderShareCard` (web data URL) scaled to fit; `e2e/web/share.spec.ts` checks the data URL and
its 1080 x 1920 / 1080 x 1080 size and takes `share-story.png`, `share-square.png` at 390
(`maxDiffPixels: 400`).

### Unverified
- Native: font loading through expo-asset, `Data.fromURI` on the photo, the cache write, and the
  render time (CPU raster; the brief's 800 ms target is not measured, no device). If it is slow on
  a phone, the composite step can move to `makeSurface` (GPU) at the cost of cross-device byte identity.
- Feed compression of a faint figure (phone check 3, brief section 1.4).
