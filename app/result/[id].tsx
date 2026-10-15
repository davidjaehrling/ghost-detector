import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Group as SkGroup, Rect as SkRect, Text as SkText, useImage, type SkFont } from '@shopify/react-native-skia';
import { Component, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, Text, View } from 'react-native';
import { track } from '../../src/analytics';
import { onBackToViewfinder, onFreshResult } from '../../src/ui/interstitial';
import type { CardFormat } from '../../src/fx/share/constants';
import type { Tier } from '../../src/engine';
import { Composite, autoGain, regionFromImage, type RegionStats } from '../../src/fx/compositor';
import { PhosphorText, SnapshotCanvas, useVT323 } from '../../src/fx/glass';
import { GhostV0, placeGhost, type Placement } from '../../src/fx/ghostV0';
import { buildThermalField, lumaFromImage, ThermalView, type LumaGrid, type ThermalField } from '../../src/fx/thermal';
import { useSkiaReady } from '../../src/fx/useSkiaReady';
import { BELIEF_PROFILE, getBelief } from '../../src/state/belief';
import { getIntensity, getScan, listScans, type ScanRecord } from '../../src/state/scans';
import { consumeReveal } from '../../src/state/session';
import { useSettings } from '../../src/state/useSettings';
import { mulberry32 } from '../../src/ui/boot/seed';
import { type KeySlot, useBlink } from '../../src/ui/boot/parts';
import { DEFAULT_FIXTURE } from '../../src/ui/fixtureNames';
import { fixtureUri } from '../../src/ui/fixtures';
import { type Harness, readHarness } from '../../src/ui/harness';
import { DEMO_CASES, SCARE_CASE, demoRecord, isDemoName } from '../../src/ui/result/demo';
import { bestSoFar, noPrior } from '../../src/ui/result/best';
import { caseSeed, cropOnFigure, panelRegion, panelTop, tierOpacity } from '../../src/ui/result/panel';
import { readingsFor } from '../../src/ui/result/readings';
import { formatWindowShort } from '../../src/ui/boot/activity';
import { PINNED_TIERS, gainLabel, screenStampLines, thermalDelta } from '../../src/ui/result/stamp';
import { stripScrimAlpha } from '../../src/ui/result/stripScrim';
import { deepPress, deepTier } from '../../src/ui/result/deepKey';
import { Readout } from '../../src/ui/Readout';
import { tierWord } from '../../src/state/tierWord';
import { copyOf, eraValue, fmtFixed, t, useLocale } from '../../src/i18n';
import { scareEligible } from '../../src/ui/result/scare';
import { HIRES_SCALE, deepCopy, evpLine, scalePlacement } from '../../src/ui/result/deepCopy';
import { type DeepState, useDeepScan } from '../../src/ui/result/deepScan';
import { FAULT_LIFE_MS, type OfferKind, type ShareMode, shareCopy, useShareOffer } from '../../src/ui/result/share';
import { runShare } from '../../src/ui/result/shareRun';
import { type ScareMode, useScare } from '../../src/ui/result/useScare';
import { useReduceMotion } from '../../src/ui/useReduceMotion';
import { SpiDial } from '../../src/ui/result/SpiDial';
import { type GlassSize, Housing } from '../../src/ui/screens/Housing';
import { color, motion, needle, type } from '../../src/ui/tokens';

const copy = copyOf({
  glass: 'result.glass',
  caseLabel: 'result.caseLabel',
  missingTitle: 'result.missingTitle',
  missingLine: 'result.missingLine',
  flux: 'result.flux',
  thermal: 'result.thermal',
  dtAvg: 'result.dtAvg',
  acoustic: 'result.acoustic',
  profile: 'result.profile',
  none: 'result.none',
  decoded: 'result.decoded',
  classLabel: 'result.classLabel',
  eraLabel: 'result.eraLabel',
  thermKeyLabel: 'result.thermKeyLabel',
  photoKey: 'result.photoKey',
  photoKeyLabel: 'result.photoKeyLabel',
  back: 'result.back',
  backLabel: 'result.backLabel',
  photoLabel: 'result.photoLabel',
  log: 'viewfinder.hud.log',
  logLabel: 'viewfinder.hud.logLabel',
});

const LINE_KEY: Record<Tier, string> = {
  quiet: 'result.line.quiet',
  trace: 'result.line.trace',
  active: 'result.line.active',
  strong: 'result.line.strong',
  critical: 'result.line.critical',
};
const resultLineFor = (tier: Tier, hz: number) => t(LINE_KEY[tier], { hz });
const coldSpot = (dt: string, khz: string) => t('result.coldSpotMin', { dt, khz });
const hiddenLabels = () => [t('result.hidden.designation'), t('result.hidden.behaviour'), deepCopy.evpHead];

