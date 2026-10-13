import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, Text as SkText, useImage } from '@shopify/react-native-skia';
import { Component, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, Text, View } from 'react-native';
import type { Tier } from '../../src/engine';
import { Composite, regionFromImage, type RegionStats } from '../../src/fx/compositor';
import { PhosphorText, useVT323 } from '../../src/fx/glass';
import { GhostV0, placeGhost, type Placement } from '../../src/fx/ghostV0';
import { buildThermalField, lumaFromImage, ThermalView, type LumaGrid, type ThermalField } from '../../src/fx/thermal';
import { useSkiaReady } from '../../src/fx/useSkiaReady';
import { BELIEF_PROFILE, getBelief } from '../../src/state/belief';
import { getScan, listScans, type ScanRecord } from '../../src/state/scans';
import { consumeReveal } from '../../src/state/session';
import { useSettings } from '../../src/state/useSettings';
import { mulberry32 } from '../../src/ui/boot/seed';
import type { KeySlot } from '../../src/ui/boot/parts';
import { DEFAULT_FIXTURE } from '../../src/ui/fixtureNames';
import { fixtureUri } from '../../src/ui/fixtures';
import { type Harness, readHarness } from '../../src/ui/harness';
import { DEMO_CASES, SCARE_CASE, demoRecord, isDemoName } from '../../src/ui/result/demo';
import { bestSoFar, NO_PRIOR } from '../../src/ui/result/best';
import { caseSeed, cropOnFigure, panelRegion, panelTop, tierOpacity } from '../../src/ui/result/panel';
import { readingsFor } from '../../src/ui/result/readings';
import { PINNED_TIERS, stampText, thermalDelta } from '../../src/ui/result/stamp';
import { Readout } from '../../src/ui/Readout';
import { scareEligible } from '../../src/ui/result/scare';
import { type ScareMode, useScare } from '../../src/ui/result/useScare';
import { useReduceMotion } from '../../src/ui/useReduceMotion';
import { SpiDial } from '../../src/ui/result/SpiDial';
import { type GlassSize, Housing } from '../../src/ui/screens/Housing';
import { color, motion, needle, type } from '../../src/ui/tokens';

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
    critical: (hz: number) => `EVP fragment logged. CH2 ${hz} Hz.`,
  },
  coldSpot: (dt: string, khz: string) => `COLD SPOT ΔT ${dt} °C · DRIFT ${khz} kHz`,
  flux: 'FLUX',
  thermal: 'THERM',
  acoustic: 'ACOUST',
  profile: 'ENTITY PROFILE',
  offer: 'Run DEEP SCAN to resolve designation, behaviour and EVP. Short video plays.',
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
  thermKeyLabel: 'Thermal view',
  photoKey: 'PHOTO',
  photoKeyLabel: 'Photo view',
  back: 'NEW SCAN',
  backLabel: 'Back to viewfinder',
  photoLabel: 'Captured photo',
};

// The barrel warp snapshots the glass content. On web the snapshot comes out blank where a Skia
// canvas sits (CanvasKit's WebGL canvases return an empty toDataURL), and the result's photo, thermal
// view and digit are all Skia canvases; native `makeImageFromView` over a Skia canvas is untested.
// Until src/fx/glass can snapshot Skia canvases the result stays on the flat glass.
// `?static=1&warp=1` turns it on for the harness.
const WARP_RESULT = false;

const NOT_FITTED_MS = 1500;
const FADE_MS = 1500;
const PHOTO_MIN = 0.3; // least share of the glass the photo keeps on a short screen
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
  const params = useLocalSearchParams<{ id?: string; static?: string; fixture?: string; demo?: string; case?: string; scare?: string; therm?: string; warp?: string; seed?: string }>();
  if (!mounted) return <View testID="screen-result" style={s.empty} />;
  return <Result params={params} />;
}

