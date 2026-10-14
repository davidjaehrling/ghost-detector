import { Skia, type SkImage, type SkTypeface } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';

import type { Lang } from '../../i18n';
import type { ScanRecord } from '../../state/scans';
import { regionFromImage } from '../compositor/regionFromImage';
import type { CardFormat } from './constants';
import { drawShareCard, encodePng, type CardFonts, type CardRender } from './render';
import { saveCard } from './save';

export { STORE_NAME, NAMEPLATE, LAYOUTS, cardFileName, MARK_CAP_FRAC, type CardFormat } from './constants';
export { drawShareCard, encodePng, type CardFonts, type CardInput, type CardRender, type MarkBox } from './render';
export { cardText, cardTexts, cardCopy, CARD_KEYS, type CardText } from './text';
export { figureLayout } from './figure';

const TTF = {
  vt323: require('@expo-google-fonts/vt323/400Regular/VT323_400Regular.ttf'),
  b612: require('@expo-google-fonts/b612-mono/400Regular/B612Mono_400Regular.ttf'),
  b612Bold: require('@expo-google-fonts/b612-mono/700Bold/B612Mono_700Bold.ttf'),
} as const;

let fonts: Promise<CardFonts> | null = null;

async function typeface(mod: number): Promise<SkTypeface> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const data = await Skia.Data.fromURI(asset.localUri ?? asset.uri);
  const tf = Skia.Typeface.MakeFreeTypeFaceFromData(data);
  if (!tf) throw new Error('share card: font failed to load');
  return tf;
}

/** The bundled VT323 and B612 Mono, loaded once. */
export function loadCardFonts(): Promise<CardFonts> {
  fonts ??= Promise.all([typeface(TTF.vt323), typeface(TTF.b612), typeface(TTF.b612Bold)]).then(([vt323, b612, b612Bold]) => ({ vt323, b612, b612Bold }));
  fonts.catch(() => (fonts = null));
  return fonts;
}

export interface ShareCardOptions {
  format: CardFormat;
  /** BELIEF_PROFILE[getBelief()].opacityRange when the user answered, as the result screen passes it. */
  beliefBand?: [number, number];
  /** Store name override (default STORE_NAME). */
  store?: string;
  /** Locale override (the L2 probe's `?lang=`); default the locale in force. */
  locale?: Lang;
}

export interface ShareCard extends CardRender {
  png: Uint8Array;
  /** Native: file:// URI in the cache directory. Web: a data:image/png;base64 URL. */
  uri: string;
}

async function loadPhoto(uri: string): Promise<SkImage> {
  const img = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!img) throw new Error('share card: photo failed to decode');
  return img;
}

/**
 * Renders the field card for a scan record (P6-01): 1080 x 1920 (story) or 1080 x 1080 (square),
 * PNG encoded, written to the cache (native) or returned as a data URL (web). Throws on failure
 * (the screen shows `E-31 PRINTER FAULT. CARD NOT SAVED.`).
 */
export async function renderShareCard(record: ScanRecord, opts: ShareCardOptions): Promise<ShareCard> {
  const [photo, stats, f] = await Promise.all([loadPhoto(record.photoUri), regionFromImage(record.photoUri).catch(() => null), loadCardFonts()]);
  const card = drawShareCard({ record, format: opts.format, photo, stats, fonts: f, beliefBand: opts.beliefBand, store: opts.store, locale: opts.locale });
  const png = encodePng(card.image);
  return { ...card, png, uri: saveCard(png, card.fileName) };
}
