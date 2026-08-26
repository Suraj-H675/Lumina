import { describe, expect, it, vi } from "vitest";

import type { EntityDetailResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import {
  loadExploreCatalogue,
  loadObjectBySlug,
  searchCatalogue,
  suggestCatalogue,
} from "../src/lib/server/catalog";

const K2_18_ID = "403d0e71-8d81-5c52-abad-c4666c1b5cd6";

const summaries = {
  hd209458: {
    canonical_name: "HD 209458",
    entity_type: "star",
    id: "26f4b667-ecd9-524d-8121-29508723715a",
    slug: "hd-209458",
  },
  k2_18: {
    canonical_name: "K2-18",
    entity_type: "star",
    id: K2_18_ID,
    slug: "k2-18",
  },
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

type RecordedRequest = Readonly<{ path: string }>;

function fetchRecording(handler: (path: string) => Response | undefined): {
  requests: Array<RecordedRequest>;
  implementation: typeof fetch;
} {
  const requests: Array<RecordedRequest> = [];
  const implementation = ((input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(String(input));
    requests.push({ path: `${url.pathname}${url.search}` });
    const body = handler(`${url.pathname}${url.search}`);
    if (body === undefined) return Promise.resolve(new Response("{}", { status: 500 }));
    return Promise.resolve(body);
  }) as unknown as typeof fetch;
  return { implementation, requests };
}

describe("loadExploreCatalogue", () => {
  it("returns bounded browse items from the public list endpoint", async () => {
    const { implementation, requests } = fetchRecording((path) =>
      path === "/api/v1/catalog/entities?limit=60"
        ? jsonResponse({
            items: [summaries.hd209458, summaries.k2_18],
            page: { has_more: false, limit: 60, next_cursor: null },
          })
        : undefined,
    );

    const outcome = await loadExploreCatalogue({ fetchImplementation: implementation });

    expect(outcome).toEqual({
      completeSlice: true,
      items: [summaries.hd209458, summaries.k2_18],
      kind: "ok",
    });
    expect(requests).toEqual([{ path: "/api/v1/catalog/entities?limit=60" }]);
  });

  it("forwards a valid entity-type filter to the browse endpoint", async () => {
    const { implementation, requests } = fetchRecording((path) =>
      path === "/api/v1/catalog/entities?entity_type=star&limit=60"
        ? jsonResponse({
            items: [summaries.hd209458],
            page: { has_more: true, limit: 60, next_cursor: "c" },
          })
        : undefined,
    );

    const outcome = await loadExploreCatalogue({
      entityType: "star",
      fetchImplementation: implementation,
    });

    expect(outcome).toEqual({ completeSlice: false, items: [summaries.hd209458], kind: "ok" });
    expect(requests).toEqual([{ path: "/api/v1/catalog/entities?entity_type=star&limit=60" }]);
  });

  it("rejects an entity-type filter outside the public vocabulary without a request", async () => {
    const { implementation, requests } = fetchRecording(() => undefined);

    const outcome = await loadExploreCatalogue({
      entityType: "galaxy_ship",
      fetchImplementation: implementation,
    });

    expect(outcome).toEqual({ kind: "invalid-query" });
    expect(requests).toEqual([]);
  });

  it("reports an unavailable catalogue without leaking transport details", async () => {
    const { implementation } = fetchRecording(() => new Response(null, { status: 503 }));

    const outcome = await loadExploreCatalogue({ fetchImplementation: implementation });

    expect(outcome).toEqual({ kind: "unavailable" });
  });
});

describe("searchCatalogue", () => {
  it("refuses to call the API for queries below the public minimum length", async () => {
    const { implementation, requests } = fetchRecording(() => undefined);

    const outcome = await searchCatalogue("k", { fetchImplementation: implementation });

    expect(outcome).toEqual({ kind: "empty-query" });
    expect(requests).toEqual([]);
  });

  it("passes the query, optional type filter, and bound to the accepted search contract", async () => {
    const { implementation, requests } = fetchRecording((path) =>
      path === "/api/v1/search?q=kepler&entity_type=star&limit=50"
        ? jsonResponse({
            items: [
              {
                entity: summaries.k2_18,
                match_reason: "canonical_name_prefix",
                matched_alias: null,
              },
            ],
          })
        : undefined,
    );

    const outcome = await searchCatalogue("kepler", {
      entityType: "star",
      fetchImplementation: implementation,
      limit: 50,
    });

    expect(outcome).toEqual({
      items: [
        { entity: summaries.k2_18, match_reason: "canonical_name_prefix", matched_alias: null },
      ],
      kind: "ok",
    });
    expect(requests).toEqual([{ path: "/api/v1/search?q=kepler&entity_type=star&limit=50" }]);
  });

  it("maps a rejected query to a distinct invalid-query state", async () => {
    const { implementation } = fetchRecording(() =>
      jsonResponse(
        { error: { code: "request.validation_failed", message: "x", request_id: "r" } },
        422,
      ),
    );

    const outcome = await searchCatalogue("??", { fetchImplementation: implementation });

    expect(outcome).toEqual({ kind: "invalid-query" });
  });

  it("maps server and transport failure to a retryable unavailable state", async () => {
    const failing = fetchRecording(() => new Response(null, { status: 500 }));
    const outcomeServer = await searchCatalogue("kepler", {
      fetchImplementation: failing.implementation,
    });
    expect(outcomeServer).toEqual({ kind: "unavailable" });

    const malformed = fetchRecording(() => jsonResponse({ unexpected: true }));
    const outcomeMalformed = await searchCatalogue("kepler", {
      fetchImplementation: malformed.implementation,
    });
    expect(outcomeMalformed).toEqual({ kind: "unavailable" });
  });
});

describe("suggestCatalogue", () => {
  it("calls the accepted suggest endpoint only for valid query lengths", async () => {
    const short = await suggestCatalogue("k", {
      fetchImplementation: fetchRecording(() => undefined).implementation,
    });
    expect(short).toEqual({ kind: "empty-query" });

    const { implementation, requests } = fetchRecording((path) =>
      path === "/api/v1/search/suggest?q=k2&limit=5"
        ? jsonResponse({ items: [summaries.k2_18] })
        : undefined,
    );

    const outcome = await suggestCatalogue("  k2 ", { fetchImplementation: implementation });

    expect(outcome).toEqual({ items: [summaries.k2_18], kind: "ok" });
    expect(requests).toEqual([{ path: "/api/v1/search/suggest?q=k2&limit=5" }]);
  });

  it("maps any failure to an unavailable suggestion state", async () => {
    const outcome = await suggestCatalogue("k2", {
      fetchImplementation: fetchRecording(() => new Response(null, { status: 503 })).implementation,
    });

    expect(outcome).toEqual({ kind: "unavailable" });
  });
});

describe("loadObjectBySlug", () => {
  const detail: EntityDetailResponse = {
    canonical_name: "K2-18",
    entity_type: "star",
    id: K2_18_ID,
    quantities: [],
  };

  function stubTwoStep(handler: (path: string) => Response | undefined) {
    return fetchRecording(handler);
  }

  it("composes the slug resolution and the accepted entity-detail read", async () => {
    const { implementation, requests } = stubTwoStep((path) => {
      if (path === "/api/v1/catalog/entities/by-slug/k2-18") {
        return jsonResponse(summaries.k2_18);
      }
      if (path === `/api/v1/catalog/entities/${K2_18_ID}`) {
        return jsonResponse(detail);
      }
      return undefined;
    });

    const outcome = await loadObjectBySlug("k2-18", { fetchImplementation: implementation });

    expect(outcome).toEqual({ detail, kind: "ok" });
    expect(requests.map((request) => request.path)).toEqual([
      "/api/v1/catalog/entities/by-slug/k2-18",
      `/api/v1/catalog/entities/${K2_18_ID}`,
    ]);
  });

  it("never issues a request for a slug outside the public slug contract", async () => {
    for (const bad of ["", "K2-18", "has_underscore", "-leading", `${"a".repeat(101)}`]) {
      const { implementation, requests } = fetchRecording(() => undefined);
      const outcome = await loadObjectBySlug(bad, { fetchImplementation: implementation });
      expect(outcome).toEqual({ kind: "object-not-found" });
      expect(requests).toEqual([]);
    }
  });

  it("renders a public not-found experience for unknown slugs", async () => {
    const { implementation } = stubTwoStep(() =>
      jsonResponse(
        { error: { code: "catalog.entity_not_found", message: "x", request_id: "r" } },
        404,
      ),
    );

    const outcome = await loadObjectBySlug("not-a-real-object", {
      fetchImplementation: implementation,
    });

    expect(outcome).toEqual({ kind: "object-not-found" });
  });

  it("never renders the detail page when the slug step fails transiently", async () => {
    const { implementation, requests } = stubTwoStep(() => new Response(null, { status: 503 }));

    const outcome = await loadObjectBySlug("k2-18", { fetchImplementation: implementation });

    expect(outcome).toEqual({ kind: "unavailable" });
    expect(requests).toHaveLength(1);
  });

  it("treats a mid-journey disappearance as not-found instead of an error screen", async () => {
    const { implementation } = stubTwoStep((path) => {
      if (path === "/api/v1/catalog/entities/by-slug/k2-18") {
        return jsonResponse(summaries.k2_18);
      }
      return jsonResponse(
        { error: { code: "catalog.entity_not_found", message: "x", request_id: "r" } },
        404,
      );
    });

    const outcome = await loadObjectBySlug("k2-18", { fetchImplementation: implementation });

    expect(outcome).toEqual({ kind: "object-not-found" });
  });
});
