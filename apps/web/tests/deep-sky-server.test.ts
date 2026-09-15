import { describe, expect, it, vi } from "vitest";

import type { EntityDetailResponse, EntitySummaryResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import { loadDeepSkyBrowse, loadDeepSkySelection } from "../src/lib/server/deep-sky";
import {
  DEGREES_UNIT_CODE,
  MESSIER_DATASET_CODE,
  MESSIER_DECLINATION_QUANTITY_CODE,
  MESSIER_PROVIDER_CODE,
  MESSIER_RIGHT_ASCENSION_QUANTITY_CODE,
  MESSIER_V2_RELEASE,
} from "../src/lib/observation/domain";

const M31: EntitySummaryResponse = {
  canonical_name: "Messier 31",
  entity_type: "galaxy",
  id: "63f8a58a-a62b-5ae7-824b-35f3ebf1f6f0",
  slug: "messier-31",
};
const M42: EntitySummaryResponse = {
  canonical_name: "Messier 42",
  entity_type: "nebula",
  id: "6d4bdbe9-2fdb-5f42-b56a-922f0789bd10",
  slug: "messier-42",
};
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function fetchRecording(handler: (path: string) => Response | undefined): {
  implementation: typeof fetch;
  requests: Array<string>;
} {
  const requests: Array<string> = [];
  const implementation = ((input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const path = `${url.pathname}${url.search}`;
    requests.push(path);
    return Promise.resolve(handler(path) ?? new Response("{}", { status: 500 }));
  }) as unknown as typeof fetch;
  return { implementation, requests };
}

function coordinateDetail(entityType: "galaxy" | "star" = "galaxy"): EntityDetailResponse {
  const source = {
    dataset: {
      code: MESSIER_DATASET_CODE,
      name: "Reviewed CDS SIMBAD Messier J2000 catalogue",
      release_version: MESSIER_V2_RELEASE,
    },
    provider: { code: MESSIER_PROVIDER_CODE, name: "CDS SIMBAD" },
    source_record_id: "11111111-1111-5111-8111-111111111111",
  };
  const quantity = (code: string, value: string) => ({
    current_selection: {
      measurement: {
        id:
          code === MESSIER_RIGHT_ASCENSION_QUANTITY_CODE
            ? "22222222-2222-5222-8222-222222222222"
            : "33333333-3333-5333-8333-333333333333",
        original_unit: DEGREES_UNIT_CODE,
        original_value: value,
        source,
        unit: { code: DEGREES_UNIT_CODE, name: "degree", symbol: "°" },
        value,
      },
      selection: {
        explanation: "Reviewed catalogue coordinate.",
        rule: "simbad_messier_j2000",
        selected_at: "2026-08-30T00:00:00Z",
        version: "v2",
      },
    },
    measurement_count: 1,
    quantity: { code, name: code },
  });
  return {
    canonical_name: "Messier 31",
    entity_type: entityType,
    id: M31.id,
    quantities: [
      quantity(MESSIER_RIGHT_ASCENSION_QUANTITY_CODE, "10.684708333333334"),
      quantity(MESSIER_DECLINATION_QUANTITY_CODE, "41.26875"),
    ],
  };
}

describe("Phase 5A deep-sky server projection", () => {
  it("combines the fixed deep-sky type reads deterministically and preserves partial failure", async () => {
    const { implementation, requests } = fetchRecording((path) => {
      if (path === "/api/v1/catalog/entities?entity_type=galaxy&limit=60") {
        return jsonResponse({
          items: [M31],
          page: { has_more: false, limit: 60, next_cursor: null },
        });
      }
      if (path === "/api/v1/catalog/entities?entity_type=nebula&limit=60") {
        return jsonResponse({
          items: [M42],
          page: { has_more: true, limit: 60, next_cursor: "next" },
        });
      }
      if (path === "/api/v1/catalog/entities?entity_type=cluster&limit=60") {
        return new Response(null, { status: 503 });
      }
      return undefined;
    });

    const result = await loadDeepSkyBrowse({ fetchImplementation: implementation });
    expect(result).toEqual({
      items: [M31, M42],
      kind: "ok",
      truncatedTypes: ["nebula"],
      unavailableTypes: ["cluster"],
    });
    expect(requests).toEqual([
      "/api/v1/catalog/entities?entity_type=galaxy&limit=60",
      "/api/v1/catalog/entities?entity_type=nebula&limit=60",
      "/api/v1/catalog/entities?entity_type=cluster&limit=60",
    ]);
  });

  it("ignores schema-valid objects returned under the wrong requested type", async () => {
    const { implementation } = fetchRecording((path) => {
      if (path.includes("entity_type=galaxy")) {
        return jsonResponse({
          items: [M42],
          page: { has_more: false, limit: 60, next_cursor: null },
        });
      }
      if (path.includes("entity_type=nebula")) {
        return jsonResponse({
          items: [M31],
          page: { has_more: false, limit: 60, next_cursor: null },
        });
      }
      if (path.includes("entity_type=cluster")) {
        return jsonResponse({
          items: [],
          page: { has_more: false, limit: 60, next_cursor: null },
        });
      }
      return undefined;
    });

    await expect(loadDeepSkyBrowse({ fetchImplementation: implementation })).resolves.toEqual({
      items: [],
      kind: "ok",
      truncatedTypes: [],
      unavailableTypes: [],
    });
  });

  it("returns unavailable only when all three canonical type reads fail", async () => {
    const { implementation } = fetchRecording(() => new Response(null, { status: 503 }));
    await expect(loadDeepSkyBrowse({ fetchImplementation: implementation })).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("focuses only a deep-sky object with exactly one accepted provenance-backed coordinate", async () => {
    const detail = coordinateDetail();
    const { implementation, requests } = fetchRecording((path) => {
      if (path === "/api/v1/catalog/entities/by-slug/messier-31") return jsonResponse(M31);
      if (path === `/api/v1/catalog/entities/${M31.id}`) return jsonResponse(detail);
      return undefined;
    });

    const result = await loadDeepSkySelection("messier-31", {
      fetchImplementation: implementation,
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("expected ready selection");
    expect(result.coordinate).toMatchObject({
      declinationDegrees: 41.26875,
      epoch: 2000,
      rightAscensionDegrees: 10.684708333333334,
    });
    expect(result.coordinateDisclosure).toContain("SIMBAD Messier ICRS J2000 resolver-record");
    expect(requests).toEqual([
      "/api/v1/catalog/entities/by-slug/messier-31",
      `/api/v1/catalog/entities/${M31.id}`,
    ]);
  });

  it("never silently substitutes a non-deep-sky or missing coordinate target", async () => {
    const starDetail = coordinateDetail("star");
    const star = { ...M31, entity_type: "star" } as EntitySummaryResponse;
    const nonDeep = fetchRecording((path) => {
      if (path === "/api/v1/catalog/entities/by-slug/messier-31") return jsonResponse(star);
      if (path === `/api/v1/catalog/entities/${M31.id}`) return jsonResponse(starDetail);
      return undefined;
    });
    await expect(
      loadDeepSkySelection("messier-31", { fetchImplementation: nonDeep.implementation }),
    ).resolves.toEqual({ kind: "invalid-object" });

    const noCoordinates = { ...coordinateDetail(), quantities: [] };
    const missing = fetchRecording((path) => {
      if (path === "/api/v1/catalog/entities/by-slug/messier-31") return jsonResponse(M31);
      if (path === `/api/v1/catalog/entities/${M31.id}`) return jsonResponse(noCoordinates);
      return undefined;
    });
    const outcome = await loadDeepSkySelection("messier-31", {
      fetchImplementation: missing.implementation,
    });
    expect(outcome.kind).toBe("coordinate-unavailable");
  });

  it("does no API work when no object was selected", async () => {
    const { implementation, requests } = fetchRecording(() => undefined);
    await expect(
      loadDeepSkySelection(undefined, { fetchImplementation: implementation }),
    ).resolves.toEqual({
      kind: "none",
    });
    expect(requests).toEqual([]);
  });
});
