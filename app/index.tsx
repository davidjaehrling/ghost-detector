import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { copyOf, t, useLocale } from '../src/i18n';
import { PhosphorText, SnapshotCanvas } from '../src/fx/glass';
import { BELIEF_PROFILE, type Belief, getBelief, setBelief } from '../src/state/belief';
import { intensityWord } from '../src/state/intensity';
import { sessionActivity } from '../src/state/session';
import { daysToFullMoon, formatWindowCountdown } from '../src/ui/boot/activity';
import { useMinuteClock } from '../src/ui/boot/clock';
import { FIXED_SEED, getInstallIdentity } from '../src/ui/boot/install';
import { CARD_BOTTOM, READOUT_GAP, STICKER_BOTTOM, bootRows } from '../src/ui/boot/layout';
import { type BootParams, readBootParams } from '../src/ui/boot/params';
import {
  GRID_COLS,
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
import { PrimingTransient, usePrimingTransient } from '../src/ui/boot/Transient';
import { Readout } from '../src/ui/Readout';
import { composeFields } from '../src/ui/readoutFields';
import { Housing } from '../src/ui/screens/Housing';
import { color, type } from '../src/ui/tokens';
import { useReduceMotion } from '../src/ui/useReduceMotion';

// Copy keys follow docs/voice-guide.md section 3.
const copy = copyOf({
  firmware: 'hud.firmware',
  trig: 'hud.trig',
  timebase: 'hud.timebase',
  selftestOk: 'boot.selftestOk',
  transient: 'boot.transient',
  actIdx: 'boot.actIdx',
  moon: 'boot.moon',
  nextPeak: 'boot.nextPeak',
  // 72 px caps cannot carry the full word; the accessibility label does.
  key: 'boot.key',
  keyLabel: 'boot.keyLabel',
  head: 'onboarding.head',
  // The question is set in two text rows (the first holds a line break); the last row carries the cursor.
  question: 'onboarding.question',
  questionHead: 'onboarding.questionHead',
  questionTail: 'onboarding.questionTail',
  note: 'onboarding.note',
  yes: 'onboarding.yes',
  yesLabel: 'onboarding.yesLabel',
  unsure: 'onboarding.unsure',
  unsureLabel: 'onboarding.unsureLabel',
  no: 'onboarding.no',
  noLabel: 'onboarding.noLabel',
  skip: 'onboarding.skip',
  skipLabel: 'onboarding.skipLabel',
});
const intensitySet = (name: string) => t('onboarding.intensitySet', { name });

// Boot is a warped glass (barrel snapshot, retaken on each stage). ACT IDX and the priming transient are
// Skia canvases, so they are SnapshotCanvas (src/fx/glass) to survive the web snapshot.
const WARP_BOOT = true;

const TYPE_CPS = 40;
// Per-launch variation for the seeded self-test readings.
const BOOT_NONCE = Date.now() % 100_000;
const snap4 = (n: number) => Math.round(n / 4) * 4;
const STICKER_H_GUESS = 132; // until the sticker has been measured
const CARD_H_GUESS = 167; // calibration card, until it has been measured
// ACT IDX is drawn on a canvas with room around it for the bloom; VT323 28 px advances 0.4 em.
const ACT_PAD = 8;
const ACT_BASE = ACT_PAD + 22;
const ACT_CH = 11.2;
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

function Boot({ params: { isStatic, date, dated, calib, spike } }: { params: BootParams }) {
  const locale = useLocale();
  const router = useRouter();
  const { index, moonPct } = sessionActivity(date);
  const peakDays = daysToFullMoon(date);
  const fixed = isStatic || dated;
  // The window countdown follows the wall clock, one tick a minute; a fixed (harness) run holds still.
  const now = useMinuteClock(date, fixed);
  const identity = useMemo(() => (fixed ? getInstallIdentity(date, FIXED_SEED) : getInstallIdentity(date)), [fixed, date]);
  const lines = useMemo(() => {
    const seed = fixed ? dayKey(date) : dayKey(date) ^ BOOT_NONCE;
    void locale; // the labels follow the language
    return selfTestReadings(seed);
  }, [fixed, date, locale]);
  const lineLen = lines.map((l) => composeFields({ ...l, labelCh: 6, valueCh: 5, unitCh: 4 }).join('').length);
  const total = lineLen.reduce((n, l) => n + l, 0) + copy.selftestOk.length;
  const typed = useTyped(total, TYPE_CPS, isStatic || calib);
  const typing = typed < total;

  const [stage, setStage] = useState<Stage>(calib ? 'calib' : 'sticker');
  const calibrating = stage !== 'sticker';
  const [answer, setAnswer] = useState<Belief | null>(null);
  const [stickerH, setStickerH] = useState(STICKER_H_GUESS);
  const [cardH, setCardH] = useState(CARD_H_GUESS);
  const cursorOn = useBlink(isStatic);
  const countdown = formatWindowCountdown(now);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // The priming transient: one spike on the trace 1.5 s after the warm-up has finished.
  const reduceMotion = useReduceMotion();
  // The ACT IDX and MOON rows draw once VT323 has loaded; the warped snapshot waits until both have.
  const [actRowsDrawn, setActRowsDrawn] = useState(0);
  const onActRowReady = useCallback(() => setActRowsDrawn((n) => n + 1), []);
  const actFontReady = actRowsDrawn >= 2;
  const [warmDone, setWarmDone] = useState(isStatic);
  const transient = usePrimingTransient({ armed: warmDone, still: isStatic, peak: spike });

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
            { testID: 'key-calib-yes', label: copy.yesLabel, legend: copy.yes, onPress: () => onAnswer('yes') },
            { testID: 'key-calib-unsure', label: copy.unsureLabel, legend: copy.unsure, onPress: () => onAnswer('unsure') },
            { testID: 'key-calib-no', label: copy.noLabel, legend: copy.no, onPress: () => onAnswer('no') },
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
      // The paper label is on the glass until ACK, then it is stuck on the housing.
      sticker={calibrating}
      // Warp is a snapshot: it is retaken once the typing is done and on each stage or answer change.
      glass={{
        warp: WARP_BOOT,
        warmUp: true,
        onWarmUpDone: () => setWarmDone(true),
        refreshKey: `${stage}-${typing ? 'typing' : 'typed'}-${answer ?? ''}-${transient.logged ? 'logged' : 'open'}-${actFontReady ? 'font' : 'nofont'}`,
      }}
    >
      {({ w, h }) => {
        const div = gridDiv(w);
        const gridLeft = Math.round((w - div * GRID_COLS) / 2);
        const rows = bootRows({ h, div, calibrating, pinnedH: calibrating ? cardH : stickerH });
        const gridBottom = GRID_TOP + div * rows;
        const activity = `${copy.actIdx} ${index}/5 · ${copy.moon} ${moonPct}%`;
        const idxLen = `${copy.actIdx} ${index}/5`.length;
        return (
          <>
            <Graticule w={w} h={h} rows={rows} />
            <IdleTrace w={w} seed={dayKey(date) + 1} rows={rows} />
            <PrimingTransient w={w} rows={rows} amp={transient.amp} still={isStatic} reduceMotion={reduceMotion} />
            <GridLabels w={w} fw={copy.firmware} trig={copy.trig} tb={copy.timebase} rows={rows} />

            <View style={[s.readout, { left: snap4(gridLeft), top: snap4(gridBottom + READOUT_GAP) }]} testID="readout">
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
              {calibrating ? null : (
                <Text style={[s.transient, { opacity: transient.logged ? 1 : 0 }]} testID="transient">
                  {copy.transient}
                </Text>
              )}
              <View style={s.activity}>
                {/* The glyphs are drawn on the glass canvas (ACT IDX in p5 with bloom); this node keeps the
                    reading for screen readers and tests. */}
                <Text style={s.activityText} testID="activity">
                  {activity}
                </Text>
                <SnapshotCanvas style={s.activityCanvas} pointerEvents="none">
                  <PhosphorText text={`${copy.actIdx} ${index}/5`} x={ACT_PAD} y={ACT_BASE} size={28} step={5} static={isStatic} reduceMotion={reduceMotion} onReady={onActRowReady} />
                  <PhosphorText
                    text={`· ${copy.moon} ${moonPct}%`}
                    x={ACT_PAD + (idxLen + 1) * ACT_CH}
                    y={ACT_BASE}
                    size={28}
                    step={3}
                    bloom={false}
                    static={isStatic}
                    reduceMotion={reduceMotion}
                    onReady={onActRowReady}
                  />
                </SnapshotCanvas>
              </View>
              <Text style={s.countdown} testID="countdown">
                {countdown}
              </Text>
              {calibrating ? null : <Text style={s.peak}>{`${copy.nextPeak}  +${peakDays} D`}</Text>}
            </View>

            {/* The sticker keeps its full size and shows whole while it is on the glass. After ACK it
                is stuck on the housing instead (Housing, bottom-left). */}
            {calibrating ? null : (
              <View style={s.stickerSlot} testID="sticker" pointerEvents="none">
                <Sticker {...identity} onLayout={(e: LayoutChangeEvent) => setStickerH(Math.round(e.nativeEvent.layout.height))} />
              </View>
            )}

            {calibrating ? (
              <View
                style={[s.calib, { bottom: CARD_BOTTOM }]}
                testID="calibration"
                onLayout={(e: LayoutChangeEvent) => setCardH(Math.round(e.nativeEvent.layout.height))}
              >
                <Text style={s.cardHead}>{copy.head}</Text>
                <View style={s.rule} />
                <View accessible accessibilityLabel={copy.question} testID="calibration-question">
                  <Text style={s.question}>{copy.questionHead}</Text>
                  <View style={s.cursorRow}>
                    <Text style={s.question}>{copy.questionTail}</Text>
                    <View style={[s.cursor, { opacity: cursorOn ? 1 : 0 }]} testID="calibration-cursor" />
                  </View>
                </View>
                <View style={s.answerRow}>
                  <Pressable
                    testID="key-calib-skip"
                    accessibilityRole="button"
                    accessibilityLabel={copy.skipLabel}
                    onPress={() => onAnswer('unsure')}
                    hitSlop={{ top: 8, bottom: 8, left: 12, right: 4 }}
                    style={s.skip}
                  >
                    <Text style={s.skipText}>{copy.skip}</Text>
                  </Pressable>
                </View>
                <Text style={s.note} testID="calibration-note">
                  {answer ? intensitySet(intensityWord(BELIEF_PROFILE[answer].intensity)) : copy.note}
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
  stM: { ...type.rdM, color: color.p4, height: 28 },
  activity: { height: 28, marginTop: 4 },
  activityText: { ...type.rdM, color: color.p3, height: 28, opacity: 0 },
  activityCanvas: { position: 'absolute', left: -ACT_PAD, top: -ACT_PAD, width: 24 * ACT_CH + 2 * ACT_PAD, height: 28 + 2 * ACT_PAD },
  transient: { ...type.rdS, color: color.p3, height: 24 },
  peak: { ...type.rdS, color: color.p3, height: 24 },
  stickerSlot: { position: 'absolute', left: 10, right: 10, bottom: STICKER_BOTTOM },
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

export { RouteFault as ErrorBoundary } from '../src/ui/screens/FaultScreen';
