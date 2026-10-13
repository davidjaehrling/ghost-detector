import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BELIEF_PROFILE, type Belief, getBelief, setBelief } from '../src/state/belief';
import { activityIndex, daysToFullMoon } from '../src/ui/boot/activity';
import { FIXED_SEED, getInstallIdentity } from '../src/ui/boot/install';
import { type BootParams, readBootParams } from '../src/ui/boot/params';
import {
  BurnIn,
  GRID_COLS,
  GRID_ROWS,
  GRID_TOP,
  Graticule,
  GridLabels,
  IdleTrace,
  type KeySlot,
  MiniSticker,
  Sticker,
  gridDiv,
  useTyped,
} from '../src/ui/boot/parts';
import { dayKey } from '../src/ui/boot/seed';
import { selfTestReadings } from '../src/ui/boot/selftest';
import { Readout } from '../src/ui/Readout';
import { composeFields } from '../src/ui/readoutFields';
import { Housing } from '../src/ui/screens/Housing';
import { color, type } from '../src/ui/tokens';

// Copy keys follow docs/voice-guide.md section 3.
const copy = {
  firmware: 'FW 3.1.7 · ROM C2-8811',
  trig: 'TRIG AUTO',
  timebase: '50 ms/DIV',
  selftestOk: 'SELFTEST OK',
  actIdx: 'ACT IDX',
  moon: 'MOON',
  nextPeak: 'NEXT PEAK  FULL MOON',
  window: 'WINDOW 22:00 TO 04:00',
  gauge10: '10',
  gauge100: '100',
  gauge1000: '1000',
  gaugeUnit: 'mG',
  // 72 px caps cannot carry the full word; the accessibility label does.
  key: 'ACK',
  keyLabel: 'Acknowledge',
  glassLabel: 'Boot self-test and calibration sticker.',
  'onboarding.head': 'FIELD CALIBRATION',
  'onboarding.question': "Have you ever experienced something you couldn't explain?",
  'onboarding.note': 'One question. The answer stays on this device.',
  'onboarding.intensitySet': (name: string) => `Intensity set to ${name}. Change any time in Settings.`,
  yes: 'YES',
  unsure: 'NOT SURE',
  no: 'NO',
  skip: 'SKIP',
};

const TYPE_CPS = 40;
// Per-launch variation for the seeded self-test readings.
const BOOT_NONCE = Date.now() % 100_000;
const snap4 = (n: number) => Math.round(n / 4) * 4;
const CONFIRM_MS = 1400;
const CONFIRM_MS_STATIC = 250;

let cached: BootParams | null = null;
const clientParams = () => (cached ??= readBootParams());
const serverParams = () => null;
const subscribeNever = () => () => {};

// Query params exist only on the client, so the static export renders the
// empty housing and the body mounts after hydration (no hydration mismatch).
export default function BootScreen() {
  const params = useSyncExternalStore(subscribeNever, clientParams, serverParams);
  return params ? <Boot params={params} /> : <View testID="boot-screen" style={s.empty} />;
}

type Stage = 'sticker' | 'calib' | 'confirmed';

