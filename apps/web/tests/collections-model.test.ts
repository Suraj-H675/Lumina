import { describe, expect, it } from "vitest";

import type { CollectionsData, LocalCollection } from "../src/lib/collections-model";
import {
  COLLECTION_NAME_MAX_CODE_POINTS,
  MAX_COLLECTIONS,
  MAX_ITEMS_PER_COLLECTION,
  addObjectsMutation,
  collectionNameProblem,
  collectionsContainingSlug,
  createCollectionMutation,
  deleteCollectionMutation,
  findDuplicateCollectionName,
  normalizeCollectionName,
  removeObjectMutation,
  renameCollectionMutation,
  validateCollectionsData,
} from "../src/lib/collections-model";

function makeCollection(
  id: string,
  name: string,
  slugs: Array<string> = [],
  overrides: Partial<LocalCollection> = {},
): LocalCollection {
  return {
    created_at: "2026-08-20T10:00:00.000Z",
    id,
    items: slugs.map((slug) => ({
      canonical_name: slug.toUpperCase(),
      entity_type: "star" as const,
      saved_at: "2026-08-20T10:00:00.000Z",
      slug,
    })),
    name,
    updated_at: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("collection name validation", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeCollectionName("  Interesting   Worlds \n")).toBe("Interesting Worlds");
    expect(collectionNameProblem("   ")).toMatch(/name/i);
    expect(collectionNameProblem("Interesting Worlds")).toBeNull();
  });

  it("bounds names by Unicode code points, not UTF-16 units", () => {
    const emojiName = "🪐".repeat(COLLECTION_NAME_MAX_CODE_POINTS);
    expect(collectionNameProblem(emojiName)).toBeNull();
    expect(collectionNameProblem(`${emojiName}🪐`)).toMatch(/60 characters/u);
  });

  it("finds duplicates case-insensitively with an exclusion id for renames", () => {
    const data: CollectionsData = {
      collections: [makeCollection("a", "Interesting Worlds"), makeCollection("b", "Deep Sky")],
      version: 1,
    };
    expect(findDuplicateCollectionName(data, "interesting worlds")?.id).toBe("a");
    expect(findDuplicateCollectionName(data, "DEEP SKY", "b")).toBeUndefined();
  });
});

describe("validateCollectionsData (untrusted persisted input)", () => {
  it("accepts a valid envelope and preserves item order", () => {
    const data: CollectionsData = {
      collections: [makeCollection("a", "Alpha", ["k2-18"])],
      version: 1,
    };
    const parsed = validateCollectionsData(structuredClone(data));
    expect(parsed).toEqual(data);
  });

  it("treats a missing envelope or unknown schema version as unreadable", () => {
    expect(validateCollectionsData(null)).toBeNull();
    expect(validateCollectionsData("nonsense")).toBeNull();
    expect(validateCollectionsData({ collections: [] })).toBeNull();
    expect(validateCollectionsData({ collections: [], version: 2 })).toBeNull();
    expect(validateCollectionsData({ collections: [], version: "1" })).toBeNull();
  });

  it("rejects malformed collections and items without throwing", () => {
    expect(validateCollectionsData({ collections: [{ id: "a" }], version: 1 })).toBeNull();
    expect(
      validateCollectionsData({
        collections: [makeCollection("a", "")],
        version: 1,
      }),
    ).toBeNull();
    expect(validateCollectionsData({ collections: ["nope"], version: 1 })).toBeNull();
    const badSlug = makeCollection("a", "Alpha");
    (badSlug.items as Array<unknown>).push({
      canonical_name: "Ghost",
      entity_type: "star",
      saved_at: "2026-08-20T10:00:00.000Z",
      slug: "Not A Slug",
    });
    expect(validateCollectionsData({ collections: [badSlug], version: 1 })).toBeNull();

    // Duplicate slugs inside one collection cannot happen through mutations.
    expect(
      validateCollectionsData({
        collections: [makeCollection("a", "Alpha", ["k2-18", "k2-18"])],
        version: 1,
      }),
    ).toBeNull();
    // Duplicate ids across collections likewise.
    expect(
      validateCollectionsData({
        collections: [makeCollection("a", "Alpha"), makeCollection("a", "Beta")],
        version: 1,
      }),
    ).toBeNull();
    // Read-side safety limits: hand-tampered over-limit payloads are rejected,
    // not hydrated into an unbounded UI.
    const tooManyCollections = Array.from({ length: MAX_COLLECTIONS + 1 }, (_, i) =>
      makeCollection(`id-${i}`, `C${i}`),
    );
    expect(validateCollectionsData({ collections: tooManyCollections, version: 1 })).toBeNull();
    expect(
      validateCollectionsData({
        collections: [
          makeCollection(
            "a",
            "Alpha",
            Array.from({ length: MAX_ITEMS_PER_COLLECTION + 1 }, (_, i) => `obj-${i}`),
          ),
        ],
        version: 1,
      }),
    ).toBeNull();
    // Collection ids must look like locally generated UUID-ish tokens so junk
    // never flows into route hrefs.
    expect(
      validateCollectionsData({
        collections: [makeCollection('bad id"><script>', "Alpha")],
        version: 1,
      }),
    ).toBeNull();
  });

  it("tolerates duplicate names on read but rejects junk timestamps", () => {
    expect(
      validateCollectionsData({
        collections: [makeCollection("a", "Alpha"), makeCollection("b", "alpha")],
        version: 1,
      }),
    ).not.toBeNull();
    expect(
      validateCollectionsData({
        collections: [makeCollection("a", "Alpha", [], { updated_at: "not-a-time" })],
        version: 1,
      }),
    ).toBeNull();
    // Unknown entity types are rejected rather than coerced.
    const badType = makeCollection("a", "Alpha");
    (badType.items as Array<Record<string, unknown>>)[0] = {
      canonical_name: "X",
      entity_type: "ufo",
      saved_at: "2026-08-20T10:00:00.000Z",
      slug: "x",
    };
    expect(validateCollectionsData({ collections: [badType], version: 1 })).toBeNull();
  });
});

