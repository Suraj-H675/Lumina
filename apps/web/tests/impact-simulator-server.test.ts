import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadImpactSimulatorCalculation } from "../src/lib/server/impact-simulator";
import { DEFAULT_IMPACT_SIMULATOR_STATE } from "../src/lib/simulations/impact-simulator";
import { IMPACT_SIMULATOR_DEFAULT_RESULT } from "./impact-simulator-fixture";

describe("Impact Simulator server loader", () => {
  it("returns only the exact canonical response using the bounded GET query", async () => {
    const requests: string[] = [];
    const result = await loadImpactSimulatorCalculation(DEFAULT_IMPACT_SIMULATOR_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: ((input: RequestInfo | URL) => {
        requests.push(String(input));
        return Promise.resolve(
          new Response(JSON.stringify(IMPACT_SIMULATOR_DEFAULT_RESULT), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        );
      }) as typeof fetch,
    });
    expect(result).toEqual({ data: IMPACT_SIMULATOR_DEFAULT_RESULT, kind: "ok" });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!);
    expect(url.pathname).toBe("/api/v1/simulations/impact-simulator");
    expect(url.searchParams.get("diameter_m")).toBe("1500");
    expect(url.searchParams.get("target_material")).toBe("sedimentary_rock");
  });

  it("fails closed on additive scientific output", async () => {
    const result = await loadImpactSimulatorCalculation(DEFAULT_IMPACT_SIMULATOR_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: (() =>
        Promise.resolve(
          new Response(JSON.stringify({ ...IMPACT_SIMULATOR_DEFAULT_RESULT, invented: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        )) as typeof fetch,
    });
    expect(result).toEqual({ kind: "unavailable" });
  });
});
