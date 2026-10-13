import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, Text, View } from 'react-native';
import type { Tier } from '../../src/engine';
import { GhostV0, placeGhost, regionFromImage, type Placement, type RegionResult } from '../../src/fx/ghostV0';
import { BELIEF_PROFILE, getBelief } from '../../src/state/belief';
import { getScan, type ScanRecord } from '../../src/state/scans';
import { mulberry32 } from '../../src/ui/boot/seed';
import type { KeySlot } from '../../src/ui/boot/parts';
import { DEFAULT_FIXTURE } from '../../src/ui/fixtureNames';
import { fixtureUri } from '../../src/ui/fixtures';
import { type Harness, readHarness } from '../../src/ui/harness';
import { demoRecord, isDemoName } from '../../src/ui/result/demo';
import { panelRegion, panelTop } from '../../src/ui/result/panel';
import { readingsFor } from '../../src/ui/result/readings';
import { Readout } from '../../src/ui/Readout';
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
  coldSpot: (dt: string) => ` Cold spot ${dt} ΔT °C.`,
  flux: 'FLUX',
  thermal: 'THERM',
  acoustic: 'ACOUST',
  profile: 'ENTITY PROFILE',
  offer: 'Run DEEP SCAN to resolve designation, behaviour and EVP.',
  none: 'NO SIGNATURE',
  decoded: 'SIGNATURE PARTIALLY DECODED:',
  classLabel: 'CLASS',
  eraLabel: 'ERA',
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
const FADE_MS = 1500;
const PANEL_FRACTION = 0.46; // ACTIVE and up
const PANEL_FRACTION_LOW = 0.34;
const CHAR_XS = 6.9; // VT323 16 px: 0.4 em advance plus 0.5 tracking
const FLUX_HOT = 1000; // mG, p5 above
const THERMAL_COLD = -5; // °C, p5 below
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
        keys={[{ testID: 'key-back', label: copy.backLabel, legend: copy.back, onPress: toViewfinder }, null, null, null]}
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

  // Fixed four-slot row: BACK, SHARE, LOG, then the primary slot. DEEP SCAN
  // takes the far right on ACTIVE and up and is a dummy cap below that.
  const deepScan = record.outcome.tier !== 'quiet' && record.outcome.tier !== 'trace';
  const keySlots: (KeySlot | null)[] = [
    { testID: 'key-back', label: copy.backLabel, legend: copy.back, onPress: toViewfinder },
    { testID: 'key-share', label: copy.shareLabel, legend: copy.share, onPress: inert },
    { testID: 'key-forward', label: copy.logLabel, legend: copy.log, onPress: () => router.push('/history') },
    deepScan ? { testID: 'key-deepscan', label: copy.deepLabel, legend: copy.deep, onPress: inert } : null,
  ];

  return (
    <Housing
      testID="screen-result"
      leds={LEDS[record.outcome.tier]}
      fixedIdentity={harness.isStatic}
      glassLabel={copy.glass}
      keys={keySlots}
    >
      {(size) => <ResultGlass size={size} record={record} isStatic={harness.isStatic} notice={notice} />}
    </Housing>
  );
}

