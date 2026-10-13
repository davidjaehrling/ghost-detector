import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { BELIEF_PROFILE, type Belief, getBelief, setBelief } from '../src/state/belief';
import { sessionActivity } from '../src/state/session';
import { daysToFullMoon, formatWindowCountdown } from '../src/ui/boot/activity';
import { FIXED_SEED, getInstallIdentity } from '../src/ui/boot/install';
import { type BootParams, readBootParams } from '../src/ui/boot/params';
import {
  GRID_COLS,
  GRID_ROWS,
  GRID_TOP,
  Graticule,
  GridLabels,
  IdleTrace,
  type KeySlot,
  Sticker,
  gridDiv,
  useBlink,
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
  // 72 px caps cannot carry the full word; the accessibility label does.
  key: 'ACK',
  keyLabel: 'Acknowledge',
  glassLabel: 'Boot self-test and calibration sticker.',
  'onboarding.head': 'FIELD CALIBRATION',
  // The question is set in three fixed rows; the last row carries the cursor.
  questionRows: ["Have you ever experienced\nsomething you couldn't", 'explain?'] as const,
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
const STICKER_H_GUESS = 132; // until the sticker has been measured
// In calibration the sticker slides down until its two heading lines (10 px padding, 18 px each)
// show whole (the -1.5 degree tilt lowers its left end by 4 px) with a few px of paper under it; the glass edge is the paper edge.
const STICKER_PEEK = 10 + 18 * 2 + 8;
const CONFIRM_MS = 1400;
const CONFIRM_MS_STATIC = 800; // the warp snapshot can hold the thread; the e2e must still see the note

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
  const { index, moonPct } = sessionActivity(date);
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
  const calibrating = stage !== 'sticker';
  const [answer, setAnswer] = useState<Belief | null>(null);
  const [stickerH, setStickerH] = useState(STICKER_H_GUESS);
  const cursorOn = useBlink(isStatic);
  const countdown = formatWindowCountdown(date);
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
            null,
          ]
        : [null, null, null, null];

  return (
    <Housing
      testID="boot-screen"
      leds={1}
      fixedIdentity={fixed}
      identity={identity}
      keys={keys}
      // Warp is a snapshot: it is retaken once the typing is done and on each stage or answer change.
      glass={{ warp: true, warmUp: true, refreshKey: `${stage}-${typing ? 'typing' : 'typed'}-${answer ?? ''}` }}
    >
      {({ w, h }) => {
        const div = gridDiv(w);
        const gridLeft = Math.round((w - div * GRID_COLS) / 2);
        const gridBottom = GRID_TOP + div * GRID_ROWS;
        return (
          <>
            <Graticule w={w} h={h} />
            <IdleTrace w={w} seed={dayKey(date) + 1} />
            <GridLabels w={w} fw={copy.firmware} trig={copy.trig} tb={copy.timebase} />

            <View style={[s.readout, { left: snap4(gridLeft), top: snap4(gridBottom + 28) }]} testID="readout">
              {calibrating
                ? null
                : lines.map((l, i) => (
                    <Readout
                      key={l.label}
                      {...l}
                      typed={typed - lineLen.slice(0, i).reduce((n, p) => n + p, 0)}
                      labelColor={color.p3}
                    />
                  ))}
              {calibrating ? null : <Text style={s.stM}>{copy.selftestOk.slice(0, Math.max(0, typed - lineLen.reduce((n, p) => n + p, 0)))}</Text>}
              <Text style={s.activity} testID="activity">
                {`${copy.actIdx} `}
                <Text style={index >= 3 ? s.activityHot : undefined}>{String(index)}</Text>
                {`/5 · ${copy.moon} ${moonPct}%`}
              </Text>
              <Text style={s.countdown} testID="countdown">
                {countdown}
              </Text>
              {calibrating ? null : <Text style={s.peak}>{`${copy.nextPeak}  +${peakDays} D`}</Text>}
            </View>

            {/* The sticker keeps its full size. In calibration it slides down until
                only its first heading line shows above the glass bottom edge (the glass clips the rest). */}
            <View
              style={[s.stickerSlot, calibrating && { bottom: 0, transform: [{ translateY: Math.max(0, stickerH - STICKER_PEEK) }] }]}
              testID="sticker"
              pointerEvents="none"
            >
              <Sticker {...identity} onLayout={(e: LayoutChangeEvent) => setStickerH(Math.round(e.nativeEvent.layout.height))} />
            </View>

            {calibrating ? (
              <View style={[s.calib, { bottom: STICKER_PEEK + 12 }]} testID="calibration">
                <Text style={s.cardHead}>{copy['onboarding.head']}</Text>
                <View style={s.rule} />
                <View accessible accessibilityLabel={copy['onboarding.question']} testID="calibration-question">
                  <Text style={s.question}>{copy.questionRows[0]}</Text>
                  <View style={s.cursorRow}>
                    <Text style={s.question}>{copy.questionRows[1]}</Text>
                    <View style={[s.cursor, { opacity: cursorOn ? 1 : 0 }]} testID="calibration-cursor" />
                  </View>
                </View>
                <View style={s.answerRow}>
                  <Pressable
                    testID="key-calib-skip"
                    accessibilityRole="button"
                    accessibilityLabel="Skip, same as not sure"
                    onPress={() => onAnswer('unsure')}
                    hitSlop={{ top: 8, bottom: 8, left: 12, right: 4 }}
                    style={s.skip}
                  >
                    <Text style={s.skipText}>{copy.skip}</Text>
                  </Pressable>
                </View>
                <Text style={s.note} testID="calibration-note">
                  {answer ? copy['onboarding.intensitySet'](BELIEF_PROFILE[answer].intensity.toUpperCase()) : copy['onboarding.note']}
                </Text>
              </View>
            ) : null}
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
  activityHot: { color: color.p5 },
  countdown: { ...type.rdS, color: color.p3, height: 24 },
  calib: { position: 'absolute', left: 12, right: 12 },
  cardHead: { ...type.lbS, color: color.p3, height: 14 },
  rule: { height: 1, backgroundColor: color.p1, marginTop: 4, marginBottom: 8 },
  question: { ...type.rdS, color: color.p4 },
  cursorRow: { flexDirection: 'row', alignItems: 'center' },
  cursor: { width: 9, height: 14, marginLeft: 4, backgroundColor: color.p4 },
  answerRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  skip: { minWidth: 44, minHeight: 28, alignItems: 'flex-end', justifyContent: 'flex-end' },
  skipText: { ...type.lbS, color: color.p3 },
  note: { ...type.rdXS, color: color.p3, marginTop: 6, height: 36 },
});
