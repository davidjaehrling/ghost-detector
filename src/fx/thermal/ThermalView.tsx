import { FilterMode, Group, Image, LinearGradient, MipmapMode, Path, Rect, Skia, Text, useFont, vec, type SkFont } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { color } from '../../ui/tokens';
import { SnapshotCanvas } from '../glass/snapshotRegistry';
import { barDeltas, displayPos, displayRange } from './encode';
import { PALETTE_NAME, PH_WHT } from './palette';
import { makeLutEffect, renderThermalImage } from './render';
import { formatDelta, sampleField, type ThermalField } from './thermalField';

// Bundled TTFs, loaded into Skia (RN `Text` fonts are not visible to a Skia canvas).
const VT323_TTF = require('@expo-google-fonts/vt323/400Regular/VT323_400Regular.ttf');

/** Live view refresh, Hz (FLIR-class sensors export at about 9 Hz). */
export const LIVE_HZ = 9;
/** Bible section 3: scale bar 10 x 220 px. Shorter only when the panel cannot hold it. */
export const BAR_W = 10;
export const BAR_H = 220;
const BAR_INSET = 8; // bar's right edge to the panel's right edge
const LABEL_GAP = 6; // tick end to label (A-48: labels outside the bar, on its left)
const RETICLE = 15; // crosshair span, px (Bible section 3)
const POINTER = 6; // cold-spot triangle, px

export interface ThermalViewProps {
  field: ThermalField;
  /** Panel size in layout px. The field is drawn at the panel width, at the photo's aspect. */
  width: number;
  height: number;
  /**
   * Offset of the full frame inside the panel (<= 0), the same `top` the photo panel uses, so the
   * thermal frame lands on the photo pixel for pixel. Default: centred on the cold spot.
   */
  top?: number;
  /** Freeze the sensor shimmer (L2 goldens, reduced motion). */
  static?: boolean;
  testID?: string;
}

/** Same rule as the result screen's crop: centre `cy` in the panel, keep the image covering it. */
function defaultTop(panelH: number, imgH: number, cy: number): number {
  const lo = Math.min(0, panelH - imgH);
  return Math.min(0, Math.max(lo, Math.round(panelH / 2 - cy * imgH)));
}

function textW(font: SkFont | null, s: string): number {
  return font ? font.measureText(s).width : 0;
}

/** `ΔT` when the font has the glyph (Bible section 3 asks to check), else `dT`. */
function deltaLabel(font: SkFont | null): string {
  if (!font) return 'ΔT';
  return font.getGlyphIDs('Δ')[0] ? 'ΔT' : 'dT';
}

/** Spot readout text, for example `SP1 ΔT -9.0 °C`; null on QUIET. */
export function spotReadout(field: ThermalField, delta = 'ΔT'): string | null {
  return field.coldSpotC === null ? null : `SP1 ${delta} ${formatDelta(field.coldSpotC)}`;
}

