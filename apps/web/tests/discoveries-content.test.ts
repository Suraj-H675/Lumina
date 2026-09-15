import { describe, expect, it } from "vitest";

import {
  DiscoveryContentValidationError,
  latestReviewedDiscovery,
  loadReviewedDiscoveries,
  validateReviewedDiscoveries,
} from "../src/lib/discoveries/content";

describe("reviewed discovery content", () => {
  it("loads the reviewed bundle in deterministic publication order", () => {
    const bundle = loadReviewedDiscoveries();

    expect(bundle.schema_version).toBe(1);
    expect(bundle.entries).toHaveLength(3);
    expect(bundle.entries.map((entry) => entry.publication_date)).toEqual([
      "2026-09-08",
      "2026-09-07",
      "2026-07-06",
    ]);
    expect(latestReviewedDiscovery().id).toBe("hubble-webb-small-tnos-2026");
  });

  it("keeps confirmation state and primary source provenance explicit", () => {
    const entries = loadReviewedDiscoveries().entries;
    expect(entries[0]?.independent_confirmation_state).toBe("peer-reviewed-publication");
    expect(entries[1]?.independent_confirmation_state).toBe("official-source-only");
    expect(entries[2]?.sources.some((source) => source.source_kind === "peer-reviewed-paper")).toBe(
      true,
    );
  });
  it("rejects additive fields and duplicate identities", () => {
    const baseline = structuredClone(loadReviewedDiscoveries()) as unknown as Record<
      string,
      unknown
    >;
    (baseline.entries as Array<Record<string, unknown>>)[0]!.unexpected = "drift";
    expect(() => validateReviewedDiscoveries(baseline)).toThrow(DiscoveryContentValidationError);

    const duplicate = structuredClone(loadReviewedDiscoveries()) as unknown as Record<
      string,
      unknown
    >;
    const entries = duplicate.entries as Array<Record<string, unknown>>;
    entries[1]!.id = entries[0]!.id;
    expect(() => validateReviewedDiscoveries(duplicate)).toThrow(/identity is duplicated/u);
  });

  it("rejects content that post-dates its review or reverses event/publication chronology", () => {
    const future = structuredClone(loadReviewedDiscoveries()) as unknown as Record<string, unknown>;
    (future.entries as Array<Record<string, unknown>>)[0]!.publication_date = "2026-09-16";
    expect(() => validateReviewedDiscoveries(future)).toThrow(/post-date the review/u);

    const reversed = structuredClone(loadReviewedDiscoveries()) as unknown as Record<
      string,
      unknown
    >;
    const entry = (reversed.entries as Array<Record<string, unknown>>)[1]!;
    entry.event_date = "2026-09-08";
    expect(() => validateReviewedDiscoveries(reversed)).toThrow(/cannot follow publication_date/u);
  });
});
