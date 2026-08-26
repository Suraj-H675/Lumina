import "server-only";

import { cache } from "react";

import { loadObjectBySlug, type CatalogueLoaderOptions } from "./catalog";
import type { CompareObjectState } from "../compare-model";
import { isValidCompareSlug } from "../compare-url";

/**
 * Resolve every selected slug to its object state for /compare.
 *
 * Slots are independent: each slug goes through the accepted two-step read
 * (by-slug → entity detail), and one slot's failure never poisons another.
 * The reads are issued concurrently; with at most three slugs this stays a
 * bounded set of requests. A malformed or unknown slug becomes an explicit
 * `unknown` slot rather than a page-level error; transport/API failure
 * surfaces as `unavailable` for that slot only.
 */
export async function loadCompareObjects(
  slugs: ReadonlyArray<string>,
  options: CatalogueLoaderOptions = {},
): Promise<Array<CompareObjectState>> {
  return Promise.all(
    slugs.map(async (slug): Promise<CompareObjectState> => {
      if (!isValidCompareSlug(slug)) return { kind: "unknown", slug };
      const outcome = await loadObjectBySlug(slug, options);
      switch (outcome.kind) {
        case "ok":
          return { detail: outcome.detail, kind: "ok", slug };
        case "object-not-found":
          return { kind: "unknown", slug };
        case "unavailable":
          return { kind: "unavailable" };
      }
    }),
  );
}

/**
 * Per-request memoized variant so `generateMetadata` and the page render share
 * one bounded set of catalogue reads instead of duplicating them. React's
 * `cache` scopes this to a single server render; nothing persists between
 * requests.
 */
export const loadCompareObjectsPerRequest = cache(
  async (slugs: ReadonlyArray<string>): Promise<Array<CompareObjectState>> =>
    loadCompareObjects(slugs),
);
