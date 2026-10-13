import { StyleSheet, Text, View } from 'react-native';
import { GRID_COLS, GRID_ROWS, GRID_TOP, Graticule, GridLabels, gridDiv } from '../boot/parts';
import { mulberry32 } from '../boot/seed';
import type { GlassSize } from '../screens/Housing';
import { color, space, type } from '../tokens';
import { BAR_BLOCKS, PHASE_LINES, type ScanFrame, barBlocks, logBefore, readingAt } from './timeline';

const copy = {
  firmware: 'FW 3.1.7 · ROM C2-8811',
  trig: 'TRIG AUTO',
  timebase: '50 ms/DIV',
};

const SWEEP_PERIOD_MS = 1600;
const SEG = 6;

// Glass content of the scan theatre: graticule, sweep line with persistence
// tail, noise trace, progress bar on the grid, telemetry block. In the hold
// the trace, sweep and bar stay where they stopped and every readout is blank.
export function TheatreGlass({ size, seed, frame }: { size: GlassSize; seed: number; frame: ScanFrame }) {
  const { w, h } = size;
  const div = gridDiv(w);
  const gw = div * GRID_COLS;
  const gh = div * GRID_ROWS;
  const gridLeft = Math.round((w - gw) / 2);
  const hold = frame.kind !== 'phase';
  const phase = frame.kind === 'phase' ? frame.phase : null;
  const pct = Math.floor(frame.progress * 100);

  return (
    <>
      <Graticule w={w} h={h} />
      <GridLabels w={w} fw={copy.firmware} trig={copy.trig} tb={copy.timebase} />
      <Trace seed={seed} frame={frame} left={gridLeft} cy={GRID_TOP + gh / 2} gw={gw} gh={gh} />
      <Sweep t={frame.t} left={gridLeft} gw={gw} gh={gh} />
      <Bar left={gridLeft} top={GRID_TOP + gh - 16} width={gw} blocks={barBlocks(frame.progress)} />
      <Text style={[s.pct, { right: gridLeft, top: GRID_TOP + gh + 3 }]} testID="scan-percent">
        {hold ? '' : `${String(pct).padStart(3, ' ')}%`}
      </Text>
      <View style={[s.block, { left: gridLeft, top: GRID_TOP + gh + 28, width: gw }]} testID="scan-readout">
        {[0, 1, 2].map((slot) => {
          const lines = phase === null ? [] : logBefore(phase);
          const line = lines[slot - (3 - lines.length)];
          return (
            <Text key={slot} style={s.log} numberOfLines={1}>
              {line ?? ''}
            </Text>
          );
        })}
        <Text style={s.status} numberOfLines={1}>
          {phase === null ? '' : PHASE_LINES[phase]}
        </Text>
        <Text style={s.value} numberOfLines={1}>
          {phase === null ? '' : readingAt(seed, phase, frame.tick)}
        </Text>
      </View>
    </>
  );
}

function Trace({ seed, frame, left, cy, gw, gh }: { seed: number; frame: ScanFrame; left: number; cy: number; gw: number; gh: number }) {
  const n = Math.ceil(gw / SEG);
  const rnd = mulberry32((seed ^ Math.imul(frame.tick + 1, 2246822519)) >>> 0);
  const amp = (0.12 + 0.5 * frame.activeFrac) * (gh / 2);
  const drift = frame.tick * 0.9;
  const ys = Array.from({ length: n }, (_, i) => {
    const dy = amp * (0.6 * Math.sin(i * 0.21 + drift) + 0.4 * (rnd() * 2 - 1));
    return Math.round((cy + dy) * 2) / 2;
  });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ys.map((y, i) => (
        <View key={`t${i}`} style={[s.trace, { left: left + i * SEG, top: y, width: Math.min(SEG, gw - i * SEG) }]} />
      ))}
      {ys.slice(1).map((y, i) => (
        <View key={`c${i}`} style={[s.trace, { left: left + (i + 1) * SEG - 0.75, top: Math.min(y, ys[i]!), width: 1.5, height: Math.abs(y - ys[i]!) + 1.5 }]} />
      ))}
    </View>
  );
}

const TAIL = [color.p5, color.p4, color.p3, color.p2, color.p1];

function Sweep({ t, left, gw, gh }: { t: number; left: number; gw: number; gh: number }) {
  const x = Math.floor(((t % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * gw);
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

// 20 blocks on the bottom row of the grid, lit left to right in whole blocks.
function Bar({ left, top, width, blocks }: { left: number; top: number; width: number; blocks: number }) {
  const inner = width - 16;
  const gap = 2;
  const bw = (inner - 4 - gap * (BAR_BLOCKS - 1)) / BAR_BLOCKS;
  return (
    <View style={[s.bar, { left: left + 8, top, width: inner }]} testID="scan-bar" accessibilityLabel={`Progress ${Math.floor((blocks / BAR_BLOCKS) * 100)} percent`}>
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
    height: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 1,
    backgroundColor: 'rgba(10, 15, 11, 0.85)',
    borderWidth: 1,
    borderColor: color.p2,
  },
  pct: { ...type.rdXS, position: 'absolute', color: color.p4 },
  block: { position: 'absolute' },
  log: { ...type.rdS, color: color.p3, height: 22 },
  status: { ...type.rdS, color: color.p4, height: 22 },
  value: { ...type.rdM, color: color.p4, height: 28, marginTop: space.unit * 2 },
});
