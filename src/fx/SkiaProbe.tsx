import { Canvas, FractalNoise, Path, Rect, Shader, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font } from '../ui/tokens';
import { Glass, PhosphorText, usePersistence, hexToRgb } from './glass';

// P3-01 proof that Skia draws on both backends: a 1 px p1 graticule, a p4 trace, and a runtime
// shader that turns a seeded FractalNoise into signed grain (4%) tinted by the phosphor.
// Fully static: fixed seed, no time uniform, so the L2 golden is stable.

export const PROBE_W = 200;
export const PROBE_H = 120;
const GRAIN = 0.04;
const SEED = 417;

// FractalNoise sits near 0.5; centre it, stretch it to roughly -1..1, scale by `amount`.
// Positive grain adds phosphor light, negative grain darkens: premultiplied srcOver gives
// c + s * (tint - c) for s > 0 and c * (1 - |s|) for s < 0.
const GRAIN_SKSL = `
uniform shader noise;
uniform float amount;
uniform float3 tint;
half4 main(float2 xy) {
  half4 n = noise.eval(xy);
  float v = n.a > 0.0 ? n.r / n.a : 0.5;
  float s = clamp((v - 0.5) * 4.0, -1.0, 1.0) * amount;
  if (s >= 0.0) return half4(half3(tint) * s, s);
  return half4(0.0, 0.0, 0.0, -s);
}`;

function graticulePath() {
  const p = Skia.PathBuilder.Make();
  // Half-pixel offsets keep 1 px lines on whole device pixels at 1x.
  for (let x = 0; x <= PROBE_W; x += 20) {
    const px = Math.min(x, PROBE_W - 1) + 0.5;
    p.moveTo(px, 0);
    p.lineTo(px, PROBE_H);
  }
  for (let y = 0; y <= PROBE_H; y += 20) {
    const py = Math.min(y, PROBE_H - 1) + 0.5;
    p.moveTo(0, py);
    p.lineTo(PROBE_W, py);
  }
  return p.detach();
}

function tracePath() {
  const p = Skia.PathBuilder.Make();
  for (let x = 0; x <= PROBE_W; x += 2) {
    const t = x / PROBE_W;
    const y = PROBE_H / 2 - 28 * Math.sin(t * Math.PI * 3) * Math.exp(-1.6 * t) - 6 * Math.sin(t * Math.PI * 17);
    if (x === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  return p.detach();
}

function BaseProbe({ testID }: { testID: string }) {
  // Built on mount, not at module load: on web the Skia API exists only after CanvasKit loads.
  const { grid, trace, grain } = useMemo(
    () => ({ grid: graticulePath(), trace: tracePath(), grain: Skia.RuntimeEffect.Make(GRAIN_SKSL) }),
    [],
  );
  if (!grain) throw new Error('SkiaProbe: grain shader failed to compile');
  return (
    <View testID={testID} style={{ width: PROBE_W, height: PROBE_H }}>
      <Canvas style={{ width: PROBE_W, height: PROBE_H }}>
        <Rect x={0} y={0} width={PROBE_W} height={PROBE_H} color={color.n0} />
        <Path path={grid} color={color.p1} style="stroke" strokeWidth={1} />
        <Path path={trace} color={color.p4} style="stroke" strokeWidth={1.5} strokeJoin="round" strokeCap="round" />
        <Rect x={0} y={0} width={PROBE_W} height={PROBE_H}>
          <Shader source={grain} uniforms={{ amount: GRAIN, tint: hexToRgb(color.p4) }}>
            <FractalNoise freqX={0.9} freqY={0.9} octaves={2} seed={SEED} />
          </Shader>
        </Rect>
      </Canvas>
    </View>
  );
}

// ---------- P3-02 glass probes: /probe?layer=overlay|warp|phosphor ----------

export type ProbeLayer = 'base' | 'overlay' | 'warp' | 'phosphor';
export const GLASS_W = 362;
export const GLASS_H = 420;
const GLASS_SEED = 417;

// ?grainscale=1 renders grain at full resolution (perf comparison only; the default is 2).
function probeGrainScale(): 1 | 2 | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = new URLSearchParams(window.location?.search ?? '').get('grainscale');
  return v === '1' ? 1 : v === '2' ? 2 : undefined;
}

export function probeLayer(): ProbeLayer {
  if (typeof window === 'undefined') return 'base';
  const v = new URLSearchParams(window.location?.search ?? '').get('layer');
  return v === 'overlay' || v === 'warp' || v === 'phosphor' ? v : 'base';
}

// Plain RN content standing in for a screen: a p1 block near the glass edges (so the barrel
// bend shows on its straight sides) and p4 VT323 text.
function SampleScreen() {
  return (
    <View style={st.sample}>
      <View style={st.block} />
      <Text style={st.big}>072</Text>
      <Text style={st.small}>mG  FLUX</Text>
    </View>
  );
}

function PhosphorProbe() {
  // Settled state under ?static=1: only the live sample, no trail.
  const trail = usePersistence(0.4, { tau: 180 });
  return (
    <Canvas style={{ width: GLASS_W, height: GLASS_H }}>
      <Rect x={0} y={0} width={GLASS_W} height={GLASS_H} color={color.n0} />
      {trail.map((s, i) => (
        <Rect key={i} x={20 + s.value * 300} y={300} width={2} height={60} color={s.color} opacity={s.opacity} />
      ))}
      <PhosphorText text="072" x={GLASS_W / 2} y={200} size={120} align="center" />
    </Canvas>
  );
}

export function SkiaProbe({ testID = 'skia-probe', layer = probeLayer() }: { testID?: string; layer?: ProbeLayer }) {
  if (layer === 'base') return <BaseProbe testID={testID} />;
  const grainScale = probeGrainScale();
  return (
    <Glass testID={testID} warp={layer === 'warp'} warmUp={layer !== 'warp'} seed={GLASS_SEED} grainScale={grainScale} style={st.window}>
      {layer === 'phosphor' ? <PhosphorProbe /> : <SampleScreen />}
    </Glass>
  );
}

const st = StyleSheet.create({
  window: { width: GLASS_W, height: GLASS_H, backgroundColor: color.n0 },
  sample: { width: GLASS_W, height: GLASS_H, backgroundColor: color.n0 },
  block: { position: 'absolute', left: 8, top: 8, width: GLASS_W - 16, height: 190, backgroundColor: color.p1 },
  big: { position: 'absolute', left: 0, right: 0, top: 220, textAlign: 'center', fontFamily: font.readout, fontSize: 120, lineHeight: 120, color: color.p4 },
  small: { position: 'absolute', left: 0, right: 0, top: 350, textAlign: 'center', fontFamily: font.readout, fontSize: 28, color: color.p4 },
});
