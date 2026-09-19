import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadBlackHoleRelativityCalculation } from "../src/lib/server/black-hole-relativity";
import { DEFAULT_BLACK_HOLE_RELATIVITY_STATE } from "../src/lib/simulations/black-hole-relativity";
import { BLACK_HOLE_RELATIVITY_DEFAULT_RESULT } from "./black-hole-relativity-fixture";

describe("Black-Hole / Relativity Lab server loader", () => {
  it("returns only the exact canonical response using the bounded GET query", async () => {
    const requests: string[] = [];
    const result = await loadBlackHoleRelativityCalculation(DEFAULT_BLACK_HOLE_RELATIVITY_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: ((input: RequestInfo | URL) => {
        requests.push(String(input));
        return Promise.resolve(
          new Response(JSON.stringify(BLACK_HOLE_RELATIVITY_DEFAULT_RESULT), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        );
      }) as typeof fetch,
    });
    expect(result).toEqual({ data: BLACK_HOLE_RELATIVITY_DEFAULT_RESULT, kind: "ok" });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!);
    expect(url.pathname).toBe("/api/v1/simulations/black-hole-relativity");
    expect(url.searchParams.get("mass_nominal_solar")).toBe("10");
    expect(url.searchParams.get("static_observer_radius_rs")).toBe("2");
  });

  it("fails closed on additive scientific output", async () => {
    const result = await loadBlackHoleRelativityCalculation(DEFAULT_BLACK_HOLE_RELATIVITY_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ ...BLACK_HOLE_RELATIVITY_DEFAULT_RESULT, invented: true }),
            {
              headers: { "content-type": "application/json" },
              status: 200,
            },
          ),
        )) as typeof fetch,
    });
    expect(result).toEqual({ kind: "unavailable" });
  });
});