function Result({ params }: { params: { id?: string; static?: string; fixture?: string; demo?: string; case?: string; scare?: string; therm?: string; warp?: string; seed?: string } }) {
  const router = useRouter();
  const [harness] = useState<Harness>(() => readHarness(params));
  const record = useMemo<ScanRecord | undefined>(() => {
    if (harness.isStatic && isDemoName(params.demo)) return demoRecord(params.demo, fixtureUri(harness.fixture ?? DEFAULT_FIXTURE), /^\d{4}$/.test(params.case ?? '') ? params.case : params.scare === '1' ? SCARE_CASE : DEMO_CASES[params.demo], harness.fixture, /^\d{1,6}$/.test(params.seed ?? '') ? Number(params.seed) : undefined);
    return getScan(String(params.id ?? ''));
  }, [harness, params.demo, params.id, params.case, params.seed, params.scare]);

  // Jump-scare (psych brief section 3): the flag is the engine's roll (the first-3-scans, 24 h and
  // per-session caps are in drawOutcome); the switch and reduced motion are the user's. It plays
  // only on a result reached straight from a scan. ?static=1&scare=1 shows the peak frame.
  const settings = useSettings();
  const reduceMotion = useReduceMotion();
  const [fresh] = useState(() => (record ? consumeReveal(record.id) : false));
  const scareMode: ScareMode =
    harness.isStatic && params.scare === '1'
      ? 'peak'
      : record && fresh && scareEligible({ jumpScare: record.outcome.jumpScare, enabled: settings.jumpScares, reduceMotion })
        ? 'armed'
        : 'off';

  // Thermal view of the photo panel (THERM key). ?static=1&therm=1 opens it for the golden.
  const [therm, setTherm] = useState(harness.isStatic && params.therm === '1');
  const warp = WARP_RESULT || (harness.isStatic && params.warp === '1');
  // Reported by the panel and the reveal; they only feed the glass snapshot key.
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [stable, setStable] = useState(harness.isStatic);

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

  // Fixed four-slot row: BACK, SHARE, THERM (PHOTO while it shows), then the primary slot. DEEP SCAN
  // takes the far right on ACTIVE and up and is a dummy cap below that.
  const deepScan = record.outcome.tier !== 'quiet' && record.outcome.tier !== 'trace';
  const keySlots: (KeySlot | null)[] = [
    { testID: 'key-back', label: copy.backLabel, legend: copy.back, onPress: toViewfinder },
    { testID: 'key-share', label: copy.shareLabel, legend: copy.share, onPress: inert },
    therm
      ? { testID: 'key-therm', label: copy.photoKeyLabel, legend: copy.photoKey, onPress: () => setTherm(false), backlit: true }
      : { testID: 'key-therm', label: copy.thermKeyLabel, legend: copy.thermal, onPress: () => setTherm(true) },
    deepScan ? { testID: 'key-deepscan', label: copy.deepLabel, legend: copy.deep, onPress: inert, primary: true } : null,
  ];

  return (
    <Housing
      testID="screen-result"
      leds={LEDS[record.outcome.tier]}
      fixedIdentity={harness.isStatic}
      glassLabel={copy.glass}
      keys={keySlots}
      glass={{ warp, refreshKey: `${record.id}-${record.outcome.tier}-${photoLoaded}-${therm}-${stable}` }}
    >
      {(size) => (
        <ResultGlass
          size={size}
          record={record}
          isStatic={harness.isStatic}
          speed={harness.speed}
          notice={notice}
          scare={scareMode}
          therm={therm}
          onPhotoLoaded={setPhotoLoaded}
          onStable={setStable}
        />
      )}
    </Housing>
  );
}

// Body heights on the 4 px grid. The photo panel takes what is left of the glass.
const BODY = { pad: 4, reveal: 92, line: 20, readings: 60, profile: 100, profileNone: 36, best: 84, decoded: 28, offer: 36, bottom: 12, gap: 4 };

