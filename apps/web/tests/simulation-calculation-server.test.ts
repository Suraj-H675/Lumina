import { describe, expect, it } from "vitest";

import { loadSimulationCalculation } from "../src/lib/server/simulation-calculation";
import {
  DEFAULT_RADIAL_VELOCITY_STATE,
  radialVelocityRequestEndpoint,
  validateRadialVelocityCalculationResult,
} from "../src/lib/simulations/radial-velocity";
import { RADIAL_VELOCITY_DEFAULT_RESULT } from "./radial-velocity-fixture";

describe("Simulation server loader", () => {
  it("uses the configured server origin and returns only a validated calculation", async () => {
    const requests: string[] = [];
    const result = await loadSimulationCalculation(
      DEFAULT_RADIAL_VELOCITY_STATE,
      {
        origin: "http://127.0.0.1:8000",
        fetchImplementation: ((input: RequestInfo | URL) => {
          requests.push(String(input));
          return Promise.resolve(
            new Response(JSON.stringify(RADIAL_VELOCITY_DEFAULT_RESULT), {
              headers: { "content-type": "application/json" },
              status: 200,
            }),
          );
        }) as typeof fetch,
      },
      radialVelocityRequestEndpoint,
      validateRadialVelocityCalculationResult,
    );

    expect(result).toEqual({ data: RADIAL_VELOCITY_DEFAULT_RESULT, kind: "ok" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("http://127.0.0.1:8000/api/v1/simulations/radial-velocity?");
  });

  it("fails closed when the scientific response does not satisfy the feature validator", async () => {
    const result = await loadSimulationCalculation(
      DEFAULT_RADIAL_VELOCITY_STATE,
      {
        origin: "http://127.0.0.1:8000",
        fetchImplementation: (() =>
          Promise.resolve(
            new Response(JSON.stringify({ ...RADIAL_VELOCITY_DEFAULT_RESULT, invented: true }), {
              headers: { "content-type": "application/json" },
              status: 200,
            }),
          )) as typeof fetch,
      },
      radialVelocityRequestEndpoint,
      validateRadialVelocityCalculationResult,
    );

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("returns unavailable for an invalid server origin or non-successful transport result", async () => {
    const invalidOrigin = await loadSimulationCalculation(
      DEFAULT_RADIAL_VELOCITY_STATE,
      { environment: "production", origin: "http://example.com" },
      radialVelocityRequestEndpoint,
      validateRadialVelocityCalculationResult,
    );
    const unavailable = await loadSimulationCalculation(
      DEFAULT_RADIAL_VELOCITY_STATE,
      {
        origin: "http://127.0.0.1:8000",
        fetchImplementation: (() =>
          Promise.resolve(new Response(null, { status: 503 }))) as typeof fetch,
      },
      radialVelocityRequestEndpoint,
      validateRadialVelocityCalculationResult,
    );

    expect(invalidOrigin).toEqual({ kind: "unavailable" });
    expect(unavailable).toEqual({ kind: "unavailable" });
  });
});
