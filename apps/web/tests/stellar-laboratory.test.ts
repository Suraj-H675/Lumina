import { describe, expect, it } from "vitest";

import {
  DEFAULT_STELLAR_LABORATORY_STATE,
  decodeStellarLaboratoryState,
  encodeStellarLaboratoryState,
  stellarLaboratoryRequestEndpoint,
  validateStellarLaboratoryCalculationResult,
  validateStellarLaboratoryState,
} from "../src/lib/simulations/stellar-laboratory";
import {
  STELLAR_LABORATORY_DEFAULT_RESULT,
  STELLAR_LABORATORY_TEN_SOLAR_MASS_RESULT,
} from "./stellar-laboratory-fixture";

describe("Stellar Laboratory browser contract", () => {
  it("round-trips only the exact versioned share state", () => {
    const encoded = encodeStellarLaboratoryState(DEFAULT_STELLAR_LABORATORY_STATE);
    expect(decodeStellarLaboratoryState(encoded)).toEqual(DEFAULT_STELLAR_LABORATORY_STATE);
    expect(decodeStellarLaboratoryState(`${encoded} `)).toBeNull();
    expect(
      validateStellarLaboratoryState({
        ...DEFAULT_STELLAR_LABORATORY_STATE,
        invented: true,
      }),
    ).toBeNull();
  });

  it("rejects non-finite and out-of-domain mass without clamping", () => {
    for (const initial_mass_msun of [Number.NaN, Number.POSITIVE_INFINITY, 0.3999, 29.67]) {
      expect(
        validateStellarLaboratoryState({
          version: 1,
          model_version: "stellar-laboratory-v1",
          initial_mass_msun,
        }),
      ).toBeNull();
    }
  });

  it("builds only the canonical API query and accepts exact echoed results", () => {
    const endpoint = stellarLaboratoryRequestEndpoint(DEFAULT_STELLAR_LABORATORY_STATE);
    expect(endpoint.path).toBe("/api/v1/simulations/stellar-laboratory?initial_mass_msun=1");
    expect(
      validateStellarLaboratoryCalculationResult(
        DEFAULT_STELLAR_LABORATORY_STATE,
        STELLAR_LABORATORY_DEFAULT_RESULT,
      ),
    ).toEqual(STELLAR_LABORATORY_DEFAULT_RESULT);
  });

  it("rejects result/state mismatches and additive payloads", () => {
    expect(
      validateStellarLaboratoryCalculationResult(
        DEFAULT_STELLAR_LABORATORY_STATE,
        STELLAR_LABORATORY_TEN_SOLAR_MASS_RESULT,
      ),
    ).toBeNull();
    expect(
      validateStellarLaboratoryCalculationResult(DEFAULT_STELLAR_LABORATORY_STATE, {
        ...STELLAR_LABORATORY_DEFAULT_RESULT,
        invented: true,
      }),
    ).toBeNull();
  });
});