function bodyHeight(tier: Tier): number {
  const lines = PINNED_TIERS.includes(tier) ? 2 : 1;
  let h = BODY.pad + BODY.reveal + BODY.gap + BODY.line * lines + BODY.gap + BODY.readings + BODY.gap + (tier === 'quiet' ? BODY.profileNone : BODY.profile);
  if (tier === 'quiet') h += BODY.gap + BODY.best;
  else h += BODY.gap + BODY.decoded;
  if (tier === 'active' || tier === 'strong' || tier === 'critical') h += BODY.offer + BODY.gap;
  return h + BODY.bottom;
}

// The photo window is the same height on every tier (the tiers must compare in review): it takes what
// the tallest body leaves, and a lighter body keeps its spare height as air under its last block.
const TIERS: readonly Tier[] = ['quiet', 'trace', 'active', 'strong', 'critical'];
export const BODY_MAX = Math.max(...TIERS.map(bodyHeight));
export const photoHeight = (glassH: number) => Math.round(Math.max(glassH * PHOTO_MIN, glassH - BODY_MAX));

type GlassProps = {
  size: GlassSize;
  record: ScanRecord;
  isStatic: boolean;
  speed: number;
  notice: boolean;
  scare: ScareMode;
  therm: boolean;
  onPhotoLoaded: (loaded: boolean) => void;
  onStable: (stable: boolean) => void;
};

