import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdBanner } from '../src/ads/Banner';
import { bestOnFile, casesLabel, caseStatus, groupByTag, recordLine, stamp, tagLabel } from '../src/state/log';
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
  empty: 'No cases logged.',
  next: 'SETUP',
  nextLabel: 'Open settings',
  nights: 'NIGHTS LOGGED',
  best: 'BEST ON FILE',
};

const tierWord = (r: ScanRecord) => r.outcome.tier.toUpperCase();
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
  // Nothing plays here; a scene left running from the result ends.
  useEffect(() => sound.stop(), []);
  // The one banner in the app sits in a fixed slot under the key band, 24 dp clear of every control.
  return (
    <View style={s.root}>
      <Placeholder
        testID="screen-history"
        code={copy.code}
        readout={records.length === 0 ? copy.empty : undefined}
        keys={[{ testID: 'key-forward', label: copy.nextLabel, legend: copy.next, onPress: () => router.push('/settings') }]}
      >
        <View style={[s.list, records.length === 0 && s.listEmpty]} testID="history-list-box">
          <View style={s.head} testID="history-head">
            <Text style={s.nights} testID="history-nights">{`${copy.nights} ${nights}`}</Text>
            {best ? (
              <Text style={s.best} testID="history-best">{`${copy.best} ${best.outcome.spi} ${tierWord(best)}`}</Text>
            ) : null}
          </View>
          <ScrollView testID="history-list" style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {groups.map((g) => (
              <View key={g.tag} testID={`history-group-${g.tag}`} style={s.group}>
                <View style={s.tagRow} testID={`history-tag-${g.tag}`} accessible accessibilityLabel={recordLine(g.tag, g.count, g.peak)}>
                  <Text style={s.tagName}>{`${tagWord(g.tag)} · ${casesWord(g.count)}`}</Text>
                  <Text style={s.tagPeak}>{`PEAK ${g.peak.outcome.spi} ${tierWord(g.peak)} · ${stamp(g.peak.createdAt)}`}</Text>
                </View>
                {g.cases.map((r) => {
                  const status = caseStatus(r);
                  return (
                    <Pressable
                      key={r.id}
                      testID={`history-row-${r.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Case ${r.id}, ${r.outcome.spi} ${tierWord(r)}${status === null ? '' : `, ${status}`}`}
                      onPress={() => router.push({ pathname: '/result/[id]', params: { id: r.id } })}
                      style={s.row}
                    >
                      <Text style={s.rowMain}>{`${r.id} · ${r.outcome.spi} ${tierWord(r)}`}</Text>
                      {status === null ? null : <Text style={s.rowOpen}>{status}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            ))}
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
  list: { position: 'absolute', left: 12, right: 12, top: 10, bottom: 52 },
  listEmpty: { bottom: 'auto' },
  head: { paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: color.p1 },
  nights: { ...type.rdM, color: color.p4 },
  best: { ...type.rdXS, color: color.p3 },
  scroll: { flex: 1 },
  content: { paddingBottom: 4 },
  group: { marginTop: 10 },
  tagRow: { paddingBottom: 2 },
  tagName: { ...type.rdS, color: color.p5 },
  tagPeak: { ...type.rdXS, color: color.p3 },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.p1,
  },
  rowMain: { ...type.rdS, color: color.p4 },
  rowOpen: { ...type.rdXS, color: color.p4 },
});
