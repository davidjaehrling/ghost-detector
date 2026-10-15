import { useSyncExternalStore } from 'react';
import { fault } from '../state/faults';
import { platformStorage } from '../state/storage';
import {
  type Lang,
  LANGS,
  clearResources,
  type LangSetting,
  LANG_SETTINGS,
  type Params,
  isLang,
  isLangSetting,
  resolveLocale,
  tableFor as tableForLocale,
  translate,
} from './core';
import './resources';

// Harness (web only): `?fault=locale-missing` drops every table but `en`, so a chosen language
// falls back per key as it does when a locale file is absent.
if (fault('locale-missing')) for (const l of LANGS) if (l !== 'en') clearResources(l);

export { hasKey, LANGS, LANG_SETTINGS, ENGINE_PREFIX, tableFor as tableForLocale, type Lang, type LangSetting, type Params } from './core';
export { eraValue, profileFor } from './profile';
export * from './format';

const KEY = 'fs4.lang.v1';

let setting: LangSetting | null = null;
let harness: Lang | null | undefined;
let current: Lang | null = null;
const listeners = new Set<() => void>();

function deviceCode(): string | null {
  try {
    // Required on first use, not at import, so node tests never load the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-localization') as { getLocales(): { languageCode: string | null }[] };
    return mod.getLocales()[0]?.languageCode ?? null;
  } catch {
    return null;
  }
}

// Web harness: `?lang=de`, read once per page. Production never sets it.
function harnessLang(): Lang | null {
  if (harness !== undefined) return harness;
  let v: string | null = null;
  try {
    v = typeof window !== 'undefined' ? new URLSearchParams(window.location?.search ?? '').get('lang') : null;
  } catch {
    v = null;
  }
  harness = isLang(v) ? v : null;
  return harness;
}

export function getLanguageSetting(): LangSetting {
  if (setting) return setting;
  setting = 'system';
  try {
    const raw = platformStorage()?.getItem(KEY);
    if (raw && isLangSetting(raw)) setting = raw;
  } catch {
    // memory only
  }
  return setting;
}

/** The locale in force. A stable string until the setting changes (safe for useSyncExternalStore). */
export function getLocale(): Lang {
  return (current ??= resolveLocale({ harness: harnessLang(), setting: getLanguageSetting(), device: deviceCode() }));
}

export function setLanguage(next: LangSetting): void {
  setting = next;
  current = null;
  try {
    platformStorage()?.setItem(KEY, next);
  } catch {
    // memory only
  }
  for (const l of listeners) l();
}

/** SYSTEM, EN, DE, ES, PT, and round again. */
export function cycleLanguage(): LangSetting {
  const i = LANG_SETTINGS.indexOf(getLanguageSetting());
  const next = LANG_SETTINGS[(i + 1) % LANG_SETTINGS.length]!;
  setLanguage(next);
  return next;
}

export const subscribeLocale = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Subscribes the calling component: it re-renders when the language changes. */
export function useLocale(): Lang {
  return useSyncExternalStore(subscribeLocale, getLocale, () => 'en');
}

/** The Settings choice (SYSTEM, EN, DE, ES, PT); re-renders when it changes, even if the locale does not. */
export function useLanguageSetting(): LangSetting {
  return useSyncExternalStore(subscribeLocale, getLanguageSetting, () => 'system');
}

/** Translate `key` in the locale in force. See core.ts for placeholders and plurals. */
export function t(key: string, params?: Params): string {
  return translate(getLocale(), key, params);
}

/**
 * A copy table whose values are read through t() on every access:
 * `const copy = copyOf({ code: 'settings.code' })`, then `copy.code` follows the language.
 */
export function copyOf<K extends string>(keys: Record<K, string>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const name of Object.keys(keys) as K[]) {
    const key = keys[name];
    Object.defineProperty(out, name, { enumerable: true, get: () => t(key) });
  }
  return out;
}

/** A table of everything under `prefix` (e.g. `engine.`), prefix stripped, for pure code that takes strings. */
export function tableFor(prefix: string): Record<string, string> {
  return tableForLocale(getLocale(), prefix);
}
