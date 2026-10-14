import { File, Paths } from 'expo-file-system';

/** Native: writes the PNG to the cache directory and returns its file URI. */
export function saveCard(png: Uint8Array, fileName: string): string {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(png);
  return file.uri;
}
