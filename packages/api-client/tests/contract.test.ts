import { describe, expect, expectTypeOf, it } from "vitest";

import { liveEndpoint, metaEndpoint, readyEndpoint, validateExactGenerated } from "../src/contract";
import type {
  EntityBrowsePageResponse,
  EntitySummaryResponse,
  EntityType,
  GetCatalogEntityBySlugData,
  LiveHealthLiveGetData,
  ListCatalogEntitiesData,
  MetadataApiV1MetaGetData,
  ReadyHealthReadyGetData,
} from "../src/generated/types.gen";
import {
  zEntityBrowsePageResponse,
  zEntitySummaryResponse,
  zGetCatalogEntityBySlugResponse,
  zListCatalogEntitiesResponse,
  zLiveResponse,
  zMetaResponse,
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
