import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadStellarLaboratoryCalculation } from "../src/lib/server/stellar-laboratory";
import { DEFAULT_STELLAR_LABORATORY_STATE } from "../src/lib/simulations/stellar-laboratory";
import { STELLAR_LABORATORY_DEFAULT_RESULT } from "./stellar-laboratory-fixture";

describe("Stellar Laboratory server loader", () => {
  it("returns only an exact canonical calculation", async () => {
    const fetchImplementation = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(STELLAR_LABORATORY_DEFAULT_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    const result = await loadStellarLaboratoryCalculation(DEFAULT_STELLAR_LABORATORY_STATE, {
      environment: "test",
      fetchImplementation,
      origin: "http://127.0.0.1:8000",
    });
    expect(result).toEqual({ data: STELLAR_LABORATORY_DEFAULT_RESULT, kind: "ok" });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed or unavailable responses", async () => {
    for (const response of [
      new Response(JSON.stringify({ ...STELLAR_LABORATORY_DEFAULT_RESULT, invented: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
      new Response(null, { status: 503 }),
    ]) {
      const result = await loadStellarLaboratoryCalculation(DEFAULT_STELLAR_LABORATORY_STATE, {
        environment: "test",
        fetchImplementation: () => Promise.resolve(response),
        origin: "http://127.0.0.1:8000",
      });
      expect(result).toEqual({ kind: "unavailable" });
    }
  });
});
