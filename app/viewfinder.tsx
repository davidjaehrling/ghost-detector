import { CameraView, type PermissionResponse, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Image, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Key } from '../src/ui/boot/parts';
import { captureSeed } from '../src/ui/capture';
import { DEFAULT_FIXTURE } from '../src/ui/fixtureNames';
import { fixtureSource, fixtureUri } from '../src/ui/fixtures';
import { type Harness, readHarness } from '../src/ui/harness';
import { Housing } from '../src/ui/screens/Housing';
import { color, type } from '../src/ui/tokens';
import { DIAL_H, DIAL_W, EmfDial } from '../src/ui/viewfinder/EmfDial';
import { type FluxSample, createFluxWalk, fluxAngle, formatFlux, liveLeds } from '../src/ui/viewfinder/flux';

// Copy keys follow docs/voice-guide.md section 3.
const copy = {
  'permission.camera': 'Camera access required for capture. Frames stay on this device.',
  'permission.denied.head': 'CAMERA OFFLINE.',
  'permission.denied.cause': 'Access denied. Stored frame in use.',
  'permission.denied.next': 'Allow access in system settings.',
  'hud.mode': 'VIEWFINDER',
  'hud.allow': 'ALLOW',
  'hud.allowLabel': 'Allow camera access',
  'hud.capture': 'CAPTURE',
  'hud.captureLabel': 'Capture photo',
};

const STATIC_SEED = 417;
const TICK_MS = 100;
const NEEDLE_JITTER_DEG = 0.006 * 100;
const FIXTURE_SIZE = { w: 768, h: 1024 };

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
  const { isStatic } = harness;
  const fixture = harness.fixture ?? DEFAULT_FIXTURE;
  const source = sourceFor(permission, Platform.OS === 'web');

  const [walk] = useState(() => createFluxWalk(isStatic ? STATIC_SEED : Date.now() % 2 ** 31));
  const [sample, setSample] = useState<FluxSample>(() => walk.next());
  const [reduceMotion, setReduceMotion] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion, () => {});
  }, []);
  useEffect(() => {
    if (isStatic) return;
    const id = setInterval(() => setSample(walk.next()), TICK_MS);
    return () => clearInterval(id);
  }, [isStatic, walk]);

  const angle = fluxAngle(sample.mg) + (reduceMotion ? 0 : sample.jitter * NEEDLE_JITTER_DEG);
  const flux = formatFlux(sample.mg);

  const capture = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      let uri = fixtureUri(fixture);
      let size = FIXTURE_SIZE;
      if (source === 'camera' && camera?.current) {
        const pic = await camera.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
        uri = pic.uri;
        size = { w: pic.width, h: pic.height };
      }
      const seed = captureSeed(uri, size.w, size.h, Date.now());
      router.push({ pathname: '/scan', params: { photo: uri, seed: String(seed) } });
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

  return (
    <Housing
      testID="screen-viewfinder"
      leds={liveLeds(sample.mg)}
      fixedIdentity={isStatic}
      glassLabel={`${copy['hud.mode']}. ${flux}.`}
      dummies={Math.max(0, 3 - (canCapture ? 1 : 0) - (showAllow ? 1 : 0))}
      keys={
        <>
          {showAllow ? (
            <Key testID="key-allow" label={copy['hud.allowLabel']} legend={copy['hud.allow']} width={72} onPress={onAllow} />
          ) : null}
          {canCapture ? (
            <Key testID="key-capture" label={copy['hud.captureLabel']} legend={copy['hud.capture']} onPress={() => void capture()} />
          ) : null}
        </>
      }
    >
      {() => (
        <>
          {source === 'camera' ? (
            <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
          ) : source === 'fixture' || source === 'denied' ? (
            <Image source={fixtureSource(fixture)} style={[StyleSheet.absoluteFill, s.photo]} accessibilityLabel="" />
          ) : null}
          <View style={s.dim} pointerEvents="none" />
          <Reticle />
          <View style={[s.panel, s.topLeft]}>
            <Text style={s.mode}>{copy['hud.mode']}</Text>
          </View>
          {source === 'ask' ? (
            <View style={s.notice} testID="permission-ask">
              <Text style={s.noticeText}>{copy['permission.camera']}</Text>
            </View>
          ) : null}
          {source === 'denied' ? (
            <View style={s.notice} testID="permission-denied">
              <Text style={s.noticeHead}>{copy['permission.denied.head']}</Text>
              <Text style={s.noticeText}>{copy['permission.denied.cause']}</Text>
              <Text style={s.noticeText}>{copy['permission.denied.next']}</Text>
            </View>
          ) : null}
          <View style={[s.panel, s.fluxPanel]}>
            <Text style={s.flux} testID="hud-flux" numberOfLines={1}>
              {flux}
            </Text>
          </View>
          <View style={[s.panel, s.dialPanel]}>
            <EmfDial angle={angle} frozen={isStatic} reduceMotion={reduceMotion} />
          </View>
        </>
      )}
    </Housing>
  );
}

// Viewfinder frame marks and a small centre cross, p4 at half strength.
function Reticle() {
  return (
    <View style={s.reticle} pointerEvents="none">
      <View style={[s.corner, { left: 0, top: 0, borderLeftWidth: 1.5, borderTopWidth: 1.5 }]} />
      <View style={[s.corner, { right: 0, top: 0, borderRightWidth: 1.5, borderTopWidth: 1.5 }]} />
      <View style={[s.corner, { left: 0, bottom: 0, borderLeftWidth: 1.5, borderBottomWidth: 1.5 }]} />
      <View style={[s.corner, { right: 0, bottom: 0, borderRightWidth: 1.5, borderBottomWidth: 1.5 }]} />
      <View style={s.crossH} />
      <View style={s.crossV} />
    </View>
  );
}

const PANEL = 'rgba(10, 15, 11, 0.74)';

const s = StyleSheet.create({
  empty: { flex: 1, backgroundColor: color.n3 },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  dim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(10, 15, 11, 0.22)' },
  panel: { position: 'absolute', backgroundColor: PANEL, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4 },
  topLeft: { left: 12, top: 12 },
  mode: { ...type.rdS, color: color.p4 },
  fluxPanel: { right: 12, bottom: 12 + DIAL_H + 6 },
  flux: { ...type.rdM, color: color.p4 },
  dialPanel: { right: 12, bottom: 12, padding: 0, paddingHorizontal: 0, paddingVertical: 0, width: DIAL_W, height: DIAL_H },
  reticle: { position: 'absolute', left: 26, right: 26, top: 56, bottom: DIAL_H + 94 },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: color.p4, opacity: 0.5 },
  crossH: { position: 'absolute', left: '50%', top: '50%', width: 15, height: 1, marginLeft: -7, backgroundColor: color.p4, opacity: 0.5 },
  crossV: { position: 'absolute', left: '50%', top: '50%', width: 1, height: 15, marginTop: -7, backgroundColor: color.p4, opacity: 0.5 },
  notice: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: '34%',
    backgroundColor: PANEL,
    borderRadius: 2,
    borderLeftWidth: 2,
    borderLeftColor: color.p3,
    padding: 12,
  },
  noticeHead: { ...type.rdM, color: color.p5 },
  noticeText: { ...type.rdS, color: color.p4 },
});
