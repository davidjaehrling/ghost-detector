import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScopeLayer } from '../../fx/scope';
import { GRID_COLS, GRID_ROWS, GRID_TOP, Graticule, GridLabels, gridDiv, useBlink } from '../boot/parts';
import { Readout } from '../Readout';
import type { GlassSize } from '../screens/Housing';
import { color, type } from '../tokens';
import { BLOCKS, BlockBar, RATE_MAX_H } from './BlockBar';
import {
  faultLine,
  type Phase,
  type ScanFrame,
  barBlocks,
  faultOn,
  heldThermal,
  liveAt,
  logBefore,
  phaseLine,
  rateAt,
} from './timeline';
import { copyOf, t, useLocale } from '../../i18n';

const copy = copyOf({
  firmware: 'hud.firmware',
  trig: 'hud.trig',
  timebase: 'hud.timebase',
  sens: 'hud.sens',
  hold: 'scan.hold',
});

// The fault line is two sentences; a narrow glass sets one per row.
const faultRows = (line: string): [string, string] => {
  const i = line.indexOf('. ');
  return i < 0 ? [line, ''] : [line.slice(0, i + 1), line.slice(i + 2)];
};

const CH_S = 8.5; // rdS advance: 0.4 em plus 0.5 tracking
// Live row 44, RATE 24, rate ramp, gaps and the bottom margin.
const RATE_BAR_BOTTOM = 12;
const PINNED_BOTTOM = RATE_BAR_BOTTOM + RATE_MAX_H + 6;
const LIVE_H = 44;
const RATE_H = 24;
const TELEMETRY_GAP = 12; // gap between the telemetry and the pinned live row when the grid is at its row count
const TELEMETRY_GAP_MIN = 4; // the grid takes one more division when that still leaves this much
const GRID_ROWS_MAX = 14;
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
  useLocale();
  const { w, h } = size;
  const div = gridDiv(w);
  const gw = div * GRID_COLS;
  const narrow = gw < 304;
  // The graticule takes the height the telemetry and the pinned live row leave over, in whole
  // divisions (8 at the least, the Bible's grid); what is left below that is the gap between the
  // telemetry and the live row, 4 px at the least and under a division more than the 12 px target. Every state shares this layout.
  const telemetryH = 3 * 24 + (narrow ? 48 : 24);
  const below = TELEMETRY_TOP + telemetryH + TELEMETRY_GAP + LIVE_H + RATE_H + PINNED_BOTTOM;
  const rows = Math.max(GRID_ROWS, Math.min(GRID_ROWS_MAX, Math.floor((h - GRID_TOP - below + TELEMETRY_GAP - TELEMETRY_GAP_MIN) / div)));
  const gh = div * rows;
  const gridLeft = Math.round((w - gw) / 2);
  const gridBottom = GRID_TOP + gh;
  const hold = frame.kind === 'hold' || frame.kind === 'done';
  const fault = frame.kind === 'fault';
  const phase: Phase = hold ? 4 : frame.phase;
  const live = hold || fault ? null : liveAt(seed, phase, frame.tick);
  // The hold and the fault beat keep the last thermal reading of phase 2 (the fault always lands in it),
  // dimmed to p3 and tagged HOLD; the tag blinks in the hold only.
  const held = hold ? heldThermal(seed, frame.t) : fault ? liveAt(seed, 2, Math.max(0, frame.tick - 1)) : null;
  const pct = Math.floor(frame.progress * 100);
  const blink = useBlink(still);

  const lines = logBefore(seed, phase);
  const faultVisible = fault && faultOn(frame.faultT);
  const status = fault ? (faultVisible ? faultLine() : '') : phaseLine(seed, phase);
  const statusColor = hold ? color.p3 : frame.final || fault ? color.p5 : color.p4;
  // The fault line hangs its second row under the text after `E-07 ` on a narrow glass.
  const rate = live ? rateAt(seed, frame.tick, frame.activeFrac, cap) : 0;
  const barLeft = gridLeft;
  const lit = barBlocks(frame.progress);
  const rateLit = live ? Math.max(1, Math.round((rate / cap) * BLOCKS)) : 0;

  return (
    <>
      <StaticGraticule w={w} h={h} rows={rows} />
      <StaticGridLabels w={w} fw={copy.firmware} trig={copy.trig} tb={copy.timebase} sens={copy.sens} rows={rows} />
      {/* Trace, afterglow and sweep in Skia (src/fx/scope); the fault beat tears the grid and dips the glass. */}
      <ScopeLayer
        seed={seed}
        frame={{ tick: frame.tick, sweep: frame.sweep, activeFrac: frame.activeFrac, faultT: frame.kind === 'fault' ? frame.faultT : -1 }}
        left={gridLeft}
        top={GRID_TOP}
        gw={gw}
        gh={gh}
        div={div}
        flat={fault}
        dim={hold}
        still={still}
      />
      <BlockBar lit={lit} left={barLeft} top={gridBottom + 24} width={gw - 48} hideLast={fault && !faultVisible} testID="scan-bar" label={t('scan.progressLabel', { pct })} />
      {/* The percentage stays through the hold at 100%; the HOLD tag sits on the held ΔT row. */}
      <Text style={[s.pct, { left: gridLeft + gw - 44, top: gridBottom + 22, width: 44 }]} testID="scan-percent">
        {`${String(hold ? 100 : pct).padStart(3, ' ')}%`}
      </Text>
      {/* Telemetry sits directly under the progress bar: no dead band between them. */}
      <View style={[s.block, { left: gridLeft, top: gridBottom + TELEMETRY_TOP, width: gw }]} testID="scan-readout">
        {[0, 1, 2].map((slot) => (
          <Text key={slot} style={s.log} numberOfLines={1}>
            {lines[slot - (3 - lines.length)] ?? ''}
          </Text>
        ))}
        {fault && narrow ? (
          <View style={{ height: 48 }} testID="scan-status" accessibilityLabel={faultLine()}>
            <Text style={[s.status, { color: statusColor, opacity: faultVisible ? 1 : 0 }]}>{faultRows(faultLine())[0]}</Text>
            <Text style={[s.status, { color: statusColor, opacity: faultVisible ? 1 : 0, marginLeft: FAULT_INDENT }]}>{faultRows(faultLine())[1]}</Text>
          </View>
        ) : (
          <Text style={[s.status, { color: statusColor, height: narrow ? 48 : 24 }]} numberOfLines={narrow ? 2 : 1} testID="scan-status">
            {status}
          </Text>
        )}
      </View>
      <View style={[s.pinned, { left: gridLeft, width: gw, bottom: PINNED_BOTTOM }]}>
        <View style={s.live} testID="scan-live">
          {live ? <LiveRow label={live.label} value={live.value} unit={live.unit} /> : null}
          {held ? (
            <View style={s.heldRow} testID="scan-held">
              <LiveRow label={held.label} value={held.value} unit={held.unit} tone={color.p3} />
              <Text style={[s.heldTag, { opacity: fault || blink ? 1 : 0 }]} testID="scan-held-tag">
                {copy.hold}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={s.rate} testID="scan-rate">
          {/* The label stays through the hold and the fault beat; only the value goes blank. */}
          <Readout
            size="rdS"
            label={t('scan.rate')}
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
      <BlockBar variant="rate" lit={rateLit} left={gridLeft} bottom={RATE_BAR_BOTTOM} width={gw} litColor={frame.final ? color.p5 : color.p4} testID="scan-rate-bar" label={t('scan.rateLabel')} />
    </>
  );
}

// The grid and its labels never change during a scan: memoised so the 20 Hz scan clock does not
// re-render a hundred views each tick.
const StaticGraticule = memo(Graticule);
const StaticGridLabels = memo(GridLabels);

// The big live row: the label as wide as its own text, the value right-aligned in a 5-character field
// straight after it, the unit at rdXS on the value's baseline. rdL advances 19.2 px a character, so for
// ΔT the value starts 57 px from the label's left edge (it used to start about 100 px away).
const LIVE_CH = 19.2;
function LiveRow({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: string }) {
  return (
    <View style={s.liveRow}>
      <Text style={[s.liveLabel, tone ? { color: tone } : null]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.liveValue, tone ? { color: tone } : null]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[s.liveUnit, tone ? { color: tone } : null]} numberOfLines={1}>
        {unit}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  pct: { ...type.rdXS, position: 'absolute', color: color.p4, textAlign: 'right' },
  block: { position: 'absolute' },
  log: { ...type.rdS, color: color.p3, height: 24 },
  status: { ...type.rdS, height: 24 },
  heldRow: { flexDirection: 'row', alignItems: 'flex-end' },
  heldTag: { ...type.rdS, height: 24, marginLeft: 12, marginBottom: 6, color: color.p3 },
  liveRow: { flexDirection: 'row', alignItems: 'flex-end', height: 44 },
  liveLabel: { ...type.rdL, height: 44, color: color.p3 },
  liveValue: { ...type.rdL, width: 5 * LIVE_CH, height: 44, textAlign: 'right', color: color.p4 },
  liveUnit: { ...type.rdXS, height: 20, marginLeft: 6, marginBottom: 6, color: color.p3 },
  pinned: { position: 'absolute' },
  live: { height: 44 },
  rate: { height: 24 },
});
