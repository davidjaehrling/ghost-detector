import type { Lang } from './core';

// Disclosure keys (D-038). They say the readings are simulated, that the unit detects nothing, or
// that a video plays first. They are fallback-forbidden: a locale that ships must carry its own
// text for every one of them, and it must pass the marker table below.
export const DISCLOSURE_KEYS = [
  'sticker.head1',
  'sticker.body',
  'about.line',
  'result.strip.mark',
  'deep.sub',
  'relay.body',
  'relay.channelName',
] as const;
export type DisclosureKey = (typeof DISCLOSURE_KEYS)[number];

const SIM = { en: /SIMULAT/iu, de: /SIMULIER|SIMULATION/iu, es: /SIMULA/iu, pt: /SIMULA/iu } satisfies Record<Lang, RegExp>;
const NOTHING = {
  en: /detects nothing/iu,
  de: /erkennt nichts/iu,
  es: /no detecta nada/iu,
  pt: /não dete[c]?ta nada/iu,
} satisfies Record<Lang, RegExp>;
const AD = { en: /SPONSORED/iu, de: /WERBE/iu, es: /PUBLICIT/iu, pt: /PUBLICIT/iu } satisfies Record<Lang, RegExp>;
const VIDEO = /VIDEO|VÍDEO/iu;

/** Every regex listed for a key must match the text in that language. Keys not listed need only exist. */
export function markersFor(lang: Lang): Partial<Record<DisclosureKey, RegExp[]>> {
  return {
    'sticker.head1': [SIM[lang]],
    'sticker.body': [NOTHING[lang]],
    'about.line': [SIM[lang]],
    'result.strip.mark': [SIM[lang]],
    'deep.sub': [VIDEO, AD[lang]],
    'relay.body': [SIM[lang]],
  };
}
