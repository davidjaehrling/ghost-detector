/**
 * English word banks for the entity profile, read from locales/engine/en.json (see strings.ts).
 * Kept as exports for the legacy callers and the tests; other locales pass their own table.
 * Field-manual voice (docs/voice-guide.md):
 * short sentences, high base-rate statements, no real people, deaths, illness or addresses,
 * no instructions to the user. No banned copy words.
 */

import { bank, en } from './strings';

/** Class labels, ALL CAPS status words. 24 as in psych-brief 2.5. */
export const CLASSES: readonly string[] = bank(en, 'profile.class');

/** Three-letter catalogue prefixes, index-matched to CLASSES. */
export const PREFIXES: readonly string[] = bank(en, 'profile.prefix');

export const ERA_ANCHORS = [1780, 1800, 1820, 1840, 1860, 1880, 1900, 1920, 1940, 1960] as const;

export const TEMPERAMENT: readonly string[] = bank(en, 'profile.temperament');
export const ATTACHMENT: readonly string[] = bank(en, 'profile.attachment');
export const BEHAVIOUR: readonly string[] = bank(en, 'profile.behaviour');
export const TIMING: readonly string[] = bank(en, 'profile.timing');

/** Detail-line templates. {n} is a seeded number: a checkable-sounding code nobody can check. */
export const DETAIL: readonly string[] = bank(en, 'profile.detail');
