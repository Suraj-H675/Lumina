import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PwaStorageError,
  clearLuminaOfflineCopies,
  readApproximateBrowserStorage,
} from "../src/lib/pwa-storage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PWA storage boundaries", () => {
  it("clears only Lumina CacheStorage namespaces and leaves unrelated caches untouched", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", {
      delete: remove,
      keys: vi
        .fn()
        .mockResolvedValue([
          "lumina-pwa-documents-v1",
          "another-app-cache",
          "lumina-pwa-static-v1",
          "lumina-pwa-metadata-v1",
        ]),
    });

    await expect(clearLuminaOfflineCopies()).resolves.toEqual({ deleted: 3 });
    expect(remove.mock.calls.map(([name]) => name)).toEqual([
      "lumina-pwa-documents-v1",
      "lumina-pwa-static-v1",
      "lumina-pwa-metadata-v1",
    ]);
  });

  it("reports an explicit cache-unavailable state instead of pretending a clear succeeded", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(clearLuminaOfflineCopies()).rejects.toEqual(
      new PwaStorageError("cache-unavailable"),
    );
  });

  it("returns only approximate origin-wide usage/quota and never requests persistence", async () => {
    const estimate = vi
      .fn()
      .mockResolvedValue({ quota: 100 * 1024 * 1024, usage: 12 * 1024 * 1024 });
    const persist = vi.fn();
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate, persist },
    });

    await expect(readApproximateBrowserStorage()).resolves.toEqual({
      kind: "available",
      quotaBytes: 100 * 1024 * 1024,
      usageBytes: 12 * 1024 * 1024,
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("distinguishes unsupported estimates from failed estimates", async () => {
    Object.defineProperty(navigator, "storage", { configurable: true, value: undefined });
    await expect(readApproximateBrowserStorage()).resolves.toEqual({ kind: "unsupported" });

    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate: vi.fn().mockRejectedValue(new DOMException("denied", "SecurityError")) },
    });
    await expect(readApproximateBrowserStorage()).resolves.toEqual({ kind: "unavailable" });
  });
});
