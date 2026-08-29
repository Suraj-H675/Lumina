import { describe, expect, it } from "vitest";

import type { EntityDetailResponse } from "@lumina/api-client";

import {
  ASTROMETRY_DATASET_CODE,
  DECLINATION_QUANTITY_CODE,
  DEGREES_UNIT_CODE,
  RIGHT_ASCENSION_QUANTITY_CODE,
  computeObservationPlan,
  extractCoordinatePairs,
  localInstantForNightTime,
} from "../src/lib/observation/domain";
import {
  analyzeTonightCollection,
  initialTonightCollectionId,
  sortTonightTargets,
  type TonightDetailCandidate,
  type TonightTargetIdentity,
} from "../src/lib/tonight/domain";

const NIGHT = "2026-08-27";
const LOCATION = { latitude: 12.972, longitude: 77.594 } as const;

const source = {
  dataset: {
    code: ASTROMETRY_DATASET_CODE,
    name: "Gaia Data Release 3 main source catalogue — reviewed astrometry slice",
    release_version: "dr3",
  },
  provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
  source_record_id: "gaia-source-record-3910747531814692736",
} as const;

type CoordinateOverrides = Readonly<{
  declination?: string;
  rightAscension?: string;
}>;

function identity(slug: string, canonicalName = slug.toUpperCase()): TonightTargetIdentity {
  return { canonical_name: canonicalName, entity_type: "star", slug };
}

function detailFor(
  target: TonightTargetIdentity,
  overrides: CoordinateOverrides = {},
): EntityDetailResponse {
  const measurement = (code: string, value: string) => ({
    current_selection: {
      measurement: {
        id: `${target.slug}-${code}`,
        original_unit: DEGREES_UNIT_CODE,
        original_value: value,
        source,
        unit: { code: DEGREES_UNIT_CODE, name: "degree", symbol: "deg" },
        value,
      },
      selection: {
        explanation: "Only reviewed measurement for this quantity.",
        rule: "single-reviewed-measurement",
        selected_at: "2026-08-27T00:00:00Z",
        version: "1",
      },
    },
    measurement_count: 1,
    quantity: { code, name: code },
  });

  return {
    canonical_name: target.canonical_name,
    entity_type: target.entity_type,
    id: `${target.slug}-id`,
    quantities: [
      measurement(RIGHT_ASCENSION_QUANTITY_CODE, overrides.rightAscension ?? "296.0037539639907"),
      measurement(DECLINATION_QUANTITY_CODE, overrides.declination ?? "44.2775873685433"),
    ],
  };
}

function loaded(target: TonightTargetIdentity, detail = detailFor(target)): TonightDetailCandidate {
  return { detail, item: target, kind: "ok" };
}

function multipleSourceDetail(target: TonightTargetIdentity): EntityDetailResponse {
  const first = detailFor(target);
  const secondSource = { ...source, source_record_id: "gaia-source-record-2835207319109249920" };
  return {
    ...first,
    quantities: [
      ...first.quantities,
      {
        ...first.quantities[0]!,
        current_selection: {
          ...first.quantities[0]!.current_selection!,
          measurement: {
            ...first.quantities[0]!.current_selection!.measurement,
            id: `${target.slug}-second-ra`,
            source: secondSource,
            value: "344.3675708158258",
          },
        },
      },
      {
        ...first.quantities[1]!,
        current_selection: {
          ...first.quantities[1]!.current_selection!,
          measurement: {
            ...first.quantities[1]!.current_selection!.measurement,
            id: `${target.slug}-second-dec`,
            source: secondSource,
            value: "20.769104345387106",
          },
        },
      },
    ],
  };
}

