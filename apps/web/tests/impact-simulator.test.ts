import { describe, expect, it } from "vitest";

import rawImpactArtifact from "../../../data/seed/impact-simulator-v1.json";
import {
  DEFAULT_IMPACT_SIMULATOR_STATE,
  ImpactSimulatorArtifactValidationError,
  decodeImpactSimulatorState,
  encodeImpactSimulatorState,
  impactSimulatorRequestEndpoint,
  validateImpactSimulatorArtifact,
  validateImpactSimulatorCalculationResult,
  validateImpactSimulatorState,
} from "../src/lib/simulations/impact-simulator";
import { IMPACT_SIMULATOR_DEFAULT_RESULT } from "./impact-simulator-fixture";

describe("Impact Simulator browser contract", () => {
  it("round-trips only the exact canonical ordered share state", () => {
    const encoded = encodeImpactSimulatorState(DEFAULT_IMPACT_SIMULATOR_STATE);
    expect(decodeImpactSimulatorState(encoded)).toEqual(DEFAULT_IMPACT_SIMULATOR_STATE);
    expect(decodeImpactSimulatorState(`${encoded} `)).toBeNull();
    expect(
      validateImpactSimulatorState({ ...DEFAULT_IMPACT_SIMULATOR_STATE, invented: true }),
    ).toBeNull();
  });

  it("rejects out-of-domain or non-solid target state without normalizing", () => {
    expect(
      validateImpactSimulatorState({
        ...DEFAULT_IMPACT_SIMULATOR_STATE,
        diameter_m: 1_499,
      }),
    ).toBeNull();
    expect(
      validateImpactSimulatorState({
        ...DEFAULT_IMPACT_SIMULATOR_STATE,
        speed_km_s: 72.01,
      }),
    ).toBeNull();
    expect(
      validateImpactSimulatorState({
        ...DEFAULT_IMPACT_SIMULATOR_STATE,
        target_material: "water",
      }),
    ).toBeNull();
  });

  it("builds the exact GET query and accepts only the exact echoed canonical result", () => {
    const endpoint = impactSimulatorRequestEndpoint(DEFAULT_IMPACT_SIMULATOR_STATE);
    const url = new URL(endpoint.path, "http://localhost");
    expect(url.pathname).toBe("/api/v1/simulations/impact-simulator");
    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      diameter_m: "1500",
      impactor_density_kg_m3: "3000",
      speed_km_s: "17",
      impact_angle_deg: "45",
      target_material: "sedimentary_rock",
    });
    expect(
      validateImpactSimulatorCalculationResult(
        DEFAULT_IMPACT_SIMULATOR_STATE,
        IMPACT_SIMULATOR_DEFAULT_RESULT,
      ),
    ).toEqual(IMPACT_SIMULATOR_DEFAULT_RESULT);
    expect(
      validateImpactSimulatorCalculationResult(DEFAULT_IMPACT_SIMULATOR_STATE, {
        ...IMPACT_SIMULATOR_DEFAULT_RESULT,
        invented: true,
      }),
    ).toBeNull();
  });

  it("rejects result/state echo mismatch without recalculating impact science", () => {
    expect(
      validateImpactSimulatorCalculationResult(
        { ...DEFAULT_IMPACT_SIMULATOR_STATE, diameter_m: 2_000 },
        IMPACT_SIMULATOR_DEFAULT_RESULT,
      ),
    ).toBeNull();
  });

  it("fails closed if the reviewed Impact artifact source identity drifts", () => {
    const mutated = structuredClone(rawImpactArtifact);
    mutated.sources[0]!.id = "invented-source";
    expect(() => validateImpactSimulatorArtifact(mutated)).toThrow(
      ImpactSimulatorArtifactValidationError,
    );
  });
});
