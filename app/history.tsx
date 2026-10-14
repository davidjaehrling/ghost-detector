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
  fullMoonsLogged,
  groupByTag,
  moonTable,
  recordLine,
  stamp,
  tagLabel,
} from '../src/state/log';
import { relayOn } from '../src/state/relay';
import { useRelay } from '../src/state/useRelay';
import { listScans, nightsLogged, type ScanRecord } from '../src/state/scans';
import { sound } from '../src/ui/audio';
import { readHarness } from '../src/ui/harness';
import { isDemoLog, seedDemoLog } from '../src/ui/log/demo';
import { Placeholder } from '../src/ui/screens/Placeholder';
import { color, type } from '../src/ui/tokens';

// The investigation log (docs/p6-brief.md section 3): cases grouped by location tag, a record row per
// tag, the nights logged. A reading surface only: no DEEP SCAN key here, no streaks, no countdowns.
const copy = {
  code: 'MODE 4 · HISTORY',
  empty: 'No cases logged. Run CAPTURE on the viewfinder.',
  next: 'SETUP',
  nextLabel: 'Open settings',
  nights: 'NIGHTS LOGGED',
  best: 'BEST ON FILE',
  emptyKey: 'Open viewfinder',
  emptyLegend: 'VIEW FINDER',
  catalogue: 'CATALOGUE',
  moon: 'MOON TABLE',
  moons: 'FULL MOONS LOGGED',
  relay: 'FIELD LOG RELAY',
};

const tierWord = (r: ScanRecord) => r.outcome.tier.toUpperCase();
// CRITICAL is red wherever a tier word shows, as on the result card.
const tierStyle = (r: ScanRecord) => (r.outcome.tier === 'critical' ? s.crit : null);
// The harness pins the clock so the moon table is the same on every run.
const HARNESS_NOW = new Date(2026, 9, 13, 12, 0).getTime();
const tagWord = tagLabel;
const casesWord = casesLabel;

export default function History() {
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
  const moons = fullMoonsLogged(records);
  const [nowMs] = useState(() => (readHarness().isStatic ? HARNESS_NOW : Date.now()));
  const table = moonTable(nowMs);
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
        readout={empty ? copy.empty : undefined}
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
        <View style={[s.list, records.length === 0 && s.listEmpty]} testID="history-list-box">
          {nights > 0 || best ? (
            <View style={s.head} testID="history-head">
              {nights > 0 ? <Text style={s.nights} testID="history-nights">{`${copy.nights} ${nights}`}</Text> : null}
              {best ? (
                <Text style={s.best} testID="history-best">
                  {`${copy.best} ${best.outcome.spi} `}
                  <Text style={tierStyle(best)}>{tierWord(best)}</Text>
                </Text>
              ) : null}
            </View>
          ) : null}
          <ScrollView testID="history-list" style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {groups.map((g) => (
              <View key={g.tag} testID={`history-group-${g.tag}`} style={s.group}>
                <View style={s.tagRow} testID={`history-tag-${g.tag}`} accessible accessibilityLabel={recordLine(g.tag, g.count, g.peak)}>
                  <Text style={s.tagName}>{`${tagWord(g.tag)} · ${casesWord(g.count)}`}</Text>
                  <Text style={s.tagPeak}>
                    {`PEAK ${g.peak.outcome.spi} `}
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
                      accessibilityLabel={`Case ${r.id}, ${r.outcome.spi} ${tierWord(r)}${status === null ? '' : `, ${status}`}`}
                      onPress={() =>
                        router.push({
                          pathname: '/result/[id]',
                          params: { id: r.id },
                        })
                      }
                      hitSlop={{ top: 4, bottom: 4 }}
                      style={s.row}
                    >
                      <Text style={s.rowMain}>
                        {`${r.id} · ${r.outcome.spi} `}
                        <Text style={tierStyle(r)}>{tierWord(r)}</Text>
                        {` · ${clock(r.createdAt)}`}
                      </Text>
                      {status === null ? null : <Text style={[s.rowOpen, r.declined && s.archived]}>{status}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={s.group} testID="history-catalogue">
              <Text style={s.section} testID="history-catalogue-head">{`${copy.catalogue} ${cat.count}/${cat.total}`}</Text>
              {cat.rows.map((c) => (
                <View key={c.cls} style={s.catRow} testID={`history-cat-${c.cls}`}>
                  <Text style={c.last ? s.catOn : s.catOff}>{`${c.prefix} ${c.cls}`}</Text>
                  <Text style={c.last ? s.catOn : s.catOff}>{c.last ? `LOGGED · ${c.last.id}` : 'UNLOGGED'}</Text>
                </View>
              ))}
            </View>
            <View style={s.group} testID="history-moon">
              <Text style={s.section}>{copy.moon}</Text>
              {table.map((n) => (
                <View key={n.date} style={s.catRow} testID={`history-moon-${n.date}`}>
                  <Text style={s.catOn}>{n.date}</Text>
                  <Text style={s.catOn}>{`MOON ${n.moonPct}% · IDX ${n.index}/5`}</Text>
                </View>
              ))}
              <Text style={s.moons} testID="history-moons">{`${copy.moons} ${moons}`}</Text>
            </View>
            <Pressable
              testID="history-relay"
              accessibilityRole="button"
              accessibilityLabel={`${copy.relay} ${relay ? 'on' : 'off'}. Open settings`}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => router.push('/settings')}
              style={[s.row, s.relayRow]}
            >
              <Text style={s.catOff}>{`${copy.relay}: ${relay ? 'ON' : 'OFF'}`}</Text>
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
  listEmpty: { bottom: 130 },
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
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.p1,
  },
  rowMain: { ...type.rdS, color: color.p4 },
  rowOpen: { ...type.rdXS, color: color.p4, marginLeft: 'auto' },
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
