import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { mulberry32 } from '../../engine';
import { color } from '../../ui/tokens';
import { withAlpha } from '../glass/color';
import { sweepStripStops } from './bloom';
import { faultDip, faultTear, sweepTail, TRACE_SEG, type TearBand } from './scope';

// The scan theatre's scope (D-017, P3-09): the noise trace, its phosphor afterglow, and the sweep
// with a continuous exponential tail, plus the fault beat (a torn frame and a brightness dip).
//
// Cost: the trace is plain views, re-rendered only when the 10 Hz tick changes. The sweep is a
// static strip (line plus exponential tail, drawn once) moved by a transform from a reanimated
// shared value: the 20 Hz scan clock sets the next position and a 50 ms linear timing fills the
// frames between, so the line glides at 60 fps with no React render and no canvas redraw.

export type ScopeFrame = {
  tick: number;
  /** Sweep position in turns (frameAt's `sweep`). */
  sweep: number;
  activeFrac: number;
  /** ms into the fault beat, or -1. */
  faultT: number;
};

export interface ScopeLayerProps {
  seed: number;
  frame: ScopeFrame;
  /** Grid box in glass pixels. */
  left: number;
  top: number;
  gw: number;
  gh: number;
  /** Grid division in px (for the torn copy of the grid lines). */
  div: number;
  /** Fault beat: the trace lies flat. */
  flat: boolean;
  /** Hold: trace and sweep stay where they stopped, at p2. */
  dim: boolean;
  /** Frozen harness frame: no animation. */
  still: boolean;
  /** Clock period of the caller in ms (the sweep glides over it). */
  clockMs?: number;
}

const CLOCK_MS = 50;

type Pt = { x: number; y: number };

/** The trace points for one tick (every TRACE_SEG px), as the theatre always drew them. */
function tracePoints(seed: number, tick: number, activeFrac: number, gw: number, gh: number, flat: boolean): Pt[] {
  const n = Math.ceil(gw / TRACE_SEG) + 1;
  const rnd = mulberry32((seed ^ Math.imul(tick + 1, 2246822519)) >>> 0);
  const amp = flat ? 0 : (0.12 + 0.5 * activeFrac) * (gh / 2);
  const drift = tick * 0.9;
  const cy = gh / 2;
  return Array.from({ length: n }, (_, i) => {
    const dy = amp * (0.6 * Math.sin(i * 0.21 + drift) + 0.4 * (rnd() * 2 - 1));
    return { x: Math.min(gw, i * TRACE_SEG), y: Math.round((cy + dy) * 2) / 2 };
  });
}

export function ScopeLayer({ seed, frame, left, top, gw, gh, div, flat, dim, still, clockMs = CLOCK_MS }: ScopeLayerProps) {
  const x = Math.floor((frame.sweep % 1) * gw);
  const pos = useSharedValue(x);
  const fade = useSharedValue(1);
  const fault = frame.faultT >= 0;
  // The frozen sweep decays in place through the fault beat, then comes back.
  const decay = fault ? Math.max(0.12, Math.exp(-frame.faultT / 450)) : 1;

  useEffect(() => {
    if (still || x < pos.get() - 1 || Math.abs(x - pos.get()) > gw / 2) pos.set(x);
    else pos.set(withTiming(x, { duration: clockMs, easing: Easing.linear }));
  }, [x, still, clockMs, gw, pos]);
  useEffect(() => {
    fade.set(still ? decay : withTiming(decay, { duration: clockMs, easing: Easing.linear }));
  }, [decay, still, clockMs, fade]);

  const tail = sweepTail(gw);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: pos.get() - tail }], opacity: fade.get() }));
  const tear = fault ? faultTear(seed, frame.faultT, gh) : null;
  const dip = fault ? faultDip(frame.faultT) : 0;

  return (
    <>
      <View pointerEvents="none" style={[s.abs, { left, top, width: gw, height: gh, overflow: 'hidden' }]} testID="scan-scope">
        <Trace
          seed={seed}
          tick={frame.tick}
          activeFrac={Math.floor(frame.activeFrac * 50) / 50}
          gw={gw}
          gh={gh}
          div={div}
          flat={flat}
          dim={dim}
          tear={tear}
          sweepX={tear ? x : 0}
          tail={tail}
        />
        {/* Hidden, not unmounted, in the torn frames (the bands carry their own copy of the sweep). */}
        <View style={[StyleSheet.absoluteFill, { opacity: tear ? 0 : 1 }]}>
          <Animated.View style={[s.abs, { left: 0, top: 0, width: tail + 2, height: gh }, slide]}>
            <SweepStrip tail={tail} gh={gh} dim={dim} />
          </Animated.View>
        </View>
      </View>
      {dip > 0 ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.dip, { opacity: dip }]} testID="scan-dip" /> : null}
    </>
  );
}

