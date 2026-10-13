import { Canvas, Group, Path, Skia, Text } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { color, fx } from '../../ui/tokens';
import { useVT323 } from './Phosphor';

// Bible §6 burn-in ghost: the flux gauge (a log arc of 100 degrees from 10 to 1000 mG with its
// ticks and labels) and the boot wordmark, burnt into the phosphor. Fixed, off-centre, never
// animates, offset 1 px right. Strength: the trace colour p4 added (Plus) at `fx.burnIn` (3%),
// which lifts n0 by about 2 to 7 levels, just under p0. A literal p0 at 3% alpha would lift n0
// by under half a level and never show.

export type BurnInLabels = { l10: string; l100: string; l1000: string; unit: string; wordmark: string };

const DEFAULT_LABELS: BurnInLabels = { l10: '10', l100: '100', l1000: '1000', unit: 'mG', wordmark: 'VELDEN' };
const A0 = -140;
const SPAN = 100;

function logAngle(mg: number): number {
  return A0 + (Math.log10(mg / 10) / 2) * SPAN;
}

export type BurnInLayerProps = {
  width: number;
  height: number;
  // Gauge centre as a fraction of the box (off-centre by default).
  cx?: number;
  cy?: number;
  radius?: number;
  opacity?: number;
  labels?: Partial<BurnInLabels>;
};

// Skia nodes, for use inside an existing <Canvas>.
export function BurnInLayer({ width, height, cx = 0.62, cy = 0.66, radius = 150, opacity = fx.burnIn, labels }: BurnInLayerProps) {
  const lab = { ...DEFAULT_LABELS, ...labels };
  const labelFont = useVT323(20);
  const markFont = useVT323(48);
  const x0 = cx * width + 1;
  const y0 = cy * height;
  const at = (deg: number, r: number) => ({ x: x0 + r * Math.cos((deg * Math.PI) / 180), y: y0 + r * Math.sin((deg * Math.PI) / 180) });
  const { arc, ticks } = useMemo(() => {
    const a = Skia.PathBuilder.Make();
    a.addArc(Skia.XYWHRect(x0 - radius, y0 - radius, radius * 2, radius * 2), A0 - 4, SPAN + 8);
    const t = Skia.PathBuilder.Make();
    const tick = (deg: number, len: number) => {
      const p = { x: x0 + radius * Math.cos((deg * Math.PI) / 180), y: y0 + radius * Math.sin((deg * Math.PI) / 180) };
      const q = { x: x0 + (radius - len) * Math.cos((deg * Math.PI) / 180), y: y0 + (radius - len) * Math.sin((deg * Math.PI) / 180) };
      t.moveTo(p.x, p.y);
      t.lineTo(q.x, q.y);
    };
    for (const dec of [10, 100]) for (let k = 2; k <= 9; k++) tick(logAngle(dec * k), 6);
    for (const mg of [10, 100, 1000]) tick(logAngle(mg), 12);
    return { arc: a.detach(), ticks: t.detach() };
  }, [x0, y0, radius]);
  if (width <= 0 || height <= 0) return null;
  const labelAt = (mg: number) => at(logAngle(mg), radius - 30);
  return (
    <Group blendMode="plus" opacity={opacity}>
      <Path path={arc} color={color.p4} style="stroke" strokeWidth={2} />
      <Path path={ticks} color={color.p4} style="stroke" strokeWidth={1.5} />
      {labelFont
        ? ([
            [lab.l10, 10],
            [lab.l100, 100],
            [lab.l1000, 1000],
          ] as const).map(([t, mg]) => {
            const p = labelAt(mg);
            const w = labelFont.measureText(t).width;
            return <Text key={t} font={labelFont} text={t} x={p.x - w / 2} y={p.y + 6} color={color.p4} />;
          })
        : null}
      {labelFont ? <Text font={labelFont} text={lab.unit} x={x0 - 10} y={y0 - radius + 46} color={color.p4} /> : null}
      {markFont ? <Text font={markFont} text={lab.wordmark} x={0.1 * width + 1} y={0.24 * height} color={color.p4} /> : null}
    </Group>
  );
}

// The same as a pointer-transparent overlay that fills its parent.
export function BurnIn(props: Omit<BurnInLayerProps, 'width' | 'height'> & { testID?: string }) {
  const { testID, ...rest } = props;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
  };
  return (
    <View testID={testID} pointerEvents="none" onLayout={onLayout} style={StyleSheet.absoluteFill}>
      {box.w > 0 ? (
        <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
          <BurnInLayer width={box.w} height={box.h} {...rest} />
        </Canvas>
      ) : null}
    </View>
  );
}
