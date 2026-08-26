import { describe, expect, expectTypeOf, it } from "vitest";

import {
  catalogEntitiesEndpoint,
  catalogEntityBySlugEndpoint,
  catalogEntityDetailEndpoint,
  catalogSuggestEndpoint,
  catalogSearchEndpoint,
  liveEndpoint,
  metaEndpoint,
  readyEndpoint,
  validateExactGenerated,
} from "../src/contract";
import { requestEndpoint } from "../src/transport";
import type {
  EntityBrowsePageResponse,
  EntitySummaryResponse,
  EntityType,
  GetCatalogEntityBySlugData,
  GetCatalogEntityData,
  LiveHealthLiveGetData,
  ListCatalogEntitiesData,
  MetadataApiV1MetaGetData,
  ReadyHealthReadyGetData,
  SearchCatalogEntitiesData,
  SuggestCatalogEntitiesData,
} from "../src/generated/types.gen";
import {
  zEntityBrowsePageResponse,
  zEntitySummaryResponse,
  zGetCatalogEntityBySlugResponse,
  zListCatalogEntitiesResponse,
  zLiveResponse,
  zMetaResponse,
  zSearchCatalogEntitiesResponse,
  zSuggestCatalogEntitiesResponse,
} from "../src/generated/zod.gen";

describe("generated contract boundary", () => {
  it("keeps request methods and paths tied to generated operation types", () => {
    expect(liveEndpoint.method).toBe("GET");
    expect(readyEndpoint.method).toBe("GET");
    expect(metaEndpoint.method).toBe("GET");
    expectTypeOf(liveEndpoint.path).toEqualTypeOf<LiveHealthLiveGetData["url"]>();
    expectTypeOf(readyEndpoint.path).toEqualTypeOf<ReadyHealthReadyGetData["url"]>();
    expectTypeOf(metaEndpoint.path).toEqualTypeOf<MetadataApiV1MetaGetData["url"]>();
  });

  it("accepts exact generated responses", () => {
    expect(validateExactGenerated(zLiveResponse, { status: "live" })).toEqual({
      data: { status: "live" },
      valid: true,
    });
    expect(
      validateExactGenerated(zMetaResponse, {
        api_version: "v1",
        application_name: "Lumina",
        application_version: "0.0.0",
        build_commit: null,
        feature_flags: {},
      }).valid,
    ).toBe(true);
  });

  it("exposes the Phase 1B2 summary, browse, and operation contracts", () => {
    expectTypeOf<EntitySummaryResponse>().toEqualTypeOf<{
      id: string;
      slug: string;
      entity_type: EntityType;
      canonical_name: string;
    }>();
    expectTypeOf<EntityBrowsePageResponse["items"]>().toEqualTypeOf<Array<EntitySummaryResponse>>();
    expectTypeOf<
      GetCatalogEntityBySlugData["url"]
    >().toEqualTypeOf<"/api/v1/catalog/entities/by-slug/{slug}">();
    expectTypeOf<ListCatalogEntitiesData["url"]>().toEqualTypeOf<"/api/v1/catalog/entities">();
    expectTypeOf<NonNullable<ListCatalogEntitiesData["query"]>["entity_type"]>().toEqualTypeOf<
      EntityType | null | undefined
    >();
    expectTypeOf<SearchCatalogEntitiesData["url"]>().toEqualTypeOf<"/api/v1/search">();
    expectTypeOf<SuggestCatalogEntitiesData["url"]>().toEqualTypeOf<"/api/v1/search/suggest">();
  });

  it("validates the exact four-field navigation responses", () => {
    const summary = {
      id: "12345678-1234-4234-9234-123456789abc",
      slug: "hd-209458",
      entity_type: "star" as const,
      canonical_name: "HD 209458",
    };
    const page = {
      items: [summary],
      page: { next_cursor: null, has_more: false, limit: 20 },
    };

    expect(validateExactGenerated(zEntitySummaryResponse, summary).valid).toBe(true);
    expect(validateExactGenerated(zEntityBrowsePageResponse, page).valid).toBe(true);
    expect(validateExactGenerated(zGetCatalogEntityBySlugResponse, summary).valid).toBe(true);
    expect(validateExactGenerated(zListCatalogEntitiesResponse, page).valid).toBe(true);
    expect(
      validateExactGenerated(zSearchCatalogEntitiesResponse, {
        items: [{ entity: summary, match_reason: "exact_slug", matched_alias: null }],
      }).valid,
    ).toBe(true);
    expect(
      validateExactGenerated(zSuggestCatalogEntitiesResponse, { items: [summary] }).valid,
    ).toBe(true);
    expect(validateExactGenerated(zEntitySummaryResponse, { ...summary, id: 42 })).toEqual({
      valid: false,
    });
    expect(validateExactGenerated(zEntitySummaryResponse, { ...summary, extra: true })).toEqual({
      valid: false,
    });
    expect(
      validateExactGenerated(zEntityBrowsePageResponse, {
        ...page,
        items: [{ ...summary, canonical_name: "" }],
      }),
    ).toEqual({ valid: false });
  });

  it("rejects additive unknown fields instead of inheriting Zod's strip default", () => {
    expect(zLiveResponse.parse({ status: "live", unexpected: true })).toEqual({ status: "live" });
    expect(validateExactGenerated(zLiveResponse, { status: "live", unexpected: true })).toEqual({
      valid: false,
    });
    expect(
      validateExactGenerated(zMetaResponse, {
        api_version: "v1",
        application_name: "Lumina",
        application_version: "0.0.0",
        build_commit: null,
        feature_flags: {},
        nested_future_field: {},
      }),
    ).toEqual({ valid: false });
  });
});

