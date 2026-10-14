import { describe, expect, it } from 'vitest';
import type { Intensity } from '../../engine';
import { INTENSITY_ORDER, cycleIntensity, nextIntensity } from '../intensity';
import { createScanStore } from '../scans';

describe('INTENSITY row', () => {
  it('cycles CALM, STANDARD, BRAVE and wraps', () => {
    expect(INTENSITY_ORDER).toEqual(['calm', 'standard', 'brave']);
    expect(nextIntensity('calm')).toBe('standard');
    expect(nextIntensity('standard')).toBe('brave');
    expect(nextIntensity('brave')).toBe('calm');
  });

  it('writes the intensity store, then reconciles with reason settings', async () => {
    const order: string[] = [];
    const data = new Map<string, string>();
    const store = createScanStore({ storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) } });
    const io = {
      set: (i: Intensity) => {
        order.push(`set:${i}`);
        store.setIntensity(i);
      },
      reconcile: (reason: 'settings') => {
        order.push(`reconcile:${reason}:${store.getIntensity()}`);
        return Promise.resolve();
      },
    };
    expect(store.getIntensity()).toBe('standard');
    expect(await cycleIntensity('standard', io)).toBe('brave');
    expect(await cycleIntensity('brave', io)).toBe('calm');
    expect(order).toEqual(['set:brave', 'reconcile:settings:brave', 'set:calm', 'reconcile:settings:calm']);
    expect([...data.values()]).toContain('calm');
  });
});
