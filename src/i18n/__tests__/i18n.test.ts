import { afterEach, describe, expect, it } from 'vitest';
import { registerResources, resolveLocale, tableFor, translate } from '../core';
import { fmtDate, fmtDeltaT, fmtFixed, fmtStamp, fmtTime } from '../format';
import { cycleLanguage, getLanguageSetting, getLocale, setLanguage, subscribeLocale, t } from '../index';

describe('resolveLocale', () => {
  it('harness beats Settings beats device beats en', () => {
    expect(resolveLocale({ harness: 'de', setting: 'es', device: 'pt' })).toBe('de');
    expect(resolveLocale({ setting: 'es', device: 'pt' })).toBe('es');
    expect(resolveLocale({ setting: 'system', device: 'pt' })).toBe('pt');
    expect(resolveLocale({ setting: 'system', device: 'pt-PT' })).toBe('pt');
    expect(resolveLocale({ setting: 'system', device: 'fr' })).toBe('en');
    expect(resolveLocale({ setting: 'system', device: null })).toBe('en');
    expect(resolveLocale({ harness: 'xx', setting: 'system', device: 'de' })).toBe('de');
  });
});

describe('translate', () => {
  registerResources('en', { 'test.hello': 'Hello {name}', 'test.only': 'English only', 'test.n_one': '{n} case', 'test.n_other': '{n} cases' });
  registerResources('de', { 'test.hello': 'Hallo {name}', 'test.n_one': '{n} Fall', 'test.n_other': '{n} Fälle' });
  registerResources('de', { 'test.motor': 'Motor' }, true);

  it('replaces placeholders', () => {
    expect(translate('en', 'test.hello', { name: 'Ada' })).toBe('Hello Ada');
    expect(translate('de', 'test.hello', { name: 'Ada' })).toBe('Hallo Ada');
  });
  it('picks plural forms', () => {
    expect(translate('en', 'test.n', { n: 1 })).toBe('1 case');
    expect(translate('en', 'test.n', { n: 3 })).toBe('3 cases');
    expect(translate('de', 'test.n', { n: 1 })).toBe('1 Fall');
    expect(translate('de', 'test.n', { n: 0 })).toBe('0 Fälle');
  });
  it('falls back to en per key', () => {
    expect(translate('de', 'test.only')).toBe('English only');
  });
  it('a language with no file falls back to en', () => {
    expect(translate('pt', 'test.hello', { name: 'Ada' })).toBe('Hello Ada');
  });
  it('throws on a missing key and a missing param under test', () => {
    expect(() => translate('en', 'test.nope')).toThrow(/missing key/);
    expect(() => translate('en', 'test.hello')).toThrow(/needs param/);
  });
  it('falls back to the key at runtime', () => {
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(translate('en', 'test.nope')).toBe('test.nope');
      expect(translate('en', 'test.hello')).toBe('Hello {name}');
    } finally {
      process.env.NODE_ENV = was;
    }
  });
  it('adds the engine. prefix to engine files and tables strip it', () => {
    expect(translate('de', 'engine.test.motor')).toBe('Motor');
    expect(tableFor('de', 'engine.')['test.motor']).toBe('Motor');
  });
});

describe('format', () => {
  it('uses the decimal mark of the language', () => {
    expect(fmtFixed(-6.25, 1, 'en')).toBe('-6.3');
    expect(fmtFixed(-6.3, 1, 'de')).toBe('-6,3');
    expect(fmtFixed(1.04, 1, 'es')).toBe('1,0');
    expect(fmtFixed(1.04, 2, 'pt')).toBe('1,04');
    expect(fmtFixed(12, 0, 'de')).toBe('12');
  });
  it('prints the thermal delta in instrument form', () => {
    expect(fmtDeltaT(-6.3, 'de')).toBe('ΔT -6,3 °C');
    expect(fmtDeltaT(-6.3, 'en')).toBe('ΔT -6.3 °C');
    expect(fmtDeltaT(-6.3, 'de', true)).toBe('ΔT -6,3°C');
  });
  it('keeps ISO dates and the 24-hour clock in every language', () => {
    const d = new Date(2026, 9, 3, 7, 5);
    expect(fmtDate(d)).toBe('2026-10-03');
    expect(fmtTime(d)).toBe('07:05');
    expect(fmtStamp(new Date(2026, 9, 13, 23, 41))).toBe('2026-10-13 23:41');
    expect(fmtTime(new Date(2026, 9, 13, 15, 0))).toBe('15:00');
  });
});

describe('language setting', () => {
  afterEach(() => setLanguage('system'));
  it('cycles SYSTEM, EN, DE, ES, PT and notifies', () => {
    setLanguage('system');
    let calls = 0;
    const off = subscribeLocale(() => calls++);
    const seen = [getLanguageSetting()];
    for (let i = 0; i < 5; i++) seen.push(cycleLanguage());
    off();
    expect(seen).toEqual(['system', 'en', 'de', 'es', 'pt', 'system']);
    expect(calls).toBe(5);
  });
  it('an explicit choice sets the locale and renders its own text', () => {
    setLanguage('de');
    expect(getLocale()).toBe('de');
    expect(t('settings.sound')).toBe('TON');
  });
  it('a locale table with a missing key falls back to en for that key', () => {
    registerResources('en', { 'synthetic.only_en': 'ENGLISH ONLY', 'synthetic.both': 'EN BOTH' });
    registerResources('es', { 'synthetic.both': 'ES BOTH' });
    setLanguage('es');
    expect(t('synthetic.both')).toBe('ES BOTH');
    expect(t('synthetic.only_en')).toBe('ENGLISH ONLY');
  });
  it('SYSTEM with no device locale is en', () => {
    setLanguage('system');
    expect(getLocale()).toBe('en');
  });
});
