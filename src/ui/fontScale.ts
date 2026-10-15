import { PixelRatio, StyleSheet, Text } from 'react-native';

// Web harness only: `?fontScale=1.3` stands in for the Android font-size setting. React Native Web does not
// scale text, so the harness does what the native Text does: fontSize, lineHeight and letterSpacing times
// the factor, capped by a Text's own `maxFontSizeMultiplier`. PixelRatio.getFontScale() answers the factor.
// Production never sets the param; native has no location and this file does nothing there.
function requested(): number {
  try {
    const v = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location?.search ?? '').get('fontScale')) : 0;
    return Number.isFinite(v) && v >= 1 && v <= 2 ? v : 1;
  } catch {
    return 1;
  }
}

export const HARNESS_FONT_SCALE = requested();

type Rendered = { render: (props: { style?: unknown; maxFontSizeMultiplier?: number }, ref: unknown) => unknown };

if (HARNESS_FONT_SCALE !== 1) {
  PixelRatio.getFontScale = () => HARNESS_FONT_SCALE;
  const host = Text as unknown as Rendered;
  const original = host.render;
  host.render = (props, ref) => {
    const flat = StyleSheet.flatten(props.style as never) as Record<string, unknown> | undefined;
    const k = Math.min(HARNESS_FONT_SCALE, props.maxFontSizeMultiplier ?? HARNESS_FONT_SCALE);
    if (!flat || k === 1) return original(props, ref);
    const style = { ...flat };
    for (const key of ['fontSize', 'lineHeight', 'letterSpacing']) if (typeof style[key] === 'number') style[key] = (style[key] as number) * k;
    return original({ ...props, style }, ref);
  };
}
