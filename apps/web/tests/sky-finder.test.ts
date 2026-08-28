import { describe, expect, it } from "vitest";
import * as Astronomy from "astronomy-engine";

import {
  BRIGHT_STAR_RENDER_CAP,
  angularSeparationDegrees,
  calculateBrightContextHorizontalPositions,
  computeSolarSystemMarkers,
  filterAboveHorizonMarkers,
  isValidSkyPosition,
  projectAzimuthAtRadius,
  projectBelowHorizonDirection,
  projectConstellationBoundary,
  projectHorizontalPosition,
  projectSkyPosition,
  positionNamedSkyAnchors,
  selectNamedAnchorLabels,
  selectRenderedBrightContextStars,
  starMarkerOpacity,
  starMarkerRadius,
  targetForSkyFinder,
} from "../src/lib/observation/sky-finder";
import type { ConstellationRegion } from "../src/lib/observation/iau-context";

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

describe("sky finder bright-star context", () => {
  const location = { latitude: 12.972, longitude: 77.594 } as const;
  const star = {
    sourceId: "10",
    rightAscensionDegrees: 180,
    declinationDegrees: 20,
    gMagnitude: 2,
  } as const;

  it("converts Gaia RA degrees to hours on the existing geometric Horizon path", () => {
    const instant = new Date("2026-08-27T12:00:00Z");
    const [positioned] = calculateBrightContextHorizontalPositions([star], location, instant);
    const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
    const expected = Astronomy.Horizon(instant, observer, 12, star.declinationDegrees);

    expect(positioned).toBeDefined();
    expect(positioned?.position.altitude).toBeCloseTo(expected.altitude, 10);
    expect(positioned?.position.azimuth).toBeCloseTo(expected.azimuth, 10);
    expect(Number.isFinite(positioned?.position.altitude)).toBe(true);
    expect(Number.isFinite(positioned?.position.azimuth)).toBe(true);
  });

  it("recomputes the real sky rotation for selected-time and location changes", () => {
    const first = calculateBrightContextHorizontalPositions(
      [star],
      location,
      new Date("2026-08-27T12:00:00Z"),
    )[0];
    const later = calculateBrightContextHorizontalPositions(
      [star],
      location,
      new Date("2026-08-27T14:00:00Z"),
    )[0];
    const elsewhere = calculateBrightContextHorizontalPositions(
      [star],
      { latitude: -33.8688, longitude: 151.2093 },
      new Date("2026-08-27T12:00:00Z"),
    )[0];

    expect(first?.position).toBeDefined();
    expect(later?.position.azimuth).not.toBeCloseTo(first?.position.azimuth ?? 0, 4);
    expect(elsewhere?.position.altitude).not.toBeCloseTo(first?.position.altitude ?? 0, 4);
  });

  it("uses a bounded monotonic marker mapping and fails safely for NaN", () => {
    const magnitudes = [-2, 0, 2, 4, 5.5];
    const radii = magnitudes.map((magnitude) => starMarkerRadius(magnitude));
    const opacities = magnitudes.map((magnitude) => starMarkerOpacity(magnitude));

    expect(radii.every((radius) => radius !== null && radius >= 0.7 && radius <= 3)).toBe(true);
    expect(
      opacities.every((opacity) => opacity !== null && opacity >= 0.32 && opacity <= 0.82),
    ).toBe(true);
    for (let index = 1; index < radii.length; index += 1) {
      expect(radii[index - 1] ?? 0).toBeGreaterThanOrEqual(radii[index] ?? 0);
      expect(opacities[index - 1] ?? 0).toBeGreaterThanOrEqual(opacities[index] ?? 0);
    }
    expect(starMarkerRadius(5.5)).toBeCloseTo(0.7, 10);
    expect(starMarkerRadius(Number.NaN)).toBeNull();
    expect(starMarkerOpacity(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("excludes below-horizon rows and caps to the brightest deterministic 1,200", () => {
    const positioned = Array.from({ length: BRIGHT_STAR_RENDER_CAP + 2 }, (_, index) => ({
      sourceId: String(index + 10),
      gMagnitude: index === BRIGHT_STAR_RENDER_CAP + 1 ? -1 : index / 1_000,
      position: position(30, index % 360),
    }));
    positioned.push({ sourceId: "99999", gMagnitude: -1, position: position(-1, 0) });
    positioned[1] = { sourceId: "11", gMagnitude: 0, position: position(30, 1) };
    positioned[0] = { sourceId: "10", gMagnitude: 0, position: position(30, 0) };

    const selection = selectRenderedBrightContextStars(positioned);

    expect(selection.aboveHorizonCount).toBe(BRIGHT_STAR_RENDER_CAP + 2);
    expect(selection.capApplied).toBe(true);
    expect(selection.stars).toHaveLength(BRIGHT_STAR_RENDER_CAP);
    expect(selection.stars.map((item) => item.sourceId).slice(0, 3)).toEqual([
      String(BRIGHT_STAR_RENDER_CAP + 11),
      "10",
      "11",
    ]);
    expect(selection.stars.map((item) => item.sourceId)).not.toContain("99999");
  });

  it("preserves every above-horizon row when the cap is not reached", () => {
    const selection = selectRenderedBrightContextStars([
      { sourceId: "20", gMagnitude: 4, position: position(1, 0) },
      { sourceId: "10", gMagnitude: 2, position: position(0, 90) },
      { sourceId: "30", gMagnitude: 1, position: position(-0.1, 180) },
    ]);

    expect(selection.capApplied).toBe(false);
    expect(selection.aboveHorizonCount).toBe(2);
    expect(selection.stars.map((item) => item.sourceId)).toEqual(["10", "20"]);
  });
});

describe("named sky-anchor geometry", () => {
  it("uses spherical separation rather than screen distance and clamps the dot product", () => {
    expect(angularSeparationDegrees(position(20, 40), position(20, 40))).toBeLessThan(0.0001);
    expect(angularSeparationDegrees(position(0, 0), position(0, 90))).toBeCloseTo(90, 10);
    expect(angularSeparationDegrees(position(90, 0), position(-90, 180))).toBeCloseTo(180, 10);
    expect(angularSeparationDegrees(position(90, 0), position(90, 270))).toBeCloseTo(0, 10);
    expect(angularSeparationDegrees(position(Number.NaN, 0), position(0, 0))).toBeNull();
  });

  it("joins by exact Gaia source ID and sorts nearest anchors deterministically", () => {
    const rows = [
      {
        iauName: "Zulu",
        hipId: 3,
        constellationAbbreviation: "Aql",
        dateApproved: "2016/01/01",
        gaiaSourceId: "30",
        gaiaCrossmatchAngularDistanceArcsec: 0,
        gaiaCrossmatchNeighbourCount: 1,
        gaiaCrossmatchFlag: 8,
      },
      {
        iauName: "Alpha",
        hipId: 1,
        constellationAbbreviation: "Aql",
        dateApproved: "2016/01/01",
        gaiaSourceId: "10",
        gaiaCrossmatchAngularDistanceArcsec: 0,
        gaiaCrossmatchNeighbourCount: 1,
        gaiaCrossmatchFlag: 8,
      },
      {
        iauName: "Missing",
        hipId: 2,
        constellationAbbreviation: "Aql",
        dateApproved: "2016/01/01",
        gaiaSourceId: "999",
        gaiaCrossmatchAngularDistanceArcsec: 0,
        gaiaCrossmatchNeighbourCount: 1,
        gaiaCrossmatchFlag: 8,
      },
    ] as const;
    const stars = [
      { sourceId: "30", gMagnitude: 2, position: position(30, 90) },
      { sourceId: "10", gMagnitude: 2, position: position(30, 90) },
    ] as const;

    const anchors = positionNamedSkyAnchors(rows, stars, position(30, 90));
    expect(anchors.map((anchor) => anchor.iauName)).toEqual(["Alpha", "Zulu"]);
    expect(anchors.every((anchor) => anchor.angularSeparationDegrees === 0)).toBe(true);
    expect(anchors.map((anchor) => anchor.gaiaSourceId)).not.toContain("999");
  });

  it("limits labels to twelve above-horizon anchors with stable tie breaking", () => {
    const anchors = Array.from({ length: 13 }, (_, index) => ({
      iauName: index === 0 ? "Zulu" : `Anchor-${String(index).padStart(2, "0")}`,
      hipId: index + 1,
      constellationAbbreviation: "Aql",
      gaiaSourceId: String(index + 1),
      gMagnitude: 2,
      position: position(index === 12 ? -1 : 20, 10),
      angularSeparationDegrees: 5,
    }));

    const selected = selectNamedAnchorLabels(anchors);
    expect(selected).toHaveLength(12);
    expect(selected.map((anchor) => anchor.iauName)).toEqual([
      "Anchor-01",
      "Anchor-02",
      "Anchor-03",
      "Anchor-04",
      "Anchor-05",
      "Anchor-06",
      "Anchor-07",
      "Anchor-08",
      "Anchor-09",
      "Anchor-10",
      "Anchor-11",
      "Zulu",
    ]);
    expect(selectNamedAnchorLabels(anchors)).toEqual(selected);
  });
});

describe("constellation boundary projection", () => {
  const instant = new Date("2026-08-27T12:00:00Z");

  function longitudeForRightAscensionZero(): number {
    const siderealDegrees = Astronomy.SiderealTime(instant) * 15;
    const normalized = ((siderealDegrees + 180) % 360) - 180;
    return normalized === -180 ? 180 : -normalized;
  }

  function region(
    vertices: ReadonlyArray<{ rightAscensionDegrees: number; declinationDegrees: number }>,
  ): ConstellationRegion {
    return {
      abbreviation: "Fixture",
      latinName: "Fixture",
      englishName: "Fixture",
      boundaryParts: [{ sourceFile: "fixture.txt", vertices }],
    };
  }

  function expectFinitePaths(
    paths: ReadonlyArray<ReadonlyArray<{ x: number; y: number; altitude: number }>>,
  ): void {
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => path.length >= 2)).toBe(true);
    expect(
      paths.flat().every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
    ).toBe(true);
  }

  it("retains above-horizon geometry and clips a boundary at the horizon", () => {
    const longitude = longitudeForRightAscensionZero();
    const paths = projectConstellationBoundary(
      region([
        { rightAscensionDegrees: 0, declinationDegrees: 0 },
        { rightAscensionDegrees: 180, declinationDegrees: 0 },
        { rightAscensionDegrees: 359, declinationDegrees: 0 },
      ]),
      { latitude: 0, longitude },
      instant,
      options,
    );

    expectFinitePaths(paths);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths.flat().every((point) => point.altitude >= 0)).toBe(true);
  });

  it("does not render a wholly below-horizon region", () => {
    const longitude = longitudeForRightAscensionZero();
    const paths = projectConstellationBoundary(
      region([
        { rightAscensionDegrees: 179, declinationDegrees: 0 },
        { rightAscensionDegrees: 181, declinationDegrees: 0 },
        { rightAscensionDegrees: 180, declinationDegrees: 2 },
      ]),
      { latitude: 0, longitude },
      instant,
      options,
    );

    expect(paths).toEqual([]);
  });

  it("handles RA wrap and northern/southern high-declination regions finitely", () => {
    const longitude = longitudeForRightAscensionZero();
    const wrapPaths = projectConstellationBoundary(
      region([
        { rightAscensionDegrees: 359, declinationDegrees: 0 },
        { rightAscensionDegrees: 1, declinationDegrees: 0 },
        { rightAscensionDegrees: 1, declinationDegrees: 2 },
        { rightAscensionDegrees: 359, declinationDegrees: 2 },
      ]),
      { latitude: 0, longitude },
      instant,
      options,
    );
    const northPaths = projectConstellationBoundary(
      region([
        { rightAscensionDegrees: 359, declinationDegrees: 88 },
        { rightAscensionDegrees: 1, declinationDegrees: 88 },
        { rightAscensionDegrees: 1, declinationDegrees: 89 },
        { rightAscensionDegrees: 359, declinationDegrees: 89 },
      ]),
      { latitude: 80, longitude },
      instant,
      options,
    );
    const southPaths = projectConstellationBoundary(
      region([
        { rightAscensionDegrees: 359, declinationDegrees: -89 },
        { rightAscensionDegrees: 1, declinationDegrees: -89 },
        { rightAscensionDegrees: 1, declinationDegrees: -88 },
        { rightAscensionDegrees: 359, declinationDegrees: -88 },
      ]),
      { latitude: -80, longitude },
      instant,
      options,
    );

    expectFinitePaths(wrapPaths);
    expectFinitePaths(northPaths);
    expectFinitePaths(southPaths);
  });
});
