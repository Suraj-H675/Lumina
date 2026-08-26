/**
 * The /compare URL contract: the committed selection lives in repeated
 * singular `object` query parameters, in URL order. Parsing is pure and
 * dependency-free so both server components and client navigation share it.
 */

/** Phase 1B5 locked maximum; do not raise without a recorded decision. */
export const COMPARE_MAX_OBJECTS = 3;

/** Repeated singular query parameter carrying one selected slug per value. */
export const COMPARE_QUERY_KEY = "object";

/** Mirrors the accepted public slug vocabulary so malformed values never become state. */
const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_SLUG_LENGTH = 100;

export function isValidCompareSlug(value: string): boolean {
  return value.length > 0 && value.length <= MAX_SLUG_LENGTH && PUBLIC_SLUG_PATTERN.test(value);
}

export type CompareSelection = Readonly<{
  /** Deduplicated slugs in first-occurrence order, capped at the locked maximum. */
  slugs: Array<string>;
  /**
   * Raw duplicate or over-limit slugs that were dropped. They stay visible as
   * removable "not loaded" slots rather than being silently discarded.
   */
  droppedSlugs: Array<string>;
}>;

/**
 * Parse committed compare URL state.
 *
 * - invalid tokens are ignored outright (they never enter the selection);
 * - duplicates deduplicate to their first occurrence;
 * - more than {@link COMPARE_MAX_OBJECTS} unique slugs cap to the first ones
 *   in URL order; anything beyond becomes a visible dropped slot.
 */
export function parseCompareSelection(values: ReadonlyArray<string>): CompareSelection {
  const seen = new Set<string>();
  const slugs: Array<string> = [];
  const droppedSlugs: Array<string> = [];

  for (const raw of values) {
    const value = raw.trim();
    if (!isValidCompareSlug(value)) continue;
    if (seen.has(value)) {
      // A repeated slug carries no new information: keep the first slot only.
      droppedSlugs.push(value);
      continue;
    }
    if (slugs.length >= COMPARE_MAX_OBJECTS) {
      droppedSlugs.push(value);
      continue;
    }
    seen.add(value);
    slugs.push(value);
  }

  return { droppedSlugs, slugs };
}

/** Read the selection from a Next.js `searchParams` page prop. */
export function compareSelectionFromSearchParams(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
): CompareSelection {
  const raw = searchParams[COMPARE_QUERY_KEY];
  return parseCompareSelection(raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]);
}

/** Build canonical /compare URL state for the given ordered slugs. */
export function buildCompareHref(slugs: ReadonlyArray<string>): string {
  const params = new URLSearchParams();
  for (const slug of parseCompareSelection(slugs).slugs) {
    params.append(COMPARE_QUERY_KEY, slug);
  }
  const encoded = params.toString();
  return encoded === "" ? "/compare" : `/compare?${encoded}`;
}
