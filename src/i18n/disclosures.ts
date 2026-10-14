import type { Lang } from './core';

// Disclosure keys (D-038). They say the readings are simulated, that the unit detects nothing, or
// that a video plays first. They are fallback-forbidden: a locale that ships must carry its own
// text for every one of them, and it must pass the marker table below.
export const DISCLOSURE_KEYS = [
  'sticker.head1',
  'sticker.head2',
  'sticker.body',
  'about.line',
  'result.strip.mark',
  'deep.sub',
  'deep.offline',
  'relay.body',
  'relay.channelName',
  'share.card.mark',
  'share.card.footer',
  'engine.notify.prefix',
] as const;
export type DisclosureKey = (typeof DISCLOSURE_KEYS)[number];

const SIM = { en: /SIMULAT/iu, de: /SIMULIER|SIMULATION/iu, es: /SIMULA/iu, pt: /SIMULA/iu } satisfies Record<Lang, RegExp>;
const SIM_STEM = { en: /SIMULAT/iu, de: /SIMULIER/iu, es: /SIMULAD/iu, pt: /SIMULAD/iu } satisfies Record<Lang, RegExp>;
const NOTHING = {
  en: /detects nothing/iu,
  de: /erkennt nichts/iu,
  es: /no detecta nada/iu,
  pt: /não dete[c]?ta nada/iu,
} satisfies Record<Lang, RegExp>;
const GENERATED = { en: /generated/iu, de: /erzeugt/iu, es: /genera/iu, pt: /geradas/iu } satisfies Record<Lang, RegExp>;
const FICTION = { en: /FICTION/iu, de: /FIKTION/iu, es: /FICTICIO/iu, pt: /FICT[IÍ]CIO/iu } satisfies Record<Lang, RegExp>;
const FIELD_LOG = { en: /FIELD LOG/iu, de: /FELDPROTOKOLL/iu, es: /REGISTRO DE CAMPO/iu, pt: /REGISTO DE CAMPO/iu } satisfies Record<Lang, RegExp>;
const ENTERTAINMENT = { en: /ENTERTAINMENT/iu, de: /UNTERHALTUNG/iu, es: /ENTRETENIMIENTO/iu, pt: /ENTRETENIMENTO/iu } satisfies Record<Lang, RegExp>;
const AD = { en: /SPONSORED/iu, de: /WERBE/iu, es: /PUBLICIT/iu, pt: /PUBLICIT/iu } satisfies Record<Lang, RegExp>;
const VIDEO = /VIDEO|VÍDEO/iu;

/** Every regex listed for a key must match the text in that language. Keys not listed need only exist. */
export function markersFor(lang: Lang): Partial<Record<DisclosureKey, RegExp[]>> {
  return {
    'sticker.head1': [SIM[lang]],
    'sticker.head2': [ENTERTAINMENT[lang]],
    'sticker.body': [GENERATED[lang], NOTHING[lang]],
    'about.line': [SIM[lang], FICTION[lang]],
    'result.strip.mark': [SIM[lang]],
    'deep.sub': [VIDEO, AD[lang]],
    'engine.notify.prefix': [FIELD_LOG[lang]],
    'relay.body': [SIM[lang]],
    'share.card.mark': [SIM_STEM[lang]],
    'share.card.footer': [SIM_STEM[lang]],
  };
}