function ResultGlass({ size, record, isStatic, notice }: { size: GlassSize; record: ScanRecord; isStatic: boolean; notice: boolean }) {
  const { outcome, profile } = record;
  const tier = outcome.tier;
  const tint = TIER_COLOR[tier];
  const wide = tier === 'active' || tier === 'strong' || tier === 'critical';
  const photoH = Math.round(size.h * (wide ? PANEL_FRACTION : PANEL_FRACTION_LOW));
  const reading = readingsFor(record.seed, tier);

  // Needle reveal spring (Bible section 3). Only the needle springs: the number
  // is blank (--) while it travels and lands in one frame at its first crossing
  // of the target. The figure fades in once the needle has settled.
  const [value] = useState(() => new Animated.Value(isStatic ? outcome.spi : 0));
  const [landed, setLanded] = useState(isStatic);
  const [settled, setSettled] = useState(isStatic);
  useEffect(() => {
    if (isStatic) return;
    const id = value.addListener(({ value: v }) => {
      if (v >= outcome.spi - 0.25) setLanded(true);
    });
    let anim: Animated.CompositeAnimation | null = null;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        if (reduce) {
          value.setValue(outcome.spi);
          setLanded(true);
          setSettled(true);
          return;
        }
        if (outcome.spi <= 0) setLanded(true);
        anim = Animated.spring(value, {
          toValue: outcome.spi,
          mass: needle.reveal.mass,
          stiffness: needle.reveal.stiffness,
          damping: needle.reveal.damping,
          useNativeDriver: false,
        });
        anim.start(() => {
          if (!alive) return;
          setLanded(true);
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
  const cold = tier === 'strong' || tier === 'critical' ? copy.coldSpot(reading.thermalC.toFixed(1)) : '';
  const resultLine = notice ? copy.notFitted : `${copy.line[tier]}${cold}`;
  const pct = profile.signatureDecodedPct;
  const innerW = size.w - 24;

  // Hidden strings for the redaction bars: the real name, the first trait line
  // and an EVP line of seeded length. Bars match their width, never a block glyph.
  const evpLen = 16 + Math.floor(mulberry32((record.seed ^ 0xe7e7) >>> 0)() * 15);
  const hiddenLen = [profile.name.length, profile.traits?.[0]?.length ?? 28, evpLen];
  const maskMax = innerW - LABEL_W;

  return (
    <View style={s.glass}>
      <PhotoPanel size={size} height={photoH} record={record} settled={settled} isStatic={isStatic} />
      <View style={s.body}>
        <View style={s.revealRow}>
          <View style={s.revealLeft}>
            <Text style={[type.rdM, s.tier, { color: tint, opacity: landed ? 1 : 0 }]} testID="result-tier">
              {copy.tierWord[tier]}
            </Text>
            <Text style={[type.rdXL, s.spi, { color: tint }]} testID="result-spi">
              {landed ? String(outcome.spi) : '--'}
            </Text>
          </View>
          <SpiDial value={value} redZone={tier === 'critical'} />
        </View>
        <View style={s.readRow2}>
          <View style={s.readings}>
            <Readout
              size="rdXS"
              label={copy.flux}
              value={String(reading.fluxMg)}
              unit="mG"
              labelCh={6}
              valueColor={reading.fluxMg > FLUX_HOT ? color.p5 : color.p4}
            />
            <Readout
              size="rdXS"
              label={copy.thermal}
              value={reading.thermalC.toFixed(1)}
              unit="°C"
              labelCh={6}
              valueColor={reading.thermalC < THERMAL_COLD ? color.p5 : color.p4}
            />
            <Readout size="rdXS" label={copy.acoustic} value={String(reading.levelDb)} unit="dBFS" labelCh={6} />
          </View>
          <Text style={s.resultLine} testID="result-line">
            {resultLine}
          </Text>
        </View>
        <View style={s.profile} testID="result-profile">
          <Text style={s.profileHead}>{copy.profile}</Text>
          {quiet ? (
            <Text style={s.profileValue}>{copy.none}</Text>
          ) : (
            <>
              <ProfileRow label={copy.classLabel} value={profile.class} />
              <ProfileRow label={copy.eraLabel} value={profile.era.replace(/^Era /, '')} />
              {copy.hidden.map((l, i) => (
                <ProfileRow key={l} label={l} maskW={Math.min(maskMax, Math.round(hiddenLen[i]! * CHAR_XS))} />
              ))}
            </>
          )}
        </View>
        <View style={s.spacer} />
        {quiet ? null : (
          <View style={s.bottom}>
            {wide ? (
              <Text style={s.offer} testID="result-offer">
                {copy.offer}
              </Text>
            ) : null}
            <Text style={s.decoded} testID="result-decoded">{`${copy.decoded} ${pct}%`}</Text>
            <DecodeBar pct={pct} />
          </View>
        )}
      </View>
    </View>
  );
}

const LABEL_W = 88;

function ProfileRow({ label, value, maskW }: { label: string; value?: string; maskW?: number }) {
  return (
    <View style={s.profRow}>
      <Text style={s.profLabel}>{label}</Text>
      {maskW !== undefined ? <View style={[s.mask, { width: maskW }]} testID="profile-mask" /> : <Text style={s.profileValue}>{value}</Text>}
    </View>
  );
}

// 20 blocks, lit in whole blocks for the decoded share.
function DecodeBar({ pct }: { pct: number }) {
  const lit = Math.round((pct / 100) * 20);
  return (
    <View style={s.decodeBar} testID="decode-bar" accessibilityLabel={`Decoded ${pct} percent`}>
      {Array.from({ length: 20 }, (_, i) => (
        <View key={i} style={[s.block, { backgroundColor: i < lit ? color.p4 : color.p1 }]} />
      ))}
    </View>
  );
}

type Composite = { placement: Placement; meanLuma: number; p90: number | undefined; top: number } | null;

// The captured photo with the v0 apparition over it. The image is laid out at its
// natural 3:4 shape and cropped by the panel, centred on the dark region. The ghost
// is placed against the visible panel (frame = panel size), so the 15% cap applies to
// what is seen. The panel mounts once the region read is done (and the image has
// loaded), so a screenshot never catches a half-built picture.
function PhotoPanel({ size, height, record, settled, isStatic }: { size: GlassSize; height: number; record: ScanRecord; settled: boolean; isStatic: boolean }) {
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
    const top = panelTop(height, imgH, region ? region.cy : null);
    const belief = getBelief();
    const opacityRange = outcome.smudge ? SMUDGE_OPACITY : belief ? BELIEF_PROFILE[belief].opacityRange : undefined;
    let placement = placeGhost(panelRegion(region, imgH, height, top), { w: W, h: height }, seed, opacityRange ? { opacityRange } : {});
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
    return { placement, meanLuma, p90: read.result?.p90Luma, top };
  }, [wantsFigure, read, W, imgH, height, seed, outcome.smudge]);

  const ready = read.done && loaded;
  const top = composite ? composite.top : panelTop(height, imgH, null);

  return (
    <View style={[s.photo, { height }]} testID={read.done ? 'result-photo' : undefined}>
      <Image
        source={{ uri: photoUri }}
        resizeMode="cover"
        style={{ position: 'absolute', left: 0, top, width: W, height: imgH, opacity: ready ? 1 : 0 }}
        accessibilityLabel={copy.photoLabel}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
      {composite && ready && settled ? (
        // Mounted at needle settle; GhostV0 fades its layers linearly (its own blend
        // mode needs the layers to stay in the photo's stacking context, so no wrapper).
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <GhostV0
            placement={composite.placement}
            regionMeanLuma={composite.meanLuma}
            regionP90Luma={composite.p90}
            fadeInMs={isStatic ? 0 : FADE_MS}
          />
        </View>
      ) : null}
      <View style={s.caseBand} pointerEvents="none">
        <Text style={s.caseText}>{`${copy.caseLabel} ${record.id}`}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, backgroundColor: color.n3 },
  glass: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photo: { width: '100%', overflow: 'hidden', backgroundColor: color.n0, borderBottomWidth: 1, borderBottomColor: color.p1 },
  // Hard-edged n0 band over the top of the photo carries the case number.
  caseBand: { position: 'absolute', left: 0, right: 0, top: 0, height: 20, backgroundColor: 'rgba(10, 15, 11, 0.64)', justifyContent: 'center', paddingHorizontal: 12 },
  caseText: { ...type.rdXS, color: color.p3 },
  body: { flex: 1, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  revealRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  revealLeft: { flexShrink: 1 },
  tier: { letterSpacing: 1 },
  spi: { height: 64, minWidth: 88 },
  readRow2: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  readings: { width: 17 * CHAR_XS + 2 },
  resultLine: { ...type.rdXS, flex: 1, color: color.p4 },
  profile: { borderTopWidth: 1, borderTopColor: color.p1, paddingTop: 4, marginTop: 4 },
  profileHead: { ...type.lbXS, color: color.p3, height: 12 },
  profRow: { flexDirection: 'row', alignItems: 'center', height: 16 },
  profLabel: { ...type.lbXS, width: LABEL_W, color: color.p3 },
  profileValue: { ...type.rdXS, color: color.p4 },
  mask: { height: 8, backgroundColor: color.p2 },
  spacer: { flex: 1 },
  bottom: { gap: 2 },
  offer: { ...type.rdXS, color: color.p4 },
  decoded: { ...type.rdXS, color: color.p4 },
  decodeBar: { flexDirection: 'row', gap: 2, height: 8 },
  block: { flex: 1, height: 8 },
});
