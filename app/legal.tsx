import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IMPRESSUM_URL, PRIVACY_POLICY_URL } from '../src/ui/legal';
import { Placeholder } from '../src/ui/screens/Placeholder';
import { color, type } from '../src/ui/tokens';
import { copyOf, useLocale } from '../src/i18n';

const copy = copyOf({
  code: 'legal.code',
  next: 'legal.next',
  nextLabel: 'legal.nextLabel',
  open: 'legal.open',
  impressum: 'legal.impressum',
  privacy: 'legal.privacy',
  about: 'about.line',
});

export default function Legal() {
  useLocale();
  const router = useRouter();
  const rows = [
    { id: 'impressum', label: copy.impressum, url: IMPRESSUM_URL },
    { id: 'privacy-policy', label: copy.privacy, url: PRIVACY_POLICY_URL },
  ];
  return (
    <Placeholder
      testID="screen-legal"
      code={copy.code}
      keys={[{ testID: 'key-forward', label: copy.nextLabel, legend: copy.next, onPress: () => router.back() }]}
    >
      <View style={s.list} testID="legal-list">
        {rows.map((r) => (
          <Pressable
            key={r.id}
            testID={`legal-${r.id}`}
            accessibilityRole="link"
            accessibilityLabel={r.label}
            onPress={() => void Linking.openURL(r.url).catch(() => undefined)}
            style={s.row}
          >
            <Text style={s.label}>{r.label}</Text>
            <Text style={s.state}>{copy.open}</Text>
          </Pressable>
        ))}
        <Text style={s.about} testID="legal-about">
          {copy.about}
        </Text>
      </View>
    </Placeholder>
  );
}

const s = StyleSheet.create({
  list: { position: 'absolute', left: 12, right: 12, top: 12, backgroundColor: color.n0, paddingHorizontal: 4 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: color.p1,
  },
  label: { ...type.rdM, color: color.p3 },
  state: { ...type.rdM, color: color.p2 },
  about: { ...type.rdXS, color: color.p3, marginTop: 12 },
});

export { RouteFault as ErrorBoundary } from '../src/ui/screens/FaultScreen';
