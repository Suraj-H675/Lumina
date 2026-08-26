/**
 * Shared, dependency-free helpers for building catalogue discovery queries.
 * Importable from both server and client code — no I/O lives here.
 */

/** Public suggestion bound used by the explore typeahead. */
export const SUGGESTION_LIMIT = 5;

/**
 * Queries shorter than the accepted public minimum never reach the API. The
 * server stays the sole authority for normalization and ranking; only obvious
 * transport hygiene happens before a request is built.
 */
export const MIN_QUERY_LENGTH = 2;

export type SuggestQueryParams = Readonly<{
  entityType?: string;
  limit?: number;
}>;

/** Build the exact query string for /api/v1/search/suggest. */
export function buildSuggestQuery(rawQuery: string, params: SuggestQueryParams = {}): string {
  const query = rawQuery.trim();
  if (query.length < MIN_QUERY_LENGTH) return "";
  const search = new URLSearchParams({
    q: query,
    ...(params.entityType === undefined ? {} : { entity_type: params.entityType }),
    limit: String(params.limit ?? SUGGESTION_LIMIT),
  });
  return search.toString();
}
