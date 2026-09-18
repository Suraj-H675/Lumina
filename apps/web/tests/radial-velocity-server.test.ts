import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadRadialVelocityCalculation } from "../src/lib/server/radial-velocity";
import { DEFAULT_RADIAL_VELOCITY_STATE } from "../src/lib/simulations/radial-velocity";
import { RADIAL_VELOCITY_DEFAULT_RESULT } from "./radial-velocity-fixture";

describe("Radial Velocity server loader", () => {
  it("requests the canonical endpoint and accepts only the exact echoed result", async () => {
    const requests: string[] = [];
    const result = await loadRadialVelocityCalculation(DEFAULT_RADIAL_VELOCITY_STATE, {
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
    });

    expect(result).toEqual({ data: RADIAL_VELOCITY_DEFAULT_RESULT, kind: "ok" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/api/v1/simulations/radial-velocity?");
    expect(requests[0]).toContain("inclination_deg=90");
  });

  it("fails closed on an additive scientific response", async () => {
    const result = await loadRadialVelocityCalculation(DEFAULT_RADIAL_VELOCITY_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: (() =>
        Promise.resolve(
          new Response(JSON.stringify({ ...RADIAL_VELOCITY_DEFAULT_RESULT, invented: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        )) as typeof fetch,
    });

    expect(result).toEqual({ kind: "unavailable" });
  });
});
