import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { drawOutcome, seedFrom } from '../src/engine';
import { markReveal } from '../src/state/session';
import { getHistory, getIntensity, getRecentLines, getRecentNames, saveScan } from '../src/state/scans';
import { DEFAULT_FIXTURE } from '../src/ui/fixtureNames';
import { fixtureUri } from '../src/ui/fixtures';
import { sound } from '../src/ui/audio';
import { type Harness, readHarness } from '../src/ui/harness';
import { type GlassSize, Housing } from '../src/ui/screens/Housing';
import { TheatreGlass } from '../src/ui/scan/Theatre';
import { createScanClock, useClockSelect } from '../src/ui/scan/clock';
import { RATE_CAP, elapsedForPhase, faultFor, scanLeds } from '../src/ui/scan/timeline';
import { color } from '../src/ui/tokens';
import { useReduceMotion } from '../src/ui/useReduceMotion';
import { copyOf, profileFor, useLocale } from '../src/i18n';

const copy = copyOf({
  cancel: 'scan.cancel',
  cancelLabel: 'scan.cancelLabel',
  glass: 'scan.glass',
});

type ScanParams = { photo?: string; seed?: string; tag?: string; static?: string; fixture?: string; speed?: string; phase?: string };

const STATIC_SEED = 417;
const CLOCK_MS = 50;

const subscribeNever = () => () => {};
const serverSnapshot = () => false;
const clientSnapshot = () => true;

// The harness params and the router params exist only on the client; the
// static export renders the empty housing and the body mounts after hydration.
export default function ScanRoute() {
  const mounted = useSyncExternalStore(subscribeNever, clientSnapshot, serverSnapshot);
  const params = useLocalSearchParams<ScanParams>();
  if (!mounted) return <View testID="screen-scan" style={s.empty} />;
  return <Scan params={params} />;
}

function Scan({ params }: { params: ScanParams }) {
  const locale = useLocale();
  const router = useRouter();
  const [harness] = useState<Harness>(() => readHarness(params));
  const { isStatic, speed, phase } = harness;

  // Drawn once, up front. Nothing of it is shown before the reveal.
  const [draw] = useState(() => {
    const given = Number(params.seed);
    const seed = Number.isInteger(given) && given >= 0 ? given >>> 0 : isStatic ? STATIC_SEED : seedFrom('direct', Date.now());
    const outcome = drawOutcome(seed, getIntensity(), getHistory());
    const profile = profileFor((seed ^ 0x9e3779b9) >>> 0, outcome.tier, { names: getRecentNames(), lines: getRecentLines() });
    const photoUri = params.photo || fixtureUri(harness.fixture ?? DEFAULT_FIXTURE);
    return { seed, outcome, profile, photoUri, fault: phase === 'fault' || faultFor(seed) };
  });
  const duration = draw.outcome.scanDurationMs;
  const [intensity] = useState(getIntensity);

  const frozen = phase !== null;
  // The clock lives outside React state: this route reads only the coarse values below, so the
  // housing and the keys do not re-render on every 50 ms tick (docs/perf.md).
  const [clock] = useState(() => createScanClock(frozen ? elapsedForPhase(phase, duration) : 0, duration, draw.fault));
  const finished = useRef(false);

  useEffect(() => {
    if (frozen) return;
    const start = Date.now();
    const id = setInterval(() => clock.set((Date.now() - start) * speed), CLOCK_MS);
    return () => clearInterval(id);
  }, [frozen, speed, clock]);

  const isDone = useClockSelect(clock, (f) => f.kind === 'done');
  const leds = useClockSelect(clock, (f) => scanLeds(f, draw.outcome.tier));

  // Sound follows the timeline (docs/sound-palette.md section 5): the scene joins the scan, then
  // one cue per phase entered, the fault dropout, the hold and, on the way out, the reveal.
  const reduceMotion = useReduceMotion();
  const toResult = useRef(false);
  const fired = useRef({ phase: -1, fault: false, hold: false });
  useEffect(() => sound.setReducedMotion(reduceMotion), [reduceMotion]);
  useEffect(() => {
    sound.join('scan', draw.outcome.tier);
    sound.scanStart();
    return () => {
      // Going on to the result keeps the scene (the reveal plays there); anything else ends it.
      if (!toResult.current) sound.stop('scan');
    };
  }, [draw.outcome.tier]);
  const inHold = useClockSelect(clock, (f) => f.kind === 'hold' || f.kind === 'done');
  const phaseNow = useClockSelect(clock, (f) => (f.kind === 'hold' || f.kind === 'done' ? 4 : f.phase));
  useEffect(() => {
    // Every phase up to the current one, in order, so a coarse clock never skips a cue.
    for (let p = fired.current.phase + 1; p <= phaseNow; p++) sound.scanPhase(p as 0 | 1 | 2 | 3 | 4);
    fired.current.phase = Math.max(fired.current.phase, phaseNow);
  }, [phaseNow]);
  const inFault = useClockSelect(clock, (f) => f.kind === 'fault');
  useEffect(() => {
    if (!inFault || fired.current.fault) return;
    fired.current.fault = true;
    sound.fault();
  }, [inFault]);
  useEffect(() => {
    if (!inHold || fired.current.hold) return;
    fired.current.hold = true;
    sound.hold();
  }, [inHold]);

  useEffect(() => {
    if (!isDone || frozen || finished.current) return;
    finished.current = true;
    toResult.current = true;
    sound.reveal(draw.outcome.tier);
    const id = saveScan({ createdAt: Date.now(), photoUri: draw.photoUri, tag: params.tag, seed: draw.seed, outcome: draw.outcome, profile: draw.profile });
    markReveal(id);
    router.replace({ pathname: '/result/[id]', params: { id } });
  }, [isDone, frozen, draw, router, params.tag]);

  // The router object is not guaranteed stable across renders; read it through a ref so the keys are.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const cancel = useCallback(() => {
    finished.current = true;
    sound.stop('scan');
    routerRef.current.dismissTo('/viewfinder');
  }, []);

  // Stable props for the housing (memoised): the keys change with the language only.
  const keys = useMemo(
    () => [null, null, null, { testID: 'key-cancel', label: copy.cancelLabel, legend: copy.cancel, onPress: cancel }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cancel, locale],
  );
  const glassLabel = useMemo(() => copy.glass, [locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const cap = RATE_CAP[intensity];
  // Reduced motion freezes the trace and the sweep (still) and slows the readouts to 5 s steps (calm).
  const still = frozen || isStatic || reduceMotion;
  const renderGlass = useCallback(
    (size: GlassSize) => <TheatreGlass size={size} seed={draw.seed} clock={clock} cap={cap} still={still} calm={reduceMotion && !frozen && !isStatic} />,
    [draw.seed, clock, cap, still, reduceMotion, frozen, isStatic],
  );

  return (
    <Housing testID="screen-scan" leds={leds} fixedIdentity={isStatic} glassLabel={glassLabel} keys={keys}>
      {renderGlass}
    </Housing>
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, backgroundColor: color.n3 },
});

export { RouteFault as ErrorBoundary } from '../src/ui/screens/FaultScreen';
