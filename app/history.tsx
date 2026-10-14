import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdBanner } from '../src/ads/Banner';
import { formatWindowShort } from '../src/ui/boot/activity';
import {
  bestOnFile,
  casesLabel,
  caseStatus,
  catalogue,
  clock,
  groupByTag,
  moonTable,
  nextFullMoon,
  recordLine,
  stamp,
  tagLabel,
} from '../src/state/log';
import { tierWord as tierWordOf } from '../src/state/tierWord';
import { relayOn } from '../src/state/relay';
import { useRelay } from '../src/state/useRelay';
import { listScans, moonsLogged, nightsLogged, type ScanRecord } from '../src/state/scans';
import { sound } from '../src/ui/audio';
import { readHarness } from '../src/ui/harness';
import { isDemoLog, seedDemoLog } from '../src/ui/log/demo';
import { faultArmed } from '../src/state/faults';
import { Placeholder } from '../src/ui/screens/Placeholder';
import { color, type } from '../src/ui/tokens';
import { openViewfinder } from '../src/ui/log/nav';
import { copyOf, t, useLocale } from '../src/i18n';

// The investigation log (docs/p6-brief.md section 3): cases grouped by location tag, a record row per
// tag, the nights logged. A reading surface only: no DEEP SCAN key here, no streaks, no countdowns.
const copy = copyOf({
  code: 'history.code',
  empty: 'history.empty',
  next: 'history.next',
  nextLabel: 'history.nextLabel',
  emptyKey: 'history.emptyKey',
  emptyLegend: 'history.emptyLegend',
  moon: 'history.moon',
});

const tierWord = (r: ScanRecord) => tierWordOf(r.outcome.tier);
// CRITICAL is red wherever a tier word shows, as on the result card.
const tierStyle = (r: ScanRecord) => (r.outcome.tier === 'critical' ? s.crit : null);
// The harness pins the clock so the moon table is the same on every run.
const HARNESS_NOW = new Date(2026, 9, 13, 12, 0).getTime();
const tagWord = tagLabel;
// Column gaps are two spaces (A-05). Non-breaking, so a nested Text on web does not collapse them.
const NB = '\u00A0';
const gap = (text: string) => text.replace(/ {2,}/g, (m) => NB.repeat(m.length));
const casesWord = casesLabel;

