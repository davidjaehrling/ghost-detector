import { type ReactNode, memo, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, type GlassProps } from '../../fx/glass';
import { FIXED_SEED, type InstallIdentity, getInstallIdentity, readInstallSeed } from '../boot/install';
import { Key, type KeySlot, KeyRow, LedLadder, MiniSticker, Screw, Wear } from '../boot/parts';
import { readHarness } from '../harness';
import { SLOT_GAP_BELOW } from '../keyLayout';
import { Nameplate } from './Nameplate';
import { color } from '../tokens';
import { useReduceMotion } from '../useReduceMotion';

export type GlassSize = { w: number; h: number };

// What a screen may ask of the glass stack (fx README, "Which screen uses what"). Viewfinder, scan
// and result take the flat default; boot adds warp and the warm-up.
export type HousingGlass = Partial<Pick<GlassProps, 'warp' | 'refreshKey' | 'warmUp' | 'warmUpKey' | 'onWarmUpDone'>>;

// Bible section 2 housing for the live screens: nameplate with serial, screen
// window with four screws, LED ladder plate on the right, key band below.
// `children` draws on the glass and receives its measured size.
export const Housing = memo(function Housing({
  testID,
  leds,
  fixedIdentity,
  glassLabel,
  keys,
  identity: given,
  glass = NO_GLASS,
  sticker = true,
  slot,
  children,
}: {
  testID: string;
  leds: number;
  /** Harness: use the fixed identity so goldens do not depend on the install seed. */
  fixedIdentity: boolean;
  /** Reading for screen readers; when omitted the glass children stay individually reachable. */
  glassLabel?: string;
  /** Boot passes the identity of its (harness) date. */
  identity?: InstallIdentity;
  /** Four slots, left to right; null is an engraved dummy cap. Slot 3 is the primary action. */
  keys: readonly (KeySlot | null)[];
  glass?: HousingGlass;
  /** The calibration sticker stuck on the housing, bottom-left. Boot leaves it off until ACK. */
  sticker?: boolean;
  /** A fixed-height strip between the window and the key row (the history banner). The window gives up the height. */
  slot?: ReactNode;
  children: (size: GlassSize) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<GlassSize>({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const own = useMemo(
    () => (fixedIdentity ? getInstallIdentity(new Date(2026, 9, 13, 12), FIXED_SEED) : getInstallIdentity()),
    [fixedIdentity],
  );
  const identity = given ?? own;
  const reduceMotion = useReduceMotion();
  // The install seed fixes the dust and scratches per device; the harness pins it for goldens.
  const seed = useMemo(() => (fixedIdentity ? FIXED_SEED : readInstallSeed()), [fixedIdentity]);
  const isStatic = readHarness().isStatic;
  return (
    <View testID={testID} style={[s.housing, { paddingTop: insets.top + 12 }]}>
      <Wear side="left" top="44%" length={58} />
      <Wear side="right" top="62%" length={46} />
      <Nameplate serial={identity.serial} />
      <View style={s.windowRow}>
        <View style={s.windowWrap}>
          <View style={s.glassBox} onLayout={onLayout} accessibilityLabel={glassLabel} accessible={glassLabel !== undefined}>
          <Glass
            testID={`${testID}-glass`}
            style={s.glass}
            seed={seed}
            // Reduced motion settles the glass layers (grain frozen at the seed, no timers), as the harness freeze does.
            static={isStatic || reduceMotion}
            reduceMotion={reduceMotion}
            {...glass}
          >
            {/* Opaque tube colour at an explicit size: the web snapshot clones this view into a block
                host, so a flex-sized root collapses to its content and bottom-anchored children jump up. */}
            <View style={[s.tube, { width: size.w, height: size.h }]}>{size.w > 0 ? children(size) : null}</View>
          </Glass>
          </View>
          <Screw corner={0} />
          <Screw corner={1} />
          <Screw corner={2} />
          <Screw corner={3} burred />
        </View>
        <View style={s.ledWrap}>
          <LedLadder lit={leds} />
        </View>
      </View>
      {slot ? <View style={s.slot}>{slot}</View> : null}
      <View style={s.keyBand}>
        {sticker ? <MiniSticker cal={identity.cal} pruef={identity.pruef} style={s.sticker} /> : null}
        <KeyRow slots={keys} />
      </View>
    </View>
  );
});

const NO_GLASS: HousingGlass = {};

export { Key };

const GUTTER = 14;

const s = StyleSheet.create({
  housing: {
    flex: 1,
    backgroundColor: color.n3,
    borderTopWidth: 1,
    borderTopColor: color.n4,
    borderBottomWidth: 2,
    borderBottomColor: color.n1,
    paddingHorizontal: GUTTER,
    overflow: 'hidden',
  },
  windowRow: { flex: 1, flexDirection: 'row', marginTop: 18, marginBottom: 18 },
  windowWrap: { flex: 1 },
  glassBox: { flex: 1 },
  tube: { backgroundColor: color.n0 },
  glass: {
    flex: 1,
    backgroundColor: color.n0,
  },
  ledWrap: { width: 28, marginLeft: 14, alignSelf: 'flex-start' },
  // Full screen width (the housing pads 14 per side). Bottom margin: at least 32 dp to the key caps,
  // which sit 6 px inside their plate in the 56 px at the bottom of the 88 px key band.
  slot: { marginHorizontal: -GUTTER, marginBottom: SLOT_GAP_BELOW },
  keyBand: { height: 88, justifyContent: 'flex-end' },
  // Under the window's lower edge and clear of its corner screw, above the key plate.
  sticker: { position: 'absolute', left: 10, top: -15 },
});
