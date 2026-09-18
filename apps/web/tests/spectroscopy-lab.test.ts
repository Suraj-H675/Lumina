import { describe, expect, it } from "vitest";

import {
  DEFAULT_SPECTROSCOPY_STATE,
  decodeSpectroscopyState,
  encodeSpectroscopyState,
  spectroscopyRequestEndpoint,
  validateSpectroscopyCalculationResult,
  validateSpectroscopyState,
} from "../src/lib/simulations/spectroscopy-lab";
import {
  SPECTROSCOPY_CONTINUUM_RESULT,
  SPECTROSCOPY_DEFAULT_RESULT,
} from "./spectroscopy-lab-fixture";

describe("Spectroscopy Lab browser contract", () => {
  it("round-trips only the exact canonical versioned share state", () => {
    const encoded = encodeSpectroscopyState(DEFAULT_SPECTROSCOPY_STATE);
    expect(decodeSpectroscopyState(encoded)).toEqual(DEFAULT_SPECTROSCOPY_STATE);
    expect(decodeSpectroscopyState(`${encoded} `)).toBeNull();
    expect(validateSpectroscopyState({ ...DEFAULT_SPECTROSCOPY_STATE, invented: true })).toBeNull();
  });

  it("rejects non-canonical species order and out-of-domain state", () => {
    expect(
      validateSpectroscopyState({
        ...DEFAULT_SPECTROSCOPY_STATE,
        selected_elements: ["Na I", "H I"],
      }),
    ).toBeNull();
    expect(
      validateSpectroscopyState({
        ...DEFAULT_SPECTROSCOPY_STATE,
        temperature_k: 2000,
      }),
    ).toBeNull();
  });

  it("builds only the canonical query and accepts an exact echoed result", () => {
    const endpoint = spectroscopyRequestEndpoint(DEFAULT_SPECTROSCOPY_STATE);
    expect(endpoint.path).toContain("/api/v1/simulations/spectroscopy-lab?");
    expect(endpoint.path).toContain("selected_elements=H+I%2CNa+I%2CCa+II");
    expect(
      validateSpectroscopyCalculationResult(
        DEFAULT_SPECTROSCOPY_STATE,
        SPECTROSCOPY_DEFAULT_RESULT,
      ),
    ).toEqual(SPECTROSCOPY_DEFAULT_RESULT);
  });

  it("accepts the canonical continuum control and rejects mismatched/additive output", () => {
    const continuumState = validateSpectroscopyState({
      version: 1,
      model_version: "spectroscopy-lab-v1",
      mode: "continuum",
      temperature_k: 6000,
      selected_elements: [],
      radial_velocity_km_s: 0,
      resolving_power: 500,
      noise_sigma: 0,
      noise_seed: 42,
    });
    expect(continuumState).not.toBeNull();
    expect(
      validateSpectroscopyCalculationResult(continuumState, SPECTROSCOPY_CONTINUUM_RESULT),
    ).toEqual(SPECTROSCOPY_CONTINUUM_RESULT);
    expect(
      validateSpectroscopyCalculationResult(
        DEFAULT_SPECTROSCOPY_STATE,
        SPECTROSCOPY_CONTINUUM_RESULT,
      ),
    ).toBeNull();
    expect(
      validateSpectroscopyCalculationResult(DEFAULT_SPECTROSCOPY_STATE, {
        ...SPECTROSCOPY_DEFAULT_RESULT,
        invented: true,
      }),
    ).toBeNull();
  });
});
