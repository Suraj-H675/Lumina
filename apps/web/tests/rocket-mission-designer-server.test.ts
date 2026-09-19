import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadRocketMissionDesignerCalculation } from "../src/lib/server/rocket-mission-designer";
import { DEFAULT_ROCKET_MISSION_DESIGNER_STATE } from "../src/lib/simulations/rocket-mission-designer";
import { ROCKET_MISSION_DESIGNER_DEFAULT_RESULT } from "./rocket-mission-designer-fixture";

describe("Rocket / Mission Designer server loader", () => {
  it("returns only the exact canonical response using repeated stage arrays", async () => {
    const requests: string[] = [];
    const result = await loadRocketMissionDesignerCalculation(
      DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
      {
        origin: "http://127.0.0.1:8000",
        fetchImplementation: ((input: RequestInfo | URL) => {
          requests.push(String(input));
          return Promise.resolve(
            new Response(JSON.stringify(ROCKET_MISSION_DESIGNER_DEFAULT_RESULT), {
              headers: { "content-type": "application/json" },
              status: 200,
            }),
          );
        }) as typeof fetch,
      },
    );
    expect(result).toEqual({ data: ROCKET_MISSION_DESIGNER_DEFAULT_RESULT, kind: "ok" });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!);
    expect(url.pathname).toBe("/api/v1/simulations/rocket-mission-designer");
    expect(url.searchParams.getAll("stage_dry_mass_kg")).toEqual(["30000", "8000"]);
    expect(url.searchParams.getAll("stage_propellant_mass_kg")).toEqual(["400000", "40000"]);
    expect(url.searchParams.getAll("stage_specific_impulse_s")).toEqual(["300", "350"]);
    expect(url.searchParams.getAll("stage_thrust_n")).toEqual(["7000000", "1000000"]);
  });

  it("fails closed on additive scientific output", async () => {
    const result = await loadRocketMissionDesignerCalculation(
      DEFAULT_ROCKET_MISSION_DESIGNER_STATE,
      {
        origin: "http://127.0.0.1:8000",
        fetchImplementation: (() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ ...ROCKET_MISSION_DESIGNER_DEFAULT_RESULT, invented: true }),
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
