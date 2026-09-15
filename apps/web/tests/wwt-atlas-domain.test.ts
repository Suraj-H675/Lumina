import { describe, expect, it } from "vitest";

import {
  APPROVED_WWT_RUNTIME_HOSTS,
  ATLAS_LAYERS,
  atlasLayerById,
  degreesToRadians,
  parseAtlasUtcInstant,
  validateAtlasObserver,
  validateFieldOfViewDeg,
} from "../src/lib/wwt/atlas";

describe("Phase 5A WWT atlas domain", () => {
  it("keeps an exact closed four-band layer inventory with HTTPS credits and reviewed hosts", () => {
    expect(ATLAS_LAYERS.map((layer) => layer.id)).toEqual([
      "visible-dss2",
      "infrared-wise",
      "ultraviolet-galex",
      "microwave-planck",
    ]);
    expect(new Set(ATLAS_LAYERS.map((layer) => layer.imageSetName)).size).toBe(4);
    expect(new Set(ATLAS_LAYERS.map((layer) => layer.band))).toEqual(
      new Set(["visible", "infrared", "ultraviolet", "microwave"]),
    );
    for (const layer of ATLAS_LAYERS) {
      expect(layer.creditUrl.startsWith("https://")).toBe(true);
      expect(layer.creditText.length).toBeGreaterThan(5);
      expect(layer.interpretation).toMatch(/colour|color|map/i);
    }
    expect([...APPROVED_WWT_RUNTIME_HOSTS].sort()).toEqual([
      "cdn.worldwidetelescope.org",
      "web.wwtassets.org",
      "www.worldwidetelescope.org",
    ]);
  });

  it("accepts only the closed layer identifiers and defaults deterministically", () => {
    expect(atlasLayerById(undefined)?.id).toBe("visible-dss2");
    expect(atlasLayerById("infrared-wise")?.imageSetName).toBe("WISE All Sky (Infrared)");
    expect(atlasLayerById("custom-url")).toBeNull();
  });

  it("converts catalogue degrees to the WWT helper radians contract exactly", () => {
    expect(degreesToRadians(0)).toBe(0);
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2, 14);
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 14);
    expect(degreesToRadians(359.9)).toBeCloseTo((359.9 * Math.PI) / 180, 14);
    expect(() => degreesToRadians(Number.NaN)).toThrow(RangeError);
  });

  it("validates transient observer coordinates against the shared Phase 4D altitude envelope", () => {
    expect(validateAtlasObserver({ latitude: 0, longitude: 0, elevationM: 0 })).toEqual({
      latitude: 0,
      longitude: 0,
      elevationM: 0,
    });
    expect(
      validateAtlasObserver({ latitude: -90, longitude: 180, elevationM: -500 }),
    ).not.toBeNull();
    expect(
      validateAtlasObserver({ latitude: 90, longitude: -180, elevationM: 10_000 }),
    ).not.toBeNull();
    expect(validateAtlasObserver({ latitude: 91, longitude: 0, elevationM: 0 })).toBeNull();
    expect(validateAtlasObserver({ latitude: 0, longitude: 181, elevationM: 0 })).toBeNull();
    expect(validateAtlasObserver({ latitude: 0, longitude: 0, elevationM: 10_001 })).toBeNull();
    expect(validateAtlasObserver({ latitude: Number.NaN, longitude: 0, elevationM: 0 })).toBeNull();
  });

  it("bounds field of view and accepts only finite UTC-parsable instants", () => {
    expect(validateFieldOfViewDeg(5)).toBe(5);
    expect(validateFieldOfViewDeg(0)).toBeNull();
    expect(validateFieldOfViewDeg(121)).toBeNull();
    expect(validateFieldOfViewDeg(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseAtlasUtcInstant("2026-09-15T06:30:00Z")?.toISOString()).toBe(
      "2026-09-15T06:30:00.000Z",
    );
    expect(parseAtlasUtcInstant("2026-09-15T06:30:00.25Z")?.toISOString()).toBe(
      "2026-09-15T06:30:00.250Z",
    );
    expect(parseAtlasUtcInstant("2026-09-15T06:30:00+00:00")).toBeNull();
    expect(parseAtlasUtcInstant("2026-09-15T06:30:00")).toBeNull();
    expect(parseAtlasUtcInstant("2026-02-30T06:30:00Z")).toBeNull();
    expect(parseAtlasUtcInstant("2026-09-15T24:00:00Z")).toBeNull();
    expect(parseAtlasUtcInstant("not-a-date")).toBeNull();
  });
});
