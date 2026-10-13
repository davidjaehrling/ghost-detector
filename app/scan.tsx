import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { drawOutcome, generateProfile, seedFrom } from '../src/engine';
import { getHistory, getIntensity, getRecentLines, getRecentNames, saveScan } from '../src/state/scans';
import { DEFAULT_FIXTURE } from '../src/ui/fixtureNames';
import { fixtureUri } from '../src/ui/fixtures';
import { type Harness, readHarness } from '../src/ui/harness';
import { Housing } from '../src/ui/screens/Housing';
import { TheatreGlass } from '../src/ui/scan/Theatre';
import { RATE_CAP, elapsedForPhase, faultFor, frameAt, scanLeds } from '../src/ui/scan/timeline';
import { color } from '../src/ui/tokens';

const copy = {
  cancel: 'CANCEL',
  cancelLabel: 'Cancel scan',
  glass: 'Scan in progress.',
};

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
  const router = useRouter();
  const [harness] = useState<Harness>(() => readHarness(params));
  const { isStatic, speed, phase } = harness;

  // Drawn once, up front. Nothing of it is shown before the reveal.
  const [draw] = useState(() => {
    const given = Number(params.seed);
    const seed = Number.isInteger(given) && given >= 0 ? given >>> 0 : isStatic ? STATIC_SEED : seedFrom('direct', Date.now());
    const outcome = drawOutcome(seed, getIntensity(), getHistory());
    const profile = generateProfile((seed ^ 0x9e3779b9) >>> 0, outcome.tier, { names: getRecentNames(), lines: getRecentLines() });
    const photoUri = params.photo || fixtureUri(harness.fixture ?? DEFAULT_FIXTURE);
    return { seed, outcome, profile, photoUri, fault: phase === 'fault' || faultFor(seed) };
  });
  const duration = draw.outcome.scanDurationMs;
  const [intensity] = useState(getIntensity);

  const frozen = phase !== null;
  const [elapsed, setElapsed] = useState(() => (frozen ? elapsedForPhase(phase, duration) : 0));
  const finished = useRef(false);

  useEffect(() => {
    if (frozen) return;
    const start = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - start) * speed), CLOCK_MS);
    return () => clearInterval(id);
  }, [frozen, speed]);

  const frame = frameAt(elapsed, duration, draw.fault);
  const isDone = frame.kind === 'done';

  useEffect(() => {
    if (!isDone || frozen || finished.current) return;
    finished.current = true;
    const id = saveScan({ createdAt: Date.now(), photoUri: draw.photoUri, tag: params.tag, seed: draw.seed, outcome: draw.outcome, profile: draw.profile });
    router.replace({ pathname: '/result/[id]', params: { id } });
  }, [isDone, frozen, draw, router, params.tag]);

  const cancel = () => {
    finished.current = true;
    router.dismissTo('/viewfinder');
  };

  return (
    <Housing
      testID="screen-scan"
      leds={scanLeds(frame, draw.outcome.tier)}
      fixedIdentity={isStatic}
      glassLabel={copy.glass}
      keys={[null, null, null, { testID: 'key-cancel', label: copy.cancelLabel, legend: copy.cancel, onPress: cancel }]}
    >
      {(size) => <TheatreGlass size={size} seed={draw.seed} frame={frame} cap={RATE_CAP[intensity]} still={frozen || isStatic} />}
    </Housing>
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, backgroundColor: color.n3 },
});
