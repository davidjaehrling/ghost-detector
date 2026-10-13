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
