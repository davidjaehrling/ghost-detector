import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import type { Tier } from '../../engine';
import { DEFAULT_FIXTURE, type FixtureName } from '../../ui/fixtureNames';
import { fixtureUri } from '../../ui/fixtures';
import { cropOnFigure, panelRegion, panelTop } from '../../ui/result/panel';
import { color } from '../../ui/tokens';
import { placeGhost, type Placement, type RegionInput } from '../ghostV0/placement';
import { Composite } from './Composite';
import { reference } from './reference';
import { regionFromImage, type RegionStats } from './regionFromImage';

// L2 harness for compositor v1 (/composite-probe?static=1&fixture=<name>&demo=<tier>), until the
// result screen switches over. It lays the photo out the way the result screen does at 390 px
// (318 x 303 panel, 3:4 photo cropped on the figure) and places the ghost with the same
// `placeGhost` call. Extra flags: `ghost=0` (photo and grain only), `variant=0..5|png`.

/** Result-screen photo panel at 390 x 844 (ACTIVE layout). */
export const PROBE_PANEL = { w: 318, h: 303 } as const;
const PHOTO_ASPECT = 4 / 3;
const DEFAULT_MEAN = 40;
const DEMO_TIERS: Record<string, Tier> = { quiet: 'quiet', trace: 'trace', active: 'active', strong: 'strong', critical: 'critical' };

/** Seed per fixture and demo, so the five fixture goldens show different figures. */
export function probeSeed(fixture: string, demo: string): number {
  let h = 2166136261;
  for (const c of `${fixture}:${demo}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export interface ProbeInfo {
  placement: Placement;
  panel: { w: number; h: number };
  meanLuma: number;
  p80Luma: number;
  /** Clamp reference and occlusion threshold the compositor used (`reference.ts`). */
  clampRef: number;
  occ: number;
  variant: number | 'png';
  seed: number;
}

declare global {
  // Read by scripts/measure-ghost.mjs.
  var __composite: ProbeInfo | undefined;
}

export function CompositeProbe({ fixture, demo, variant }: { fixture: FixtureName | null; demo?: string; variant?: string }) {
  const name = fixture ?? DEFAULT_FIXTURE;
  const tier = DEMO_TIERS[demo ?? 'active'] ?? 'active';
  const seed = probeSeed(name, tier);
  const uri = useMemo(() => fixtureUri(name), [name]);
  const [stats, setStats] = useState<{ done: boolean; r: RegionStats | null }>({ done: false, r: null });

  useEffect(() => {
    let live = true;
    regionFromImage(uri).then((r) => live && setStats({ done: true, r }));
    return () => {
      live = false;
    };
  }, [uri]);

  const v = variant === 'png' ? 'png' : variant !== undefined && /^[0-5]$/.test(variant) ? Number(variant) : undefined;
  const { w: W, h: H } = PROBE_PANEL;
  const imgH = Math.round(W * PHOTO_ASPECT);

  const layout = useMemo(() => {
    if (!stats.done) return null;
    const region = stats.r?.region ?? null;
    const top0 = panelTop(H, imgH, region ? region.cy : null);
    const pr: RegionInput | null = panelRegion(region, imgH, H, top0);
    let placement = placeGhost(pr, { w: W, h: H }, seed, { tier });
    const crop = cropOnFigure(H, imgH, top0, placement);
    placement = { ...placement, y: placement.y + crop.dy };
    return { region: pr, placement, top: crop.top };
  }, [stats, H, W, imgH, seed, tier]);

  const meanLuma = stats.r?.meanLuma ?? DEFAULT_MEAN;
  useEffect(() => {
    if (!layout) return;
    const ref = reference({
      meanLuma,
      p80Luma: stats.r?.p80Luma,
      p90Luma: stats.r?.p90Luma,
      region: layout.region,
      grid: stats.r?.grid,
      placement: layout.placement,
      photoRect: { x: 0, y: layout.top, width: W, height: imgH },
    });
    globalThis.__composite = {
      placement: layout.placement,
      clampRef: ref.mean,
      occ: ref.occ,
      panel: { w: W, h: H },
      meanLuma,
      p80Luma: stats.r?.p80Luma ?? meanLuma,
      variant: v ?? seed % 6,
      seed,
    };
  }, [layout, W, H, imgH, meanLuma, stats, v, seed]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.n3 }}>
      <View testID="composite-probe" style={{ width: W, height: H, backgroundColor: color.n0, overflow: 'hidden' }}>
        {layout ? (
          <Composite
            photo={uri}
            width={W}
            height={H}
            photoRect={{ x: 0, y: layout.top, width: W, height: imgH }}
            region={layout.region}
            meanLuma={meanLuma}
            p90Luma={stats.r?.p90Luma}
            p80Luma={stats.r?.p80Luma}
            grid={stats.r?.grid}
            placement={layout.placement}
            tier={tier}
            seed={seed}
            variant={v}
          />
        ) : null}
      </View>
      <Text style={{ color: color.p3, marginTop: 8, fontFamily: 'VT323_400Regular', fontSize: 16 }}>{`${name.toUpperCase()} ${tier.toUpperCase()}`}</Text>
    </View>
  );
}