export default function History() {
  // Harness: ?fault=render stops this screen until RESET (web only; native never arms it).
  if (faultArmed('render')) throw new Error('E-60 injected render fault');
  useLocale();
  const router = useRouter();
  // Harness: ?static=1&log=demo3 seeds three tags before the first read.
  const [records] = useState(() => {
    if (readHarness().isStatic && isDemoLog(window.location?.search ?? '')) seedDemoLog();
    return listScans();
  });
  const groups = groupByTag(records);
  const best = bestOnFile(records);
  const nights = nightsLogged();
  const cat = catalogue(records);
  const moons = moonsLogged();
  const [nowMs] = useState(() => (readHarness().isStatic ? HARNESS_NOW : Date.now()));
  const table = moonTable(nowMs);
  const nextMoon = nextFullMoon(nowMs);
  const relay = relayOn(useRelay());
  const empty = records.length === 0;
  // Nothing plays here; a scene left running from the result ends.
  useEffect(() => sound.stop(), []);
  // The scroll viewport is a whole number of 22 dp rows tall, so no row is cut at the foot of the glass.
  const [boxH, setBoxH] = useState(0);
  const headRows = (best ? 1 : 0) + (best ? 1 : 0) + (nights > 0 ? 1 : 0);
  const scrollH = boxH > 0 ? Math.max(PITCH * 2, Math.floor((boxH - headRows * PITCH) / PITCH) * PITCH) : undefined;
  // The one banner in the app sits in a fixed slot between the window and the key row, 32 dp or more
  // clear of every row and key. The window gives up the height.
  return (
    <>
      <Placeholder
        testID="screen-history"
        code={copy.code}
        graticule={false}
        slot={<AdBanner />}
        keys={[
          // Plain navigation back to the finder, in slot 1 whether or not the log is empty. It is never
          // an interstitial break: only the explicit return from a result is (src/ui/interstitial.ts).
          { testID: 'key-viewfinder', label: copy.emptyKey, legend: copy.emptyLegend, onPress: () => openViewfinder(router) },
          null,
          null,
          {
            testID: 'key-forward',
            label: copy.nextLabel,
            legend: copy.next,
            onPress: () => router.push('/settings'),
          },
        ]}
      >
        <View style={s.list} testID="history-list-box" onLayout={(e: LayoutChangeEvent) => setBoxH(Math.round(e.nativeEvent.layout.height))}>
          {headRows > 0 ? (
            <View style={[s.head, { height: headRows * PITCH }]} testID="history-head">
              {best ? (
                <Text style={s.best} testID="history-best">
                  {t('history.bestLine', { spi: best.outcome.spi })}
                  <Text style={tierStyle(best)}>{tierWord(best)}</Text>
                </Text>
              ) : null}
              {best ? <Text style={s.nights} testID="history-catalogue-line">{t('history.catalogueHead', { count: cat.count, total: cat.total })}</Text> : null}
              {nights > 0 ? <Text style={s.nights} testID="history-nights">{t('history.nightsLine', { n: nights })}</Text> : null}
            </View>
          ) : null}
          <ScrollView testID="history-list" style={[s.scroll, scrollH ? { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height: scrollH } : null]} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {empty ? (
              <Text style={s.empty} testID="history-empty" accessibilityLabel={copy.empty}>
                {copy.empty}
              </Text>
            ) : null}
            {groups.map((g, gi) => (
              <View key={g.tag} testID={`history-group-${g.tag}`} style={gi > 0 ? s.group : null}>
                <View style={s.tagRow} testID={`history-tag-${g.tag}`} accessible accessibilityLabel={recordLine(g.tag, g.count, g.peak)}>
                  <Text style={s.tagName}>{gap(`${tagWord(g.tag)}  ${casesWord(g.count)}`)}</Text>
                  <Text style={s.tagPeak}>
                    {t('history.peak', { spi: g.peak.outcome.spi })}
                    <Text style={tierStyle(g.peak)}>{tierWord(g.peak)}</Text>
                    {gap(`  ${stamp(g.peak.createdAt)}`)}
                  </Text>
                </View>
                {g.cases.map((r) => {
                  const status = caseStatus(r);
                  return (
                    <Pressable
                      key={r.id}
                      testID={`history-row-${r.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={status === null ? t('history.rowLabel', { id: r.id, spi: r.outcome.spi, tier: tierWord(r) }) : t('history.rowLabelStatus', { id: r.id, spi: r.outcome.spi, tier: tierWord(r), status })}
                      onPress={() =>
                        router.push({
                          pathname: '/result/[id]',
                          params: { id: r.id },
                        })
                      }
                      style={s.row}
                    >
                      <View style={s.rowText}>
                        <Text style={s.rowMain} numberOfLines={1}>
                          {gap(`${r.id}  ${r.outcome.spi} `)}
                          <Text style={tierStyle(r)}>{tierWord(r)}</Text>
                        </Text>
                        <Text style={s.rowClock} numberOfLines={1}>
                          {clock(r.createdAt)}
                        </Text>
                      </View>
                      {status === null ? null : (
                        <Text style={[s.rowOpen, r.declined && s.archived]} numberOfLines={1}>
                          {status}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={s.group} testID="history-catalogue">
              <Text style={s.section} testID="history-catalogue-head">{t('history.catalogueHead', { count: cat.count, total: cat.total })}</Text>
              {(empty ? [] : cat.rows).map((c) => (
                <View key={c.cls} style={s.catRow} testID={`history-cat-${c.cls}`}>
                  <Text style={c.last ? s.catOn : s.catOff}>{`${c.prefix} ${c.cls}`}</Text>
                  <Text style={c.last ? s.catOn : s.catOff}>{c.last ? gap(t('history.logged', { id: c.last.id })) : t('history.unlogged')}</Text>
                </View>
              ))}
            </View>
            <View style={s.group} testID="history-moon">
              <Text style={s.section}>{copy.moon}</Text>
              <Text style={s.moons} testID="history-next-moon">{t('history.nextMoonLine', { date: nextMoon })}</Text>
              <View style={s.catRow}>
                <Text style={s.catOff}>{t('history.date')}</Text>
                <Text style={s.catOff}>{t('history.moonHead')}</Text>
              </View>
              {table.map((n) => (
                <View key={n.date} style={s.catRow} testID={`history-moon-${n.date}`}>
                  <Text style={n.date === nextMoon ? s.catOn : s.catOff}>{n.date}</Text>
                  <Text style={n.date === nextMoon ? s.catOn : s.catOff}>{`${n.moonPct}%`}</Text>
                </View>
              ))}
              {empty ? <Text style={s.moons} testID="history-window">{formatWindowShort(new Date(nowMs))}</Text> : null}
              {moons > 0 ? <Text style={s.moons} testID="history-moons">{t('history.moonsLine', { n: moons })}</Text> : null}
            </View>
            <Pressable
              testID="history-relay"
              accessibilityRole="button"
              accessibilityLabel={t(relay ? 'history.relayLabelOn' : 'history.relayLabelOff')}
              onPress={() => router.push('/settings')}
              style={[s.row, s.relayRow]}
            >
              <Text style={s.catOff}>{t(relay ? 'history.relayOn' : 'history.relayOff')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Placeholder>
    </>
  );
}

// One vertical pitch for the whole list: every row is a multiple of 22 dp, so the scroll viewport can
// end on a row edge.
const PITCH = 22;

const s = StyleSheet.create({
  // Leaves the screen code line free along the bottom of the glass.
  list: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 10,
    bottom: 52,
    backgroundColor: color.n0,
  },
  empty: { ...type.rdM, color: color.p4, paddingTop: 4 },
  head: { borderBottomWidth: 1, borderBottomColor: color.p1 },
  best: { ...type.rdS, height: PITCH, color: color.p4 },
  nights: { ...type.rdXS, lineHeight: PITCH, height: PITCH, color: color.p3 },
  scroll: { flex: 1 },
  content: { paddingBottom: 0 },
  group: { marginTop: PITCH },
  tagRow: { height: PITCH * 2 },
  tagName: { ...type.rdS, height: PITCH, color: color.p4 },
  tagPeak: { ...type.rdXS, lineHeight: PITCH, height: PITCH, color: color.p3 },
  row: {
    height: PITCH * 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.p1,
  },
  rowText: { flexShrink: 1 },
  rowMain: { ...type.rdS, height: 22, color: color.p4 },
  rowClock: { ...type.rdXS, lineHeight: 18, height: 18, color: color.p3 },
  // A fixed right column, so the status never wraps under the case at 360 dp.
  rowOpen: { ...type.rdXS, color: color.p4, width: 98, flexShrink: 0, textAlign: 'right' },
  archived: { color: color.p3 },
  crit: { color: color.red },
  section: {
    ...type.rdS,
    height: PITCH,
    color: color.p4,
    borderBottomWidth: 1,
    borderBottomColor: color.p1,
  },
  catRow: {
    height: PITCH,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catOn: { ...type.rdXS, color: color.p4 },
  catOff: { ...type.rdXS, color: color.p3 },
  moons: { ...type.rdXS, lineHeight: PITCH, height: PITCH, color: color.p4 },
  relayRow: { marginTop: PITCH },
});

export { RouteFault as ErrorBoundary } from '../src/ui/screens/FaultScreen';