describe("Tonight domain", () => {
  it("selects the first non-empty collection initially and preserves collection order", () => {
    expect(
      initialTonightCollectionId([
        { id: "empty", items: [] },
        { id: "first-non-empty", items: [identity("k2-18")] },
        { id: "later-non-empty", items: [identity("kepler-452")] },
      ]),
    ).toBe("first-non-empty");
    expect(initialTonightCollectionId([{ id: "only-empty", items: [] }])).toBe("only-empty");
    expect(initialTonightCollectionId([])).toBeNull();
  });

  it("marks zero coordinate pairs as missing and multiple pairs as unresolved", () => {
    const missing = identity("missing-coordinates", "Missing Coordinates");
    const multiple = identity("multiple-coordinates", "Multiple Coordinates");
    const noCoordinatesDetail = { ...detailFor(missing), quantities: [] };
    const result = analyzeTonightCollection(
      [loaded(missing, noCoordinatesDetail), loaded(multiple, multipleSourceDetail(multiple))],
      LOCATION,
      NIGHT,
    );

    expect(result?.unresolved).toEqual([
      expect.objectContaining({ item: missing, kind: "missing-coordinate" }),
      expect.objectContaining({ item: multiple, kind: "multiple-coordinate-sources" }),
    ]);
    expect(result?.aboveHorizon).toHaveLength(0);
    expect(result?.belowHorizon).toHaveLength(0);
  });

  it("keeps exactly one accepted coordinate pair eligible for analysis", () => {
    const target = identity("one-pair", "One Pair");
    const result = analyzeTonightCollection([loaded(target)], LOCATION, NIGHT);

    expect(result?.summary.scientificallyAnalyzedCount).toBe(1);
    expect(result?.aboveHorizon.length).toBe(1);
    expect(result?.aboveHorizon[0]?.item.canonical_name).toBe("One Pair");
    expect(result?.aboveHorizon[0]?.peak.altitude).toBeGreaterThan(0);
  });

  it("keeps a signed below-horizon maximum in the secondary group", () => {
    const target = identity("below", "Below");
    const result = analyzeTonightCollection(
      [
        loaded(
          target,
          detailFor(target, { rightAscension: "172.5601297577743", declination: "-80" }),
        ),
      ],
      { latitude: 45, longitude: 0 },
      NIGHT,
    );

    expect(result?.aboveHorizon).toHaveLength(0);
    expect(result?.belowHorizon).toHaveLength(1);
    expect(result?.belowHorizon[0]?.peak.altitude).toBeLessThanOrEqual(0);
  });

  it("returns a common no-darkness state without fabricating an ordering", () => {
    const target = identity("polar-nightless", "Polar Nightless");
    const result = analyzeTonightCollection(
      [loaded(target)],
      { latitude: 80, longitude: 0 },
      "2026-06-21",
    );

    expect(result?.night.astronomicalDarkness).toBeNull();
    expect(result?.aboveHorizon).toEqual([]);
    expect(result?.belowHorizon).toEqual([]);
    expect(result?.notRanked).toEqual([
      expect.objectContaining({ item: target, kind: "no-darkness" }),
    ]);
  });

  it("sorts primary targets by altitude, peak time, or stable name", () => {
    const makeTarget = (slug: string, altitude: number, peak: string, name: string) => ({
      coordinate: extractCoordinatePairs(detailFor(identity(slug, name)))[0]!,
      item: identity(slug, name),
      kind: "above-horizon" as const,
      moon: null,
      peak: {
        altitude,
        azimuth: 90,
        compass: "E",
        instant: new Date(peak),
      },
      targetEvents: {
        rise: { kind: "not-during-night" as const },
        set: { kind: "not-during-night" as const },
        transit: { kind: "not-during-night" as const },
      },
    });
    const targets = [
      makeTarget("zeta", 42, "2026-08-27T23:00:00Z", "Zeta"),
      makeTarget("alpha", 42, "2026-08-27T22:00:00Z", "Alpha"),
      makeTarget("beta", 42, "2026-08-27T22:00:00Z", "Beta"),
      makeTarget("highest", 61, "2026-08-28T01:00:00Z", "Highest"),
    ];

    expect(
      sortTonightTargets(targets, "highest-altitude").map((target) => target.item.slug),
    ).toEqual(["highest", "alpha", "beta", "zeta"]);
    expect(sortTonightTargets(targets, "peak-time").map((target) => target.item.slug)).toEqual([
      "alpha",
      "beta",
      "zeta",
      "highest",
    ]);
    expect(sortTonightTargets(targets, "name").map((target) => target.item.slug)).toEqual([
      "alpha",
      "beta",
      "highest",
      "zeta",
    ]);
  });

  it("uses the same observation geometry and lunar path as the detailed planner", () => {
    const target = identity("shared-science", "Shared Science");
    const detail = detailFor(target);
    const coordinate = extractCoordinatePairs(detail)[0];
    const selected = localInstantForNightTime(NIGHT, "22:00");
    expect(coordinate).toBeDefined();
    expect(selected).not.toBeNull();
    const plan = computeObservationPlan(coordinate!, LOCATION, NIGHT, selected!);
    const result = analyzeTonightCollection([loaded(target, detail)], LOCATION, NIGHT);
    const tonight = result?.aboveHorizon[0] ?? result?.belowHorizon[0];

    expect(plan).not.toBeNull();
    expect(tonight).toBeDefined();
    expect(tonight?.peak.altitude).toBe(plan?.maxDuringDarkness?.altitude);
    expect(tonight?.peak.instant).toEqual(plan?.maxDuringDarkness?.instant);
    expect(tonight?.moon?.position.altitude).toBeTypeOf("number");
    expect(tonight?.moon?.position.azimuth).toBeGreaterThanOrEqual(0);
    expect(tonight?.moon?.position.azimuth).toBeLessThan(360);
    expect(tonight?.moon?.illuminationFraction).toBeGreaterThanOrEqual(0);
    expect(tonight?.moon?.illuminationFraction).toBeLessThanOrEqual(1);
    expect(tonight?.moon?.targetSeparationDegrees).toBeGreaterThanOrEqual(0);
    expect(tonight?.moon?.targetSeparationDegrees).toBeLessThanOrEqual(180);
  });

  it("handles the accepted one-hundred-target analysis bound deterministically", () => {
    const targets = Array.from({ length: 100 }, (_, index) => {
      const slug = `target-${String(index).padStart(3, "0")}`;
      const target = identity(slug, `Target ${String(index).padStart(3, "0")}`);
      return loaded(target);
    });

    const result = analyzeTonightCollection(targets, LOCATION, NIGHT);
    const analyzed = [...(result?.aboveHorizon ?? []), ...(result?.belowHorizon ?? [])];

    expect(result?.summary.savedTargetCount).toBe(100);
    expect(result?.summary.scientificallyAnalyzedCount).toBe(100);
    expect(sortTonightTargets(analyzed, "name").map((target) => target.item.slug)).toEqual(
      targets.map((target) => target.item.slug),
    );
  });
});
