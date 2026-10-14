import type { Intensity } from '../engine';
import { t } from '../i18n';

// The INTENSITY row in Settings cycles CALM, STANDARD, BRAVE. A change writes the intensity store and
// then asks the notification scheduler to reconcile (Calm sends fewer line kinds).

export const INTENSITY_ORDER: readonly Intensity[] = ['calm', 'standard', 'brave'];

const INTENSITY_KEY: Record<Intensity, string> = {
  calm: 'intensity.calm',
  standard: 'intensity.standard',
  brave: 'intensity.brave',
};

/** CALM, STANDARD or BRAVE, as the instrument prints it. */
export const intensityWord = (i: Intensity): string => t(INTENSITY_KEY[i]);

export function nextIntensity(i: Intensity): Intensity {
  return INTENSITY_ORDER[(INTENSITY_ORDER.indexOf(i) + 1) % INTENSITY_ORDER.length]!;
}

export type IntensityIo = {
  set(i: Intensity): void;
  reconcile(reason: 'settings'): Promise<void>;
};

/** Cycles to the next intensity: store write first, then the reconcile. Returns the new value. */
export async function cycleIntensity(current: Intensity, io: IntensityIo): Promise<Intensity> {
  const next = nextIntensity(current);
  io.set(next);
  await io.reconcile('settings');
  return next;
}
