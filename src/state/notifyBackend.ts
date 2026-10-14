import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { FIELD_LOG_CHANNEL, type NotifyBackend, type SystemPermission } from './relay';

// Native notification backend. The `Field log` channel is quiet by design (D-032): default
// importance, no sound, no badge, no vibration pattern, private on the lock screen. The channel is
// created before the permission request; nothing here schedules anything.

export const notifyBackend: NotifyBackend = {
  async ensureChannel() {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(FIELD_LOG_CHANNEL, {
      name: 'Field log',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      showBadge: false,
      enableVibrate: false,
      enableLights: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  },
  async permission(): Promise<SystemPermission> {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.status === 'denied' ? 'denied' : 'unknown';
  },
  async request() {
    const p = await Notifications.requestPermissionsAsync();
    return p.granted ? 'granted' : 'denied';
  },
  openSystemSettings: () => Linking.openSettings(),
};
