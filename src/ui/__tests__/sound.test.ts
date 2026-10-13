import { describe, expect, it } from 'vitest';
import { createSound } from '../sound';

function rig(settings = { sound: true, haptics: true }, intensity: 'calm' | 'standard' | 'brave' = 'standard') {
  const calls: string[] = [];
  const rec = (n: string) => (...a: unknown[]) => void calls.push(`${n}${a.length ? ' ' + a.join(',') : ''}`);
  const engine = { start: rec('start'), stop: rec('stop'), setTier: rec('setTier'), setIntensity: rec('setIntensity'), setFlux: rec('setFlux'), scanPhase: rec('scanPhase'), hold: rec('hold'), reveal: rec('reveal'), scare: rec('scare'), fault: rec('fault'), setReduced: rec('setReduced') };
  const haptics = { fire: rec('fire'), setEnabled: rec('hEnabled'), setReduced: rec('hReduced'), setIntensity: rec('hIntensity') };
  const cues: string[] = [];
  const state = { ...settings };
  const sound = createSound({ engine: () => engine, haptics: () => haptics, settings: () => state, intensity: () => intensity, onCue: (c) => cues.push(c) });
  return { sound, calls, cues, state };
}

describe('sound facade', () => {
  it('runs a scan in the timeline order', () => {
    const { sound, calls, cues } = rig();
    sound.start('vf');
    sound.join('scan', 'strong');
    sound.scanStart();
    for (const p of [0, 1, 2, 3, 4] as const) sound.scanPhase(p);
    sound.hold();
    sound.reveal('strong');
    expect(cues).toEqual(['start', 'scanStart', 'scanPhase 0', 'scanPhase 1', 'scanPhase 2', 'scanPhase 3', 'scanPhase 4', 'hold', 'reveal', 'hapticScanEnd']);
    expect(calls.filter((c) => /^(start|scanPhase|hold|reveal)/.test(c))).toEqual(['start', 'scanPhase 0', 'scanPhase 1', 'scanPhase 2', 'scanPhase 3', 'scanPhase 4', 'hold', 'reveal']);
    expect(calls).toContain('setTier strong');
    expect(calls).toContain('setIntensity standard');
    expect(calls).toContain('fire scanStart');
  });

  it('starts once and stops only what runs', () => {
    const { sound, calls } = rig();
    sound.stop();
    expect(calls).toEqual([]);
    sound.start('vf');
    sound.start('vf');
    expect(calls.filter((c) => c === 'start')).toHaveLength(1);
    sound.stop();
    sound.stop();
    expect(calls.filter((c) => c === 'stop')).toHaveLength(1);
    sound.start('vf');
    expect(calls.filter((c) => c === 'start')).toHaveLength(2);
  });

  it('a screen losing focus cannot stop the screen that took over', () => {
    const { sound, calls } = rig();
    sound.start('vf');
    sound.join('scan', 'active');
    expect(calls.filter((c) => c === 'start')).toHaveLength(1);
    sound.stop('vf');
    expect(calls).not.toContain('stop');
    sound.stop('scan');
    expect(calls).toContain('stop');
  });

  it('a new viewfinder after a scan starts the scene afresh', () => {
    const { sound, calls } = rig();
    sound.join('scan', 'strong');
    sound.start('vf');
    expect(calls.filter((c) => c === 'start')).toHaveLength(2);
    expect(calls.filter((c) => c === 'stop')).toHaveLength(1);
  });

  it('with SOUND off the engine is never touched, haptics still follow their own switch', () => {
    const { sound, calls, state } = rig({ sound: false, haptics: true });
    sound.start('vf', 'active');
    sound.setFlux(400);
    sound.scanStart();
    sound.scanPhase(0);
    sound.hold();
    sound.reveal('active');
    sound.scare();
    sound.stop();
    expect(calls.filter((c) => /^(start|stop|setTier|setIntensity|setFlux|scanPhase|hold|reveal|scare|fault)\b/.test(c))).toEqual([]);
    expect(calls).toContain('fire scanStart');
    state.haptics = false;
    const before = calls.length;
    sound.capture();
    expect(calls.slice(before).some((c) => c.startsWith('fire'))).toBe(false);
  });

  it('does not forward scan cues before the scene is running', () => {
    const { sound, calls } = rig();
    sound.scanPhase(0);
    sound.hold();
    sound.setFlux(300);
    expect(calls.filter((c) => /^(scanPhase|hold|setFlux)/.test(c))).toEqual([]);
  });

  it('picks the CRITICAL haptic for a CRITICAL reveal and sends the fault to the engine only', () => {
    const { sound, calls, cues } = rig();
    sound.start('vf', 'critical');
    sound.fault();
    sound.reveal('critical');
    expect(calls).toContain('fault');
    expect(calls).toContain('fire criticalResult');
    expect(calls).not.toContain('fire error');
    expect(cues).toContain('hapticCritical');
  });

  it('passes reduced motion to both', () => {
    const { sound, calls } = rig();
    sound.setReducedMotion(true);
    expect(calls).toContain('hReduced true');
    sound.start('vf');
    expect(calls).toContain('setReduced true');
  });
});
