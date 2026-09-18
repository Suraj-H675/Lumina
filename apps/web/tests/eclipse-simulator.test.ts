import { describe, expect, it } from "vitest";

import {
  DEFAULT_ECLIPSE_SIMULATOR_STATE,
  decodeEclipseSimulatorState,
  eclipseSimulatorRequestEndpoint,
  encodeEclipseSimulatorState,
  validateEclipseSimulatorCalculationResult,
  validateEclipseSimulatorState,
} from "../src/lib/simulations/eclipse-simulator";
import {
  ECLIPSE_DALLAS_NONE_RESULT,
  ECLIPSE_DALLAS_TOTAL_RESULT,
} from "./eclipse-simulator-fixture";

describe("Eclipse Simulator browser contract", () => {
  it("round-trips only the exact canonical versioned share state", () => {
    const encoded = encodeEclipseSimulatorState(DEFAULT_ECLIPSE_SIMULATOR_STATE);
    expect(decodeEclipseSimulatorState(encoded)).toEqual(DEFAULT_ECLIPSE_SIMULATOR_STATE);
    expect(decodeEclipseSimulatorState(`${encoded} `)).toBeNull();
    expect(
      validateEclipseSimulatorState({ ...DEFAULT_ECLIPSE_SIMULATOR_STATE, invented: true }),
    ).toBeNull();
  });

  it("rejects non-canonical UTC and out-of-domain observer state", () => {
    expect(
      validateEclipseSimulatorState({
        ...DEFAULT_ECLIPSE_SIMULATOR_STATE,
        at_utc: "2024-04-08T18:42:00+00:00",
      }),
    ).toBeNull();
    expect(
      validateEclipseSimulatorState({
        ...DEFAULT_ECLIPSE_SIMULATOR_STATE,
        latitude_deg: 91,
      }),
    ).toBeNull();
  });

  it("builds only the canonical query and accepts an exact echoed result", () => {
    const endpoint = eclipseSimulatorRequestEndpoint(DEFAULT_ECLIPSE_SIMULATOR_STATE);
    expect(endpoint.path).toContain("/api/v1/simulations/eclipse-simulator?");
    expect(endpoint.path).toContain("at_utc=2024-04-08T18%3A42%3A00Z");
    expect(
      validateEclipseSimulatorCalculationResult(
        DEFAULT_ECLIPSE_SIMULATOR_STATE,
        ECLIPSE_DALLAS_TOTAL_RESULT,
      ),
    ).toEqual(ECLIPSE_DALLAS_TOTAL_RESULT);
  });

  it("rejects state/result mismatches and additive scientific responses", () => {
    expect(
      validateEclipseSimulatorCalculationResult(
        DEFAULT_ECLIPSE_SIMULATOR_STATE,
        ECLIPSE_DALLAS_NONE_RESULT,
      ),
    ).toBeNull();
    expect(
      validateEclipseSimulatorCalculationResult(DEFAULT_ECLIPSE_SIMULATOR_STATE, {
        ...ECLIPSE_DALLAS_TOTAL_RESULT,
        invented: true,
      }),
    ).toBeNull();
  });
});
