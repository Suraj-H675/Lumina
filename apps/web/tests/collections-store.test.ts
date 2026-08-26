import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COLLECTIONS_STORAGE_KEY, EMPTY_COLLECTIONS_DATA } from "../src/lib/collections-model";
import type * as StoreModule from "../src/lib/collections-store";

/**
 * The store module keeps module-level state (one canonical external store per
 * tab), so every test gets a fresh localStorage and a reloaded module registry.
 */
const K2_18 = { canonical_name: "K2-18", entity_type: "star" as const, slug: "k2-18" };
const KEPLER_452 = {
  canonical_name: "Kepler-452",
  entity_type: "star" as const,
  slug: "kepler-452",
};

let store: typeof StoreModule;

function rawStorageValue(): string | null {
  return window.localStorage.getItem(COLLECTIONS_STORAGE_KEY);
}

beforeEach(async () => {
  window.localStorage.clear();
  vi.resetModules();
  store = await import("../src/lib/collections-store");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collections store — hydration and persistence", () => {
  it("persists created collections through the one write path", () => {
    const result = store.createCollection("Interesting Worlds");
    expect(result.ok).toBe(true);
    const persisted = JSON.parse(rawStorageValue() ?? "{}") as {
      collections: Array<{ items: unknown[]; name: string }>;
      version: number;
    };
    expect(persisted.version).toBe(1);
    expect(persisted.collections[0]?.name).toBe("Interesting Worlds");
    expect(persisted.collections[0]?.items).toEqual([]);
  });

  it("round-trips collections across simulated reloads (fresh module, same storage)", async () => {
    const created = store.createCollection("Alpha");
    if (!created.ok || created.collection === undefined) throw new Error("create failed");
    expect(store.addObjectToCollection(created.collection.id, K2_18).ok).toBe(true);

    vi.resetModules();
    store = await import("../src/lib/collections-store");
    // A fresh page load hydrates before rendering; mirror that here.
    expect(store.getCollectionsStatusSnapshot()).toBe("ready");
    const data = store.getCollectionsSnapshot();
    expect(data.collections).toHaveLength(1);
    expect(data.collections[0]?.items[0]?.slug).toBe("k2-18");
    expect(data.version).toBe(1);
    // Creation order is preserved; the overview renders it newest-first by list order.
    expect(data.collections[0]?.name).toBe("Alpha");
  });

  it("rejects duplicate names case-insensitively through the store path too", () => {
    expect(store.createCollection("Deep Sky").ok).toBe(true);
    expect(store.createCollection("deep   sky ")).toMatchObject({
      ok: false,
      reason: "duplicate-name",
    });
    expect(store.getCollectionsSnapshot().collections).toHaveLength(1);
  });

  it("enforces the collection cap honestly", () => {
    for (let index = 0; index < 50; index += 1) {
      expect(store.createCollection(`C${index}`)).toMatchObject({ ok: true });
    }
    expect(store.createCollection("One Too Many")).toMatchObject({
      ok: false,
      reason: "collection-limit",
    });
  });
});

describe("collections store — untrusted persisted data", () => {
  it.each([
    ["not JSON at all", "{definitely not json"],
    ["an unknown schema version", JSON.stringify({ collections: [], version: 99 })],
    ["structurally wrong payloads", JSON.stringify({ hello: "world", version: 1 })],
    ["a bare array", "[]"],
  ])("enters recovery state for %s instead of crashing", (_label, seeded) => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, seeded);
    expect(store.getCollectionsStatusSnapshot()).toBe("corrupted");
    // Data is NOT silently destroyed…
    expect(rawStorageValue()).toBe(seeded);
    // …and semantic writes refuse honestly while unreadable.
    expect(store.createCollection("X")).toMatchObject({
      ok: false,
      reason: "storage-corrupted",
    });
    expect(store.addObjectsToCollection("any-id", [K2_18])).toMatchObject({
      ok: false,
      reason: "storage-corrupted",
    });
  });

  it("treats a missing key as a valid empty state, ready for writes", () => {
    expect(store.getCollectionsStatusSnapshot()).toBe("ready");
    expect(store.getCollectionsSnapshot()).toEqual(EMPTY_COLLECTIONS_DATA);
  });

  it("reset replaces unreadable data with a valid empty envelope — explicitly only", () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, "{corrupt");
    expect(store.getCollectionsStatusSnapshot()).toBe("corrupted");
    const result = store.resetCollections();
    expect(result.ok).toBe(true);
    expect(JSON.parse(rawStorageValue() ?? "{}")).toEqual({ collections: [], version: 1 });
    expect(store.getCollectionsStatusSnapshot()).toBe("ready");
  });
});

