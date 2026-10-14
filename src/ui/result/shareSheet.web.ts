// Web stub for the L2 harness: no sheet opens and the native module is never imported. Every share
// is recorded in window.__shareLog.
export type ShareLogEntry = { format: 'story' | 'square'; fileName: string; uri: string; title: string };

declare global {
  interface Window {
    __shareLog?: ShareLogEntry[];
  }
}

export async function openShareSheet(card: { uri: string; fileName: string; format: 'story' | 'square' }, dialogTitle: string): Promise<void> {
  (window.__shareLog ??= []).push({ format: card.format, fileName: card.fileName, uri: card.uri, title: dialogTitle });
}
