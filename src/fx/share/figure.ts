import type { ScanRecord } from '../../state/scans';
import { caseSeed, cropOnFigure, panelRegion, panelTop, tierOpacity } from '../../ui/result/panel';
import { placeGhost, type Placement, type RegionInput } from '../ghostV0/placement';
import type { RegionStats } from '../compositor/regionFromImage';

// Where the figure stands on the card's photo: the result screen's rule (app/result/[id].tsx,
// PhotoPanel) on the card's panel. Same seed (caseSeed), same opacity band and ladder, same TRACE
// smudge, same crop on the figure, so the figure keeps the opacity the user saw. Only the frame
// differs (the card's photo is 4:5 or 27:19, the screen's panel is shorter), which moves where
// the figure lands, never how bright it is.

/** Values the result screen holds in app/result/[id].tsx. */
export const SMUDGE_OPACITY: [number, number] = [0.08, 0.1];
export const SMUDGE_SCALE = 0.7;
export const DEFAULT_MEAN_LUMA = 40;

export interface FigureLayout {
  /** Placement in panel pixels (logical: the card photo / CARD_HIRES). */
  placement: Placement;
  region: RegionInput | null;
  meanLuma: number;
  /** Photo offset in the panel (<= 0) after the crop on the figure. */
  top: number;
  /** Photo height in the panel (width fills the panel). */
  imgH: number;
  seed: number;
}

export interface FigureInput {
  record: Pick<ScanRecord, 'id' | 'seed' | 'outcome'>;
  stats: RegionStats | null;
  panel: { w: number; h: number };
  /** Photo aspect, height / width (3:4 portrait captures: 4/3). */
  aspect: number;
  /** The belief answer's opacity band (BELIEF_PROFILE[belief].opacityRange), when the user gave one. */
  beliefBand?: [number, number];
}

/** Null when the record shows no figure (QUIET without a smudge): the card then shows the photo alone. */
export function figureLayout({ record, stats, panel, aspect, beliefBand }: FigureInput): FigureLayout | null {
  const { outcome } = record;
  const seed = caseSeed(record.seed, record.id);
  const { w: W, h: height } = panel;
  const imgH = Math.max(height, Math.round(W * aspect));
  if (!(outcome.figureShown || outcome.smudge)) return null;
  const region = stats?.region ?? null;
  const meanLuma = stats?.meanLuma ?? DEFAULT_MEAN_LUMA;
  const top0 = panelTop(height, imgH, region ? region.cy : null);
  const ladder = outcome.smudge ? {} : tierOpacity(outcome.tier, beliefBand);
  const opacityRange = outcome.smudge ? SMUDGE_OPACITY : (ladder.opacityRange ?? beliefBand);
  const pr = panelRegion(region, imgH, height, top0);
  let placement = placeGhost(pr, { w: W, h: height }, seed, {
    tier: outcome.tier,
    ...(opacityRange ? { opacityRange } : {}),
    ...(ladder.tierCap ? { tierCap: ladder.tierCap } : {}),
  });
  if (outcome.smudge) {
    const w = placement.w * SMUDGE_SCALE;
    const h = placement.h * SMUDGE_SCALE;
    placement = {
      ...placement,
      x: placement.x + (placement.w - w) / 2,
      y: placement.y + (placement.h - h) / 2,
      w,
      h,
      offsetCopies: placement.offsetCopies.map((c) => ({ ...c, dx: c.dx * SMUDGE_SCALE, dy: c.dy * SMUDGE_SCALE })),
    };
  }
  const crop = cropOnFigure(height, imgH, top0, placement);
  placement = { ...placement, y: placement.y + crop.dy };
  return { placement, region: pr, meanLuma, top: crop.top, imgH, seed };
}

/** Photo offset for a card with no figure: centred, as the result screen does. */
export function plainTop(panelH: number, panelW: number, aspect: number): { top: number; imgH: number } {
  const imgH = Math.max(panelH, Math.round(panelW * aspect));
  return { top: panelTop(panelH, imgH, null), imgH };
}
