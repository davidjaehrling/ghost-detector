import { Skia, type SkImage, type SkTypeface } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';

import type { Lang } from '../../i18n';
import type { ScanRecord } from '../../state/scans';
import { getInstallIdentity } from '../../ui/boot/install';
import { regionFromImage } from '../compositor/regionFromImage';
import type { CardFormat } from './constants';
import { encodeCard } from './encode';
import { drawShareCard, encodePng, type CardFonts, type CardIdentity, type CardRender } from './render';
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
  /** The calibration stamp the card's sticker prints (A-92); default this install's, as the housing shows it. */
  identity?: CardIdentity;
  /** 'skia' forces CanvasKit's PNG encoder on web too (the L2 probe's `?encoder=skia`, to compare pixels). */
  encoder?: 'skia';
}

/** Wall time of each print step in ms (P8-03 budget: draw plus encode under 1500 ms). */
export interface PrintTiming {
  /** Photo decode, region statistics and fonts (parallel; fonts are cached after the first card). */
  load: number;
  /** drawShareCard: the offscreen raster, composite, strip, grain and text. */
  draw: number;
  /** PNG encode (encodeCard: Skia on native, the browser's encoder on web). */
  encode: number;
  /** saveCard: file write (native) or data URL (web). */
  save: number;
  /** load + draw + encode + save. */
  total: number;
}

export interface ShareCard extends CardRender {
  png: Uint8Array;
  ms: PrintTiming;
  /** Native: file:// URI in the cache directory. Web: a data:image/png;base64 URL. */
  uri: string;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

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
  const t0 = now();
  const [photo, stats, f] = await Promise.all([loadPhoto(record.photoUri), regionFromImage(record.photoUri).catch(() => null), loadCardFonts()]);
  const t1 = now();
  const card = drawShareCard({ record, format: opts.format, photo, stats, fonts: f, beliefBand: opts.beliefBand, store: opts.store, locale: opts.locale, identity: opts.identity ?? getInstallIdentity() });
  const t2 = now();
  const png = opts.encoder === 'skia' ? encodePng(card.image) : await encodeCard(card.image);
  const t3 = now();
  const uri = saveCard(png, card.fileName);
  const t4 = now();
  const r = (v: number) => Math.round(v * 10) / 10;
  return { ...card, png, uri, ms: { load: r(t1 - t0), draw: r(t2 - t1), encode: r(t3 - t2), save: r(t4 - t3), total: r(t4 - t0) } };
}
