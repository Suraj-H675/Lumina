import { describe, expect, it } from "vitest";

import rawSeasonsArtifact from "../../../data/seed/seasons-simulator-v1.json";

import {
  DEFAULT_SEASONS_STATE,
  SEASONS_CONSTANTS,
  SEASONS_DEFINITION,
  SEASONS_PRESETS,
  SEASONS_SCIENTIFIC_VALIDATION,
  SEASONS_SOURCES,
  SEASONS_VALIDATION_FIXTURES,
  SeasonsArtifactValidationError,
  buildSeasonsVisualTransform,
  canonicalizeSeasonsOrbitalPosition,
  decodeSeasonsState,
  encodeSeasonsState,
  validateSeasonsArtifact,
  validateSeasonsCalculationResult,
  validateSeasonsState,
} from "../src/lib/simulations/seasons-simulator";
import type { SeasonsCalculationResponse } from "@lumina/api-client";

const JUNE_RESULT: SeasonsCalculationResponse = {
  model_version: "seasons-simulator-v1",
  schema_version: 1,
  inputs: {
    axial_tilt_deg: 23.43928,
    orbital_position_deg: 90,
    latitude_deg: 40,
    eccentricity_preset: "earth",
  },
  solar_declination_deg: 23.43928,
  selected: {
    latitude_deg: 40,
    noon_solar_zenith_deg: 16.56072,
    noon_sun_altitude_deg: 73.43928,
    illumination_incidence_deg: 16.56072,
    day_length_hours: 14.8444511275,
    polar_state: "none",
  },
  comparison_latitude_deg: -40,
  opposite_hemisphere: {
    latitude_deg: -40,
    noon_solar_zenith_deg: 63.43928,
    noon_sun_altitude_deg: 26.56072,
    illumination_incidence_deg: 63.43928,
    day_length_hours: 9.1555488725,
    polar_state: "none",
  },
  eccentricity: 0.01671123,
  distance_over_semimajor_axis: 1.0162727707813541,
  relative_solar_flux: 0.9682319752100141,
};

