import { fault } from '../../state/faults';

// Web stub for the L2 harness: no sheet opens and the native module is never imported. Every share
// is recorded in window.__shareLog.
export type ShareLogEntry = { format: 'story' | 'square'; fileName: string; uri: string; title: string };

declare global {
  interface Window {
    __shareLog?: ShareLogEntry[];
    __shareCancelled?: number;
  }
}

export async function openShareSheet(card: { uri: string; fileName: string; format: 'story' | 'square' }, dialogTitle: string): Promise<void> {
  // ?fault=share-cancel: the person closes the sheet without choosing a target. The native call
  // resolves the same way, so the flow must end quietly: no E-31, no entry in the log.
  if (fault('share-cancel')) {
    (window.__shareCancelled = (window.__shareCancelled ?? 0) + 1);
    return;
  }
  (window.__shareLog ??= []).push({ format: card.format, fileName: card.fileName, uri: card.uri, title: dialogTitle });
}
