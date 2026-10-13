import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg, MAX_HAPTIC_MS, patternMs, type HapticEvent } from '../config';
import { createHaptics, type HapticDriver } from '../haptics';

function rig() {
  const calls: string[] = [];
  const driver: HapticDriver = {
    impact: (s) => void calls.push(`impact:${s}`),
    notification: (k) => void calls.push(`note:${k}`),
    selection: () => void calls.push('selection'),
  };
  let t = 0;
  const queue: [() => void, number][] = [];
  const h = createHaptics(cfg, { driver, now: () => t, later: (fn, ms) => void queue.push([fn, ms]) });
  return { h, calls, queue, at: (ms: number) => void (t = ms) };
}

describe('haptic grammar', () => {
  it('every event pattern sums to at most 120 ms', () => {
    for (const e of Object.keys(cfg.haptics) as HapticEvent[]) expect(patternMs(cfg.haptics[e]), e).toBeLessThanOrEqual(MAX_HAPTIC_MS);
  });
  it('maps events to the palette patterns', () => {
    const { h, calls, queue } = rig();
    h.fire('tierUp');
    h.fire('capture');
    h.fire('scanEnd');
    h.fire('criticalResult');
    h.fire('uiConfirm');
    h.fire('error');
    expect(calls).toEqual(['impact:medium', 'impact:rigid', 'impact:heavy', 'note:warning', 'selection', 'note:error']);
    h.fire('scanStart');
    expect(queue.map((q) => q[1])).toEqual([60]);
    queue[0]![0]();
    expect(calls.slice(-2)).toEqual(['impact:medium', 'impact:light']);
  });
  it('off switch silences every call, including queued steps', () => {
    const { h, calls, queue } = rig();
    h.fire('scanStart');
    h.setEnabled(false);
    queue[0]![0]();
    h.fire('scare');
    expect(calls).toEqual(['impact:medium']);
  });
  it('needle ticks: 8 per second, 4 when reduced, none above 12 clicks/s', () => {
    const { h, calls, at } = rig();
    for (let i = 0; i < 20; i++) h.fire('needleTick');
    expect(calls).toHaveLength(8);
    at(1000);
    h.setReduced(true);
    calls.length = 0;
    for (let i = 0; i < 20; i++) h.fire('needleTick');
    expect(calls).toHaveLength(4);
    at(2500);
    h.setGeigerRate(13);
    calls.length = 0;
    h.fire('needleTick');
    expect(calls).toHaveLength(0);
  });
  it('calm drops Heavy to Medium and Rigid to Light', () => {
    const { h, calls } = rig();
    h.setIntensity('calm');
    h.fire('scanEnd');
    h.fire('capture');
    expect(calls).toEqual(['impact:medium', 'impact:light']);
  });
});
