import { describe, expect, it, vi } from "vitest";

import type { EntityDetailResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import { loadCompareObjects } from "../src/lib/server/compare";

const K2_18_ID = "403d0e71-8d81-5c52-abad-c4666c1b5cd6";
const KEPLER_452_ID = "bfd42670-3013-598e-8eb5-5a1c084dd1a0";

const K2_18_SUMMARY = {
  canonical_name: "K2-18",
  entity_type: "star" as const,
  id: K2_18_ID,
  slug: "k2-18",
};
const KEPLER_452_SUMMARY = {
  canonical_name: "Kepler-452",
  entity_type: "star" as const,
  id: KEPLER_452_ID,
  slug: "kepler-452",
};

function detailFor(summary: {
  canonical_name: string;
  entity_type: "star";
  id: string;
  slug: string;
}): EntityDetailResponse {
  return {
    canonical_name: summary.canonical_name,
    entity_type: summary.entity_type,
    id: summary.id,
    quantities: [],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const notFound = (): Response =>
  jsonResponse({ error: { code: "catalog.entity_not_found", message: "x", request_id: "r" } }, 404);

type Recorded = { requests: Array<string>; responses: Array<Response | undefined> };

function makeFetch(handler: (path: string) => Response | undefined): {
  implementation: typeof fetch;
  recorded: Recorded;
} {
  const recorded: Recorded = { requests: [], responses: [] };
  const implementation = ((input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const path = `${url.pathname}${url.search}`;
    recorded.requests.push(path);
    const response = handler(path);
    recorded.responses.push(response);
    return Promise.resolve(response ?? new Response(null, { status: 500 }));
  }) as unknown as typeof fetch;
  return { implementation, recorded };
}

const slugResponse = (path: string): Response | undefined => {
  if (path === "/api/v1/catalog/entities/by-slug/k2-18") return jsonResponse(K2_18_SUMMARY);
  if (path === "/api/v1/catalog/entities/by-slug/kepler-452") {
    return jsonResponse(KEPLER_452_SUMMARY);
  }
  if (path.startsWith("/api/v1/catalog/entities/by-slug/")) return notFound();
  if (path === `/api/v1/catalog/entities/${K2_18_ID}`) {
    return jsonResponse(detailFor(K2_18_SUMMARY));
  }
  if (path === `/api/v1/catalog/entities/${KEPLER_452_ID}`) {
    return jsonResponse(detailFor(KEPLER_452_SUMMARY));
  }
  if (/^\/api\/v1\/catalog\/entities\/[0-9a-f-]{36}$/u.test(path)) return notFound();
  return undefined;
};

describe("loadCompareObjects", () => {
  it("resolves each slot through the accepted two-step reads in order", async () => {
    const { implementation, recorded } = makeFetch(slugResponse);

    const states = await loadCompareObjects(["k2-18"], { fetchImplementation: implementation });

    expect(states).toEqual([{ detail: detailFor(K2_18_SUMMARY), kind: "ok", slug: "k2-18" }]);
    expect(recorded.requests).toEqual([
      "/api/v1/catalog/entities/by-slug/k2-18",
      `/api/v1/catalog/entities/${K2_18_ID}`,
    ]);
  });

  it("keeps one unknown slug from poisoning the other slots", async () => {
    const { implementation } = makeFetch(slugResponse);

    const states = await loadCompareObjects(["k2-18", "not-a-real-object"], {
      fetchImplementation: implementation,
    });

    expect(states).toEqual([
      { detail: detailFor(K2_18_SUMMARY), kind: "ok", slug: "k2-18" },
      { kind: "unknown", slug: "not-a-real-object" },
    ]);
  });

  it("never requests a malformed slug and marks its slot unknown", async () => {
    const { implementation, recorded } = makeFetch(() => undefined);

    const states = await loadCompareObjects(["Not_A_Slug"], {
      fetchImplementation: implementation,
    });

    expect(states).toEqual([{ kind: "unknown", slug: "Not_A_Slug" }]);
    expect(recorded.requests).toEqual([]);
  });

  it("maps transient failure to an unavailable slot while valid slots still load", async () => {
    const { implementation } = makeFetch((path) =>
      path.startsWith("/api/v1/catalog/entities/by-slug/kepler-452")
        ? new Response(null, { status: 503 })
        : slugResponse(path),
    );

    const states = await loadCompareObjects(["k2-18", "kepler-452"], {
      fetchImplementation: implementation,
    });

    expect(states).toEqual([
      { detail: detailFor(K2_18_SUMMARY), kind: "ok", slug: "k2-18" },
      { kind: "unavailable" },
    ]);
  });
});
