import { t } from '../i18n';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { FIELD_LOG_CHANNEL, type NotifyBackend, type ScheduleBackend, type SystemPermission, type TapData } from './relay';

// Native notification backend. The `Field log` channel is quiet by design (D-032): default
// importance, no sound, no badge, no vibration pattern, private on the lock screen. The channel is
// created before the permission request. Lines are local notifications at a date trigger (the
// engine's own fire time, 18:00 to 22:00 local); no exact-alarm API is used.

const asTap = (data: unknown, id: string): TapData | null => {
  const d = data as { templateId?: unknown; caseId?: unknown } | null;
  if (!d || typeof d.templateId !== 'number') return null;
  return { id, templateId: d.templateId, ...(typeof d.caseId === 'number' ? { caseId: d.caseId } : {}) };
};

export const notifyBackend: NotifyBackend & ScheduleBackend = {
  async schedule(line) {
    await Notifications.scheduleNotificationAsync({
      identifier: line.id,
      content: {
        title: line.title,
        body: line.body,
        sound: false,
        data: { templateId: line.templateId, ...(line.caseId !== undefined ? { caseId: line.caseId } : {}) },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: line.fireAtMs, channelId: FIELD_LOG_CHANNEL },
    });
  },
  async cancel(id) {
    await Notifications.cancelScheduledNotificationAsync(id);
  },
  onTap(handler) {
    const seen = (r: Notifications.NotificationResponse | null) => {
      const tap = r ? asTap(r.notification.request.content.data, r.notification.request.identifier) : null;
      if (tap) handler(tap);
    };
    void Notifications.getLastNotificationResponseAsync().then(seen).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(seen);
    return () => sub.remove();
  },
  async ensureChannel() {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(FIELD_LOG_CHANNEL, {
      name: t('relay.channelName'),
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
