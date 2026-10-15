// CanvasKit (the web backend) has no GC for Skia objects and its wasm heap never shrinks, so every
// Paint, Font, Shader, ImageFilter, Path, Image and Surface a draw makes must be `dispose()`d. A bin
// collects what one draw allocates and frees it in one place once the draw is done. On native the
// same calls free the JSI objects early instead of waiting for the GC.

export interface Disposable {
  dispose(): void;
}

export class Bin {
  private items: Disposable[] = [];

  /** Keeps `x` (null passes through) until `free()`; returns it. */
  own<T extends Disposable | null | undefined>(x: T): T {
    if (x) this.items.push(x);
    return x;
  }

  /** Frees everything owned, newest first. Only call once every draw using them has run (a CPU raster draws at once). */
  free(): void {
    const items = this.items.splice(0);
    for (let n = items.length - 1; n >= 0; n--) items[n]!.dispose();
  }
}
