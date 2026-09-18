import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPlanetarySystemBuilderCalculation } from "../src/lib/server/planetary-system-builder";
import { DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE } from "../src/lib/simulations/planetary-system-builder";
import { PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT } from "./planetary-system-builder-fixture";

describe("Planetary System Builder server loader", () => {
  it("returns only the exact canonical response using repeated query arrays", async () => {
    const requests: string[] = [];
    const result = await loadPlanetarySystemBuilderCalculation(
      DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
      {
        origin: "http://127.0.0.1:8000",
        fetchImplementation: ((input: RequestInfo | URL) => {
          requests.push(String(input));
          return Promise.resolve(
            new Response(JSON.stringify(PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT), {
              headers: { "content-type": "application/json" },
              status: 200,
            }),
          );
        }) as typeof fetch,
      },
    );
    expect(result).toEqual({ data: PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT, kind: "ok" });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!);
    expect(url.pathname).toBe("/api/v1/simulations/planetary-system-builder");
    expect(url.searchParams.getAll("planet_mass_mearth")).toEqual(["1", "1", "1"]);
    expect(url.searchParams.getAll("semi_major_axis_au")).toEqual(["0.7", "1", "2"]);
  });

  it("fails closed on additive scientific output", async () => {
    const result = await loadPlanetarySystemBuilderCalculation(
      DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
      {
        origin: "http://127.0.0.1:8000",
        fetchImplementation: (() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ ...PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT, invented: true }),
              {
                headers: { "content-type": "application/json" },
                status: 200,
              },
            ),
          )) as typeof fetch,
      },
    );
    expect(result).toEqual({ kind: "unavailable" });
  });
});
