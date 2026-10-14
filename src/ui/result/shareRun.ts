import { track } from '../../analytics';
import { renderShareCard, type CardFormat } from '../../fx/share';
import type { ScanRecord } from '../../state/scans';
import { onCardShared } from '../interstitial';
import { shareCopy } from './share';
import { openShareSheet } from './shareSheet';

/** Two frames and a macrotask, so the printing line is on screen before the render starts. */
const yieldToPaint = () =>
  new Promise<void>((resolve) => {
    const next = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16);
    next(() => next(() => setTimeout(resolve, 0)));
  });

/**
 * Renders the field card and opens the system sheet. Throws on any failure (the caller prints E-31).
 * The interstitial is skipped on the next return once the sheet has been asked for.
 */
export async function runShare(record: ScanRecord, format: CardFormat, beliefBand?: [number, number]): Promise<void> {
  await yieldToPaint();
  const card = await renderShareCard(record, { format, ...(beliefBand ? { beliefBand } : {}) });
  await openShareSheet({ uri: card.uri, fileName: card.fileName, format }, shareCopy.title(record.id));
  onCardShared();
  track('share_card');
}
