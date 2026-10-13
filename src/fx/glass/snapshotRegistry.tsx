import { Canvas, useCanvasRef, type CanvasProps, type CanvasRef } from '@shopify/react-native-skia';
import { useEffect, useRef, type RefObject } from 'react';
import { Platform, View } from 'react-native';

// Warp capture fix (D-017). On web the glass warp rasterises the DOM, and a Skia canvas there is a
// WebGL canvas whose drawing buffer is cleared after each frame, so `toDataURL` reads it back
// blank: the result photo, the thermal view and the SPI digit vanished from the warped snapshot.
// A <SnapshotCanvas> is a drop-in <Canvas> that registers itself; the web rasteriser asks each
// registered canvas for `makeImageSnapshot()` (Skia redraws its picture into an image) and pastes
// that in place of the blank element. Native is unchanged (makeImageFromView reads the views).

const registry = new WeakMap<object, RefObject<CanvasRef | null>>();

/** Web: the image of a canvas element that belongs to a <SnapshotCanvas>, as a PNG data URL, or null. */
export function snapshotCanvasElement(el: Element): string | null {
  // The canvas sits a level or two under the wrapper view that registered it.
  let node: Element | null = el;
  for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
    const ref = registry.get(node);
    if (!ref?.current) continue;
    try {
      const img = ref.current.makeImageSnapshot();
      const b64 = img.encodeToBase64();
      img.dispose();
      return b64 ? `data:image/png;base64,${b64}` : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** A <Canvas> the web warp snapshot can read. Same props; `style` sizes the canvas. */
export function SnapshotCanvas({ style, pointerEvents, testID, ...props }: CanvasProps) {
  const canvas = useCanvasRef();
  const host = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = host.current as unknown as object | null;
    if (!el) return;
    registry.set(el, canvas);
    return () => {
      registry.delete(el);
    };
  }, [canvas]);
  return (
    <View ref={host} style={style} pointerEvents={pointerEvents} testID={testID} collapsable={false}>
      <Canvas ref={canvas} style={{ width: '100%', height: '100%' }} pointerEvents={pointerEvents} {...props} />
    </View>
  );
}
