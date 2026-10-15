/** Platform-neutral haptic style helper, shared by haptics.ts and haptics.web.ts. */
import type { HapticStep, Intensity } from './config';

/** Calm drops Heavy to Medium and Rigid to Light. */
export function calmStyle(s: HapticStep['style'], intensity: Intensity): HapticStep['style'] {
  if (intensity !== 'calm') return s;
  return s === 'heavy' ? 'medium' : s === 'rigid' ? 'light' : s;
}
