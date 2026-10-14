import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { showPrivacyOptions } from '../src/ads';
import { notifyBackend } from '../src/state/notifyBackend';
import { refreshRelay, relayCopy, relayOn, relayStore, toggleRelay } from '../src/state/relay';
import { useRelay } from '../src/state/useRelay';
import { CALM_LINE, setHaptics, setJumpScares, setSound } from '../src/state/settings';
import { useConsent } from '../src/state/useConsent';
import { useSettings } from '../src/state/useSettings';
import { sound } from '../src/ui/audio';
import { Placeholder } from '../src/ui/screens/Placeholder';
import { color, type } from '../src/ui/tokens';

const copy = {
  code: 'MODE 5 · SETTINGS',
  next: 'BACK',
  nextLabel: 'Back to history',
  sound: 'SOUND',
  haptics: 'HAPTICS',
  scares: 'JUMP SCARES',
  on: 'ON',
  off: 'OFF',
  privacy: 'PRIVACY',
  legal: 'LEGAL',
  open: 'OPEN',
  about: 'READINGS ARE SIMULATED. FIELD INSTRUMENT FICTION.',
};

export default function Settings() {
  const router = useRouter();
  const settings = useSettings();
  const consent = useConsent();
  const relay = useRelay();
  const [calmNote, setCalmNote] = useState(false);
  // Nothing plays on this screen; a scene left running from the result ends here.
  useEffect(() => sound.stop(), []);
  // The system permission may have changed in system settings since the last visit.
  useEffect(() => {
    void refreshRelay(relayStore, notifyBackend).catch(() => {});
  }, []);

  const rows = [
    { id: 'sound', label: copy.sound, on: settings.sound, toggle: () => setSound(!settings.sound) },
    { id: 'haptics', label: copy.haptics, on: settings.haptics, toggle: () => setHaptics(!settings.haptics) },
    {
      id: 'jumpscares',
      label: copy.scares,
      on: settings.jumpScares,
      // On Calm the switch springs back to OFF and the instrument says why (sound palette section 6).
      toggle: () => setCalmNote(!setJumpScares(!settings.jumpScares) && !settings.jumpScares),
    },
    // Off by default; on only with the notification permission granted. After a system denial the
    // row opens the system notification settings instead of asking again.
    { id: 'relay', label: relayCopy.settingsLabel, on: relayOn(relay), toggle: () => void toggleRelay(relayStore, notifyBackend).catch(() => {}) },
  ];

  return (
    <Placeholder
      testID="screen-settings"
      code={copy.code}
      keys={[{ testID: 'key-forward', label: copy.nextLabel, legend: copy.next, onPress: () => router.back() }]}
    >
      <View style={s.list} testID="settings-list">
        {rows.map((r) => (
          <Pressable
            key={r.id}
            testID={`setting-${r.id}`}
            accessibilityRole="switch"
            accessibilityLabel={r.label}
            accessibilityState={{ checked: r.on }}
            onPress={r.toggle}
            style={s.row}
          >
            <Text style={s.label}>{r.label}</Text>
            <Text style={[s.state, r.on && s.stateOn]} testID={`setting-${r.id}-state`}>
              {r.on ? copy.on : copy.off}
            </Text>
          </Pressable>
        ))}
        {consent.privacyOptionsRequired ? (
          <Pressable
            testID="setting-privacy"
            accessibilityRole="button"
            accessibilityLabel={copy.privacy}
            onPress={() => void showPrivacyOptions()}
            style={s.row}
          >
            <Text style={s.label}>{copy.privacy}</Text>
            <Text style={s.state}>{copy.open}</Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="setting-legal"
          accessibilityRole="button"
          accessibilityLabel={copy.legal}
          onPress={() => router.push('/legal')}
          style={s.row}
        >
          <Text style={s.label}>{copy.legal}</Text>
          <Text style={s.state}>{copy.open}</Text>
        </Pressable>
        <Text style={s.about} testID="settings-about">
          {copy.about}
        </Text>
        {relay.system === 'denied' ? (
          <Text style={s.note} testID="settings-relay-note">
            {relayCopy.blocked}
          </Text>
        ) : null}
        {calmNote ? (
          <Text style={s.note} testID="settings-calm-note">
            {CALM_LINE}
          </Text>
        ) : null}
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
  stateOn: { color: color.p5 },
  about: { ...type.rdXS, color: color.p3, marginTop: 12 },
  note: { ...type.rdXS, color: color.p5, marginTop: 12 },
});
