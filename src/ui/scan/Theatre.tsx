import { StyleSheet, Text, View } from 'react-native';
import { GRID_COLS, GRID_ROWS, GRID_TOP, Graticule, GridLabels, gridDiv } from '../boot/parts';
import { mulberry32 } from '../boot/seed';
import { Readout } from '../Readout';
import type { GlassSize } from '../screens/Housing';
import { color, type } from '../tokens';
import {
  BAR_BLOCKS,
  FAULT_LINE,
  PHASE_LINES,
  type Phase,
  type ScanFrame,
  barBlocks,
  faultOn,
  liveAt,
  logBefore,
  rateAt,
} from './timeline';

const copy = {
  firmware: 'FW 3.1.7 · ROM C2-8811',
  trig: 'TRIG AUTO',
  timebase: '50 ms/DIV',
  sens: '10 mG/DIV',
};

const SEG = 6;

// Glass content of the scan theatre: graticule, sweep line with persistence
// tail, noise trace on the grid; progress bar and the telemetry block below it.
// In the hold the trace, sweep and bar stay where they stopped, the telemetry
// stays dimmed at p3, and only the live row and the percentage go blank.
export function TheatreGlass({ size, seed, frame, cap }: { size: GlassSize; seed: number; frame: ScanFrame; cap: number }) {
  const { w, h } = size;
  const div = gridDiv(w);
  const gw = div * GRID_COLS;
  const gh = div * GRID_ROWS;
  const gridLeft = Math.round((w - gw) / 2);
  const gridBottom = GRID_TOP + gh;
  const hold = frame.kind === 'hold' || frame.kind === 'done';
  const fault = frame.kind === 'fault';
  const phase: Phase = hold ? 4 : frame.phase;
  const live = hold || fault ? null : liveAt(seed, phase, frame.tick);
  const pct = Math.floor(frame.progress * 100);

  const lines = logBefore(phase);
  const status = fault ? (faultOn(frame.faultT) ? FAULT_LINE : '') : PHASE_LINES[phase];
  const statusColor = hold ? color.p3 : frame.final || fault ? color.p5 : color.p4;
  // rdS is 8.5 px a char: the longest telemetry line (35 chars) and the fault line
  // need two rows on a narrow glass.
  const statusRows = gw < 304 ? 2 : 1;

  return (
    <>
      <Graticule w={w} h={h} />
      <GridLabels w={w} fw={copy.firmware} trig={copy.trig} tb={copy.timebase} sens={copy.sens} />
      <Trace seed={seed} frame={frame} left={gridLeft} cy={GRID_TOP + gh / 2} gw={gw} gh={gh} />
      <Sweep turns={frame.sweep} left={gridLeft} gw={gw} gh={gh} />
      <Bar left={gridLeft} top={gridBottom + 24} width={gw - 48} blocks={barBlocks(frame.progress)} />
      <Text style={[s.pct, { left: gridLeft + gw - 44, top: gridBottom + 22, width: 44 }]} testID="scan-percent">
        {hold ? '' : `${String(pct).padStart(3, ' ')}%`}
      </Text>
      <View style={[s.block, { left: gridLeft, top: gridBottom + 52, width: gw }]} testID="scan-readout">
        {[0, 1, 2].map((slot) => (
          <Text key={slot} style={s.log} numberOfLines={1}>
            {lines[slot - (3 - lines.length)] ?? ''}
          </Text>
        ))}
        <Text style={[s.status, { color: statusColor, height: 24 * statusRows }]} numberOfLines={statusRows} testID="scan-status">
          {status}
        </Text>
        <View style={s.live} testID="scan-live">
          {live ? <Readout size="rdL" label={live.label} value={live.value} unit={live.unit} labelCh={4} valueCh={5} unitCh={5} /> : null}
        </View>
        <View style={s.rate} testID="scan-rate">
          {live ? <Readout size="rdS" label="RATE" value={String(rateAt(seed, frame.tick, frame.activeFrac, cap))} unit="c/s" labelCh={5} valueCh={3} unitCh={3} /> : null}
        </View>
      </View>
    </>
  );
}

// Noise trace: points every SEG px joined by straight segments.
function Trace({ seed, frame, left, cy, gw, gh }: { seed: number; frame: ScanFrame; left: number; cy: number; gw: number; gh: number }) {
  const n = Math.ceil(gw / SEG) + 1;
  const rnd = mulberry32((seed ^ Math.imul(frame.tick + 1, 2246822519)) >>> 0);
  const amp = (0.12 + 0.5 * frame.activeFrac) * (gh / 2);
  const drift = frame.tick * 0.9;
  const pts = Array.from({ length: n }, (_, i) => {
    const dy = amp * (0.6 * Math.sin(i * 0.21 + drift) + 0.4 * (rnd() * 2 - 1));
    return { x: Math.min(gw, i * SEG), y: Math.round((cy + dy) * 2) / 2 };
  });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pts.slice(1).map((b, i) => {
        const a = pts[i]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        return (
          <View
            key={i}
            style={[
              s.trace,
              {
                left: left + (a.x + b.x) / 2 - len / 2,
                top: (a.y + b.y) / 2 - 0.75,
                width: len,
                transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const TAIL = [color.p5, color.p4, color.p3, color.p2, color.p1];

function Sweep({ turns, left, gw, gh }: { turns: number; left: number; gw: number; gh: number }) {
  const x = Math.floor((turns % 1) * gw);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {TAIL.map((c, i) => {
        const tx = x - i * 7;
        if (tx < 0) return null;
        return <View key={i} style={{ position: 'absolute', left: left + tx, top: GRID_TOP, width: i === 0 ? 2 : 3, height: gh, backgroundColor: c, opacity: i === 0 ? 0.9 : 0.55 }} />;
      })}
    </View>
  );
}

// 20 blocks below the grid, lit left to right in whole blocks.
function Bar({ left, top, width, blocks }: { left: number; top: number; width: number; blocks: number }) {
  const gap = 2;
  const bw = (width - 4 - gap * (BAR_BLOCKS - 1)) / BAR_BLOCKS;
  return (
    <View style={[s.bar, { left, top, width }]} testID="scan-bar" accessibilityLabel={`Progress ${Math.floor((blocks / BAR_BLOCKS) * 100)} percent`}>
      {Array.from({ length: BAR_BLOCKS }, (_, i) => (
        <View key={i} style={{ width: bw, height: 6, marginRight: i === BAR_BLOCKS - 1 ? 0 : gap, backgroundColor: i < blocks ? color.p4 : color.p1 }} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  trace: { position: 'absolute', height: 1.5, backgroundColor: color.p4 },
  bar: {
    position: 'absolute',
    height: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 1,
    borderWidth: 1,
    borderColor: color.p2,
  },
  pct: { ...type.rdXS, position: 'absolute', color: color.p4, textAlign: 'right' },
  block: { position: 'absolute' },
  log: { ...type.rdS, color: color.p3, height: 24 },
  status: { ...type.rdS, height: 24 },
  live: { height: 44, marginTop: 4 },
  rate: { height: 24 },
});