describe("createCollectionMutation", () => {
  it("creates with normalized name, appends last, stamps timestamps", () => {
    const empty: CollectionsData = { collections: [], version: 1 };
    const result = createCollectionMutation(empty, "  Deep   Sky ", "id-1", "2026-08-21T00:00:00Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.collection.name).toBe("Deep Sky");
    expect(result.collection.created_at).toBe("2026-08-21T00:00:00Z");
    expect(result.data.collections.map((c) => c.id)).toEqual(["id-1"]);
  });

  it("enforces blank names, duplicates, and the collection cap without mutating input", () => {
    const data: CollectionsData = { collections: [makeCollection("a", "Alpha")], version: 1 };
    const before = structuredClone(data);

    expect(createCollectionMutation(data, "   ", "id-2", "t")).toEqual({
      message: expect.any(String),
      ok: false,
      reason: "invalid-name",
    });
    expect(createCollectionMutation(data, "ALPHA", "id-2", "t")).toMatchObject({
      ok: false,
      reason: "duplicate-name",
    });
    expect(structuredClone(data)).toEqual(before);

    const atCap: CollectionsData = {
      collections: Array.from({ length: MAX_COLLECTIONS }, (_, index) =>
        makeCollection(`id-${index}`, `C${index}`),
      ),
      version: 1,
    };
    expect(createCollectionMutation(atCap, "One More", "id-x", "t")).toMatchObject({
      ok: false,
      reason: "collection-limit",
    });
  });
});

describe("renameCollectionMutation", () => {
  it("renames in place preserving id, items, order; updates updated_at only", () => {
    const original = makeCollection("a", "Alpha", ["k2-18"], {
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const data: CollectionsData = {
      collections: [original, makeCollection("b", "Beta")],
      version: 1,
    };
    const result = renameCollectionMutation(data, "a", " Gamma ", "2026-08-22T00:00:00Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const renamed = result.data.collections.find((c) => c.id === "a");
    expect(renamed?.name).toBe("Gamma");
    expect(renamed?.created_at).toBe(original.created_at);
    expect(renamed?.updated_at).toBe("2026-08-22T00:00:00Z");
    expect(renamed?.items.map((item) => item.slug)).toEqual(["k2-18"]);
    expect(result.data.collections.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("blocks blank names, cross-collection duplicates, and unknown ids", () => {
    const data: CollectionsData = {
      collections: [makeCollection("a", "Alpha"), makeCollection("b", "Beta")],
      version: 1,
    };
    expect(renameCollectionMutation(data, "a", "", "t")).toMatchObject({
      ok: false,
      reason: "invalid-name",
    });
    expect(renameCollectionMutation(data, "a", "beta", "t")).toMatchObject({
      ok: false,
      reason: "duplicate-name",
    });
    expect(renameCollectionMutation(data, "ghost", "Gamma", "t")).toMatchObject({
      ok: false,
      reason: "collection-not-found",
    });
  });
});

describe("deleteCollectionMutation / removeObjectMutation", () => {
  it("deletes only the targeted collection and is idempotent", () => {
    const data: CollectionsData = {
      collections: [makeCollection("a", "Alpha"), makeCollection("b", "Beta")],
      version: 1,
    };
    const result = deleteCollectionMutation(data, "a");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.collections.map((c) => c.id)).toEqual(["b"]);
    expect(deleteCollectionMutation(result.data, "a").ok).toBe(true);
  });

  it("removes one object, keeps others and order, reports honestly", () => {
    const data: CollectionsData = {
      collections: [makeCollection("a", "Alpha", ["k2-18", "kepler-186", "k2-18b"])],
      version: 1,
    };
    const result = removeObjectMutation(data, "a", "kepler-186", "t2");
    expect(result.ok && result.removed).toBe(true);
    if (!result.ok || !result.removed) return;
    const collection = result.data.collections[0];
    expect(collection?.items.map((item) => item.slug)).toEqual(["k2-18", "k2-18b"]);
    expect(collection?.updated_at).toBe("t2");

    // Removing an absent slug changes nothing and says so.
    const noop = removeObjectMutation(result.data, "a", "kepler-186", "t3");
    expect(noop.ok && noop.removed === false && noop.data === result.data).toBe(true);
    expect(removeObjectMutation(data, "ghost", "k2-18", "t")).toMatchObject({
      ok: false,
      reason: "collection-not-found",
    });
  });
});

describe("addObjectsMutation (atomic multi-object save)", () => {
  it("appends new unique items in request order, preserving existing order", () => {
    const data: CollectionsData = {
      collections: [makeCollection("a", "Alpha", ["hd-209458"])],
      version: 1,
    };
    const result = addObjectsMutation(
      data,
      "a",
      [
        { canonical_name: "K2-18", entity_type: "star", slug: "k2-18" },
        { canonical_name: "HD 209458", entity_type: "star", slug: "hd-209458" },
        { canonical_name: "K2-18", entity_type: "star", slug: "k2-18" }, // dup within request
        { canonical_name: "Kepler-452", entity_type: "star", slug: "kepler-452" },
      ],
      "t9",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.addedCount).toBe(2);
    expect(result.existingCount).toBe(1); // hd-209458 was already a member
    const items = result.data.collections[0]?.items ?? [];
    expect(items.map((item) => item.slug)).toEqual(["hd-209458", "k2-18", "kepler-452"]);
    expect(items[1]?.saved_at).toBe("t9");
    // Existing member kept its original snapshot untouched (no reordering).
    expect(items[0]?.saved_at).toBe("2026-08-20T10:00:00.000Z");
  });

  it("is fully idempotent when everything requested is already present", () => {
    const data: CollectionsData = {
      collections: [makeCollection("a", "Alpha", ["k2-18"])],
      version: 1,
    };
    const result = addObjectsMutation(
      data,
      "a",
      [{ canonical_name: "K2-18", entity_type: "star", slug: "k2-18" }],
      "later",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.addedCount).toBe(0);
    expect(result.existingCount).toBe(1);
    // The untouched collection keeps its old updated_at — no fake activity.
    expect(result.data.collections[0]?.updated_at).toBe("2026-08-20T10:00:00.000Z");
    expect(result.data.collections[0]?.items[0]?.saved_at).toBe("2026-08-20T10:00:00.000Z");
  });

  it("refuses to partially fill a full collection (atomic failure)", () => {
    const fullSlugs = Array.from({ length: MAX_ITEMS_PER_COLLECTION - 1 }, (_, i) => `obj-${i}`);
    const data: CollectionsData = {
      collections: [makeCollection("a", "Full", fullSlugs)],
      version: 1,
    };
    const result = addObjectsMutation(
      data,
      "a",
      [
        { canonical_name: "Fits", entity_type: "star", slug: "fits" },
        { canonical_name: "Overflows", entity_type: "star", slug: "overflows" },
      ],
      "t",
    );
    expect(result).toMatchObject({ ok: false, reason: "item-limit" });
    // Nothing was added despite one slot being free.
    expect(data.collections[0]?.items).toHaveLength(MAX_ITEMS_PER_COLLECTION - 1);
  });

  it("distinguishes a completely full collection from an overflowing batch", () => {
    const fullSlugs = Array.from({ length: MAX_ITEMS_PER_COLLECTION }, (_, i) => `obj-${i}`);
    const data: CollectionsData = {
      collections: [makeCollection("a", "Full", fullSlugs)],
      version: 1,
    };
    expect(
      addObjectsMutation(data, "a", [{ canonical_name: "X", entity_type: "star", slug: "x" }], "t"),
    ).toMatchObject({
      message: /collection is full/u,
      ok: false,
      reason: "item-limit",
    });
    // One slot free but two requested → the message mentions the room left.
    const almost = addObjectsMutation(
      {
        collections: [
          makeCollection("b", "Almost", fullSlugs.slice(0, MAX_ITEMS_PER_COLLECTION - 1)),
        ],
        version: 1,
      },
      "b",
      [
        { canonical_name: "One", entity_type: "star", slug: "one" },
        { canonical_name: "Two", entity_type: "star", slug: "two" },
      ],
      "t",
    );
    expect(almost).toMatchObject({ message: /only 1 more object fits/u, ok: false });
  });

  it("reports missing collections", () => {
    const data: CollectionsData = { collections: [], version: 1 };
    expect(addObjectsMutation(data, "ghost", [], "t")).toMatchObject({
      ok: false,
      reason: "collection-not-found",
    });
  });
});

describe("collectionsContainingSlug", () => {
  it("lists every collection holding the slug", () => {
    const data: CollectionsData = {
      collections: [makeCollection("a", "Alpha", ["k2-18"]), makeCollection("b", "Beta", [])],
      version: 1,
    };
    expect(collectionsContainingSlug(data, "k2-18").map((c) => c.id)).toEqual(["a"]);
    expect(collectionsContainingSlug(data, "kepler-452")).toEqual([]);
  });
});
