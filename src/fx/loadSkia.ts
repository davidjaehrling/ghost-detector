// Native: Skia ships in the binary, nothing to load.
export function loadSkia(): Promise<void> {
  return Promise.resolve();
}

export const SKIA_NEEDS_LOAD = false;
