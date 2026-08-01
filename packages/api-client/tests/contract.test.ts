import { describe, expect, expectTypeOf, it } from "vitest";

import { liveEndpoint, metaEndpoint, readyEndpoint, validateExactGenerated } from "../src/contract";
import type {
  LiveHealthLiveGetData,
  MetadataApiV1MetaGetData,
  ReadyHealthReadyGetData,
} from "../src/generated/types.gen";
import { zLiveResponse, zMetaResponse } from "../src/generated/zod.gen";

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
