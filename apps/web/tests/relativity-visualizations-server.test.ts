import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadRelativityVisualizationsCalculation } from "../src/lib/server/relativity-visualizations";
import { DEFAULT_RELATIVITY_VISUALIZATIONS_STATE } from "../src/lib/simulations/relativity-visualizations";
import { RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT } from "./relativity-visualizations-fixture";

describe("Relativity Visualizations server loader", () => {
  it("returns only the exact canonical response using the bounded GET query", async () => {
    const requests: string[] = [];
    const result = await loadRelativityVisualizationsCalculation(
      DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
      {
        origin: "http://127.0.0.1:8000",
        fetchImplementation: ((input: RequestInfo | URL) => {
          requests.push(String(input));
          return Promise.resolve(
            new Response(JSON.stringify(RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT), {
              headers: { "content-type": "application/json" },
              status: 200,
            }),
          );
        }) as typeof fetch,
      },
    );
    expect(result).toEqual({
      data: RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT,
      kind: "ok",
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!);
    expect(url.pathname).toBe("/api/v1/simulations/relativity-visualizations");
    expect(url.searchParams.get("relative_speed_fraction_c")).toBe("0.6");
    expect(url.searchParams.get("proper_time_s")).toBe("10");
    expect(url.searchParams.get("proper_length_m")).toBe("100");
    expect(url.searchParams.get("simultaneous_event_separation_m")).toBe("299792458");
  });

  it("fails closed on additive scientific output", async () => {
    const result = await loadRelativityVisualizationsCalculation(
      DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
      {
        origin: "http://127.0.0.1:8000",
        fetchImplementation: (() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                ...RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT,
                invented: true,
              }),
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