function Boot({ params: { isStatic, date, dated, calib } }: { params: BootParams }) {
  const router = useRouter();
  const { index, moonPct } = activityIndex(date);
  const peakDays = daysToFullMoon(date);
  const fixed = isStatic || dated;
  const identity = useMemo(() => (fixed ? getInstallIdentity(date, FIXED_SEED) : getInstallIdentity(date)), [fixed, date]);
  const lines = useMemo(() => {
    const seed = fixed ? dayKey(date) : dayKey(date) ^ BOOT_NONCE;
    return selfTestReadings(seed);
  }, [fixed, date]);
  const lineLen = lines.map((l) => composeFields({ ...l, labelCh: 6, valueCh: 5, unitCh: 4 }).join('').length);
  const total = lineLen.reduce((n, l) => n + l, 0) + copy.selftestOk.length;
  const typed = useTyped(total, TYPE_CPS, isStatic || calib);
  const typing = typed < total;

  const [stage, setStage] = useState<Stage>(calib ? 'calib' : 'sticker');
  const [answer, setAnswer] = useState<Belief | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const goOn = () => router.push('/viewfinder');
  const onAcknowledge = () => {
    // The question is asked once; a stored answer goes straight on.
    if (getBelief()) goOn();
    else setStage('calib');
  };
  const onAnswer = (b: Belief) => {
    setBelief(b);
    setAnswer(b);
    setStage('confirmed');
    if (timer.current) clearTimeout(timer.current);
    // Under ?calib=1 the card is the golden; nothing navigates away from it.
    if (!calib) timer.current = setTimeout(goOn, isStatic ? CONFIRM_MS_STATIC : CONFIRM_MS);
  };

  const keys: (KeySlot | null)[] =
    stage === 'sticker'
      ? [null, null, null, { testID: 'key-acknowledge', label: copy.keyLabel, legend: copy.key, onPress: onAcknowledge, inert: typing }]
      : stage === 'calib'
        ? [
            { testID: 'key-calib-yes', label: 'Yes', legend: copy.yes, onPress: () => onAnswer('yes') },
            { testID: 'key-calib-unsure', label: 'Not sure', legend: copy.unsure, onPress: () => onAnswer('unsure') },
            { testID: 'key-calib-no', label: 'No', legend: copy.no, onPress: () => onAnswer('no') },
            { testID: 'key-calib-skip', label: 'Skip, same as not sure', legend: copy.skip, onPress: () => onAnswer('unsure') },
          ]
        : [null, null, null, null];

  return (
    <Housing
      testID="boot-screen"
      leds={1}
      fixedIdentity={fixed}
      identity={identity}
      keys={keys}
      bandExtra={
        stage === 'sticker' ? null : (
          <View style={s.miniSlot}>
            <MiniSticker {...identity} />
          </View>
        )
      }
    >
      {({ w, h }) => {
        const div = gridDiv(w);
        const gridLeft = Math.round((w - div * GRID_COLS) / 2);
        const gridBottom = GRID_TOP + div * GRID_ROWS;
        return (
          <>
            <BurnIn
              cx={Math.round(w * 0.16)}
              cy={GRID_TOP + Math.round(div * GRID_ROWS * 0.8)}
              labels={{ l10: copy.gauge10, l100: copy.gauge100, l1000: copy.gauge1000, unit: copy.gaugeUnit }}
            />
            <Graticule w={w} h={h} />
            <IdleTrace w={w} seed={dayKey(date) + 1} />
            <GridLabels w={w} fw={copy.firmware} trig={copy.trig} tb={copy.timebase} />

            <View style={[s.readout, { left: snap4(gridLeft), top: snap4(gridBottom + 28) }]} testID="readout">
              {lines.map((l, i) => (
                <Readout
                  key={l.label}
                  {...l}
                  typed={typed - lineLen.slice(0, i).reduce((n, p) => n + p, 0)}
                  labelColor={color.p3}
                />
              ))}
              <Text style={s.stM}>{copy.selftestOk.slice(0, Math.max(0, typed - lineLen.reduce((n, p) => n + p, 0)))}</Text>
              <Text style={s.activity}>{`${copy.actIdx} ${index}/5 · ${copy.moon} ${moonPct}%`}</Text>
              <Text style={s.peak}>{`${copy.nextPeak}  +${peakDays} D`}</Text>
              <Text style={s.peak}>{copy.window}</Text>
            </View>

            {stage === 'sticker' ? (
              <View style={s.stickerSlot} testID="sticker">
                <Sticker {...identity} />
              </View>
            ) : (
              <View style={s.card} testID="calibration">
                <Text style={s.cardHead}>{copy['onboarding.head']}</Text>
                <Text style={s.question}>{copy['onboarding.question']}</Text>
                <Text style={s.note} testID="calibration-note">
                  {answer ? copy['onboarding.intensitySet'](BELIEF_PROFILE[answer].intensity.toUpperCase()) : copy['onboarding.note']}
                </Text>
              </View>
            )}
          </>
        );
      }}
    </Housing>
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, backgroundColor: color.n3 },
  readout: { position: 'absolute' },
  stM: { ...type.rdM, color: color.p4, height: 28, marginTop: 4 },
  activity: { ...type.rdM, color: color.p3, height: 28, marginTop: 8 },
  peak: { ...type.rdS, color: color.p3, height: 24 },
  stickerSlot: { position: 'absolute', left: 10, right: 10, bottom: 13 },
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: color.n0,
    borderWidth: 1,
    borderColor: color.p2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardHead: { ...type.lbS, color: color.p3 },
  question: { ...type.rdS, color: color.p4, marginTop: 8 },
  note: { ...type.rdXS, color: color.p3, marginTop: 6, height: 36 },
  miniSlot: { position: 'absolute', left: 2, top: 0 },
});