// The barrel warp snapshots the glass content. The photo (Composite), the thermal view, the SPI digit and
// the data strip are SnapshotCanvas, which the web snapshot reads through makeImageSnapshot (a plain WebGL
// canvas reads back blank). `?static=1&warp=0` turns it off for the harness.
const WARP_RESULT = true;

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
  const params = useLocalSearchParams<{ id?: string; static?: string; fixture?: string; demo?: string; case?: string; scare?: string; therm?: string; warp?: string; seed?: string; deepscan?: string; share?: string; deeparm?: string }>();
  if (!mounted) return <View testID="screen-result" style={s.empty} />;
  return <Result params={params} />;
}

function Result({ params }: { params: { id?: string; static?: string; fixture?: string; demo?: string; case?: string; scare?: string; therm?: string; warp?: string; seed?: string; deepscan?: string; share?: string; deeparm?: string } }) {
  useLocale();
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
  // The result is shown for the first time right after a scan; reopening a case from the log is not a scan.
  useEffect(() => {
    if (record && fresh) {
      track('scan_complete', { tier: record.outcome.tier, intensity: getIntensity() });
      onFreshResult();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scareMode: ScareMode =
    harness.isStatic && params.scare === '1'
      ? 'peak'
      : record && fresh && scareEligible({ jumpScare: record.outcome.jumpScare, enabled: settings.jumpScares, reduceMotion })
        ? 'armed'
        : 'off';

  // Thermal view of the photo panel (THERM key). ?static=1&therm=1 opens it for the golden.
  const [therm, setTherm] = useState(harness.isStatic && params.therm === '1');
  const warp = WARP_RESULT && !(harness.isStatic && params.warp === '0');
  // Reported by the panel and the reveal; they only feed the glass snapshot key.
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [stable, setStable] = useState(harness.isStatic);

  const toViewfinder = () => {
    onBackToViewfinder();
    router.navigate('/viewfinder');
  };
  // DEEP SCAN. The harness demo record is not in the store, so it keeps its unlock in memory;
  // ?deepscan=unlocked starts it unlocked.
  const isDemo = harness.isStatic && isDemoName(params.demo);
  const tierWide = record ? record.outcome.tier !== 'quiet' && record.outcome.tier !== 'trace' : false;
  const deep = useDeepScan({
    id: record?.id ?? '',
    enabled: tierWide,
    unlockedAt: isDemo && params.deepscan === 'unlocked' ? 1 : record?.deepScanAt,
    persist: !isDemo,
  });
  // Share flow (docs/p6-brief.md 1.5 and 1.6). Harness: `?static=1&share=offer|updated|format|timer`.
  // Under static the proactive timers are frozen unless share=timer, so the goldens do not move.
  const shareParam = harness.isStatic ? params.share : undefined;
  const [digitLanded, setDigitLanded] = useState(harness.isStatic);
  const [shareMode, setShareMode] = useState<ShareMode>(shareParam === 'format' ? 'format' : 'idle');
  const offer = useShareOffer({
    tier: record?.outcome.tier ?? 'quiet',
    stable: stable && digitLanded,
    deep: deep.state,
    adClosedAt: deep.closedAt,
    frozen: harness.isStatic && shareParam !== 'timer',
    initial: shareParam === 'offer' ? 'ready' : shareParam === 'updated' ? 'updated' : null,
  });
  const alive = useRef(true);
  const faultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (faultTimer.current) clearTimeout(faultTimer.current);
    };
  }, []);
  const shareOpen = shareMode === 'format' || shareMode === 'printing';
  // DEEP SCAN is hardware key 4 with a two-step arm (D-045 ruling 1). The first press lights the key and
  // prints the sponsored-video line above it; the second runs the ad. Any other key cancels the arm.
  const [shownAt] = useState(() => Date.now());
  const shareMoment = offer.line !== null || shareMode !== 'idle';
  const [armedRaw, setArmed] = useState(harness.isStatic && params.deeparm === '1');
  // The arm drops when the key's state changes (an ad starts, the key goes dark) or a share moment opens.
  const armSignal = `${deep.state}|${shareMoment}`;
  const [lastSignal, setLastSignal] = useState(armSignal);
  if (lastSignal !== armSignal) {
    setLastSignal(armSignal);
    // A key that was still warming had nothing armed (the harness may start it armed).
    if (!lastSignal.startsWith('warming')) setArmed(false);
  }
  const armed = armedRaw && deep.state === 'ready' && !shareMoment;
  const pressDeep = () => {
    const what = deepPress({ state: deep.state, armed, sinceShownMs: Date.now() - shownAt });
    if (what === 'arm') setArmed(true);
    else if (what === 'run') {
      setArmed(false);
      void deep.press();
    }
  };
  const openFormat = () => {
    setArmed(false);
    if (!digitLanded || shareOpen) return;
    if (faultTimer.current) clearTimeout(faultTimer.current);
    offer.dismiss();
    setShareMode('format');
  };
  const pickFormat = (format: CardFormat) => {
    if (!record || shareMode !== 'format') return;
    setShareMode('printing');
    const belief = getBelief();
    // Harness: ?static=1&share=fail makes the printer fault.
    const run = shareParam === 'fail' ? Promise.reject(new Error('harness printer fault')) : runShare(record, format, belief ? BELIEF_PROFILE[belief].opacityRange : undefined);
    run.then(
      () => alive.current && setShareMode('idle'),
      () => {
        if (!alive.current) return;
        setShareMode('fault');
        if (!harness.isStatic) faultTimer.current = setTimeout(() => setShareMode('idle'), FAULT_LIFE_MS);
      },
    );
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

  // Fixed four-slot row. Resting: BACK, SHARE, THERM (PHOTO while it shows), then slot 4: DEEP SCAN on
  // ACTIVE and above, LOG on QUIET, dark on TRACE. Choosing a format: CANCEL, 9:16 STORY, 1:1 SQUARE and a
  // dark cap (THERM is off, D-045 5). Printing: every key inert, the render cannot be skipped. Slot 4 is
  // dark in every share moment, so the DEEP SCAN line goes with it (D-034 c).
  const tier = record.outcome.tier;
  const cancelArm = () => setArmed(false);
  const deepSentence = `${deepCopy.label}. ${deepCopy.arm}`;
  const deepLegend = deep.state === 'warming' ? deepCopy.keyWarming : deep.state === 'offline' ? deepCopy.keyOffline : deepCopy.legend;
  let slot4: KeySlot | null = null;
  if (!shareMoment && deepTier(tier) && deep.state !== 'unlocked') {
    slot4 = {
      testID: 'deepscan-key',
      label: deep.state === 'ready' ? deepSentence : `${deepCopy.label}. ${deepLegend}`,
      legend: deepLegend,
      onPress: pressDeep,
      inert: deep.state !== 'ready',
      backlit: armed,
    };
  } else if (!shareMoment && tier === 'quiet') {
    // Plain navigation to the log. It never goes through onBackToViewfinder, so it is never an ad break.
    slot4 = { testID: 'key-log', label: copy.logLabel, legend: copy.log, onPress: () => router.push('/history') };
  }
  const keySlots: (KeySlot | null)[] =
    shareMode === 'format'
      ? [
          { testID: 'key-back', label: shareCopy.cancelLabel, legend: shareCopy.cancel, onPress: () => setShareMode('idle') },
          { testID: 'share-916', label: shareCopy.storyLabel, legend: shareCopy.storyKey, onPress: () => pickFormat('story'), backlit: true },
          { testID: 'share-11', label: shareCopy.squareLabel, legend: shareCopy.squareKey, onPress: () => pickFormat('square'), backlit: true },
          null,
        ]
      : [
          { testID: 'key-back', label: copy.backLabel, legend: copy.back, onPress: () => { cancelArm(); toViewfinder(); }, inert: shareMode === 'printing' },
          { testID: 'key-share', label: shareCopy.keyLabel, legend: shareCopy.key, onPress: openFormat, inert: !digitLanded || shareOpen, backlit: offer.line !== null && !shareOpen },
          therm
            ? { testID: 'key-therm', label: copy.photoKeyLabel, legend: copy.photoKey, onPress: () => { cancelArm(); setTherm(false); }, backlit: true, inert: shareOpen }
            : { testID: 'key-therm', label: copy.thermKeyLabel, legend: copy.thermal, onPress: () => { cancelArm(); setTherm(true); }, inert: shareOpen },
          slot4,
        ];

  return (
    <Housing
      testID="screen-result"
      leds={LEDS[record.outcome.tier]}
      fixedIdentity={harness.isStatic}
      glassLabel={copy.glass}
      keys={keySlots}
      glass={{ warp, refreshKey: `${record.id}-${record.outcome.tier}-${photoLoaded}-${therm}-${stable}-${deep.state}-${shareMode}-${offer.line}-${armed}` }}
    >
      {(size) => (
        <ResultGlass
          size={size}
          record={record}
          isStatic={harness.isStatic}
          speed={harness.speed}
          share={{ mode: shareMode, line: offer.line }}
          onLanded={setDigitLanded}
          scare={scareMode}
          therm={therm}
          deep={deep}
          armed={armed}
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
  share: { mode: ShareMode; line: OfferKind | null };
  onLanded: (landed: boolean) => void;
  scare: ScareMode;
  therm: boolean;
  deep: { state: DeepState; press: () => void; closedAt: number | null };
  /** The first press of key 4 has armed the DEEP SCAN (the sponsored-video line is up). */
  armed: boolean;
  onPhotoLoaded: (loaded: boolean) => void;
  onStable: (stable: boolean) => void;
};

function ResultGlass({ size, record, isStatic, speed, share, onLanded, scare, therm, deep, armed, onPhotoLoaded, onStable }: GlassProps) {
  const locale = useLocale();
  const { outcome, profile } = record;
  const tier = outcome.tier;
  const tint = TIER_COLOR[tier];
  const wide = tier === 'active' || tier === 'strong' || tier === 'critical';
  const quiet = tier === 'quiet';
  const photoH = photoHeight(size.h);
  const reading = readingsFor(record.seed, tier);
  // One thermal number per result: the cold spot on STRONG and CRITICAL, the THERM reading below.
  const deltaC = thermalDelta(tier, reading);
  const stamp = screenStampLines({ id: record.id, spi: outcome.spi, deltaC, createdAt: record.createdAt }, tier);

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

  useEffect(() => {
    onLanded(landed);
  }, [landed, onLanded]);

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
  // The SPI digit draws once its font has loaded; the warped snapshot waits for it.
  const digitFont = useVT323(72);
  const digitReady = digitFont !== null;
  useEffect(() => {
    onStable(stable && digitReady);
  }, [stable, digitReady, onStable]);

  const mainLine =
    tier === 'critical' ? resultLineFor(tier, reading.evpHz) : resultLineFor(tier, 0);
  const resultLine = share.mode === 'fault' ? shareCopy.fault : share.line === 'ready' ? shareCopy.ready() : share.line === 'updated' ? shareCopy.updated : mainLine;
  const lineCount = PINNED_TIERS.includes(tier) ? 2 : 1;
  const sharePanel = share.mode === 'format' || share.mode === 'printing';
  // No ad-starting key shares the glass with the share moment: the offer line, format, printing, fault.
  const shareMoment = share.line !== null || share.mode !== 'idle';
  const unlocked = deep.state === 'unlocked';
  const pct = unlocked ? 100 : profile.signatureDecodedPct;
  const innerW = size.w - 24;
  const best = useMemo(() => (quiet ? bestSoFar(listScans(), record.id) : null), [quiet, record.id]);
  // QUIET fills the lower glass with the unit's own state: tonight's window, and the auto-gain the probe
  // front end applied (only over a photo dark enough to need it).
  const [gainDb, setGainDb] = useState(0);
  const [openedAt] = useState(() => Date.now());
  const windowLine = formatWindowShort(new Date(isStatic ? record.createdAt : openedAt));

  // Hidden strings for the redaction bars: the real name, the first trait line
  // and an EVP line of seeded length. Bars match their width, never a block glyph.
  const evpLen = 16 + Math.floor(mulberry32((record.seed ^ 0xe7e7) >>> 0)() * 15);
  const hiddenLen = [profile.name.length, profile.traits?.[0]?.length ?? 28, evpLen];
  const maskMax = innerW - LABEL_W;
  // What DEEP SCAN resolves: the designation, the first behaviour line and the EVP fragment.
  const unlockedValues = [profile.name, profile.traits?.[0] ?? '', evpLine(record.seed)];

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
        hires={unlocked}
        onPhotoLoaded={onPhotoLoaded}
        onGain={setGainDb}
      />
      <View style={s.body}>
        <View style={s.revealRow}>
          <View style={s.revealLeft}>
            <Text style={[type.rdM, s.tier, { color: tint, opacity: landed ? 1 : 0 }]} testID="result-tier">
              {tierWord(tier)}
            </Text>
            <View style={s.spiBox}>
              {/* The glyphs are drawn on the glass canvas; this node keeps the number for screen readers and tests. */}
              <Text style={[type.rdXL, s.spi, { color: tint, opacity: 0 }]} testID="result-spi">
                {landed ? String(outcome.spi) : '--'}
              </Text>
              <SnapshotCanvas style={s.spiCanvas} pointerEvents="none">
                <PhosphorText
                  text={landed ? String(outcome.spi) : '--'}
                  x={SPI_PAD}
                  y={SPI_BASE}
                  size={72}
                  step={tier === 'critical' ? 5 : 4}
                  static={isStatic}
                  reduceMotion={reduceMotion}
                />
              </SnapshotCanvas>
            </View>
          </View>
          <SpiDial value={value} redZone={tier === 'critical'} />
        </View>
        <View style={s.lines}>
          {sharePanel ? (
            <SharePanel mode={share.mode} height={BODY.line * lineCount} still={isStatic} />
          ) : (
            <>
              <Text style={s.resultLine} testID="result-line" numberOfLines={1}>
                {resultLine}
              </Text>
              {PINNED_TIERS.includes(tier) ? (
                <Text style={s.resultLine} testID="result-coldspot" numberOfLines={1}>
                  {coldSpot(fmtFixed(deltaC, 1, locale), fmtFixed(reading.driftKhz, 1, locale))}
                </Text>
              ) : null}
            </>
          )}
        </View>
        <View style={s.readings}>
          <Readout
            size="rdXS"
            label={copy.flux}
            value={String(reading.fluxMg)}
            unit="mG"
            labelCh={8}
            valueColor={reading.fluxMg > FLUX_HOT ? color.p5 : color.p4}
          />
          <Readout
            size="rdXS"
            label={copy.dtAvg}
            value={fmtFixed(reading.thermalC, 1, locale)}
            unit="°C"
            labelCh={8}
            valueColor={reading.thermalC < THERMAL_COLD ? color.p5 : color.p4}
          />
          <Readout size="rdXS" label={copy.acoustic} value={String(reading.levelDb)} unit="dBFS" labelCh={8} />
        </View>
        <View style={s.profile} testID="result-profile">
          <Text style={s.profileHead}>{copy.profile}</Text>
          {quiet ? (
            <Text style={s.profileValue}>{copy.none}</Text>
          ) : (
            <>
              <ProfileRow label={copy.classLabel} value={profile.class} />
              <ProfileRow label={copy.eraLabel} value={eraValue(profile.era)} valueTestID="profile-era" />
              {hiddenLabels().map((l, i) =>
                unlocked ? (
                  <ProfileRow key={l} label={l} value={unlockedValues[i]} valueTestID={`profile-${PROFILE_IDS[i]}`} peak={PROFILE_IDS[i] === 'evp'} />
                ) : (
                  <ProfileRow key={l} label={l} maskW={Math.min(maskMax, Math.round(hiddenLen[i]! * CHAR_XS))} />
                ),
              )}
            </>
          )}
        </View>
        {quiet ? null : (
          <View style={s.decodedBlock}>
            <Text style={s.decoded} testID="result-decoded">{unlocked ? deepCopy.decoded : `${copy.decoded} ${pct}%`}</Text>
            <DecodeBar pct={pct} />
          </View>
        )}
        {quiet ? null : <View style={s.spacer} />}
        {wide ? <View style={[s.deepZone, unlocked && s.deepZoneDone]}>{shareMoment ? null : <DeepLine state={deep.state} armed={armed} />}</View> : null}
        {quiet ? (
          <View style={s.best} testID="result-best">
            {best ? (
              <Text style={s.bestText}>
                <Text style={{ color: color.p3 }}>{`${best.prefix} `}</Text>
                {best.value}
              </Text>
            ) : (
              <Text style={[s.bestText, { color: color.p3 }]}>{noPrior()}</Text>
            )}
          </View>
        ) : null}
        {quiet ? (
          <View style={s.quietState}>
            <Text style={s.quietWindow} testID="result-window">{windowLine}</Text>
            {gainDb > 0 ? <Text style={s.quietGain} testID="result-gain">{gainLabel(gainDb)}</Text> : null}
          </View>
        ) : null}
      </View>
      {scareView.flash > 0 ? <View pointerEvents="none" style={[s.flash, { opacity: scareView.flash }]} testID="scare-flash" /> : null}
    </View>
  );
}

const LABEL_W = 88;
const PROFILE_IDS = ['name', 'behaviour', 'evp'] as const;
const SPI_PAD = 12; // canvas margin around the digit so the bloom is not clipped
const SPI_BASE = SPI_PAD + 52; // VT323 72 px baseline inside the 64 px line

function ProfileRow({ label, value, maskW, valueTestID, peak = false }: { label: string; value?: string; maskW?: number; valueTestID?: string; peak?: boolean }) {
  // A value longer than its box (a narrow phone) tightens its tracking to fit instead of cutting the end.
  // The room is measured on the row (minus the label column), never on the text itself: a text's own
  // width is its content width, which sits a sub-pixel under len * CHAR_XS and would tighten every row.
  const [rowW, setRowW] = useState(0);
  // 8 px of air to the glass edge on the right (A-52): a long value tightens before it reaches the window.
  const boxW = rowW - LABEL_W - 8;
  // The unlocked EVP fragment is the one peak on the profile: rdM in p5 (28 px VT323, 0.4 em advance).
  const charW = peak ? 11.2 : CHAR_XS;
  const need = (value?.length ?? 0) * charW;
  const tight = rowW > 0 && need > boxW + 1 ? { letterSpacing: Math.max(peak ? -2 : -0.8, Math.floor((boxW / (value?.length ?? 1) - (charW - (peak ? 0 : 0.5))) * 10) / 10) } : null;
  return (
    <View style={[s.profRow, peak && s.profRowPeak]} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
      <Text style={s.profLabel}>{label}</Text>
      {maskW !== undefined ? <View style={[s.mask, { width: maskW }]} testID="profile-mask" /> : <Text style={[s.profileValue, s.profileFit, peak && s.profilePeak, tight]} numberOfLines={1} testID={valueTestID}>{value}</Text>}
    </View>
  );
}

// The format choice, in place of the result lines only: one line; the formats are hardware keys
// (D-045 5) and the reading rows stay. While the card renders the same box holds the printing line with
// a blinking block. The box keeps the height of what it replaces, so nothing above or below moves.
function SharePanel({ mode, height, still }: { mode: ShareMode; height: number; still: boolean }) {
  const blink = useBlink(still);
  const printing = mode === 'printing';
  return (
    <View style={[s.sharePanel, { height }]} testID="share-panel">
      <View style={s.shareLineRow}>
        <Text style={s.resultLine} testID="share-line" numberOfLines={1}>
          {printing ? shareCopy.printing : shareCopy.format}
        </Text>
        {printing ? <View style={[s.shareBlock, { opacity: blink ? 1 : 0 }]} testID="share-block" /> : null}
      </View>
    </View>
  );
}

// What prints directly above hardware key 4 (the key is in the housing row; this is the glass line over
// it). Armed: the sponsored-video sentence. Warming, offline and running print their state. Unlocked: the
// completion line. Nothing prints before the first press, so the zone keeps its height and stays blank.
function DeepLine({ state, armed }: { state: DeepState; armed: boolean }) {
  useLocale();
  if (state === 'unlocked') {
    return (
      <Text style={s.deepDone} testID="deepscan-done">
        {deepCopy.done}
      </Text>
    );
  }
  const text = state === 'warming' ? deepCopy.warming : state === 'offline' ? deepCopy.offline : state === 'running' ? deepCopy.running : armed ? deepCopy.arm : null;
  if (text === null) return null;
  return (
    <Text style={s.deepLine} testID="deepscan-line">
      {text}
    </Text>
  );
}

// 20 blocks, lit in whole blocks for the decoded share.
function DecodeBar({ pct }: { pct: number }) {
  const lit = Math.round((pct / 100) * 20);
  return (
    <View style={s.decodeBar} testID="decode-bar" role="progressbar" accessibilityLabel={t('result.decodedLabel', { pct })}>
      {Array.from({ length: 20 }, (_, i) => (
        <View key={i} style={[s.block, { backgroundColor: i < lit ? color.p4 : color.p1 }]} />
      ))}
    </View>
  );
}

// QUIET draws no figure; the composite still wants a placement, so it gets an empty one (disabled hides it).
const QUIET_PLACEMENT: Placement = { x: 0, y: 0, w: 1, h: 1, matte: 1, opacity: 0.08, flipX: false, offsetCopies: [] };

type Layout = { placement: Placement; region: ReturnType<typeof panelRegion>; meanLuma: number; top: number } | null;

// DEEP SCAN unlock: the compositor is asked for a larger output through its width and height (it
// rasterises at width x pixel ratio), and the result is shown at panel size. k = 1 draws as before.
function HiRes({ k, width, height, children }: { k: number; width: number; height: number; children: (k: number) => ReactNode }) {
  if (k === 1) return <>{children(1)}</>;
  return (
    <View style={{ width, height, overflow: 'hidden' }} pointerEvents="none">
      <View style={{ width: width * k, height: height * k, transform: [{ scale: 1 / k }], transformOrigin: 'top left' }}>{children(k)}</View>
    </View>
  );
}

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
  hires,
  onPhotoLoaded,
  onGain,
}: {
  size: GlassSize;
  height: number;
  record: ScanRecord;
  settled: boolean;
  isStatic: boolean;
  pop: number | null;
  therm: boolean;
  thermalC: number;
  stamp: [string, string];
  hires: boolean;
  onPhotoLoaded: (loaded: boolean) => void;
  onGain: (db: number) => void;
}) {
  const { outcome, photoUri, seed, id } = record;
  const wantsFigure = outcome.figureShown || outcome.smudge;
  const reduceMotion = useReduceMotion();
  const skia = useSkiaReady();
  const [v1Failed, setV1Failed] = useState(false);
  const v1 = skia && !v1Failed;
  const [read, setRead] = useState<{ done: boolean; result: RegionStats | null }>({ done: false, result: null });
  const [loaded, setLoaded] = useState(false);
  const image = useImage(v1 ? photoUri : null);
  const photoReady = v1 ? image !== null : loaded;

  // The data strip's font: the warped glass retakes its snapshot once the photo and the strip are both drawn.
  const stampFont = useVT323(16);
  const stampReady = stampFont !== null;
  useEffect(() => {
    onPhotoLoaded(photoReady && stampReady);
  }, [photoReady, stampReady, onPhotoLoaded]);

  useEffect(() => {
    // Read for every tier: the QUIET photo has no figure but its luma grid drives the auto-gain (A-45).
    let alive = true;
    regionFromImage(photoUri)
      .catch(() => null)
      .then((result) => alive && setRead({ done: true, result }));
    return () => {
      alive = false;
    };
  }, [photoUri]);

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
  // QUIET has no figure: the composite runs disabled so the auto-gain and tint still show (A-45), and the
  // strip names the gain the probe front end applied.
  const quietPanel = !wantsFigure && read.done;
  const gainDb = v1 && quietPanel ? autoGain(read.result?.grid).db : 0;
  useEffect(() => {
    onGain(gainDb);
  }, [gainDb, onGain]);
  const lines = useMemo<[string, string]>(() => (gainDb > 0 ? [`${stamp[0]}  ${gainLabel(gainDb)}`, stamp[1]] : stamp), [stamp, gainDb]);

  return (
    <View style={[s.photo, { height }]} testID={read.done ? 'result-photo' : undefined}>
      {v1 ? (
        (layout || quietPanel) && image && ready ? (
          <V1Boundary onFail={() => setV1Failed(true)}>
            {/* Before the needle settles the photo shows alone (disabled draws photo and grain); the
                figure's fade starts when the composite is mounted again at settle. */}
            <HiRes k={hires ? HIRES_SCALE : 1} width={W} height={height}>
              {(k) => (
                <Composite
                  key={showGhost ? 'figure' : 'photo'}
                  photo={image}
                  width={W * k}
                  height={height * k}
                  photoRect={{ x: 0, y: top * k, width: W * k, height: imgH * k }}
                  region={layout?.region}
                  meanLuma={layout ? layout.meanLuma : (read.result?.meanLuma ?? DEFAULT_MEAN_LUMA)}
                  p80Luma={read.result?.p80Luma}
                  p90Luma={read.result?.p90Luma}
                  grid={read.result?.grid}
                  placement={!layout ? QUIET_PLACEMENT : k === 1 ? layout.placement : scalePlacement(layout.placement, k)}
                  tier={outcome.tier}
                  seed={placementSeed}
                  static={isStatic}
                  fadeInMs={FADE_MS}
                  pop={pop}
                  disabled={!showGhost}
                />
              )}
            </HiRes>
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
      {therm && field ? (
        <View style={StyleSheet.absoluteFill}>
          <ThermalView field={field} width={W} height={height} top={top} static={isStatic || reduceMotion} />
        </View>
      ) : null}
      {!ready ? null : <DataStrip lines={lines} width={W} height={height} font={stampFont} />}
    </View>
  );
}

// The data strip burned into the photo's lower left corner, two VT323 lines in p3: case, SPI and time,
// then the labelled ΔT and SIMULATED last (A-40, D-045 7). Compositor v1 has no `stamp` prop, so it is a
// Skia text canvas over the panel. The photo's own 4% grain sits under it and the glass grain and
// scanlines over it, so it reads as burned into the picture. The n0 scrim is the least alpha that holds
// the card's 5:1 contrast target over a white photo (A-41), with a 1 px n0 copy under the text.
const STRIP_LINE = 16;
const STRIP_H = 2 * STRIP_LINE + 8;
const STRIP_X = 8;
const STRIP_SCRIM = stripScrimAlpha();
function DataStrip({ lines, width, height, font }: { lines: [string, string]; width: number; height: number; font: SkFont | null }) {
  const widths = font ? lines.map((l) => font.measureText(l).width) : [0, 0];
  // A line wider than the strip (a narrow phone, a long locale) is scaled down so nothing is cut off.
  const avail = width - 2 * STRIP_X;
  const k = Math.min(1, ...widths.map((w) => (w > avail + 2 ? avail / w : 1)));
  const scrimW = font ? Math.min(width, Math.max(...widths) * k + 2 * STRIP_X) : 0;
  // Web only (`data-*`): the widest drawn line after scaling, so the layout goldens can assert the strip fits.
  const web = { dataSet: { textW: String(Math.ceil(Math.max(...widths) * k)) } } as object;
  return (
    <View style={[s.strip, { top: height - STRIP_H, width }]} pointerEvents="none" testID="result-stamp" role="img" aria-label={lines.join(' ')} aria-busy={font === null} {...web}>
      <SnapshotCanvas style={{ width, height: STRIP_H }} pointerEvents="none">
        {font ? (
          <>
            <SkRect x={0} y={2} width={scrimW} height={STRIP_H - 2} color={color.n0} opacity={STRIP_SCRIM} />
            <SkGroup transform={[{ translateX: STRIP_X }, { scale: k }]}>
              {lines.map((l, i) => {
                const y = (STRIP_LINE * (i + 1) - 1) / k;
                return (
                  <SkGroup key={i}>
                    <SkText font={font} text={l} x={1 / k} y={y + 1 / k} color={color.n0} />
                    <SkText font={font} text={l} x={0} y={y} color={color.p3} />
                  </SkGroup>
                );
              })}
            </SkGroup>
          </>
        ) : null}
      </SnapshotCanvas>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, backgroundColor: color.n3 },
  glass: { flex: 1 },
  flash: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: color.p5 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photo: { width: '100%', overflow: 'hidden', backgroundColor: color.n0, borderBottomWidth: 1, borderBottomColor: color.p1 },
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
  readings: { marginTop: BODY.gap, width: 19 * CHAR_XS + 2 },
  // 6 px under the rule: the umlaut of ENTITÄTSPROFIL clears it (A-52). 1 + 6 + 12 + 5 x 16 stays inside BODY.profile.
  profile: { borderTopWidth: 1, borderTopColor: color.p1, paddingTop: 6, marginTop: BODY.gap },
  profileHead: { ...type.lbXS, color: color.p3, height: 12 },
  profRow: { flexDirection: 'row', alignItems: 'center', height: 16 },
  profLabel: { ...type.lbXS, width: LABEL_W, color: color.p3 },
  profileValue: { ...type.rdXS, color: color.p4 },
  profRowPeak: { height: 28 },
  profilePeak: { ...type.rdM, color: color.p5 },
  profileFit: { flexShrink: 1 },
  mask: { height: 8, backgroundColor: color.p2 },
  decodedBlock: { marginTop: BODY.gap, gap: 2 },
  spacer: { flex: 1, minHeight: BODY.gap },
  // The line over key 4: two lines of rdXS at legend size, tracking 0 so the longest locale line wraps to two at 360,
  // right-aligned so its right edge sits over key 4, p4. The zone keeps its height whether or not a line prints.
  deepZone: { height: BODY.offer, marginHorizontal: -4, justifyContent: 'flex-end', marginBottom: -8 },
  // Unlocked prints one line, and the EVP row has grown by 12 (rdM): the zone gives that height back.
  deepZoneDone: { height: BODY.offer - 12 },
  deepLine: { ...type.rdXS, letterSpacing: 0, color: color.p4, textAlign: 'right' },
  deepDone: { ...type.rdXS, color: color.p4, textAlign: 'right' },
  sharePanel: {},
  shareLineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shareBlock: { width: 8, height: 12, backgroundColor: color.p4 },
  decoded: { ...type.rdXS, color: color.p4 },
  decodeBar: { flexDirection: 'row', gap: 2, height: 8 },
  block: { flex: 1, height: 8 },
  // Glass text under a p1 rule, left aligned: no box, no card.
  best: { borderTopWidth: 1, borderTopColor: color.p1, marginTop: BODY.gap, paddingTop: 6 },
  bestText: { ...type.rdXS, color: color.p4 },
  quietState: { flex: 1, justifyContent: 'flex-end' },
  quietWindow: { ...type.rdM, color: color.p3 },
  quietGain: { ...type.rdM, color: color.p4 },
});

export { RouteFault as ErrorBoundary } from '../../src/ui/screens/FaultScreen';
