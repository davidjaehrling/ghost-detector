import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { TIERS, type Tier } from '../src/engine';
import { buildThermalField, lumaFromImage, ThermalView, type ThermalSource } from '../src/fx/thermal';
import { makeLutEffect, renderThermalImage } from '../src/fx/thermal/render';
import { DEFAULT_FIXTURE } from '../src/ui/fixtureNames';
import { fixtureUri } from '../src/ui/fixtures';
import { readHarness } from '../src/ui/harness';
import { color, type } from '../src/ui/tokens';

// Hidden L2 harness route, nothing links here:
//   /thermal-probe?static=1&fixture=<name>&tier=<tier>[&bench=1]
// Renders the fixture's thermal field in the result screen's 318 x 303 photo panel.
// bench=1 times the field build and the offscreen pass and prints the numbers.

const PANEL_W = 318;
const PANEL_H = 303;
const SEED = 0x7e41a3;

function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && (TIERS as readonly string[]).includes(v);
}

function bench(src: ThermalSource, tier: Tier): string {
  const effect = makeLutEffect();
  const n = 60;
  let t0 = performance.now();
  let field = buildThermalField(src.grid, src.region, { seed: SEED, tier });
  for (let i = 1; i < n; i++) field = buildThermalField(src.grid, src.region, { seed: SEED + i, tier });
  const buildMs = (performance.now() - t0) / n;
  t0 = performance.now();
  for (let i = 1; i <= n; i++) renderThermalImage(field, effect, i)?.dispose();
  const renderMs = (performance.now() - t0) / n;
  return `build ${buildMs.toFixed(2)} ms  pass ${renderMs.toFixed(2)} ms`;
}

export default function ThermalProbe() {
  const params = useLocalSearchParams<{ tier?: string; bench?: string }>();
  const harness = readHarness();
  const fixture = harness.fixture ?? DEFAULT_FIXTURE;
  const tier: Tier = isTier(params.tier) ? params.tier : 'critical';
  const [src, setSrc] = useState<ThermalSource | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    lumaFromImage(fixtureUri(fixture)).then((r) => alive && setSrc(r));
    return () => {
      alive = false;
    };
  }, [fixture]);

  const field = useMemo(() => (src ? buildThermalField(src.grid, src.region, { seed: SEED, tier }) : null), [src, tier]);
  const stats = useMemo(() => (src && params.bench === '1' ? bench(src, tier) : null), [src, tier, params.bench]);

  return (
    <View style={{ flex: 1, alignItems: 'center', paddingTop: 120, backgroundColor: color.n3 }}>
      {field ? <ThermalView field={field} width={PANEL_W} height={PANEL_H} static={harness.isStatic} /> : null}
      {src === null ? <Text style={[type.lbS, { color: color.p3 }]}>NO IMAGE</Text> : null}
      {stats ? (
        <Text testID="thermal-bench" style={[type.lbS, { color: color.p3, marginTop: 8 }]}>
          {stats}
        </Text>
      ) : null}
    </View>
  );
}