function ResultGlass({ size, record, isStatic, speed, notice, scare, therm, onPhotoLoaded, onStable }: GlassProps) {
  const { outcome, profile } = record;
  const tier = outcome.tier;
  const tint = TIER_COLOR[tier];
  const wide = tier === 'active' || tier === 'strong' || tier === 'critical';
  const quiet = tier === 'quiet';
  const photoH = photoHeight(size.h);
  const reading = readingsFor(record.seed, tier);
  // One thermal number per result: the cold spot on STRONG and CRITICAL, the THERM reading below.
  const deltaC = thermalDelta(tier, reading);
  const stamp = stampText({ id: record.id, spi: outcome.spi, deltaC, createdAt: record.createdAt });

  // Reveal (psych brief 2.6): 1.2 s of silence with the number blank, the needle at
  // rest and the photo up; then the needle springs and the number lands in one frame at
  // its first crossing of the target; the figure fades in once the needle has settled.
  const [value] = useState(() => new Animated.Value(isStatic ? outcome.spi : 0));
  const [landed, setLanded] = useState(isStatic);
  const [settled, setSettled] = useState(isStatic);
  useEffect(() => {
    if (isStatic) return;
    const id = value.addListener(({ value: v }) => {
      if (v >= outcome.spi - 0.25) setLanded(true);
    });
    let anim: Animated.CompositeAnimation | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
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
        timer = setTimeout(() => {
          if (!alive) return;
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
        }, motion.hold / speed);
      });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      anim?.stop();
      value.removeListener(id);
    };
  }, [isStatic, speed, outcome.spi, value]);

  const reduceMotion = useReduceMotion();
  const scareView = useScare(scare, landed);

  // The warped glass shows a snapshot of this view, retaken when the glass key changes. The key
  // moves to `stable` once the needle has settled, the figure has faded in and the scare is over,
  // so the last snapshot is of the finished picture.
  const [faded, setFaded] = useState(isStatic);
  useEffect(() => {
    if (isStatic || !settled) return;
    const id = setTimeout(() => setFaded(true), FADE_MS + 150);
    return () => clearTimeout(id);
  }, [isStatic, settled]);
  const stable = isStatic || (settled && faded && scareView.pop === null && scareView.flash === 0);
  useEffect(() => {
    onStable(stable);
  }, [stable, onStable]);

  const mainLine =
    tier === 'critical' ? copy.line.critical(reading.evpHz) : copy.line[tier];
  const resultLine = notice ? copy.notFitted : mainLine;
  const pct = profile.signatureDecodedPct;
  const innerW = size.w - 24;
  const best = useMemo(() => (quiet ? bestSoFar(listScans(), record.id) : null), [quiet, record.id]);

  // Hidden strings for the redaction bars: the real name, the first trait line
  // and an EVP line of seeded length. Bars match their width, never a block glyph.
  const evpLen = 16 + Math.floor(mulberry32((record.seed ^ 0xe7e7) >>> 0)() * 15);
  const hiddenLen = [profile.name.length, profile.traits?.[0]?.length ?? 28, evpLen];
  const maskMax = innerW - LABEL_W;

  return (
    <View style={s.glass}>
      <PhotoPanel
        size={size}
        height={photoH}
        record={record}
        settled={settled}
        isStatic={isStatic}
        pop={scareView.pop}
        therm={therm}
        thermalC={deltaC}
        stamp={stamp}
        onPhotoLoaded={onPhotoLoaded}
      />
      <View style={s.body}>
        <View style={s.revealRow}>
          <View style={s.revealLeft}>
            <Text style={[type.rdM, s.tier, { color: tint, opacity: landed ? 1 : 0 }]} testID="result-tier">
              {copy.tierWord[tier]}
            </Text>
            <View style={s.spiBox}>
              {/* The glyphs are drawn on the glass canvas; this node keeps the number for screen readers and tests. */}
              <Text style={[type.rdXL, s.spi, { color: tint, opacity: 0 }]} testID="result-spi">
                {landed ? String(outcome.spi) : '--'}
              </Text>
              <Canvas style={s.spiCanvas} pointerEvents="none">
                <PhosphorText
                  text={landed ? String(outcome.spi) : '--'}
                  x={SPI_PAD}
                  y={SPI_BASE}
                  size={72}
                  step={tier === 'critical' ? 5 : 4}
                  static={isStatic}
                  reduceMotion={reduceMotion}
                />
              </Canvas>
            </View>
          </View>
          <SpiDial value={value} redZone={tier === 'critical'} />
        </View>
        <View style={s.lines}>
          <Text style={s.resultLine} testID="result-line" numberOfLines={1}>
            {resultLine}
          </Text>
          {PINNED_TIERS.includes(tier) ? (
            <Text style={s.resultLine} testID="result-coldspot" numberOfLines={1}>
              {copy.coldSpot(deltaC.toFixed(1), reading.driftKhz.toFixed(1))}
            </Text>
          ) : null}
        </View>
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
        <View style={s.profile} testID="result-profile">
          <Text style={s.profileHead}>{copy.profile}</Text>
          {quiet ? (
            <Text style={s.profileValue}>{copy.none}</Text>
          ) : (
            <>
              <ProfileRow label={copy.classLabel} value={profile.class} />
              <ProfileRow label={copy.eraLabel} value={profile.era.replace(/^Era /, '').toUpperCase()} valueTestID="profile-era" />
              {copy.hidden.map((l, i) => (
                <ProfileRow key={l} label={l} maskW={Math.min(maskMax, Math.round(hiddenLen[i]! * CHAR_XS))} />
              ))}
            </>
          )}
        </View>
        {quiet ? null : (
          <View style={s.decodedBlock}>
            <Text style={s.decoded} testID="result-decoded">{`${copy.decoded} ${pct}%`}</Text>
            <DecodeBar pct={pct} />
          </View>
        )}
        {quiet ? null : <View style={s.spacer} />}
        {wide ? (
          <Text style={s.offer} testID="result-offer">
            {copy.offer}
          </Text>
        ) : null}
        {quiet ? (
          <View style={s.best} testID="result-best">
            {best ? (
              <Text style={s.bestText}>
                <Text style={{ color: color.p3 }}>{`${best.prefix} `}</Text>
                {best.value}
              </Text>
            ) : (
              <Text style={[s.bestText, { color: color.p3 }]}>{NO_PRIOR}</Text>
            )}
          </View>
        ) : null}
      </View>
      {scareView.flash > 0 ? <View pointerEvents="none" style={[s.flash, { opacity: scareView.flash }]} testID="scare-flash" /> : null}
    </View>
  );
}

