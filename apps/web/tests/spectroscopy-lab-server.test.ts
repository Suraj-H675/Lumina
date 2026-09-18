import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadSpectroscopyCalculation } from "../src/lib/server/spectroscopy-lab";
import { DEFAULT_SPECTROSCOPY_STATE } from "../src/lib/simulations/spectroscopy-lab";
import { SPECTROSCOPY_DEFAULT_RESULT } from "./spectroscopy-lab-fixture";

describe("Spectroscopy Lab server loader", () => {
  it("returns only the exact canonical response", async () => {
    const requests: string[] = [];
    const result = await loadSpectroscopyCalculation(DEFAULT_SPECTROSCOPY_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: ((input: RequestInfo | URL) => {
        requests.push(String(input));
        return Promise.resolve(
          new Response(JSON.stringify(SPECTROSCOPY_DEFAULT_RESULT), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        );
      }) as typeof fetch,
    });
    expect(result).toEqual({ data: SPECTROSCOPY_DEFAULT_RESULT, kind: "ok" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/api/v1/simulations/spectroscopy-lab?");
  });

  it("fails closed on additive scientific output", async () => {
    const result = await loadSpectroscopyCalculation(DEFAULT_SPECTROSCOPY_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: (() =>
        Promise.resolve(
          new Response(JSON.stringify({ ...SPECTROSCOPY_DEFAULT_RESULT, invented: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        )) as typeof fetch,
    });
    expect(result).toEqual({ kind: "unavailable" });
  });
});
