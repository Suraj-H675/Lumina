import { describe, expect, it } from "vitest";

import rawBlackHoleArtifact from "../../../data/seed/black-hole-relativity-v1.json";
import {
  BLACK_HOLE_RELATIVITY_LANDMARK_DEFINITIONS,
  DEFAULT_BLACK_HOLE_RELATIVITY_STATE,
  BlackHoleRelativityArtifactValidationError,
  blackHoleRelativityRequestEndpoint,
  decodeBlackHoleRelativityState,
  encodeBlackHoleRelativityState,
  validateBlackHoleRelativityArtifact,
  validateBlackHoleRelativityCalculationResult,
  validateBlackHoleRelativityState,
} from "../src/lib/simulations/black-hole-relativity";
import { BLACK_HOLE_RELATIVITY_DEFAULT_RESULT } from "./black-hole-relativity-fixture";

describe("Black-Hole / Relativity Lab browser contract", () => {
  it("round-trips only the exact canonical ordered share state", () => {
    const encoded = encodeBlackHoleRelativityState(DEFAULT_BLACK_HOLE_RELATIVITY_STATE);
    expect(decodeBlackHoleRelativityState(encoded)).toEqual(DEFAULT_BLACK_HOLE_RELATIVITY_STATE);
    expect(decodeBlackHoleRelativityState(`${encoded} `)).toBeNull();
    expect(
      validateBlackHoleRelativityState({
        ...DEFAULT_BLACK_HOLE_RELATIVITY_STATE,
        invented: true,
      }),
    ).toBeNull();
  });

  it("rejects horizon/inside-horizon and over-budget state without normalizing", () => {
    expect(
      validateBlackHoleRelativityState({
        ...DEFAULT_BLACK_HOLE_RELATIVITY_STATE,
        static_observer_radius_rs: 1,
      }),
    ).toBeNull();
    expect(
      validateBlackHoleRelativityState({
        ...DEFAULT_BLACK_HOLE_RELATIVITY_STATE,
        mass_nominal_solar: 1e10 + 1,
      }),
    ).toBeNull();
  });

  it("builds the exact GET query and accepts only the exact echoed canonical result", () => {
    const endpoint = blackHoleRelativityRequestEndpoint(DEFAULT_BLACK_HOLE_RELATIVITY_STATE);
    const url = new URL(endpoint.path, "http://localhost");
    expect(url.pathname).toBe("/api/v1/simulations/black-hole-relativity");
    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      mass_nominal_solar: "10",
      static_observer_radius_rs: "2",
    });
    expect(
      validateBlackHoleRelativityCalculationResult(
        DEFAULT_BLACK_HOLE_RELATIVITY_STATE,
        BLACK_HOLE_RELATIVITY_DEFAULT_RESULT,
      ),
    ).toEqual(BLACK_HOLE_RELATIVITY_DEFAULT_RESULT);
    expect(
      validateBlackHoleRelativityCalculationResult(DEFAULT_BLACK_HOLE_RELATIVITY_STATE, {
        ...BLACK_HOLE_RELATIVITY_DEFAULT_RESULT,
        invented: true,
      }),
    ).toBeNull();
  });

  it("rejects result/state echo mismatch without recalculating relativity", () => {
    expect(
      validateBlackHoleRelativityCalculationResult(
        {
          ...DEFAULT_BLACK_HOLE_RELATIVITY_STATE,
          static_observer_radius_rs: 4,
        },
        BLACK_HOLE_RELATIVITY_DEFAULT_RESULT,
      ),
    ).toBeNull();
  });

  it("takes landmark identities and normalized radii from the reviewed artifact", () => {
    expect(
      BLACK_HOLE_RELATIVITY_LANDMARK_DEFINITIONS.map((row) => ({
        id: row.id,
        radius_rs: row.radius_rs,
      })),
    ).toEqual(
      BLACK_HOLE_RELATIVITY_DEFAULT_RESULT.landmarks.map((row) => ({
        id: row.id,
        radius_rs: row.radius_rs,
      })),
    );
  });

  it("fails closed if the reviewed Black-Hole artifact source identity drifts", () => {
    const mutated = structuredClone(rawBlackHoleArtifact);
    mutated.sources[0]!.id = "invented-source";
    expect(() => validateBlackHoleRelativityArtifact(mutated)).toThrow(
      BlackHoleRelativityArtifactValidationError,
    );
  });
});
