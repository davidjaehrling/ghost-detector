// Locale layer: pure core. No React, no native modules; the hook is in index.ts.
//
// Keys are flat and dotted (area.part.name). Placeholders are `{name}`. Plurals are key pairs
// (name_one and name_other, plus _zero/_two/_few/_many where a language needs them) read with
// t(key, { n: 3 }); the category comes from Intl.PluralRules for the active locale and falls back
// to `_other`.
// Fallback per key: active locale, then `en`. A key missing from `en` throws under NODE_ENV=test
// and returns the key itself at runtime.

export const LANGS = ['en', 'de', 'es', 'pt'] as const;
export type Lang = (typeof LANGS)[number];
export type LangSetting = 'system' | Lang;
export const LANG_SETTINGS: readonly LangSetting[] = ['system', ...LANGS];

export type Dict = Record<string, string>;
export type Params = Record<string, string | number>;

export const ENGINE_PREFIX = 'engine.';

const dicts: Partial<Record<Lang, Dict>> = {};

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);
export const isLangSetting = (v: unknown): v is LangSetting => v === 'system' || isLang(v);

/** Adds a flat dictionary. Engine files may omit the `engine.` prefix; it is added here. */
export function registerResources(lang: string, flat: Dict, engine = false): void {
  if (!isLang(lang)) return;
  const into = (dicts[lang] ??= {});
  for (const [k, v] of Object.entries(flat)) {
    if (typeof v !== 'string') continue;
    into[engine && !k.startsWith(ENGINE_PREFIX) ? ENGINE_PREFIX + k : k] = v;
  }
}

/** Harness: forgets a language's table, as if its file were missing. */
export function clearResources(lang: Lang): void {
  delete dicts[lang];
}

export function resourcesOf(lang: Lang): Dict {
  return dicts[lang] ?? {};
}

export function hasLanguage(lang: Lang): boolean {
  return Object.keys(resourcesOf(lang)).length > 0;
}

/** The locale in force: harness `?lang=`, then the Settings choice, then the device, then `en`. */
export function resolveLocale(o: { harness?: string | null; setting?: LangSetting; device?: string | null }): Lang {
  if (isLang(o.harness)) return o.harness;
  if (o.setting && o.setting !== 'system') return o.setting;
  const dev = o.device?.toLowerCase().split(/[-_]/)[0];
  return isLang(dev) ? dev : 'en';
}

const isTest = () => typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

function lookup(lang: Lang, key: string): string | undefined {
  return dicts[lang]?.[key] ?? dicts.en?.[key];
}

function pluralKey(lang: Lang, key: string, n: number): string {
  let cat = 'other';
  try {
    cat = new Intl.PluralRules(lang).select(n);
  } catch {
    // keep other
  }
  return lookup(lang, `${key}_${cat}`) !== undefined ? `${key}_${cat}` : `${key}_other`;
}

/** Whether `key` (or a plural form of it) exists in `en`, the source of truth. */
export function hasKey(key: string): boolean {
  return dicts.en?.[key] !== undefined;
}

export function translate(lang: Lang, key: string, params?: Params): string {
  let k = key;
  if (typeof params?.n === 'number' && lookup(lang, key) === undefined) k = pluralKey(lang, key, params.n);
  const raw = lookup(lang, k);
  if (raw === undefined) {
    if (isTest()) throw new Error(`i18n: missing key "${key}"`);
    return key;
  }
  if (!params && !raw.includes('{')) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params?.[name];
    if (v === undefined) {
      if (isTest()) throw new Error(`i18n: key "${key}" needs param "${name}"`);
      return m;
    }
    return String(v);
  });
}

/** Every entry under a prefix with the prefix stripped, `en` filled in under the locale's own. */
export function tableFor(lang: Lang, prefix: string): Dict {
  const out: Dict = {};
  for (const l of lang === 'en' ? (['en'] as const) : (['en', lang] as const)) {
    for (const [k, v] of Object.entries(resourcesOf(l))) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  }
  return out;
}