describe("catalogue discovery endpoints", () => {
  const summary: EntitySummaryResponse = {
    id: "0b6e7c30-1e2a-5c4d-9f3e-6a5b7c8d9e0f",
    slug: "k2-18",
    entity_type: "star",
    canonical_name: "K2-18",
  };

  function respondWith(body: unknown): typeof fetch {
    return () =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
  }

  it("binds the search endpoint to the generated operation contract", async () => {
    expectTypeOf(catalogSearchEndpoint.path).toEqualTypeOf<SearchCatalogEntitiesData["url"]>();
    expectTypeOf(catalogSearchEndpoint.method).toEqualTypeOf<"GET">();

    const result = await requestEndpoint("http://127.0.0.1:8000", catalogSearchEndpoint, {
      fetchImplementation: respondWith({
        items: [{ entity: summary, match_reason: "canonical_name_prefix", matched_alias: null }],
      }),
    });

    expect(result).toEqual({
      data: {
        items: [{ entity: summary, match_reason: "canonical_name_prefix", matched_alias: null }],
      },
      kind: "ok",
      status: 200,
    });
  });

  it("binds the suggest endpoint to the generated operation contract", async () => {
    expectTypeOf(catalogSuggestEndpoint.path).toEqualTypeOf<SuggestCatalogEntitiesData["url"]>();
    expectTypeOf(catalogSuggestEndpoint.method).toEqualTypeOf<"GET">();

    const result = await requestEndpoint("http://127.0.0.1:8000", catalogSuggestEndpoint, {
      fetchImplementation: respondWith({ items: [summary] }),
    });

    expect(result).toEqual({ data: { items: [summary] }, kind: "ok", status: 200 });
  });

  it("rejects malformed discovery payloads instead of trusting them", async () => {
    const result = await requestEndpoint("http://127.0.0.1:8000", catalogSearchEndpoint, {
      fetchImplementation: respondWith({
        items: [{ entity: summary, match_reason: "invented_tier", matched_alias: null }],
      }),
    });

    expect(result).toEqual({ kind: "malformed-response" });
  });

  it("binds the catalogue read endpoints used by explore and object pages", async () => {
    expectTypeOf(catalogEntitiesEndpoint.path).toEqualTypeOf<ListCatalogEntitiesData["url"]>();
    expectTypeOf(catalogEntityBySlugEndpoint.path).toEqualTypeOf<
      GetCatalogEntityBySlugData["url"]
    >();
    expectTypeOf(catalogEntityDetailEndpoint.path).toEqualTypeOf<GetCatalogEntityData["url"]>();

    const browse = await requestEndpoint("http://127.0.0.1:8000", catalogEntitiesEndpoint, {
      fetchImplementation: respondWith({
        items: [summary],
        page: { has_more: false, limit: 20, next_cursor: null },
      }),
    });
    expect(browse).toEqual({
      data: { items: [summary], page: { has_more: false, limit: 20, next_cursor: null } },
      kind: "ok",
      status: 200,
    });

    const bySlug = await requestEndpoint("http://127.0.0.1:8000", catalogEntityBySlugEndpoint, {
      fetchImplementation: respondWith(summary),
    });
    expect(bySlug.kind).toBe("ok");

    const detail = await requestEndpoint("http://127.0.0.1:8000", catalogEntityDetailEndpoint, {
      fetchImplementation: respondWith({
        canonical_name: "K2-18",
        entity_type: "star",
        id: summary.id,
        quantities: [],
      }),
    });
    expect(detail.kind).toBe("ok");
  });
});