// The trace with its afterglow (the previous tick at p2), and in the torn frames the grid and the
// trace drawn again in offset bands over an n0 ground. Plain views, re-rendered only when the 10 Hz
// tick changes: on web a Skia canvas redraw forces a GPU read-back (software compositing), and a
// trace canvas at 10 Hz alone held the scan at a p95 of 33 to 50 ms on SwiftShader.
const Trace = memo(function Trace({
  seed,
  tick,
  activeFrac,
  gw,
  gh,
  div,
  flat,
  dim,
  tear,
  sweepX,
  tail,
}: {
  seed: number;
  tick: number;
  activeFrac: number;
  gw: number;
  gh: number;
  div: number;
  flat: boolean;
  dim: boolean;
  tear: TearBand[] | null;
  sweepX: number;
  tail: number;
}) {
  const now = useMemo(() => tracePoints(seed, tick, activeFrac, gw, gh, flat), [seed, tick, activeFrac, gw, gh, flat]);
  const back = useMemo(() => (dim || flat || tick < 1 ? null : tracePoints(seed, tick - 1, activeFrac, gw, gh, false)), [seed, tick, activeFrac, gw, gh, flat, dim]);
  const body = (dy: number) => (
    <>
      {back ? <Segments pts={back} dy={dy} c={color.p2} opacity={0.55} width={1.5} /> : null}
      <Segments pts={now} dy={dy} c={dim ? color.p2 : color.p4} opacity={1} width={dim ? 2 : 1.5} />
    </>
  );
  if (!tear) return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{body(0)}</View>;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {tear.map((b, i) => (
        <View key={i} style={[s.abs, { left: 0, top: b.y, width: gw, height: b.h, overflow: 'hidden', backgroundColor: color.n0 }]}>
          <View style={[s.abs, { left: b.dx, top: 0, width: gw, height: b.h }]}>
            <Grid gw={gw} gh={gh} div={div} dy={-b.y} />
            {body(-b.y)}
            <TornSweep x={sweepX} tail={tail} h={b.h} />
          </View>
        </View>
      ))}
    </View>
  );
});

function Segments({ pts, dy, c, opacity, width }: { pts: Pt[]; dy: number; c: string; opacity: number; width: number }) {
  return (
    <>
      {pts.slice(1).map((b, i) => {
        const a = pts[i]!;
        const ddx = b.x - a.x;
        const ddy = b.y - a.y;
        const len = Math.hypot(ddx, ddy);
        return (
          <View
            key={i}
            style={[
              s.abs,
              {
                left: (a.x + b.x) / 2 - len / 2,
                top: (a.y + b.y) / 2 + dy - width / 2,
                width: len,
                height: width,
                opacity,
                backgroundColor: c,
                transform: [{ rotate: `${Math.atan2(ddy, ddx)}rad` }],
              },
            ]}
          />
        );
      })}
    </>
  );
}

// The sweep in a torn band: the line and its tail in a few decaying steps (2 to 3 frames only).
const TORN_STEPS = 6;
function TornSweep({ x, tail, h }: { x: number; tail: number; h: number }) {
  const w = tail / TORN_STEPS;
  return (
    <>
      {Array.from({ length: TORN_STEPS }, (_, i) => (
        <View key={i} style={[s.abs, { left: x - (i + 1) * w, top: 0, width: w, height: h, backgroundColor: color.p3, opacity: 0.5 * Math.exp((-4 * (i + 0.5)) / TORN_STEPS) }]} />
      ))}
      <View style={[s.abs, { left: x, top: 0, width: 2, height: h, backgroundColor: color.p5, opacity: 0.9 }]} />
    </>
  );
}

// The graticule's division lines, for the torn copy only.
function Grid({ gw, gh, div, dy }: { gw: number; gh: number; div: number; dy: number }) {
  const lines = [];
  for (let x = 0, k = 0; x <= gw + 0.5; x += div, k++) lines.push(<View key={`x${k}`} style={[s.abs, s.gridLine, { left: x, top: dy, width: 1, height: gh }]} />);
  for (let y = 0, k = 0; y <= gh + 0.5; y += div, k++) lines.push(<View key={`y${k}`} style={[s.abs, s.gridLine, { left: 0, top: y + dy, width: gw, height: 1 }]} />);
  return <>{lines}</>;
}

// The sweep line at the right edge of the strip and its exponential tail to the left, drawn once.
const SweepStrip = memo(function SweepStrip({ tail, gh, dim }: { tail: number; gh: number; dim: boolean }) {
  // A-32 (D-049): the exponential tail gone within SWEEP_FADE_PX, never a flat wash over the strip.
  const { positions, colors } = sweepStripStops(tail, dim);
  return (
    <Canvas style={{ width: tail + 2, height: gh }} pointerEvents="none">
      <Rect x={0} y={0} width={tail} height={gh}>
        <LinearGradient start={vec(0, 0)} end={vec(tail, 0)} colors={colors} positions={positions} />
      </Rect>
      <Rect x={tail} y={0} width={2} height={gh} color={withAlpha(dim ? color.p2 : color.p5, 0.9)} />
    </Canvas>
  );
});

const s = StyleSheet.create({
  abs: { position: 'absolute' },
  dip: { backgroundColor: color.n0, zIndex: 10 },
  gridLine: { backgroundColor: withAlpha(color.p1, 0.4) },
});
