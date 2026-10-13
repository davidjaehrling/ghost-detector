import { StyleSheet, Text, View } from 'react-native';
import { GRID_COLS, GRID_ROWS, GRID_TOP, Graticule, GridLabels, gridDiv, useBlink } from '../boot/parts';
import { mulberry32 } from '../boot/seed';
import { Readout } from '../Readout';
import type { GlassSize } from '../screens/Housing';
import { color, type } from '../tokens';
import { BLOCKS, BlockBar, RATE_MAX_H } from './BlockBar';
import {
  FAULT_LINE,
  type Phase,
  type ScanFrame,
  barBlocks,
  faultOn,
  liveAt,
  logBefore,
  phaseLine,
  rateAt,
} from './timeline';

const copy = {
  firmware: 'FW 3.1.7 · ROM C2-8811',
  trig: 'TRIG AUTO',
  timebase: '50 ms/DIV',
  sens: '10 mG/DIV',
};

const SEG = 6;
const CH_S = 8.5; // rdS advance: 0.4 em plus 0.5 tracking
// Live row 44, RATE 24, rate ramp, gaps and the bottom margin.
const RATE_BAR_BOTTOM = 12;
const PINNED_BOTTOM = RATE_BAR_BOTTOM + RATE_MAX_H + 6;
const LIVE_H = 44;
const RATE_H = 24;
const TELEMETRY_GAP = 12; // least gap between the telemetry and the pinned live row
const GRID_ROWS_MAX = 12;
// Progress bar 24 px under the grid, telemetry 52 px under it (three log rows, then the status row).
const TELEMETRY_TOP = 52;
const FAULT_INDENT = 'E-07 '.length * CH_S;

// Glass content of the scan theatre: graticule, sweep line with persistence
// tail, noise trace on the grid; progress bar and the telemetry block below it;
// the live value, RATE and the rate bar pinned low. In the hold the trace and
// sweep stay where they stopped at p2, the last telemetry line stays dimmed at
// p3, a block blinks where the percentage was, and the live rows go blank.
// The fault beat flattens the trace, stalls the bar and blinks the E-07 line.
export function TheatreGlass({ size, seed, frame, cap, still = false }: { size: GlassSize; seed: number; frame: ScanFrame; cap: number; still?: boolean }) {
  const { w, h } = size;
  const div = gridDiv(w);
  const gw = div * GRID_COLS;
  const narrow = gw < 304;
  // The graticule takes the height the telemetry and the pinned live row leave over, in whole
  // divisions (8 at the least, the Bible's grid); what is left below that is the gap between the
  // telemetry and the live row, 12 px or a little more. Every state shares this layout.
  const telemetryH = 3 * 24 + (narrow ? 48 : 24);
  const below = TELEMETRY_TOP + telemetryH + TELEMETRY_GAP + LIVE_H + RATE_H + PINNED_BOTTOM;
  const rows = Math.max(GRID_ROWS, Math.min(GRID_ROWS_MAX, Math.floor((h - GRID_TOP - below) / div)));
  const gh = div * rows;
  const gridLeft = Math.round((w - gw) / 2);
  const gridBottom = GRID_TOP + gh;
  const hold = frame.kind === 'hold' || frame.kind === 'done';
  const fault = frame.kind === 'fault';
  const phase: Phase = hold ? 4 : frame.phase;
  const live = hold || fault ? null : liveAt(seed, phase, frame.tick);
  const pct = Math.floor(frame.progress * 100);
  const blink = useBlink(still);

  const lines = logBefore(seed, phase);
  const faultVisible = fault && faultOn(frame.faultT);
  const status = fault ? (faultVisible ? FAULT_LINE : '') : phaseLine(seed, phase);
  const statusColor = hold ? color.p3 : frame.final || fault ? color.p5 : color.p4;
  // The fault line hangs its second row under the text after `E-07 ` on a narrow glass.
  const rate = live ? rateAt(seed, frame.tick, frame.activeFrac, cap) : 0;
  const barLeft = gridLeft;
  const lit = barBlocks(frame.progress);
  const rateLit = live ? Math.max(1, Math.round((rate / cap) * BLOCKS)) : 0;

  return (
    <>
      <Graticule w={w} h={h} rows={rows} />
      <GridLabels w={w} fw={copy.firmware} trig={copy.trig} tb={copy.timebase} sens={copy.sens} rows={rows} />
      <Trace seed={seed} frame={frame} left={gridLeft} cy={GRID_TOP + gh / 2} gw={gw} gh={gh} flat={fault} dim={hold} />
      <Sweep turns={frame.sweep} left={gridLeft} gw={gw} gh={gh} dim={hold} />
      <BlockBar lit={lit} left={barLeft} top={gridBottom + 24} width={gw - 48} hideLast={fault && !faultVisible} testID="scan-bar" label={`Progress ${pct} percent`} />
      {hold ? (
        <View style={[s.holdBlock, { left: gridLeft + gw - 10, top: gridBottom + 26, opacity: blink ? 1 : 0 }]} testID="scan-percent" />
      ) : (
        <Text style={[s.pct, { left: gridLeft + gw - 44, top: gridBottom + 22, width: 44 }]} testID="scan-percent">
          {`${String(pct).padStart(3, ' ')}%`}
        </Text>
      )}
      {/* Telemetry sits directly under the progress bar: no dead band between them. */}
      <View style={[s.block, { left: gridLeft, top: gridBottom + TELEMETRY_TOP, width: gw }]} testID="scan-readout">
        {[0, 1, 2].map((slot) => (
          <Text key={slot} style={s.log} numberOfLines={1}>
            {lines[slot - (3 - lines.length)] ?? ''}
          </Text>
        ))}
        {fault && narrow ? (
          <View style={{ height: 48 }} testID="scan-status" accessibilityLabel={FAULT_LINE}>
            <Text style={[s.status, { color: statusColor, opacity: faultVisible ? 1 : 0 }]}>{'E-07 SENSOR DRIFT.'}</Text>
            <Text style={[s.status, { color: statusColor, opacity: faultVisible ? 1 : 0, marginLeft: FAULT_INDENT }]}>{'RECALIBRATING.'}</Text>
          </View>
        ) : (
          <Text style={[s.status, { color: statusColor, height: narrow ? 48 : 24 }]} numberOfLines={narrow ? 2 : 1} testID="scan-status">
            {status}
          </Text>
        )}
      </View>
      <View style={[s.pinned, { left: gridLeft, width: gw, bottom: PINNED_BOTTOM }]}>
        <View style={s.live} testID="scan-live">
          {live ? <Readout size="rdL" label={live.label} value={live.value} unit={live.unit} labelCh={4} valueCh={5} unitCh={5} /> : null}
        </View>
        <View style={s.rate} testID="scan-rate">
          {/* The label stays through the hold and the fault beat; only the value goes blank. */}
          <Readout
            size="rdS"
            label="RATE"
            value={live ? String(rate) : '--'}
            unit="c/s"
            labelCh={5}
            valueCh={3}
            unitCh={3}
            labelColor={frame.final && live ? color.p5 : color.p3}
            valueColor={live ? (frame.final ? color.p5 : color.p4) : color.p2}
            unitColor={live ? (frame.final ? color.p5 : color.p3) : color.p2}
          />
        </View>
      </View>
      <BlockBar variant="rate" lit={rateLit} left={gridLeft} bottom={RATE_BAR_BOTTOM} width={gw} litColor={frame.final ? color.p5 : color.p4} testID="scan-rate-bar" label="Event rate" />
    </>
  );
}