describe("Seasons Simulator reviewed artifact and state boundary", () => {
  it("publishes the frozen definition, constants, presets, fixtures, and provenance", () => {
    expect(SEASONS_DEFINITION).toMatchObject({
      slug: "seasons-simulator",
      title: "Seasons Simulator",
      content_type: "interactive-simulation",
      status: "ready",
      version: 1,
      model_version: "seasons-simulator-v1",
      share_schema_version: 1,
    });
    expect(SEASONS_DEFINITION.learning_objectives).toHaveLength(5);
    expect(SEASONS_DEFINITION.assumptions.length).toBeGreaterThan(0);
    expect(SEASONS_DEFINITION.limitations.length).toBeGreaterThan(0);
    expect(SEASONS_DEFINITION.references).toEqual(SEASONS_SOURCES.map((source) => source.id));
    expect(SEASONS_DEFINITION.validation_fixtures).toEqual(
      SEASONS_VALIDATION_FIXTURES.map((fixture) => fixture.id),
    );
    expect(SEASONS_CONSTANTS.EARTH_OBLIQUITY_J2000_DEG).toBe(23.43928);
    expect(SEASONS_CONSTANTS.EARTH_ECCENTRICITY).toBe(0.01671123);
    expect(SEASONS_CONSTANTS.PERIHELION_SEASONAL_LONGITUDE_DEG).toBe(282.93768193);
    expect(SEASONS_PRESETS).toEqual({ circular: 0, earth: 0.01671123, exaggerated: 0.1 });
    expect(SEASONS_SCIENTIFIC_VALIDATION.id).toBe("seasons-simulator-independent-validation-v1");
    expect(SEASONS_SOURCES.every((source) => source.url.startsWith("https://"))).toBe(true);
  });

  it("rejects a mutated reviewed artifact instead of exposing it to presentation", () => {
    const mutated = structuredClone(rawSeasonsArtifact) as {
      constants: { EARTH_ECCENTRICITY: number };
    };
    mutated.constants.EARTH_ECCENTRICITY = 0.5;

    expect(() => validateSeasonsArtifact(mutated)).toThrow(SeasonsArtifactValidationError);
  });

  it("accepts the exact default state and emits the canonical share schema", () => {
    expect(validateSeasonsState(DEFAULT_SEASONS_STATE)).toEqual(DEFAULT_SEASONS_STATE);
    expect(encodeSeasonsState(DEFAULT_SEASONS_STATE)).toBe(
      '{"version":1,"model_version":"seasons-simulator-v1","axial_tilt_deg":23.43928,"orbital_position_deg":90,"latitude_deg":40,"eccentricity_preset":"earth"}',
    );
    expect(decodeSeasonsState(encodeSeasonsState(DEFAULT_SEASONS_STATE))).toEqual(
      DEFAULT_SEASONS_STATE,
    );
  });

  it("rejects unsupported, additive, non-canonical, and invalid serialized state", () => {
    expect(decodeSeasonsState("not-json")).toBeNull();
    expect(decodeSeasonsState('{"version":2}')).toBeNull();
    expect(
      decodeSeasonsState(
        '{"version":1,"model_version":"seasons-simulator-v1","axial_tilt_deg":23.43928,"orbital_position_deg":90,"latitude_deg":40,"eccentricity_preset":"earth","extra":true}',
      ),
    ).toBeNull();
    expect(
      decodeSeasonsState(
        '{"version":1,"model_version":"seasons-simulator-v1","axial_tilt_deg":23.43928,"orbital_position_deg":360,"latitude_deg":40,"eccentricity_preset":"earth"}',
      ),
    ).toBeNull();
    expect(
      decodeSeasonsState(
        ' {"version":1,"model_version":"seasons-simulator-v1","axial_tilt_deg":23.43928,"orbital_position_deg":90,"latitude_deg":40,"eccentricity_preset":"earth"}',
      ),
    ).toBeNull();
    expect(
      validateSeasonsState({ ...DEFAULT_SEASONS_STATE, axial_tilt_deg: Number.NaN }),
    ).toBeNull();
    expect(
      validateSeasonsState({ ...DEFAULT_SEASONS_STATE, eccentricity_preset: "unknown" }),
    ).toBeNull();
  });

  it("canonicalizes only the visual 360-degree endpoint", () => {
    expect(canonicalizeSeasonsOrbitalPosition(360)).toBe(0);
    expect(canonicalizeSeasonsOrbitalPosition(0)).toBe(0);
    expect(canonicalizeSeasonsOrbitalPosition(-20)).toBeNull();
    expect(canonicalizeSeasonsOrbitalPosition(720)).toBeNull();
  });
});

describe("Seasons Simulator browser result boundary", () => {
  it("accepts the versioned known-case response without calculating it", () => {
    const result = validateSeasonsCalculationResult(DEFAULT_SEASONS_STATE, JUNE_RESULT);

    expect(result).toEqual(JUNE_RESULT);
    expect(result?.selected.day_length_hours).toBe(14.8444511275);
    expect(result?.opposite_hemisphere.day_length_hours).toBe(9.1555488725);
  });

  it("rejects a response for a different state or with additive fields", () => {
    expect(
      validateSeasonsCalculationResult({ ...DEFAULT_SEASONS_STATE, latitude_deg: 41 }, JUNE_RESULT),
    ).toBeNull();
    expect(
      validateSeasonsCalculationResult(DEFAULT_SEASONS_STATE, {
        ...JUNE_RESULT,
        unexpected: true,
      }),
    ).toBeNull();
  });

  it("keeps visualization output explicitly downstream of canonical normalized outputs", () => {
    const visual = buildSeasonsVisualTransform(DEFAULT_SEASONS_STATE, JUNE_RESULT);

    expect(visual).not.toBeNull();
    expect(visual?.orbit.earth_x_percent).toBeCloseTo(50, 10);
    expect(visual?.orbit.major_radius_percent).toBe(32);
    expect(visual?.orbit.minor_radius_percent).toBeCloseTo(31.465241, 5);
    expect(buildSeasonsVisualTransform(DEFAULT_SEASONS_STATE, null)).toBeNull();
  });
});
