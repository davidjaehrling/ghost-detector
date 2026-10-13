import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, Text, View } from 'react-native';
import type { Tier } from '../../src/engine';
import { GhostV0, placeGhost, regionFromImage, type Placement, type RegionResult } from '../../src/fx/ghostV0';
import { getScan, type ScanRecord } from '../../src/state/scans';
import { Key } from '../../src/ui/boot/parts';
import { DEFAULT_FIXTURE } from '../../src/ui/fixtureNames';
import { fixtureUri } from '../../src/ui/fixtures';
import { type Harness, readHarness } from '../../src/ui/harness';
import { demoRecord, isDemoName } from '../../src/ui/result/demo';
import { formatReadings, readingsFor } from '../../src/ui/result/readings';
import { SpiDial } from '../../src/ui/result/SpiDial';
import { type GlassSize, Housing } from '../../src/ui/screens/Housing';
import { color, needle, type } from '../../src/ui/tokens';

const copy = {
  glass: 'Scan result.',
  caseLabel: 'CASE',
  missingTitle: 'NO RECORD',
  missingLine: 'Case not on file.',
  tierWord: { quiet: 'QUIET', trace: 'TRACE', active: 'ACTIVE', strong: 'STRONG', critical: 'CRITICAL' } satisfies Record<Tier, string>,
  line: {
    quiet: 'Baseline. No signature.',
    trace: 'Trace only. Below threshold for class.',
    active: 'Activity logged.',
    strong: 'Strong. Signature resolving.',
    critical: 'EVP fragment logged.',
  } satisfies Record<Tier, string>,
  flux: 'FLUX',
  thermal: 'THERMAL',
  acoustic: 'ACOUSTIC',
  profile: 'ENTITY PROFILE',
  none: 'NO SIGNATURE',
  decoded: 'SIGNATURE PARTIALLY DECODED:',
  classLabel: 'CLASS',
  eraLabel: 'ERA',
  mask: '▒▒▒',
  hidden: ['DESIGNATION', 'BEHAVIOUR', 'EVP'],
  notFitted: 'NOT FITTED IN THIS UNIT',
  share: 'SHARE',
  shareLabel: 'Share result',
  deep: 'DEEP SCAN',
  deepLabel: 'Deep scan',
  log: 'LOG',
  logLabel: 'Open history',
  back: 'BACK',
  backLabel: 'Back to viewfinder',
  photoLabel: 'Captured photo',
};

const NOT_FITTED_MS = 1500;
const PHOTO_ASPECT = 4 / 3; // fixtures and camera captures are 3:4 portrait
const DEFAULT_MEAN_LUMA = 40; // native, until Skia reads pixels (P3)
// TRACE smudge: matte copies at the bottom of the opacity band, 70% scale.
const SMUDGE_OPACITY: [number, number] = [0.08, 0.1];
const SMUDGE_SCALE = 0.7;

const LEDS: Record<Tier, number> = { quiet: 1, trace: 2, active: 3, strong: 4, critical: 5 };
const TIER_COLOR: Record<Tier, string> = {
  quiet: color.p4,
  trace: color.p4,
  active: color.p4,
  strong: color.p5,
  critical: color.red,
};

const subscribeNever = () => () => {};
const serverSnapshot = () => false;
const clientSnapshot = () => true;

// Harness params and the store exist only on the client; the static export
// renders an empty housing colour and the body mounts after hydration.
export default function ResultRoute() {
  const mounted = useSyncExternalStore(subscribeNever, clientSnapshot, serverSnapshot);
  const params = useLocalSearchParams<{ id?: string; static?: string; fixture?: string; demo?: string }>();
  if (!mounted) return <View testID="screen-result" style={s.empty} />;
  return <Result params={params} />;
}

