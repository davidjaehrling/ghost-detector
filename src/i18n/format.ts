// Number, date and time formatting per locale. Deliberately not Intl: Hermes ships a thin Intl and
// the instrument wants one fixed shape. 24-hour clock everywhere, ISO dates stay ISO, the decimal
// mark follows the language (comma in de, es, pt; point in en). Units keep their instrument form.
import type { Lang } from './core';

export const decimalMark = (lang: Lang): string => (lang === 'en' ? '.' : ',');

/** `toFixed` with the locale's decimal mark: fmtFixed(-6.25, 1, 'de') is "-6,3". */
export function fmtFixed(n: number, digits: number, lang: Lang): string {
  return n.toFixed(digits).replace('.', decimalMark(lang));
}

/** Thermal delta in the instrument form: "ΔT -6,3 °C". */
export function fmtDeltaT(n: number, lang: Lang, narrow = false): string {
  return `ΔT ${fmtFixed(n, 1, lang)}${narrow ? '' : ' '}°C`;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** "2026-10-13", local time. ISO in every language. */
export function fmtDate(ms: number | Date): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** "23:41", local time, 24 hour in every language. */
export function fmtTime(ms: number | Date): string {
  const d = new Date(ms);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** "2026-10-13 23:41". */
export function fmtStamp(ms: number | Date): string {
  return `${fmtDate(ms)} ${fmtTime(ms)}`;
}