const LABEL_W = 88;
const SPI_PAD = 12; // canvas margin around the digit so the bloom is not clipped
const SPI_BASE = SPI_PAD + 52; // VT323 72 px baseline inside the 64 px line

function ProfileRow({ label, value, maskW, valueTestID }: { label: string; value?: string; maskW?: number; valueTestID?: string }) {
  return (
    <View style={s.profRow}>
      <Text style={s.profLabel}>{label}</Text>
      {maskW !== undefined ? <View style={[s.mask, { width: maskW }]} testID="profile-mask" /> : <Text style={s.profileValue} testID={valueTestID}>{value}</Text>}
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

type Layout = { placement: Placement; region: ReturnType<typeof panelRegion>; meanLuma: number; top: number } | null;

// A flat mid-grey grid for a photo that cannot be read (the thermal view still has a room to draw).
const FLAT_GRID: LumaGrid = { luma: new Uint8Array(72 * 96).fill(128), width: 72, height: 96 };

// Catches a compositor that cannot start (shader compile) and hands the panel to the v0 path.
class V1Boundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// The captured photo with the apparition over it. The photo is laid out at its natural 3:4 shape
// and cropped by the panel, centred on the figure. The ghost is placed against the visible panel
// (frame = panel size), so the 15% cap applies to what is seen. The panel mounts once the region
// read is done (and the photo has decoded), so a screenshot never catches a half-built picture.
// Compositor v1 (Skia) draws photo, figure and grain on one canvas; the RN image with GhostV0
// stays as the fallback when Skia is not ready or the shader cannot compile. The THERM key swaps
// the contents for the thermal view of the same frame.
function PhotoPanel({
  size,
  height,
  record,
  settled,
  isStatic,
  pop,
  therm,
  thermalC,
  stamp,
  onPhotoLoaded,
}: {
  size: GlassSize;
  height: number;
  record: ScanRecord;
  settled: boolean;
  isStatic: boolean;
  pop: number | null;
  therm: boolean;
  thermalC: number;
  stamp: string;
  onPhotoLoaded: (loaded: boolean) => void;
}) {
  const { outcome, photoUri, seed, id } = record;
  const wantsFigure = outcome.figureShown || outcome.smudge;
  const reduceMotion = useReduceMotion();
  const skia = useSkiaReady();
  const [v1Failed, setV1Failed] = useState(false);
  const v1 = skia && !v1Failed && wantsFigure;
  const [read, setRead] = useState<{ done: boolean; result: RegionStats | null }>({ done: !wantsFigure, result: null });
  const [loaded, setLoaded] = useState(false);
  const image = useImage(v1 ? photoUri : null);
  const photoReady = v1 ? image !== null : loaded;

  useEffect(() => {
    onPhotoLoaded(photoReady);
  }, [photoReady, onPhotoLoaded]);

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
  const placementSeed = caseSeed(seed, id);
  const layout = useMemo<Layout>(() => {
    if (!wantsFigure || !read.done) return null;
    const region = read.result?.region ?? null;
    const meanLuma = read.result?.meanLuma ?? DEFAULT_MEAN_LUMA;
    const top0 = panelTop(height, imgH, region ? region.cy : null);
    const belief = getBelief();
    const band = belief ? BELIEF_PROFILE[belief].opacityRange : undefined;
    // Opacity rises with tier inside the belief band; the smudge tiers keep their own faint band.
    const ladder = outcome.smudge ? {} : tierOpacity(outcome.tier, band);
    const opacityRange = outcome.smudge ? SMUDGE_OPACITY : (ladder.opacityRange ?? band);
    const panel = panelRegion(region, imgH, height, top0);
    let placement = placeGhost(panel, { w: W, h: height }, placementSeed, {
      tier: outcome.tier,
      ...(opacityRange ? { opacityRange } : {}),
      ...(ladder.tierCap ? { tierCap: ladder.tierCap } : {}),
    });
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
    // Second pass: slide the photo so the figure, not the dark region, is what the crop centres on.
    const crop = cropOnFigure(height, imgH, top0, placement);
    placement = { ...placement, y: placement.y + crop.dy };
    return { placement, region: panel, meanLuma, top: crop.top };
  }, [wantsFigure, read, W, imgH, height, placementSeed, outcome.smudge, outcome.tier]);

  // The thermal field: built once per record from the photo's luma, pinned to the THERM reading.
  const [field, setField] = useState<ThermalField | null>(null);
  useEffect(() => {
    let alive = true;
    lumaFromImage(photoUri)
      .catch(() => null)
      .then((src) => {
        if (!alive) return;
        setField(buildThermalField(src?.grid ?? FLAT_GRID, src?.region ?? null, { seed, tier: outcome.tier, deltaC: thermalC }));
      });
    return () => {
      alive = false;
    };
  }, [photoUri, seed, outcome.tier, thermalC]);

  const ready = read.done && photoReady;
  const top = layout ? layout.top : panelTop(height, imgH, null);
  const showGhost = layout !== null && ready && settled;
  const legacyFigure = layout !== null && ready && !v1;

  return (
    <View style={[s.photo, { height }]} testID={read.done ? 'result-photo' : undefined}>
      {v1 ? (
        layout && image && ready ? (
          <V1Boundary onFail={() => setV1Failed(true)}>
            {/* Before the needle settles the photo shows alone (disabled draws photo and grain); the
                figure's fade starts when the composite is mounted again at settle. */}
            <Composite
              key={showGhost ? 'figure' : 'photo'}
              photo={image}
              width={W}
              height={height}
              photoRect={{ x: 0, y: top, width: W, height: imgH }}
              region={layout.region}
              meanLuma={layout.meanLuma}
              p80Luma={read.result?.p80Luma}
              p90Luma={read.result?.p90Luma}
              grid={read.result?.grid}
              placement={layout.placement}
              tier={outcome.tier}
              seed={placementSeed}
              static={isStatic}
              fadeInMs={FADE_MS}
              disabled={!showGhost}
            />
          </V1Boundary>
        ) : null
      ) : (
        <Image
          source={{ uri: photoUri }}
          resizeMode="cover"
          style={{ position: 'absolute', left: 0, top, width: W, height: imgH, opacity: ready ? 1 : 0 }}
          accessibilityLabel={copy.photoLabel}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      )}
      {legacyFigure && settled && layout ? (
        // Fallback: GhostV0 fades its layers linearly (its own blend mode needs the layers to
        // stay in the photo's stacking context, so no wrapper).
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <GhostV0 placement={layout.placement} regionMeanLuma={layout.meanLuma} regionP90Luma={read.result?.p90Luma} fadeInMs={isStatic ? 0 : FADE_MS} />
        </View>
      ) : null}
      {layout && ready && pop !== null && !therm ? (
        // Jump-scare: the compositor has no pop prop, so a GhostV0 layer above the canvas carries it:
        // a second figure layer at the matte's full opacity for one frame (0 until then).
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <GhostV0
            placement={{ ...layout.placement, opacity: pop }}
            regionMeanLuma={layout.meanLuma}
            regionP90Luma={read.result?.p90Luma}
            fadeInMs={0}
          />
        </View>
      ) : null}
      {therm && field ? (
        <View style={StyleSheet.absoluteFill}>
          <ThermalView field={field} width={W} height={height} top={top} static={isStatic || reduceMotion} />
        </View>
      ) : null}
      {therm || !ready ? null : <DataStrip text={stamp} width={W} height={height} />}
      {therm ? null : (
        // The thermal view has its own readout box in the same corner.
        <View style={s.caseBand} pointerEvents="none">
          <Text style={s.caseText}>{`${copy.caseLabel} ${record.id}`}</Text>
        </View>
      )}
    </View>
  );
}

// The data strip: case, SPI, ΔT and time in VT323 p3, bottom-left of the photo. Compositor v1 has no
// `stamp` prop, so it is a Skia text canvas over the panel. The photo's own 4% grain sits under it
// and the glass grain and scanlines (the overlay over the whole window) sit over it, so it reads as
// burned into the picture. A 1 px n0 copy under the text keeps it legible on a bright frame.
const STRIP_H = 24;
const STRIP_X = 8;
function DataStrip({ text, width, height }: { text: string; width: number; height: number }) {
  const font = useVT323(16);
  const base = STRIP_H - 8;
  return (
    <View style={[s.strip, { top: height - STRIP_H, width }]} pointerEvents="none" testID="result-stamp" aria-label={text} aria-busy={font === null}>
      <Canvas style={{ width, height: STRIP_H }} pointerEvents="none">
        {font ? (
          <>
            <SkText font={font} text={text} x={STRIP_X + 1} y={base + 1} color={color.n0} />
            <SkText font={font} text={text} x={STRIP_X} y={base} color={color.p3} />
          </>
        ) : null}
      </Canvas>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, backgroundColor: color.n3 },
  glass: { flex: 1 },
  flash: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: color.p5 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photo: { width: '100%', overflow: 'hidden', backgroundColor: color.n0, borderBottomWidth: 1, borderBottomColor: color.p1 },
  // Hard-edged n0 band over the top of the photo carries the case number.
  caseBand: { position: 'absolute', left: 0, right: 0, top: 0, height: 20, backgroundColor: 'rgba(10, 15, 11, 0.64)', justifyContent: 'center', paddingHorizontal: 12 },
  caseText: { ...type.rdXS, color: color.p3 },
  strip: { position: 'absolute', left: 0, height: STRIP_H },
  body: { flex: 1, paddingHorizontal: 12, paddingTop: BODY.pad, paddingBottom: BODY.bottom },
  revealRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: BODY.reveal },
  revealLeft: { flexShrink: 1 },
  tier: { letterSpacing: 1 },
  spi: { height: 64, minWidth: 88 },
  spiBox: { height: 64, minWidth: 88 },
  spiCanvas: { position: 'absolute', left: -SPI_PAD, top: -SPI_PAD, width: 124, height: 64 + 2 * SPI_PAD },
  lines: { marginTop: BODY.gap },
  resultLine: { ...type.rdXS, height: BODY.line, color: color.p4 },
  readings: { marginTop: BODY.gap, width: 17 * CHAR_XS + 2 },
  profile: { borderTopWidth: 1, borderTopColor: color.p1, paddingTop: 4, marginTop: BODY.gap },
  profileHead: { ...type.lbXS, color: color.p3, height: 12 },
  profRow: { flexDirection: 'row', alignItems: 'center', height: 16 },
  profLabel: { ...type.lbXS, width: LABEL_W, color: color.p3 },
  profileValue: { ...type.rdXS, color: color.p4 },
  mask: { height: 8, backgroundColor: color.p2 },
  decodedBlock: { marginTop: BODY.gap, gap: 2 },
  spacer: { flex: 1, minHeight: BODY.gap },
  offer: { ...type.rdXS, color: color.p4, marginBottom: BODY.gap },
  decoded: { ...type.rdXS, color: color.p4 },
  decodeBar: { flexDirection: 'row', gap: 2, height: 8 },
  block: { flex: 1, height: 8 },
  // Glass text under a p1 rule, left aligned: no box, no card.
  best: { flex: 1, borderTopWidth: 1, borderTopColor: color.p1, marginTop: BODY.gap, paddingTop: 6 },
  bestText: { ...type.rdXS, color: color.p4 },
});