function Result({ params }: { params: { id?: string; static?: string; fixture?: string; demo?: string } }) {
  const router = useRouter();
  const [harness] = useState<Harness>(() => readHarness(params));
  const record = useMemo<ScanRecord | undefined>(() => {
    if (harness.isStatic && isDemoName(params.demo)) return demoRecord(params.demo, fixtureUri(harness.fixture ?? DEFAULT_FIXTURE));
    return getScan(String(params.id ?? ''));
  }, [harness, params.demo, params.id]);

  const toViewfinder = () => router.navigate('/viewfinder');
  const [notice, setNotice] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (noticeTimer.current && clearTimeout(noticeTimer.current)), []);
  // Share and Deep Scan are not wired in P2 (plan section 8: Deep Scan is opt-in and
  // rewarded, keys are inert). A press shows one line; under static it stays up.
  const inert = () => {
    setNotice(true);
    if (harness.isStatic) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(false), NOT_FITTED_MS);
  };

  if (!record) {
    return (
      <Housing
        testID="screen-result"
        leds={1}
        fixedIdentity={harness.isStatic}
        glassLabel={copy.glass}
        dummies={2}
        keys={<Key testID="key-back" label={copy.backLabel} legend={copy.back} width={72} onPress={toViewfinder} />}
      >
        {() => (
          <View style={s.missing} testID="result-missing">
            <Text style={[type.rdM, { color: color.p4 }]}>{copy.missingTitle}</Text>
            <Text style={[type.rdS, { color: color.p3 }]}>{`${copy.caseLabel} ${String(params.id ?? '').toUpperCase()}`}</Text>
            <Text style={[type.rdS, { color: color.p3 }]}>{copy.missingLine}</Text>
          </View>
        )}
      </Housing>
    );
  }

  return (
    <Housing
      testID="screen-result"
      leds={LEDS[record.outcome.tier]}
      fixedIdentity={harness.isStatic}
      glassLabel={copy.glass}
      dummies={0}
      keys={
        <>
          <Key testID="key-share" label={copy.shareLabel} legend={copy.share} width={66} onPress={inert} />
          <Key testID="key-deepscan" label={copy.deepLabel} legend={copy.deep} width={98} onPress={inert} />
          <Key testID="key-forward" label={copy.logLabel} legend={copy.log} width={52} onPress={() => router.push('/history')} />
          <Key testID="key-back" label={copy.backLabel} legend={copy.back} width={62} onPress={toViewfinder} />
        </>
      }
    >
      {(size) => <ResultGlass size={size} record={record} isStatic={harness.isStatic} notice={notice} />}
    </Housing>
  );
}

function ResultGlass({ size, record, isStatic, notice }: { size: GlassSize; record: ScanRecord; isStatic: boolean; notice: boolean }) {
  const { outcome, profile } = record;
  const tier = outcome.tier;
  const tint = TIER_COLOR[tier];
  const photoH = Math.round(size.h * 0.34);
  const reading = formatReadings(readingsFor(record.seed, tier));

  // Needle reveal spring (Bible section 3). The number is derived from the same value.
  const [value] = useState(() => new Animated.Value(isStatic ? outcome.spi : 0));
  const [shown, setShown] = useState(isStatic ? outcome.spi : 0);
  const [settled, setSettled] = useState(isStatic);
  useEffect(() => {
    if (isStatic) return;
    const id = value.addListener(({ value: v }) => setShown(Math.round(Math.min(100, Math.max(0, v)))));
    let anim: Animated.CompositeAnimation | null = null;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        if (reduce) {
          value.setValue(outcome.spi);
          setSettled(true);
          return;
        }
        anim = Animated.spring(value, {
          toValue: outcome.spi,
          mass: needle.reveal.mass,
          stiffness: needle.reveal.stiffness,
          damping: needle.reveal.damping,
          useNativeDriver: false,
        });
        anim.start(() => {
          if (!alive) return;
          setShown(outcome.spi);
          setSettled(true);
        });
      });
    return () => {
      alive = false;
      anim?.stop();
      value.removeListener(id);
    };
  }, [isStatic, outcome.spi, value]);

  const quiet = tier === 'quiet';
  return (
    <View style={s.glass}>
      <PhotoPanel size={size} height={photoH} record={record} />
      <View style={s.body}>
        <View style={s.revealRow}>
          <View style={s.revealLeft}>
            <Text style={[type.rdM, s.tier, { color: tint, opacity: settled ? 1 : 0 }]} testID="result-tier">
              {copy.tierWord[tier]}
            </Text>
            <Text style={[type.rdXL, { color: tint }]} testID="result-spi">
              {shown}
            </Text>
          </View>
          <SpiDial value={value} redZone={tier === 'critical'} />
        </View>
        <Text style={s.caseLine}>{`${copy.caseLabel} ${record.id}`}</Text>
        <View style={s.readings}>
          <ReadingRow label={copy.flux} value={reading.flux} />
          <ReadingRow label={copy.thermal} value={reading.thermal} />
          <ReadingRow label={copy.acoustic} value={reading.level} />
        </View>
        <Text style={s.resultLine} numberOfLines={2} testID="result-line">
          {notice ? copy.notFitted : copy.line[tier]}
        </Text>
        <View style={s.profile} testID="result-profile">
          <Text style={s.profileHead}>{copy.profile}</Text>
          {quiet ? (
            <Text style={s.profileValue}>{copy.none}</Text>
          ) : (
            <>
              <ProfileRow label={copy.classLabel} value={profile.class} />
              <ProfileRow label={copy.eraLabel} value={profile.era.replace(/^Era /, '')} />
              {copy.hidden.map((l) => (
                <ProfileRow key={l} label={l} value={copy.mask} masked />
              ))}
              <Text style={s.decoded} testID="result-decoded">{`${copy.decoded} ${profile.signatureDecodedPct}%`}</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function ReadingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.readRow}>
      <Text style={s.readLabel}>{label}</Text>
      <Text style={s.readValue}>{value}</Text>
    </View>
  );
}

