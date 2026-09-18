import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadEclipseSimulatorCalculation } from "../src/lib/server/eclipse-simulator";
import { DEFAULT_ECLIPSE_SIMULATOR_STATE } from "../src/lib/simulations/eclipse-simulator";
import { ECLIPSE_DALLAS_TOTAL_RESULT } from "./eclipse-simulator-fixture";

describe("Eclipse Simulator server loader", () => {
  it("returns only the exact canonical response", async () => {
    const requests: string[] = [];
    const result = await loadEclipseSimulatorCalculation(DEFAULT_ECLIPSE_SIMULATOR_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: ((input: RequestInfo | URL) => {
        requests.push(String(input));
        return Promise.resolve(
          new Response(JSON.stringify(ECLIPSE_DALLAS_TOTAL_RESULT), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        );
      }) as typeof fetch,
    });
    expect(result).toEqual({ data: ECLIPSE_DALLAS_TOTAL_RESULT, kind: "ok" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/api/v1/simulations/eclipse-simulator?");
  });

  it("fails closed on additive scientific output", async () => {
    const result = await loadEclipseSimulatorCalculation(DEFAULT_ECLIPSE_SIMULATOR_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: (() =>
        Promise.resolve(
          new Response(JSON.stringify({ ...ECLIPSE_DALLAS_TOTAL_RESULT, invented: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        )) as typeof fetch,
    });
    expect(result).toEqual({ kind: "unavailable" });
  });
});
