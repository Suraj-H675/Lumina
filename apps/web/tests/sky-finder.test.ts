import { describe, expect, it } from "vitest";

import {
  computeSolarSystemMarkers,
  filterAboveHorizonMarkers,
  isValidSkyPosition,
  projectAzimuthAtRadius,
  projectBelowHorizonDirection,
  projectHorizontalPosition,
  projectSkyPosition,
  targetForSkyFinder,
} from "../src/lib/observation/sky-finder";

const options = { centerX: 100, centerY: 100, skyRadius: 80, belowHorizonPadding: 12 } as const;

function position(altitude: number, azimuth: number) {
  return { altitude, azimuth, compass: "test" } as const;
}

describe("sky finder projection", () => {
  it("places the zenith at the center for every azimuth", () => {
    for (const azimuth of [0, 90, 180, 270]) {
      const projected = projectHorizontalPosition(position(90, azimuth), options);
      expect(projected?.x).toBeCloseTo(options.centerX, 10);
      expect(projected?.y).toBeCloseTo(options.centerY, 10);
      expect(projected?.radialFraction).toBe(0);
    }
  });

  it.each([
    [0, 100, 20],
    [90, 180, 100],
    [180, 100, 180],
    [270, 20, 100],
  ])("maps azimuth %i to the documented compass orientation", (azimuth, expectedX, expectedY) => {
    const projected = projectHorizontalPosition(position(0, azimuth), options);
    expect(projected?.x).toBeCloseTo(expectedX, 10);
    expect(projected?.y).toBeCloseTo(expectedY, 10);
    expect(projected?.radius).toBe(options.skyRadius);
  });

  it("maps 45° altitude halfway from the horizon to the zenith", () => {
    const projected = projectHorizontalPosition(position(45, 0), options);
    expect(projected?.x).toBeCloseTo(options.centerX, 10);
    expect(projected?.y).toBeCloseTo(options.centerY - options.skyRadius / 2, 10);
    expect(projected?.radialFraction).toBeCloseTo(0.5, 10);
  });

  it("projects guide directions with the same north-at-top convention", () => {
    expect(projectAzimuthAtRadius(0, 80, 100, 100)).toEqual({ x: 100, y: 20 });
    expect(projectAzimuthAtRadius(90, 80, 100, 100)).toEqual({ x: 180, y: 100 });
    expect(projectAzimuthAtRadius(Number.NaN, 80, 100, 100)).toBeNull();
  });

  it("keeps a below-horizon direction outside the visible disk", () => {
    const projected = projectBelowHorizonDirection(position(-14.2, 103), options);
    expect(projected).not.toBeNull();
    expect(projected?.radius).toBe(options.skyRadius + options.belowHorizonPadding);
    expect(projected?.x).not.toBeCloseTo(options.centerX, 5);
    expect(projectSkyPosition(position(-14.2, 103), options)?.kind).toBe("below-horizon");
    expect(projectHorizontalPosition(position(-14.2, 103), options)).toBeNull();
  });

  it("fails safely for invalid scientific values and rendering options", () => {
    expect(isValidSkyPosition(position(Number.NaN, 90))).toBe(false);
    expect(isValidSkyPosition(position(45, Number.POSITIVE_INFINITY))).toBe(false);
    expect(projectSkyPosition(position(45, Number.NaN), options)).toBeNull();
    expect(
      projectHorizontalPosition(position(45, 90), {
        centerX: 0,
        centerY: 0,
        skyRadius: Number.NaN,
      }),
    ).toBeNull();
  });
});

describe("sky finder solar-system references", () => {
  const location = { latitude: 0, longitude: 0 } as const;
  const instant = new Date("2026-08-27T12:00:00Z");

  it("returns finite observer-specific positions in deterministic order without Earth", () => {
    const markers = computeSolarSystemMarkers(location, instant);
    expect(markers.map((marker) => marker.name)).toEqual([
      "Sun",
      "Mercury",
      "Venus",
      "Mars",
      "Jupiter",
      "Saturn",
    ]);
    expect(new Set(markers.map((marker) => marker.body)).size).toBe(markers.length);
    expect(markers.map((marker) => marker.name)).not.toContain("Earth");
    expect(
      markers.every(
        (marker) =>
          Number.isFinite(marker.position.altitude) &&
          marker.position.altitude >= -90 &&
          marker.position.altitude <= 90 &&
          Number.isFinite(marker.position.azimuth) &&
          marker.position.azimuth >= 0 &&
          marker.position.azimuth < 360,
      ),
    ).toBe(true);
  });

  it("filters only geometric above-horizon references without changing their order", () => {
    const markers = computeSolarSystemMarkers(location, instant);
    const visible = filterAboveHorizonMarkers(markers);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((marker) => marker.position.altitude >= 0)).toBe(true);
    expect(visible.map((marker) => marker.name)).toEqual(
      markers.filter((marker) => marker.position.altitude >= 0).map((marker) => marker.name),
    );
  });

  it("returns no references for an invalid time", () => {
    expect(computeSolarSystemMarkers(location, new Date("invalid"))).toEqual([]);
  });
});

describe("sky finder target source", () => {
  it("retains the exact planner-selected position object", () => {
    const selectedPosition = position(42.8, 103.2);
    const target = targetForSkyFinder(
      { selected: { instant: new Date("2026-08-27T12:00:00Z"), position: selectedPosition } },
      "Fixture target",
    );
    expect(target.position).toBe(selectedPosition);
    expect(target.name).toBe("Fixture target");
  });
});