export function ThermalView({ field, width, height, top, static: isStatic = false, testID = 'thermal-view' }: ThermalViewProps) {
  const vt = useFont(VT323_TTF, 16);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (isStatic) return;
    const id = setInterval(() => setFrame((f) => f + 1), 1000 / LIVE_HZ);
    return () => clearInterval(id);
  }, [isStatic]);

  // Skia objects are built on mount, never at module load (web has no Skia before CanvasKit).
  const effect = useMemo(() => makeLutEffect(), []);
  const image = useMemo(() => renderThermalImage(field, effect, isStatic ? 0 : frame), [field, effect, frame, isStatic]);
  useEffect(() => {
    // Free the previous frame a little after it was replaced, once the canvas has redrawn.
    if (!image) return;
    return () => {
      setTimeout(() => image.dispose(), 500);
    };
  }, [image]);

  const imgH = Math.round((width * field.height) / field.width);
  const spot = field.coldSpot;
  const y0 = top ?? defaultTop(height, imgH, spot ? spot.y : 0.5);
  const { lo, hi } = displayRange(field);

  // Scale bar geometry.
  const barH = Math.min(BAR_H, Math.max(60, height - 48));
  const barX = width - BAR_INSET - BAR_W;
  const barY = Math.round((height - barH) / 2);
  const posY = (c: number) => barY + barH - displayPos(field, c) * barH;

  const delta = deltaLabel(vt);
  const readout = spotReadout(field, delta);
  // A-48: the bar reads in ΔT against the room, °C, so its bottom is the spot readout's value.
  const ends = barDeltas(field);
  const maxT = formatDelta(ends.hi);
  const minT = formatDelta(ends.lo);
  const ambT = formatDelta(0);
  const ambY = posY(field.ambientC);

  const marks = useMemo(() => {
    const ticks = Skia.PathBuilder.Make();
    for (const c of [lo, field.ambientC, hi]) {
      const y = Math.round(posY(c)) + 0.5;
      ticks.moveTo(barX - 4, y);
      ticks.lineTo(barX, y);
    }
    const pointer = Skia.PathBuilder.Make();
    let reticle = null;
    if (spot) {
      const py = posY(sampleField(field, spot.x, spot.y));
      pointer.moveTo(barX - 1, py);
      pointer.lineTo(barX - 1 - POINTER, py - POINTER / 2);
      pointer.lineTo(barX - 1 - POINTER, py + POINTER / 2);
      pointer.close();
      const cx = Math.round(spot.x * width) + 0.5;
      const cy = Math.round(y0 + spot.y * imgH) + 0.5;
      const r = (RETICLE - 1) / 2;
      const gap = 3;
      const b = Skia.PathBuilder.Make();
      b.moveTo(cx - r, cy);
      b.lineTo(cx - gap, cy);
      b.moveTo(cx + gap, cy);
      b.lineTo(cx + r, cy);
      b.moveTo(cx, cy - r);
      b.lineTo(cx, cy - gap);
      b.moveTo(cx, cy + gap);
      b.lineTo(cx, cy + r);
      reticle = b.detach();
    }
    return { ticks: ticks.detach(), pointer: pointer.detach(), reticle };
    // posY is derived from lo, hi, barY and barH, all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, spot, lo, hi, barX, barY, barH, width, imgH, y0]);

  const readW = textW(vt, readout ?? '') + 10;
  const labelX = barX - 4 - LABEL_GAP; // labels end here (right-aligned)
  const labelW = Math.max(textW(vt, maxT), textW(vt, minT), textW(vt, ambT));
  const plateX = Math.floor(labelX - labelW - 6);

  return (
    <View
      testID={testID}
      role="img"
      accessibilityLabel={readout ? `Thermal view ${PALETTE_NAME}, ${readout}` : `Thermal view ${PALETTE_NAME}, no cold spot`}
      style={{ width, height, overflow: 'hidden', backgroundColor: color.n0 }}
    >
      <SnapshotCanvas style={{ width, height }}>
        <Rect x={0} y={0} width={width} height={height} color={color.n0} />
        <Image
          image={image}
          x={0}
          y={y0}
          width={width}
          height={imgH}
          fit="fill"
          sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }}
        />
        {marks.reticle ? (
          <Group>
            <Path path={marks.reticle} color={color.n0} style="stroke" strokeWidth={3} />
            <Path path={marks.reticle} color={color.p4} style="stroke" strokeWidth={1} />
          </Group>
        ) : null}

        {/* Scale bar: n0 plate, PH-WHT gradient warm at the top, 1 px n4 keyline. */}
        <Rect x={plateX} y={barY - 12} width={width - plateX - 2} height={barH + 24} color={color.n0} />
        <Rect x={barX} y={barY} width={BAR_W} height={barH}>
          <LinearGradient start={vec(0, barY + barH)} end={vec(0, barY)} colors={[...PH_WHT]} />
        </Rect>
        <Rect x={barX - 0.5} y={barY - 0.5} width={BAR_W + 1} height={barH + 1} color={color.n4} style="stroke" strokeWidth={1} />
        <Path path={marks.ticks} color={color.n4} style="stroke" strokeWidth={1} />
        {spot ? <Path path={marks.pointer} color={color.p4} /> : null}
        {vt ? (
          <Group>
            <Text x={labelX - textW(vt, maxT)} y={barY + 5} text={maxT} font={vt} color={color.p4} />
            <Text x={labelX - textW(vt, minT)} y={barY + barH + 5} text={minT} font={vt} color={color.p4} />
            {Math.abs(ambY - barY) > 14 && Math.abs(ambY - barY - barH) > 14 ? (
              <Text x={labelX - textW(vt, ambT)} y={ambY + 5} text={ambT} font={vt} color={color.p3} />
            ) : null}
          </Group>
        ) : null}

        {/* Spot readout box top-left (Bible section 3). No palette name: the view has one fixed palette,
            so the corner label reported a constant the scale bar already shows, and the result screen's
            data strip covers that corner. The name stays in the accessibility label. */}
        {vt && readout ? (
          <Group>
            <Rect x={8} y={8} width={readW} height={20} color={color.n0} />
            <Rect x={8.5} y={8.5} width={readW - 1} height={19} color={color.n4} style="stroke" strokeWidth={1} />
            <Text x={13} y={23} text={readout} font={vt} color={color.p4} />
          </Group>
        ) : null}
      </SnapshotCanvas>
    </View>
  );
}