describe("collections store — storage failures are honest", () => {
  it("reports write failure on quota errors and changes nothing", () => {
    store.createCollection("Keep Me");
    const before = store.getCollectionsSnapshot();

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const outcome = store.createCollection("Will Not Persist");
    setItem.mockRestore();

    expect(outcome).toMatchObject({ ok: false, reason: "storage-write-failed" });
    // State did NOT advance: the UI never claims an unsaved save succeeded.
    expect(store.getCollectionsSnapshot()).toEqual(before);
    expect(before.collections.map((collection) => collection.name)).toEqual(["Keep Me"]);
  });

  it("multi-object save is atomic under storage failure", () => {
    const created = store.createCollection("Atomic");
    if (!created.ok || created.collection === undefined) throw new Error("create failed");

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const outcome = store.addObjectsToCollection(created.collection.id, [K2_18, KEPLER_452]);
    setItem.mockRestore();

    expect(outcome.ok).toBe(false);
    expect(store.getCollectionsSnapshot().collections[0]?.items).toHaveLength(0);
  });

  it("reports storage-unavailable when localStorage is blocked entirely", async () => {
    const blocked = new DOMException("denied", "SecurityError");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw blocked;
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw blocked;
    });
    vi.resetModules();
    store = await import("../src/lib/collections-store");

    expect(store.getCollectionsStatusSnapshot()).toBe("unavailable");
    expect(store.createCollection("X")).toMatchObject({
      ok: false,
      reason: "storage-unavailable",
    });
    expect(store.addObjectToCollection("whatever", K2_18)).toMatchObject({
      ok: false,
      reason: "storage-unavailable",
    });
    expect(store.deleteCollection("x").ok).toBe(false);
    expect(store.renameCollection("x", "y").ok).toBe(false);
  });

  it("keeps last-known readable state after a failed write", () => {
    const created = store.createCollection("Survivor");
    if (!created.ok || created.collection === undefined) throw new Error("create failed");

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const failed = store.addObjectToCollection(created.collection.id, K2_18);
    setItem.mockRestore();

    expect(failed.ok).toBe(false);
    expect(store.getCollectionsSnapshot().collections[0]?.items).toHaveLength(0);
  });
});

describe("collections store — cross-tab synchronization", () => {
  it("re-reads state when another tab writes the collections key", () => {
    expect(store.getCollectionsStatusSnapshot()).toBe("ready");

    const otherTabPayload = {
      collections: [
        {
          created_at: "2026-08-21T00:00:00.000Z",
          id: "from-other-tab",
          items: [{ ...K2_18, saved_at: "2026-08-21T00:00:00.000Z" }],
          name: "From Another Tab",
          updated_at: "2026-08-21T00:00:00.000Z",
        },
      ],
      version: 1,
    };
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(otherTabPayload));
    // The browser fires `storage` in OTHER tabs sharing this origin.
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: COLLECTIONS_STORAGE_KEY,
        newValue: JSON.stringify(otherTabPayload),
      }),
    );

    const data = store.getCollectionsSnapshot();
    expect(data.collections.map((collection) => collection.id)).toEqual(["from-other-tab"]);
  });

  it("handles another tab REMOVING the key (clearing site data)", () => {
    store.createCollection("Soon Gone");
    window.localStorage.removeItem(COLLECTIONS_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
    expect(store.getCollectionsSnapshot()).toEqual(EMPTY_COLLECTIONS_DATA);
    expect(store.getCollectionsStatusSnapshot()).toBe("ready");
  });

  it("ignores storage events for unrelated keys", () => {
    store.createCollection("Mine");
    const before = store.getCollectionsSnapshot();
    window.localStorage.setItem("unrelated.key", "changed");
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated.key" }));
    expect(store.getCollectionsSnapshot()).toEqual(before);
  });

  it("follows another tab into the corrupted recovery state rather than guessing", () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, "{{{");
    window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
    expect(store.getCollectionsStatusSnapshot()).toBe("corrupted");
  });
});

describe("collections store — semantic operations end to end", () => {
  it("create → rename → atomic multi-add → remove → delete, all persisted", () => {
    const created = store.createCollection("Trip Targets");
    if (!created.ok || created.collection === undefined) throw new Error("create failed");
    const id = created.collection.id;

    expect(store.renameCollection(id, "Trip Targets — Final").ok).toBe(true);

    const multi = store.addObjectsToCollection(id, [
      K2_18,
      KEPLER_452,
      K2_18, // duplicate within the same request
    ]);
    if (!multi.ok) throw new Error("multi add failed");
    expect(multi.addedCount).toBe(2);

    expect(store.removeObjectFromCollection(id, "k2-18").ok).toBe(true);
    let data = store.getCollectionsSnapshot();
    expect(data.collections[0]?.name).toBe("Trip Targets — Final");
    expect(data.collections[0]?.items.map((item) => item.slug)).toEqual(["kepler-452"]);

    expect(store.deleteCollection(id).ok).toBe(true);
    data = store.getCollectionsSnapshot();
    expect(data.collections).toHaveLength(0);

    // And everything above is exactly what landed on disk.
    const persisted = JSON.parse(rawStorageValue() ?? "null") as typeof data | null;
    expect(persisted).toEqual(data);
  });
});
