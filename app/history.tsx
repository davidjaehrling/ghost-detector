import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdBanner } from '../src/ads/Banner';
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
import { Placeholder } from '../src/ui/screens/Placeholder';
import { color, type } from '../src/ui/tokens';
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
const casesWord = casesLabel;

export default function History() {
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
  // The one banner in the app sits in a fixed slot under the key band, 24 dp clear of every control.
  return (
    <View style={s.root}>
      <Placeholder
        testID="screen-history"
        code={copy.code}
        graticule={false}
        keys={[
          ...(empty
            ? [
                {
                  testID: 'key-viewfinder',
                  label: copy.emptyKey,
                  legend: copy.emptyLegend,
                  onPress: () => router.replace('/viewfinder'),
                },
                null,
                null,
              ]
            : []),
          {
            testID: 'key-forward',
            label: copy.nextLabel,
            legend: copy.next,
            onPress: () => router.push('/settings'),
          },
        ]}
      >
        <View style={s.list} testID="history-list-box">
          {nights > 0 || best ? (
            <View style={s.head} testID="history-head">
              {nights > 0 ? <Text style={s.nights} testID="history-nights">{t('history.nightsLine', { n: nights })}</Text> : null}
              {best ? (
                <Text style={s.best} testID="history-best">
                  {t('history.bestLine', { spi: best.outcome.spi })}
                  <Text style={tierStyle(best)}>{tierWord(best)}</Text>
                </Text>
              ) : null}
            </View>
          ) : null}
          <ScrollView testID="history-list" style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {empty ? (
              <Text style={s.empty} testID="history-empty" accessibilityLabel={copy.empty}>
                {copy.empty}
              </Text>
            ) : null}
            {groups.map((g) => (
              <View key={g.tag} testID={`history-group-${g.tag}`} style={s.group}>
                <View style={s.tagRow} testID={`history-tag-${g.tag}`} accessible accessibilityLabel={recordLine(g.tag, g.count, g.peak)}>
                  <Text style={s.tagName}>{`${tagWord(g.tag)} · ${casesWord(g.count)}`}</Text>
                  <Text style={s.tagPeak}>
                    {t('history.peak', { spi: g.peak.outcome.spi })}
                    <Text style={tierStyle(g.peak)}>{tierWord(g.peak)}</Text>
                    {` · ${stamp(g.peak.createdAt)}`}
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
                      hitSlop={{ top: 4, bottom: 4 }}
                      style={s.row}
                    >
                      <Text style={s.rowMain} numberOfLines={1}>
                        {`${r.id} · ${r.outcome.spi} `}
                        <Text style={tierStyle(r)}>{tierWord(r)}</Text>
                        <Text style={s.rowClock}>{` ${clock(r.createdAt)}`}</Text>
                      </Text>
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
                  <Text style={c.last ? s.catOn : s.catOff}>{c.last ? t('history.logged', { id: c.last.id }) : t('history.unlogged')}</Text>
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
                  <Text style={s.catOn}>{n.date}</Text>
                  <Text style={s.catOn}>{`${n.moonPct}% · ${n.index}/5`}</Text>
                </View>
              ))}
              {moons > 0 ? <Text style={s.moons} testID="history-moons">{t('history.moonsLine', { n: moons })}</Text> : null}
            </View>
            <Pressable
              testID="history-relay"
              accessibilityRole="button"
              accessibilityLabel={t(relay ? 'history.relayLabelOn' : 'history.relayLabelOff')}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => router.push('/settings')}
              style={[s.row, s.relayRow]}
            >
              <Text style={s.catOff}>{t(relay ? 'history.relayOn' : 'history.relayOff')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Placeholder>
      <AdBanner />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.n3 },
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
  head: { paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: color.p1 },
  nights: { ...type.rdM, color: color.p4 },
  best: { ...type.rdXS, color: color.p3 },
  scroll: { flex: 1 },
  content: { paddingBottom: 4 },
  group: { marginTop: 10 },
  tagRow: { paddingBottom: 2 },
  tagName: { ...type.rdS, color: color.p4 },
  tagPeak: { ...type.rdXS, color: color.p3 },
  row: {
    minHeight: 36,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.p1,
  },
  rowMain: { ...type.rdS, color: color.p4, flexShrink: 1 },
  rowClock: { ...type.rdXS, color: color.p3 },
  // A fixed right column, so the status never wraps under the case at 360 dp.
  rowOpen: { ...type.rdXS, color: color.p4, width: 98, flexShrink: 0, textAlign: 'right' },
  archived: { color: color.p3 },
  crit: { color: color.red },
  section: {
    ...type.rdS,
    color: color.p4,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: color.p1,
  },
  catRow: {
    minHeight: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catOn: { ...type.rdXS, color: color.p4 },
  catOff: { ...type.rdXS, color: color.p3 },
  moons: { ...type.rdXS, color: color.p4, marginTop: 4 },
  relayRow: { marginTop: 10 },
});
