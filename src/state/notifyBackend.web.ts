import { fault } from './faults';
import { type NotifyBackend, type ScheduleBackend, type SystemPermission } from './relay';

// Web stub: no notification API is touched. Every call lands in window.__notifyLog for the L2
// harness, and the system's answer comes from the URL: ?notify=granted|denied (default: not asked,
// and a request answers denied).

export type NotifyLogEntry = {
  at: number;
  call: string;
  /** `schedule` and `cancel` carry the line. */
  id?: string;
  templateId?: number;
  fireAtMs?: number;
  title?: string;
  body?: string;
};

declare global {
  interface Window {
    __notifyLog?: NotifyLogEntry[];
  }
}

const record = (call: string, extra: Partial<NotifyLogEntry> = {}) => {
  if (typeof window !== 'undefined') (window.__notifyLog ??= []).push({ at: Date.now(), call, ...extra });
};

// Read once at load: the router drops the query on a navigation, and the flag must outlive that.
const flag = new URLSearchParams(typeof window !== 'undefined' ? (window.location?.search ?? '') : '').get('notify');
const answer = (): 'granted' | 'denied' | null => (fault('notify-denied') ? 'denied' : flag === 'granted' || flag === 'denied' ? flag : null);

let asked = false;

export const notifyBackend: NotifyBackend & ScheduleBackend = {
  async schedule({ id, templateId, fireAtMs, title, body }) {
    record('schedule', { id, templateId, fireAtMs, title, body });
  },
  async cancel(id) {
    record('cancel', { id });
  },
  onTap: () => () => {},
  async ensureChannel() {
    record('createChannel:field-log');
  },
  async permission(): Promise<SystemPermission> {
    record('getPermission');
    return asked ? (answer() ?? 'denied') : 'unknown';
  },
  async request() {
    record('requestPermission');
    asked = true;
    return answer() ?? 'denied';
  },
  async openSystemSettings() {
    record('openSystemSettings');
  },
};
