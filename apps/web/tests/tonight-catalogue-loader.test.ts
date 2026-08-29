import { afterEach, describe, expect, it, vi } from "vitest";

import type { EntityDetailResponse, EntitySummaryResponse } from "@lumina/api-client";

import {
  clearTonightCatalogueDetailCache,
  loadTonightCatalogueDetails,
  TonightCatalogueLoadAborted,
} from "../src/lib/tonight/catalogue-loader";
import type { TonightDetailCandidate, TonightTargetIdentity } from "../src/lib/tonight/domain";

const ORIGIN = "http://127.0.0.1:8000";
const TEST_ENTITY_ID = "00000000-0000-5000-8000-000000000001";

function identity(slug: string): TonightTargetIdentity {
  return { canonical_name: slug.toUpperCase(), entity_type: "star", slug };
}

function summaryFor(item: TonightTargetIdentity): EntitySummaryResponse {
  return {
    canonical_name: item.canonical_name,
    entity_type: item.entity_type,
    id: TEST_ENTITY_ID,
    slug: item.slug,
  };
}

function detailFor(item: TonightTargetIdentity): EntityDetailResponse {
  void item;
  return {
    canonical_name: "Catalogue detail",
    entity_type: "star",
    id: TEST_ENTITY_ID,
    quantities: [],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

afterEach(() => {
  clearTonightCatalogueDetailCache();
  vi.restoreAllMocks();
});

describe("Tonight catalogue detail loader", () => {
  it("keeps target requests bounded at six concurrent object loads", async () => {
    const items = Array.from({ length: 10 }, (_, index) => identity(`target-${index}`));
    let active = 0;
    let maximumActive = 0;
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      const bySlug = /^\/api\/v1\/catalog\/entities\/by-slug\/([^/]+)$/u.exec(url.pathname);
      if (bySlug !== null) {
        const item = identity(decodeURIComponent(bySlug[1]!));
        return jsonResponse(summaryFor(item));
      }
      const detail = /^\/api\/v1\/catalog\/entities\/([^/]+)$/u.exec(url.pathname);
      if (detail === null) throw new Error("unexpected fixture path");
      const item = identity(detail[1]!);
      return jsonResponse(detailFor(item));
    });

    const results = await loadTonightCatalogueDetails(items, {
      fetchImplementation,
      origin: ORIGIN,
    });

    expect(results).toHaveLength(10);
    expect(results.every((result) => result.kind === "ok")).toBe(true);
    expect(maximumActive).toBeLessThanOrEqual(6);
  });

  it("reuses successful details by slug without caching failures", async () => {
    const items = [identity("cached"), identity("missing")];
    let missing = true;
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const bySlug = /^\/api\/v1\/catalog\/entities\/by-slug\/([^/]+)$/u.exec(url.pathname);
      if (bySlug !== null) {
        const item = identity(decodeURIComponent(bySlug[1]!));
        if (item.slug === "missing" && missing) return jsonResponse({ error: "not found" }, 404);
        return jsonResponse(summaryFor(item));
      }
      const item = identity(/^\/api\/v1\/catalog\/entities\/([^/]+)$/u.exec(url.pathname)![1]!);
      return jsonResponse(detailFor(item));
    });

    const first = await loadTonightCatalogueDetails(items, {
      fetchImplementation,
      origin: ORIGIN,
    });
    expect(first.map((result) => result.kind)).toEqual(["ok", "catalogue-not-found"]);
    const firstRequestCount = fetchImplementation.mock.calls.length;

    missing = false;
    const second = await loadTonightCatalogueDetails(items, {
      fetchImplementation,
      origin: ORIGIN,
    });
    expect(second.map((result) => result.kind)).toEqual(["ok", "ok"]);
    expect(fetchImplementation.mock.calls.length - firstRequestCount).toBe(2);
  });

  it("isolates 404 and network failures as bounded candidate outcomes", async () => {
    const items = [identity("gone"), identity("offline"), identity("usable")];
    const calls: Array<string> = [];
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      const bySlug = /^\/api\/v1\/catalog\/entities\/by-slug\/([^/]+)$/u.exec(url.pathname);
      if (bySlug !== null && decodeURIComponent(bySlug[1]!) === "gone") {
        return jsonResponse({ error: "not found" }, 404);
      }
      if (url.pathname.includes("offline")) throw new Error("private network failure");
      const item = identity(
        decodeURIComponent(
          /^\/api\/v1\/catalog\/entities\/by-slug\/([^/]+)$/u.exec(url.pathname)?.[1] ??
            /^\/api\/v1\/catalog\/entities\/([^/]+)$/u.exec(url.pathname)?.[1] ??
            "usable",
        ),
      );
      return url.pathname.includes("by-slug")
        ? jsonResponse(summaryFor(item))
        : jsonResponse(detailFor(item));
    });

    const results = await loadTonightCatalogueDetails(items, {
      fetchImplementation,
      origin: ORIGIN,
    });

    expect(results).toEqual([
      { item: items[0]!, kind: "catalogue-not-found" },
      { item: items[1]!, kind: "catalogue-unavailable" },
      { detail: detailFor(items[2]!), item: items[2]!, kind: "ok" },
    ] satisfies Array<TonightDetailCandidate>);
    expect(calls).toContain("/api/v1/catalog/entities/by-slug/gone");
  });

  it("cancels stale work and does not return a partial result", async () => {
    const controller = new AbortController();
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            {
              once: true,
            },
          );
        }),
    );
    const pending = loadTonightCatalogueDetails([identity("stale")], {
      fetchImplementation,
      origin: ORIGIN,
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(TonightCatalogueLoadAborted);
  });

  it("rejects collections larger than the accepted one-hundred-item bound", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    await expect(
      loadTonightCatalogueDetails(
        Array.from({ length: 101 }, (_, index) => identity(`target-${index}`)),
        { fetchImplementation, origin: ORIGIN },
      ),
    ).rejects.toThrow(/100/iu);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
