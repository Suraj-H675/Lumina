import { describe, expect, it } from "vitest";

import rawBuilderArtifact from "../../../data/seed/planetary-system-builder-v1.json";
import {
  DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
  PlanetarySystemBuilderArtifactValidationError,
  decodePlanetarySystemBuilderState,
  encodePlanetarySystemBuilderState,
  planetarySystemBuilderRequestEndpoint,
  validatePlanetarySystemBuilderArtifact,
  validatePlanetarySystemBuilderCalculationResult,
  validatePlanetarySystemBuilderState,
} from "../src/lib/simulations/planetary-system-builder";
import { PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT } from "./planetary-system-builder-fixture";

describe("Planetary System Builder browser contract", () => {
  it("round-trips only the exact canonical ordered share state", () => {
    const encoded = encodePlanetarySystemBuilderState(DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE);
    expect(decodePlanetarySystemBuilderState(encoded)).toEqual(
      DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
    );
    expect(decodePlanetarySystemBuilderState(`${encoded} `)).toBeNull();
    expect(
      validatePlanetarySystemBuilderState({
        ...DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
        invented: true,
      }),
    ).toBeNull();
  });

  it("rejects equal or descending submitted semimajor axes instead of sorting", () => {
    expect(
      validatePlanetarySystemBuilderState({
        ...DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
        planets: [
          { mass_mearth: 1, semi_major_axis_au: 1 },
          { mass_mearth: 1, semi_major_axis_au: 1 },
        ],
      }),
    ).toBeNull();
    expect(
      validatePlanetarySystemBuilderState({
        ...DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
        planets: [
          { mass_mearth: 1, semi_major_axis_au: 2 },
          { mass_mearth: 1, semi_major_axis_au: 1 },
        ],
      }),
    ).toBeNull();
  });

  it("builds repeated query arrays and accepts only the exact echoed canonical result", () => {
    const endpoint = planetarySystemBuilderRequestEndpoint(DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE);
    const url = new URL(endpoint.path, "http://localhost");
    expect(url.searchParams.getAll("planet_mass_mearth")).toEqual(["1", "1", "1"]);
    expect(url.searchParams.getAll("semi_major_axis_au")).toEqual(["0.7", "1", "2"]);
    expect(
      validatePlanetarySystemBuilderCalculationResult(
        DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
        PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT,
      ),
    ).toEqual(PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT);
    expect(
      validatePlanetarySystemBuilderCalculationResult(DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE, {
        ...PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT,
        invented: true,
      }),
    ).toBeNull();
  });

  it("rejects result/state echo mismatch without recalculating scientific values", () => {
    expect(
      validatePlanetarySystemBuilderCalculationResult(
        {
          ...DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
          stellar_mass_msun: 1.1,
        },
        PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT,
      ),
    ).toBeNull();
  });

  it("fails closed if the reviewed Builder artifact source identity drifts", () => {
    const mutated = structuredClone(rawBuilderArtifact);
    mutated.sources[0]!.id = "invented-source";
    expect(() => validatePlanetarySystemBuilderArtifact(mutated)).toThrow(
      PlanetarySystemBuilderArtifactValidationError,
    );
  });
});
