import { Blur, Group, Paint, Text, useFont, type SkFont } from '@shopify/react-native-skia';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fx } from '../../ui/tokens';
import { PHOSPHOR, type PhosphorStep } from './color';
import { effectiveTau, trailLifetime, trailStyle } from './persistence';
import { useStaticDefault } from './useGlassClock';

// VT323 from the bundled Google Fonts TTF (the same file expo-font loads for RN text).
const VT323_TTF = require('@expo-google-fonts/vt323/400Regular/VT323_400Regular.ttf');

export const TAU = { trace: fx.tauTrace, sweep: fx.tauSweep } as const;

export type TrailSample<T> = { value: T; step: PhosphorStep; color: string; opacity: number };

type Stamp<T> = { value: T; t: number };

// Keeps the recent values of a moving element and returns the decayed trail, oldest first,
// ending with the live sample. Re-renders on every animation frame while a trail is visible.
// `static` (or the harness flag) returns only the live sample: the settled state.
export function usePersistence<T>(
  value: T,
  { tau = TAU.trace, step = 4, static: isStaticProp, reduceMotion = false }: { tau?: number; step?: PhosphorStep; static?: boolean; reduceMotion?: boolean } = {},
): TrailSample<T>[] {
  const isStatic = useStaticDefault(isStaticProp);
  const t = effectiveTau(tau, reduceMotion);
  const life = trailLifetime(step, t);
  // History lives in a ref the frame loop mutates; render reads the copy in state.
  const hist = useRef<Stamp<T>[]>([]);
  const [snap, setSnap] = useState<{ list: Stamp<T>[]; now: number }>({ list: [], now: 0 });

  useEffect(() => {
    if (isStatic) return;
    let raf = 0;
    const frame = () => {
      const n = Date.now();
      const list = hist.current;
      const last = list[list.length - 1];
      if (!last || !Object.is(last.value, value)) list.push({ value, t: n });
      // Keep the live sample; drop history older than the trail's lifetime.
      while (list.length > 1 && n - list[1]!.t > life) list.shift();
      setSnap({ list: list.slice(), now: n });
      if (list.length > 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, isStatic, life]);

  if (isStatic) return [{ value, step, color: PHOSPHOR[step], opacity: 1 }];
  const { list, now } = snap;
  const out: TrailSample<T>[] = [];
  // A sample's age counts from when the next value replaced it. Until the frame loop stamps a
  // new live value, the last stamped one counts as replaced just now (age 0).
  const pending = list.length > 0 && !Object.is(list[list.length - 1]!.value, value);
  const n = pending ? list.length : list.length - 1;
  for (let i = 0; i < n; i++) {
    const next = i + 1 < list.length ? list[i + 1]!.t : now;
    const s = trailStyle(step, now - next, t);
    if (s) out.push({ value: list[i]!.value, step: s.step, color: PHOSPHOR[s.step], opacity: s.opacity });
  }
  out.push({ value, step, color: PHOSPHOR[step], opacity: 1 });
  return out;
}

// Bloom: the children once as they are, then again blurred and added (Plus) at low alpha.
// Use it around Skia content on the glass (traces, needle, readouts). Bloom is part of the
// settled look, so it renders the same with or without `static`.
export function Bloom({ children, radius = 4, strength = 0.35, enabled = true }: { children: ReactNode; radius?: number; strength?: number; enabled?: boolean }) {
  if (!enabled || strength <= 0) return <Group>{children}</Group>;
  return (
    <Group>
      {children}
      <Group
        layer={
          <Paint blendMode="plus" opacity={strength}>
            <Blur blur={radius} mode="decal" />
          </Paint>
        }
      >
        {children}
      </Group>
    </Group>
  );
}

export function useVT323(size: number): SkFont | null {
  return useFont(VT323_TTF, size);
}

export type PhosphorTextProps = {
  text: string;
  x: number;
  // Baseline.
  y: number;
  size?: number;
  step?: PhosphorStep;
  align?: 'left' | 'center' | 'right';
  bloom?: boolean;
  // Bible §6: on a change the old glyphs linger at p1 for 90 ms under the new ones.
  lingerMs?: number;
  static?: boolean;
  reduceMotion?: boolean;
};

const LINGER_MS = 90;

function alignedX(font: SkFont, text: string, x: number, align: PhosphorTextProps['align']): number {
  if (align === 'left') return x;
  const w = font.measureText(text).width;
  return align === 'center' ? x - w / 2 : x - w;
}

// VT323 drawn in Skia with bloom and the digit-change linger. Draw nothing until the font
// has loaded (one frame on native, a fetch on web).
export function PhosphorText({ text, x, y, size = 72, step = 4, align = 'left', bloom = true, lingerMs = LINGER_MS, static: isStaticProp, reduceMotion = false }: PhosphorTextProps) {
  const isStatic = useStaticDefault(isStaticProp);
  const font = useVT323(size);
  const [ghost, setGhost] = useState<string | null>(null);
  const prev = useRef(text);
  useEffect(() => {
    if (prev.current === text) return;
    const old = prev.current;
    prev.current = text;
    if (isStatic || reduceMotion || lingerMs <= 0) return;
    setGhost(old);
    const id = setTimeout(() => setGhost(null), lingerMs);
    return () => clearTimeout(id);
  }, [text, isStatic, reduceMotion, lingerMs]);
  if (!font) return null;
  return (
    <Group>
      {ghost !== null ? <Text font={font} text={ghost} x={alignedX(font, ghost, x, align)} y={y} color={PHOSPHOR[1]} /> : null}
      <Bloom enabled={bloom} radius={Math.max(2, size / 18)}>
        <Text font={font} text={text} x={alignedX(font, text, x, align)} y={y} color={PHOSPHOR[step]} />
      </Bloom>
    </Group>
  );
}
