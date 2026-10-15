import { describe, expect, it } from "vitest";
import { JsiSkApi } from "@shopify/react-native-skia/lib/module/skia/web";
import { repairSkia } from "./loadSkia.web";

type Api = Record<string, unknown>;
const api = (ck: unknown) => JsiSkApi(ck as never) as unknown as Api;

// The dev bundle builds react-native-skia's `Skia` singleton before CanvasKit has loaded (expo-router
// evaluates every route module while it validates the route tree). repairSkia must fix both the
// singleton and the references react-native-skia's own modules bound to its factories at load.
describe("repairSkia", () => {
  it("points an early singleton, and factory methods bound to it, at the loaded CanvasKit", () => {
    const skia = api(undefined) as {
      Image: { MakeImageFromEncoded: (d: unknown) => unknown };
      Paint: () => unknown;
    };
    const image = skia.Image;
    const bound = skia.Image.MakeImageFromEncoded.bind(skia.Image); // as core/Image.js does at load
    expect(() => bound({ ref: new Uint8Array() })).toThrow(TypeError);

    const encoded: unknown[] = [];
    const ck = {
      MakeImageFromEncoded: (bytes: unknown) => (encoded.push(bytes), null),
    };
    repairSkia(skia as unknown as Api, api(ck));

    expect(skia.Image).toBe(image);
    expect(bound({ ref: "bytes" })).toBeNull();
    expect(encoded).toEqual(["bytes"]);
  });

  it("replaces closure members built over the missing CanvasKit", () => {
    const skia = api(undefined);
    const before = skia.Paint;
    const fresh = api({});
    repairSkia(skia, fresh);
    expect(skia.Paint).toBe(fresh.Paint);
    expect(skia.Paint).not.toBe(before);
  });
});