// Noise trace: points every SEG px joined by straight segments.
function Trace({ seed, frame, left, cy, gw, gh, flat, dim }: { seed: number; frame: ScanFrame; left: number; cy: number; gw: number; gh: number; flat: boolean; dim: boolean }) {
  const n = Math.ceil(gw / SEG) + 1;
  const rnd = mulberry32((seed ^ Math.imul(frame.tick + 1, 2246822519)) >>> 0);
  const amp = flat ? 0 : (0.12 + 0.5 * frame.activeFrac) * (gh / 2);
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
                height: dim ? 2 : 1.5,
                left: left + (a.x + b.x) / 2 - len / 2,
                top: (a.y + b.y) / 2 - 0.75,
                width: len,
                backgroundColor: dim ? color.p2 : color.p4,
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

function Sweep({ turns, left, gw, gh, dim }: { turns: number; left: number; gw: number; gh: number; dim: boolean }) {
  const x = Math.floor((turns % 1) * gw);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {TAIL.map((c, i) => {
        const tx = x - i * 7;
        if (tx < 0) return null;
        return <View key={i} style={{ position: 'absolute', left: left + tx, top: GRID_TOP, width: i === 0 ? 2 : 3, height: gh, backgroundColor: dim ? color.p2 : c, opacity: dim ? (i === 0 ? 0.9 : 0.35) : i === 0 ? 0.9 : 0.55 }} />;
      })}
    </View>
  );
}

const s = StyleSheet.create({
  trace: { position: 'absolute', height: 1.5, backgroundColor: color.p4 },
  pct: { ...type.rdXS, position: 'absolute', color: color.p4, textAlign: 'right' },
  block: { position: 'absolute' },
  log: { ...type.rdS, color: color.p3, height: 24 },
  status: { ...type.rdS, height: 24 },
  holdBlock: { position: 'absolute', width: 10, height: 14, backgroundColor: color.p4 },
  pinned: { position: 'absolute' },
  live: { height: 44 },
  rate: { height: 24 },
});
