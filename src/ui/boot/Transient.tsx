import { t } from '../../i18n';
import { Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Bloom, SnapshotCanvas, TAU, usePersistence } from '../../fx/glass';
import { GRID_COLS, GRID_TOP, gridDiv } from './parts';

// The one priming transient on the boot trace (psych brief 2.1): a single spike of 2 to 3 divisions
// rising off the idle line about 1.5 s after the trace settles, then gone, leaving its afterglow on
// the glass (phosphor persistence). The line `TRANSIENT 1 · LOGGED` under SELFTEST OK is the record.

export const TRANSIENT_DELAY_MS = 1500;
/** Spike height in divisions at its peak. */
export const SPIKE_DIV = 2.5;
/** Amplitude steps of the event: rise, ring back, rest. */
export const SPIKE_STEPS: readonly { at: number; amp: number }[] = [
  { at: 0, amp: 1 },
  { at: 70, amp: 0.4 },
  { at: 140, amp: 0 },
];

// Fires once: returns the live amplitude and whether the event has been logged. With `peak`
// (harness) the amplitude sits at its peak and with `still` (static) the event is logged at once
// and no spike is drawn: the finished state.
export function usePrimingTransient({ armed, still, peak }: { armed: boolean; still: boolean; peak: boolean }): { amp: number; logged: boolean } {
  const [amp, setAmp] = useState(0);
  const [logged, setLogged] = useState(still);
  useEffect(() => {
    if (still || !armed) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        setLogged(true);
        SPIKE_STEPS.forEach(({ at, amp: a }) => timers.push(setTimeout(() => setAmp(a), at)));
      }, TRANSIENT_DELAY_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [still, armed]);
  return { amp: peak ? 1 : amp, logged };
}

// The spike's polyline for amplitude `a` on a canvas whose idle line is at y = `base`.
export function spikePoints(a: number, x0: number, base: number, div: number): { x: number; y: number }[] {
  const up = SPIKE_DIV * div * a;
  const down = 0.9 * div * a;
  return [
    { x: x0 - 16, y: base },
    { x: x0 - 7, y: base + 1 },
    { x: x0, y: base - up },
    { x: x0 + 5, y: base + down },
    { x: x0 + 11, y: base - 0.35 * up },
    { x: x0 + 17, y: base + 0.25 * down },
    { x: x0 + 24, y: base },
  ];
}

export function PrimingTransient({
  w,
  rows,
  amp,
  still,
  reduceMotion,
}: {
  w: number;
  rows: number;
  amp: number;
  still: boolean;
  reduceMotion: boolean;
}) {
  const div = gridDiv(w);
  const gw = div * GRID_COLS;
  const left = Math.round((w - gw) / 2);
  const cy = GRID_TOP + (div * rows) / 2;
  const reach = Math.ceil(SPIKE_DIV * div) + 8;
  // Afterglow of the spike: the value is its amplitude, so every older amplitude is drawn again, one
  // phosphor step dimmer per sample, until it has decayed.
  const trail = usePersistence(Math.round(amp * 20) / 20, { tau: TAU.sweep, step: 5, static: still, reduceMotion });
  const x0 = Math.round(gw * 0.62);
  return (
    <View style={{ position: 'absolute', left, top: cy - reach, width: gw, height: reach * 2 }} pointerEvents="none" testID="boot-transient" aria-valuetext={t('a11y.percent', { n: Math.round(amp * 100) })}>
      <SnapshotCanvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Bloom radius={3}>
          {trail.map((sample, i) => {
            if (sample.value <= 0.01) return null;
            const pts = spikePoints(sample.value, x0, reach, div);
            const p = Skia.PathBuilder.Make();
            pts.forEach((pt, k) => (k === 0 ? p.moveTo(pt.x, pt.y) : p.lineTo(pt.x, pt.y)));
            return <Path key={i} path={p.detach()} style="stroke" strokeWidth={1.5} strokeJoin="miter" color={sample.color} opacity={sample.opacity} />;
          })}
        </Bloom>
      </SnapshotCanvas>
    </View>
  );
}
