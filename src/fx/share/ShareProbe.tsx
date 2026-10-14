import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { isLang } from '../../i18n/core';
import { useSkiaReady } from '../useSkiaReady';
import { DEMO_CASES, demoRecord, isDemoName } from '../../ui/result/demo';
import { fixtureUri } from '../../ui/fixtures';
import { DEFAULT_FIXTURE, isFixtureName } from '../../ui/fixtureNames';
import { color } from '../../ui/tokens';
import { LAYOUTS, type CardFormat } from './constants';
import { renderShareCard } from './index';

// L2 harness for the share card (/share-probe?format=story|square&case=<demo>[-deep|-undecoded]&fixture=<f>&lang=en|de|es|pt).
// `-deep` marks the record Deep Scanned (EVP line); `-undecoded` (or no suffix) leaves it as captured
// (`SIGNATURE [n]% DECODED`). `lang` renders the card in that locale (default the locale in force).
// Renders through the public renderShareCard (web: data URL), scaled to fit.
export function ShareProbe({ format: f, kase, fixture, lang }: { format?: string; kase?: string; fixture?: string; lang?: string }) {
  const format: CardFormat = f === 'square' ? 'square' : 'story';
  const [name, suffix] = (kase ?? 'critical-deep').split('-');
  const deep = suffix === 'deep';
  const demo = isDemoName(name) ? name : 'critical';
  const fx = isFixtureName(fixture) ? fixture : DEFAULT_FIXTURE;
  const locale = isLang(lang) ? lang : undefined;
  const skia = useSkiaReady();
  const [uri, setUri] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!skia) return;
    const rec = demoRecord(demo, fixtureUri(fx), DEMO_CASES[demo], fx);
    if (deep) rec.deepScanAt = rec.createdAt;
    renderShareCard(rec, { format, locale }).then((c) => setUri(c.uri), (e: unknown) => setErr(String(e)));
  }, [skia, demo, deep, fx, format, locale]);

  const L = LAYOUTS[format];
  const w = 360;
  const h = Math.round((w * L.height) / L.width);
  const fit = h > 780 ? 780 / h : 1;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.n1 }}>
      <View testID={uri ? 'share-card' : undefined} style={{ width: w * fit, height: h * fit }}>
        {uri ? <Image source={{ uri }} style={{ width: w * fit, height: h * fit }} accessibilityLabel="Field card" /> : null}
      </View>
      {err ? <Text style={{ color: color.p5 }}>{err}</Text> : null}
    </View>
  );
}