function ProfileRow({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) {
  return (
    <View style={s.profRow}>
      <Text style={s.profLabel}>{label}</Text>
      <Text style={[s.profileValue, masked && s.masked]}>{value}</Text>
    </View>
  );
}

type Composite = { placement: Placement; meanLuma: number } | null;

// The captured photo with the v0 apparition over it. The image is laid out at its
// natural 3:4 shape and cropped by the panel; the crop is centred on the figure so a
// short panel never cuts it off. The panel mounts once the region read is done (and the
// image has loaded), so a screenshot never catches a half-built picture.
function PhotoPanel({ size, height, record }: { size: GlassSize; height: number; record: ScanRecord }) {
  const { outcome, photoUri, seed } = record;
  const wantsFigure = outcome.figureShown || outcome.smudge;
  const [read, setRead] = useState<{ done: boolean; result: RegionResult | null }>({ done: !wantsFigure, result: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!wantsFigure) return;
    let alive = true;
    regionFromImage(photoUri)
      .catch(() => null)
      .then((result) => alive && setRead({ done: true, result }));
    return () => {
      alive = false;
    };
  }, [photoUri, wantsFigure]);

  const W = size.w;
  const imgH = Math.round(W * PHOTO_ASPECT);
  const composite = useMemo<Composite>(() => {
    if (!wantsFigure || !read.done) return null;
    const region = read.result?.region ?? null;
    const meanLuma = read.result?.meanLuma ?? DEFAULT_MEAN_LUMA;
    let placement = placeGhost(region, { w: W, h: imgH }, seed, outcome.smudge ? { opacityRange: SMUDGE_OPACITY } : {});
    if (outcome.smudge) {
      const w = placement.w * SMUDGE_SCALE;
      const h = placement.h * SMUDGE_SCALE;
      placement = {
        ...placement,
        x: placement.x + (placement.w - w) / 2,
        y: placement.y + (placement.h - h) / 2,
        w,
        h,
        offsetCopies: placement.offsetCopies.map((c) => ({ ...c, dx: c.dx * SMUDGE_SCALE, dy: c.dy * SMUDGE_SCALE })),
      };
    }
    return { placement, meanLuma };
  }, [wantsFigure, read, W, imgH, seed, outcome.smudge]);

  const ready = read.done && loaded;
  const centreY = composite ? composite.placement.y + composite.placement.h / 2 : imgH / 2;
  const top = Math.min(0, Math.max(height - imgH, Math.round(height / 2 - centreY)));

  return (
    <View style={[s.photo, { height }]} testID={read.done ? 'result-photo' : undefined}>
      <View style={{ position: 'absolute', left: 0, top, width: W, height: imgH, opacity: ready ? 1 : 0 }}>
        <Image
          source={{ uri: photoUri }}
          resizeMode="cover"
          style={{ width: W, height: imgH }}
          accessibilityLabel={copy.photoLabel}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
        {composite ? <GhostV0 placement={composite.placement} regionMeanLuma={composite.meanLuma} /> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, backgroundColor: color.n3 },
  glass: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photo: { width: '100%', overflow: 'hidden', backgroundColor: color.n0, borderBottomWidth: 1, borderBottomColor: color.p1 },
  body: { flex: 1, paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  revealRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  revealLeft: { flexShrink: 1 },
  tier: { letterSpacing: 1 },
  caseLine: { ...type.lbXS, color: color.n5 },
  readings: { gap: 0 },
  readRow: { flexDirection: 'row' },
  readLabel: { ...type.rdS, width: 96, color: color.p3 },
  readValue: { ...type.rdS, width: 110, textAlign: 'right', color: color.p4 },
  resultLine: { ...type.rdS, color: color.p4, minHeight: 22 },
  profile: { gap: 2, borderTopWidth: 1, borderTopColor: color.p1, paddingTop: 6 },
  profileHead: { ...type.lbXS, color: color.n5, marginBottom: 2 },
  profRow: { flexDirection: 'row', alignItems: 'baseline' },
  profLabel: { ...type.lbS, width: 96, color: color.p3 },
  profileValue: { ...type.rdXS, color: color.p4 },
  masked: { color: color.p2 },
  decoded: { ...type.rdXS, color: color.p4, marginTop: 4 },
});
