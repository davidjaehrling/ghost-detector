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
    `DEFAULT_OPACITY_RANGE` = 0.13 to 0.25 (at 0.09 the cellar figure lifted only 7 luma).
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
Copies share a fixed budget: their alpha multipliers sum to `COPY_ALPHA_SUM` = 0.35, falling by
0.72 per step. Where the figure and every copy overlap, the layer alpha is
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
    Noise: two octaves of seeded value noise, never beyond ±0.4 °C.
  - Cold spot: Gaussian dip (sigma 0.6 of the radius), radius 8 to 14% of the short side, centred
    on the region centroid with up to 15% seeded jitter and kept inside the region box. No region
    (bright frames): the darkest smoothed point inside a 15% margin. Depth by tier
    (`TIER_DEPTH`): quiet 0 (no spot), trace 1.5, active 3, strong 6, critical 9 °C.
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
    sits on an `n0` ground. Display scale: FLIR-style half-strength histogram equalisation (half
    linear in °C, half rank), otherwise a 9 °C spot squeezes the room into the top two stops. The
    scale bar ticks use the same mapping (`displayPos`), so their labels stay true.
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
- The block look at 2.65 px per sensor pixel is subtle at 1x; it is visible zoomed in.
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
    RGBA. Child `<canvas>` elements are copied with `toDataURL` (RN Skia web canvases are 2D, so
    they copy); cross-origin images and sheets are skipped.
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
