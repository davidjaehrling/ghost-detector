export const FIXTURE_NAMES = ['cellar', 'attic', 'bright', 'black', 'outdoors'] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];
export const DEFAULT_FIXTURE: FixtureName = 'cellar';

export function isFixtureName(v: string | null | undefined): v is FixtureName {
  return !!v && (FIXTURE_NAMES as readonly string[]).includes(v);
}
