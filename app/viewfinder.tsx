import { CameraView, type PermissionResponse, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { type RefObject, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { cadenceStore } from '../src/state/cadence';
import { syncRelay } from '../src/state/notifyRuntime';
import { relayDue, relayStore } from '../src/state/relay';
import { listScans } from '../src/state/scans';
import { sessionActivity } from '../src/state/session';
import { hasSeenTag, markTagSeen, LOCATION_TAGS, type LocationTag } from '../src/state/locations';
import type { KeySlot } from '../src/ui/boot/parts';
import { captureSeed } from '../src/ui/capture';
import { DEFAULT_FIXTURE } from '../src/ui/fixtureNames';
import { fixtureUri } from '../src/ui/fixtures';
import { FeedTint } from '../src/fx/glass';
import { readBootParams } from '../src/ui/boot/params';
import { type Harness, readHarness } from '../src/ui/harness';
import { sound } from '../src/ui/audio';
import { Readout } from '../src/ui/Readout';
import { useActive } from '../src/ui/useActive';
import { useReduceMotion } from '../src/ui/useReduceMotion';
import { Housing } from '../src/ui/screens/Housing';
import { color, radius, type } from '../src/ui/tokens';
import { DIAL_H, DIAL_W, EmfDial } from '../src/ui/viewfinder/EmfDial';
import { takeReturnNote } from '../src/ui/interstitial';
import { gateOpenFor } from '../src/ui/interstitialParams';
import { RelayModule, useRelayModule } from '../src/ui/relay/RelayModule';
import { useInterstitialGate } from '../src/ui/useInterstitialGate';
import { Sweep } from '../src/ui/viewfinder/Sweep';
import { formatFlux, formatGeo, formatThermal, jitteredAngle, liveLeds, liveTier } from '../src/ui/viewfinder/flux';
import { useFlux } from '../src/ui/viewfinder/useFlux';
import { useLiveThermal } from '../src/ui/viewfinder/useLiveThermal';
import { FIXTURE_TAG, LORE, TAG_HIT, TAG_LABEL, TAG_ROW_PAD, tagLegend, tagTracking } from '../src/ui/viewfinder/lore';

// Copy keys follow docs/voice-guide.md section 3. The denied-permission strings are
// placeholders in the same voice: Copy will add their keys to the voice guide.
const copy = {
  'permission.camera': 'Camera access required for capture. Frames stay on this device.',
  'permission.denied.head': 'CAMERA OFFLINE.',
  'permission.denied.cause': 'Access denied. Stored frame in use.',
  'permission.denied.next': 'Allow access in system settings.',
  'hud.mode': 'Viewfinder',
  'hud.live': 'VF · LIVE',
  'hud.stored': 'VF · STORED',
  'hud.wait': 'VF · WAIT',
  'hud.tagLabel': 'Location tag, step to the next',
  'hud.allow': 'ALLOW',
  'hud.allowLabel': 'Allow camera access',
  'hud.log': 'LOG',
  'hud.logLabel': 'Open history',
  'hud.capture': 'CAPTURE',
  'hud.captureLabel': 'Capture photo',
};

// Harness: a fixed capture time so the scan seed, and the result golden, repeat.
const STATIC_CAPTURE_MS = Date.UTC(2026, 9, 13, 12);
const STATIC_SEED = 417;
const FIXTURE_SIZE = { w: 768, h: 1024 };
const BAND = 0.3; // scrim band: lower 30% of the glass, never less than it needs
const BAND_MIN = TAG_HIT + 36 + 96; // tag row, two lore rows, dial plate height
const RETICLE_TOP = 68; // keep in step with s.reticle.top
const SCRIM = 'rgba(10, 15, 11, 0.64)';

let cached: Harness | null = null;
const snapshot = () => (cached ??= readHarness());
const serverSnapshot = () => null;
const subscribeNever = () => () => {};

// Query params exist only on the client, so the static export renders the
// empty housing and the body mounts after hydration.
export default function ViewfinderRoute() {
  const harness = useSyncExternalStore(subscribeNever, snapshot, serverSnapshot);
  if (!harness) return <View testID="screen-viewfinder" style={s.empty} />;
  return Platform.OS === 'web' ? <Viewfinder harness={harness} /> : <NativeViewfinder harness={harness} />;
}

function NativeViewfinder({ harness }: { harness: Harness }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  return <Viewfinder harness={harness} permission={permission} request={requestPermission} camera={camera} />;
}

type Source = 'loading' | 'camera' | 'ask' | 'fixture' | 'denied';

function sourceFor(permission: PermissionResponse | null | undefined, web: boolean): Source {
  if (web) return 'fixture';
  if (!permission) return 'loading';
  if (permission.granted) return 'camera';
  return permission.status === 'undetermined' ? 'ask' : 'denied';
}

function Viewfinder({
  harness,
  permission,
  request,
  camera,
}: {
  harness: Harness;
  permission?: PermissionResponse | null;
  request?: () => Promise<PermissionResponse>;
  camera?: RefObject<CameraView | null>;
}) {
  const router = useRouter();
  const { width: windowW } = useWindowDimensions();
  const { isStatic } = harness;
  // Under 380 px the dial plate leaves 126 px beside GEO: the thermal digit drops its spaces to fit.
  const narrow = windowW < 380;
  const fixture = harness.fixture ?? DEFAULT_FIXTURE;
  const source = sourceFor(permission, Platform.OS === 'web');
  // An interstitial may show only once the camera permission is granted (or on web, where there is none).
  useInterstitialGate(gateOpenFor(source));

  // The FIELD LOG RELAY opt-in: on the first eligible return from a result (after the 3rd scan or the
  // first STRONG), never when that return shows an interstitial (the next eligible return gets it).
  const [relayOpen, setRelayOpen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void syncRelay('focus');
      const note = takeReturnNote();
      if (!note) return;
      const scans = listScans();
      const due = relayDue({
        state: relayStore.get(),
        scanCount: scans.length,
        hasStrong: scans.some((r) => r.outcome.tier === 'strong' || r.outcome.tier === 'critical'),
        sessionIndex: cadenceStore.sessionIndex(),
        fromResult: true,
        interstitial: note.interstitial,
      });
      if (due) {
        relayStore.markOffered();
        setRelayOpen(true);
      }
    }, []),
  );
  const closeRelay = useCallback(() => setRelayOpen(false), []);
  const relayModule = useRelayModule(isStatic, closeRelay);

  const reduceMotion = useReduceMotion();
  const active = useActive();
  const [fluxSeed] = useState(() => (isStatic ? STATIC_SEED : Date.now() % 2 ** 31));
  const { sample } = useFlux({ seed: fluxSeed, isStatic, active });
  const [tag, setTag] = useState<LocationTag>(() => (harness.fixture ? FIXTURE_TAG[harness.fixture] : LOCATION_TAGS[0]));
  const busy = useRef(false);
  // One index per session (boot fixes it first). Under ?static=1 the clock is the boot screen's:
  // ?date=&time= when given, else the harness time, so a direct visit shows the same number.
  const { index } = sessionActivity(isStatic ? readBootParams().date : new Date());

  // Sound follows the screen: on while it is focused and in the foreground, off on a blur or when
  // the app goes to the background (useActive). The flux and its tier drive the clicks and the hum.
  const tierNow = liveTier(sample.mg);
  const tierRef = useRef(tierNow);
  useEffect(() => {
    tierRef.current = tierNow;
  }, [tierNow]);
  useEffect(() => sound.setReducedMotion(reduceMotion), [reduceMotion]);
  useEffect(() => {
    if (!active) return;
    sound.start('vf', tierRef.current);
    return () => sound.stop('vf');
  }, [active]);
  useEffect(() => {
    if (active) sound.setTier(tierNow);
  }, [active, tierNow]);
  useEffect(() => {
    if (active) sound.setFlux(sample.mg);
  }, [active, sample.mg]);

  const angle = jitteredAngle(sample.mg, sample.jitter, reduceMotion);
  const flux = formatFlux(sample.mg);
  const dT = useLiveThermal({ mg: sample.mg, seed: fluxSeed, isStatic, active });

  const capture = async () => {
    if (busy.current) return;
    busy.current = true;
    sound.capture();
    try {
      let uri = fixtureUri(fixture);
      let size = FIXTURE_SIZE;
      if (source === 'camera' && camera?.current) {
        const pic = await camera.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
        uri = pic.uri;
        size = { w: pic.width, h: pic.height };
      }
      const seed = captureSeed(uri, size.w, size.h, isStatic ? STATIC_CAPTURE_MS : Date.now());
      markTagSeen(tag);
      router.push({ pathname: '/scan', params: { photo: uri, seed: String(seed), tag } });
    } finally {
      busy.current = false;
    }
  };

  const onAllow = () => {
    if (permission && !permission.canAskAgain) void Linking.openSettings();
    else void request?.();
  };

  const canCapture = source === 'camera' || source === 'fixture' || source === 'denied';
  const showAllow = source === 'ask' || source === 'denied';
  const state = source === 'denied' ? copy['hud.stored'] : source === 'ask' || source === 'loading' ? copy['hud.wait'] : copy['hud.live'];
  const lore = hasSeenTag(tag) ? null : LORE[tag];

  const keySlots: (KeySlot | null)[] = [
    // History is one tap from here (the result screen's key row carries THERM instead).
    { testID: 'key-log', label: copy['hud.logLabel'], legend: copy['hud.log'], onPress: () => router.push('/history') },
    null,
    showAllow ? { testID: 'key-allow', label: copy['hud.allowLabel'], legend: copy['hud.allow'], onPress: onAllow } : null,
    canCapture ? { testID: 'key-capture', label: copy['hud.captureLabel'], legend: copy['hud.capture'], onPress: () => void capture(), backlit: true } : null,
  ];

  return (
    <Housing
      testID="screen-viewfinder"
      leds={liveLeds(sample.mg)}
      fixedIdentity={isStatic}
      glassLabel={`${copy['hud.mode']}. ${flux}. Activity index ${index} of 5. Location ${TAG_LABEL[tag]}.`}
      keys={relayOpen && relayModule.keys ? relayModule.keys : keySlots}
    >
      {({ w, h }) => {
        const bandH = Math.max(Math.round(h * BAND), BAND_MIN);
        return (
          <>
            {/* The feed seen through the tube: the phosphor ramp mixed over the colour, lifted blacks (FeedTint). */}
            {source === 'camera' ? (
              <FeedTint testID="hud-feed">
                <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
              </FeedTint>
            ) : source === 'fixture' || source === 'denied' ? (
              <FeedTint testID="hud-feed" image={fixtureUri(fixture)} />
            ) : null}
            <View style={s.dim} pointerEvents="none" />
            <Sweep
              width={w}
              height={h - bandH}
              cx={w / 2}
              cy={Math.round((RETICLE_TOP + h - bandH - 12) / 2)}
              mg={sample.mg}
              isStatic={isStatic}
              running={active}
              reduceMotion={reduceMotion}
            />
            <Reticle bottom={bandH + 12} />

            <View style={s.topScrim} pointerEvents="none" />
            <View style={s.topLeft} pointerEvents="none" testID="hud-top">
              <Readout label="IDX" value={`${index}/5`} labelCh={3} valueCh={5} unitCh={0} {...HUD} />
            </View>

            {source === 'ask' ? (
              <View style={[s.notice, { bottom: bandH }]} testID="permission-ask">
                <Text style={s.noticeText}>{copy['permission.camera']}</Text>
              </View>
            ) : null}
            {source === 'denied' ? (
              <View style={[s.notice, { bottom: bandH }]} testID="permission-denied">
                <Text style={s.noticeHead}>{copy['permission.denied.head']}</Text>
                <Text style={s.noticeText}>{copy['permission.denied.cause']}</Text>
                <Text style={s.noticeText}>{copy['permission.denied.next']}</Text>
              </View>
            ) : null}

            {relayOpen ? <RelayModule bottom={bandH + 12} line={relayModule.line} onDone={closeRelay} /> : null}

            <View style={[s.band, { height: bandH }]} testID="hud-band">
              <View style={s.tagRow} accessibilityRole="tablist">
                {LOCATION_TAGS.map((tg) => (
                  <Pressable
                    key={tg}
                    testID={`tag-${tg}`}
                    onPress={() => setTag(tg)}
                    accessibilityRole="tab"
                    accessibilityLabel={TAG_LABEL[tg]}
                    accessibilityState={{ selected: tg === tag }}
                    style={s.tagHit}
                  >
                    <View>
                      <Text style={[s.tag, { letterSpacing: tagTracking(windowW) }, tg === tag && s.tagOn]} testID={`tag-text-${tg}`}>
                        {tagLegend(tg, windowW)}
                      </Text>
                      {tg === tag ? <View style={s.tagLine} testID="tag-underline" /> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
              {lore ? (
                <View style={s.lore} testID="hud-lore">
                  <Text style={s.loreText}>{lore[0]}</Text>
                  <Text style={s.loreText}>{lore[1]}</Text>
                </View>
              ) : null}
              <View style={s.fluxBlock}>
                <View style={s.fluxRow} testID="hud-flux" accessibilityLabel={flux}>
                  <Text style={s.fluxLabel}>FLUX</Text>
                  <Text style={s.fluxValue}>{String(sample.mg).padStart(4, ' ')}</Text>
                  <Text style={s.fluxUnit}>mG</Text>
                </View>
                <View style={s.geoRow}>
                  <Text style={s.geo} testID="hud-geo">
                    {formatGeo(sample.mg)}
                  </Text>
                  <Text style={[s.dt, narrow && s.dtNarrow]} testID="hud-dt" accessibilityLabel={formatThermal(dT)}>
                    <Text style={s.dtLabel}>{narrow ? 'ΔT' : 'ΔT '}</Text>
                    {`${dT.toFixed(1)}${narrow ? '' : ' '}°C`}
                  </Text>
                </View>
                <Text style={s.state} testID="hud-state">
                  {state}
                </Text>
              </View>
              <View style={s.dialPlate} testID="hud-dial">
                <View style={[s.plateDot, { left: 5 }]} />
                <View style={[s.plateDot, { right: 5 }]} />
                <EmfDial angle={angle} frozen={isStatic} reduceMotion={reduceMotion} />
              </View>
            </View>
          </>
        );
      }}
    </Housing>
  );
}

const HUD = { labelColor: color.p4, valueColor: color.p4, unitColor: color.p4 } as const;

// Frame marks: 2 px p4 arms with a 1 px n0 outline so they read on any photo,
// and a small centre cross.
const ARM = 22;

function Bracket({ x, y }: { x: 'left' | 'right'; y: 'top' | 'bottom' }) {
  const at = (extra: object) => ({ position: 'absolute' as const, [x]: -1, [y]: -1, ...extra });
  return (
    <>
      <View style={at({ width: ARM + 2, height: 4, backgroundColor: color.n0 })} />
      <View style={at({ width: 4, height: ARM + 2, backgroundColor: color.n0 })} />
      <View style={{ position: 'absolute', [x]: 0, [y]: 0, width: ARM, height: 2, backgroundColor: color.p4 }} />
      <View style={{ position: 'absolute', [x]: 0, [y]: 0, width: 2, height: ARM, backgroundColor: color.p4 }} />
    </>
  );
}

function Reticle({ bottom }: { bottom: number }) {
  return (
    <View style={[s.reticle, { bottom }]} pointerEvents="none" testID="hud-reticle">
      <Bracket x="left" y="top" />
      <Bracket x="right" y="top" />
      <Bracket x="left" y="bottom" />
      <Bracket x="right" y="bottom" />
      <View style={s.crossHo} />
      <View style={s.crossVo} />
      <View style={s.crossH} />
      <View style={s.crossV} />
    </View>
  );
}

const s = StyleSheet.create({
  empty: { flex: 1, backgroundColor: color.n3 },
  dim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(10, 15, 11, 0.22)' },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0, height: 56, backgroundColor: SCRIM },
  topLeft: { position: 'absolute', left: 12, top: 4 },
  reticle: { position: 'absolute', left: 12, right: 12, top: RETICLE_TOP },
  crossHo: { position: 'absolute', left: '50%', top: '50%', width: 17, height: 3, marginLeft: -8, marginTop: -1, backgroundColor: color.n0 },
  crossVo: { position: 'absolute', left: '50%', top: '50%', width: 3, height: 17, marginLeft: -1, marginTop: -8, backgroundColor: color.n0 },
  crossH: { position: 'absolute', left: '50%', top: '50%', width: 15, height: 1, marginLeft: -7, backgroundColor: color.p4 },
  crossV: { position: 'absolute', left: '50%', top: '50%', width: 1, height: 15, marginTop: -7, backgroundColor: color.p4 },
  // One opaque n0 band, edge to edge, from the tag row to the glass bottom: HUD text sits on this.
  band: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.n0 },
  tagRow: { position: 'absolute', left: TAG_ROW_PAD, right: TAG_ROW_PAD, top: 0, flexDirection: 'row', justifyContent: 'space-between' },
  tagHit: { minWidth: TAG_HIT, height: TAG_HIT, alignItems: 'center', justifyContent: 'center' },
  tag: { ...type.lbXS, color: color.n5 },
  // Selected: p5 text with a 1 px p4 rule under it (its own view, so the rule is not the text's colour).
  tagOn: { color: color.p5 },
  tagLine: { position: 'absolute', left: 0, right: 0, bottom: -2, height: 1, backgroundColor: color.p4 },
  lore: { position: 'absolute', left: 12, right: 12, top: TAG_HIT },
  loreText: { ...type.rdXS, color: color.p4, height: 18 },
  fluxBlock: { position: 'absolute', left: 12, bottom: 8 },
  fluxRow: { flexDirection: 'row', alignItems: 'flex-end', height: 44 },
  fluxLabel: { ...type.rdXS, color: color.p3, marginBottom: 2, marginRight: 4 },
  fluxValue: { ...type.rdL, color: color.p4, width: 4 * 19.2, textAlign: 'right' },
  fluxUnit: { ...type.rdXS, color: color.p3, marginBottom: 2, marginLeft: 4 },
  geoRow: { flexDirection: 'row', alignItems: 'center' },
  geo: { ...type.rdXS, color: color.p3, height: 18 },
  dt: { ...type.rdXS, color: color.p4, height: 18, marginLeft: 12 },
  dtNarrow: { marginLeft: 6 },
  dtLabel: { color: color.p3 },
  state: { ...type.lbS, color: color.p3 },
  dialPlate: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: DIAL_W,
    height: DIAL_H,
    backgroundColor: color.n1,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: color.n4,
    borderBottomRightRadius: radius.window - 2,
    overflow: 'hidden',
  },
  plateDot: { position: 'absolute', top: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: color.n4 },
  notice: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: SCRIM,
    borderLeftWidth: 2,
    borderLeftColor: color.p3,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noticeHead: { ...type.rdM, color: color.p5 },
  noticeText: { ...type.rdS, color: color.p4 },
});
