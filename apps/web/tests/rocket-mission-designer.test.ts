import { describe, expect, it } from "vitest";

import rawRocketArtifact from "../../../data/seed/rocket-mission-designer-v1.json";
import {
  DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
  RocketMissionDesignerArtifactValidationError,
  decodeRocketMissionDesignerState,
  encodeRocketMissionDesignerState,
  rocketMissionDesignerRequestEndpoint,
  validateRocketMissionDesignerArtifact,
  validateRocketMissionDesignerCalculationResult,
  validateRocketMissionDesignerState,
} from "../src/lib/simulations/rocket-mission-designer";
import { ROCKET_MISSION_DESIGNER_DEFAULT_RESULT } from "./rocket-mission-designer-fixture";

describe("Rocket / Mission Designer browser contract", () => {
  it("round-trips only the exact canonical ordered share state", () => {
    const encoded = encodeRocketMissionDesignerState(DEFAULT_ROCKET_MISSION_DESIGNER_STATE);
    expect(decodeRocketMissionDesignerState(encoded)).toEqual(
      DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
    );
    expect(decodeRocketMissionDesignerState(`${encoded} `)).toBeNull();
    expect(
      validateRocketMissionDesignerState({
        ...DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
        invented: true,
      }),
    ).toBeNull();
  });

  it("rejects invalid closed identifiers and per-stage bounds without normalizing", () => {
    expect(
      validateRocketMissionDesignerState({
        ...DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
        gravity_body: "venus",
      }),
    ).toBeNull();
    expect(
      validateRocketMissionDesignerState({
        ...DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
        stages: [
          {
            ...DEFAULT_ROCKET_MISSION_DESIGNER_STATE.stages[0]!,
            specific_impulse_s: 501,
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects a share state above the reviewed total submitted launch-mass guard", () => {
    expect(
      validateRocketMissionDesignerState({
        ...DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
        payload_mass_kg: 300_000,
        stages: [
          {
            dry_mass_kg: 2_000_000,
            propellant_mass_kg: 5_000_000,
            specific_impulse_s: 300,
            thrust_n: 7_000_000,
          },
          {
            dry_mass_kg: 2_000_000,
            propellant_mass_kg: 5_000_000,
            specific_impulse_s: 350,
            thrust_n: 1_000_000,
          },
        ],
      }),
    ).toBeNull();
  });

  it("builds repeated stage query arrays and accepts only the exact echoed canonical result", () => {
    const endpoint = rocketMissionDesignerRequestEndpoint(DEFAULT_ROCKET_MISSION_DESIGNER_STATE);
    const url = new URL(endpoint.path, "http://localhost");
    expect(url.searchParams.getAll("stage_dry_mass_kg")).toEqual(["30000", "8000"]);
    expect(url.searchParams.getAll("stage_propellant_mass_kg")).toEqual(["400000", "40000"]);
    expect(url.searchParams.getAll("stage_specific_impulse_s")).toEqual(["300", "350"]);
    expect(url.searchParams.getAll("stage_thrust_n")).toEqual(["7000000", "1000000"]);
    expect(
      validateRocketMissionDesignerCalculationResult(
        DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
        ROCKET_MISSION_DESIGNER_DEFAULT_RESULT,
      ),
    ).toEqual(ROCKET_MISSION_DESIGNER_DEFAULT_RESULT);
    expect(
      validateRocketMissionDesignerCalculationResult(DEFAULT_ROCKET_MISSION_DESIGNER_STATE, {
        ...ROCKET_MISSION_DESIGNER_DEFAULT_RESULT,
        invented: true,
      }),
    ).toBeNull();
  });

  it("rejects result/state echo mismatch without recalculating rocket science", () => {
    expect(
      validateRocketMissionDesignerCalculationResult(
        {
          ...DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
          payload_mass_kg: 5_001,
        },
        ROCKET_MISSION_DESIGNER_DEFAULT_RESULT,
      ),
    ).toBeNull();
  });

  it("fails closed if the reviewed Rocket artifact source identity drifts", () => {
    const mutated = structuredClone(rawRocketArtifact);
    mutated.sources[0]!.id = "invented-source";
    expect(() => validateRocketMissionDesignerArtifact(mutated)).toThrow(
      RocketMissionDesignerArtifactValidationError,
    );
  });
});
