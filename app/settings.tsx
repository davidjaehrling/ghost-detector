import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { showPrivacyOptions } from '../src/ads';
import { notifyBackend } from '../src/state/notifyBackend';
import { cycleIntensity } from '../src/state/intensity';
import { syncRelay } from '../src/state/notifyRuntime';
import { refreshRelay, relayCopy, relayOn, relayStore, toggleRelay } from '../src/state/relay';
import { useRelay } from '../src/state/useRelay';
import { getIntensity, setIntensity } from '../src/state/scans';
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
  intensity: 'INTENSITY',
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
  const [intensity, setIntensityNow] = useState(getIntensity);
  // Nothing plays on this screen; a scene left running from the result ends here.
  useEffect(() => sound.stop(), []);
  // The system permission may have changed in system settings since the last visit.
  useEffect(() => {
    void refreshRelay(relayStore, notifyBackend).catch(() => {});
  }, []);

  type Row = { id: string; label: string; on: boolean; value?: string; help?: string; toggle: () => void };
  const rows: Row[] = [
    { id: 'sound', label: copy.sound, on: settings.sound, toggle: () => setSound(!settings.sound) },
    { id: 'haptics', label: copy.haptics, on: settings.haptics, toggle: () => setHaptics(!settings.haptics) },
    {
      id: 'jumpscares',
      label: copy.scares,
      on: settings.jumpScares,
      // On Calm the switch springs back to OFF and the instrument says why (sound palette section 6).
      toggle: () => {
        setCalmNote(!setJumpScares(!settings.jumpScares) && !settings.jumpScares);
        void syncRelay('settings');
      },
    },
    // Off by default; on only with the notification permission granted. After a system denial the
    // row opens the system notification settings instead of asking again.
    {
      id: 'intensity',
      label: copy.intensity,
      on: false,
      value: intensity.toUpperCase(),
      toggle: () => {
        void cycleIntensity(intensity, { set: setIntensity, reconcile: syncRelay }).then((next) => {
          setIntensityNow(next);
          setCalmNote(false);
        });
      },
    },
    { id: 'relay', label: relayCopy.settingsLabel, help: relayCopy.settingsHelp, on: relayOn(relay), toggle: () => void toggleRelay(relayStore, notifyBackend).catch(() => {}).then(() => syncRelay('settings')) },
  ];

  return (
    <Placeholder
      testID="screen-settings"
      code={copy.code}
      graticule={false}
      keys={[{ testID: 'key-forward', label: copy.nextLabel, legend: copy.next, onPress: () => router.back() }]}
    >
      <View style={s.list} testID="settings-list">
        {rows.map((r) => (
          <View key={r.id} style={s.rowWrap}>
            <Pressable
              testID={`setting-${r.id}`}
              accessibilityRole={r.value ? 'button' : 'switch'}
              accessibilityLabel={r.value ? `${r.label} ${r.value}` : r.label}
              accessibilityState={r.value ? {} : { checked: r.on }}
              onPress={r.toggle}
              style={s.rowIn}
            >
              <Text style={s.label}>{r.label}</Text>
              <Text style={[s.state, r.on && s.stateOn]} testID={`setting-${r.id}-state`}>
                {r.value ?? (r.on ? copy.on : copy.off)}
              </Text>
            </Pressable>
            {r.help ? (
              <Text style={s.help} testID={`setting-${r.id}-help`}>
                {r.help}
              </Text>
            ) : null}
          </View>
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
  rowWrap: { borderBottomWidth: 1, borderBottomColor: color.p1 },
  rowIn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: color.p1 },
  help: { ...type.lbXS, color: color.p3, paddingBottom: 8 },
  label: { ...type.lbM, color: color.p3 },
  state: { ...type.rdM, color: color.p2 },
  stateOn: { color: color.p5 },
  about: { ...type.rdXS, color: color.p3, marginTop: 12 },
  note: { ...type.rdXS, color: color.p5, marginTop: 12 },
});
