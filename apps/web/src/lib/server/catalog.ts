import "server-only";

import {
  catalogEntitiesEndpoint,
  catalogEntityBySlugEndpoint,
  catalogEntityDetailEndpoint,
  catalogSearchEndpoint,
  catalogSuggestEndpoint,
  requestEndpoint,
  type ApiEndpoint,
  type CatalogSearchResponse,
  type EntityDetailResponse,
  type EntitySummaryResponse,
  type TransportOptions,
} from "@lumina/api-client";

import { resolveWebApiOrigin } from "./api-origin";

/** Bounded discovery slice rendered by /explore when no query is committed. */
export const EXPLORE_BROWSE_LIMIT = 60;
/** Public maximum search results; the committed /explore page always asks for the full tier list. */
export const SEARCH_RESULT_LIMIT = 50;
/** Public suggestion bound used by the explore typeahead. */
export const SUGGESTION_LIMIT = 5;

/**
 * Queries shorter than the accepted public minimum never reach the API. The server stays the sole
 * authority for normalization and ranking; only obvious transport hygiene happens here.
 */
const MIN_QUERY_LENGTH = 2;

/** Mirrors the accepted public slug vocabulary so impossible slugs never become API traffic. */
const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_SLUG_LENGTH = 100;

function isPublicSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && PUBLIC_SLUG_PATTERN.test(slug);
}

/** The accepted closed entity-type vocabulary, mirrored for request hygiene. */
const ENTITY_TYPE_VOCABULARY = {
  asteroid: "asteroid",
  black_hole: "black_hole",
  cluster: "cluster",
  compact_object: "compact_object",
  comet: "comet",
  concept: "concept",
  constellation: "constellation",
  dwarf_planet: "dwarf_planet",
  event: "event",
  exoplanet: "exoplanet",
  galaxy: "galaxy",
  launch_vehicle: "launch_vehicle",
  mission: "mission",
  moon: "moon",
  nebula: "nebula",
  observatory: "observatory",
  person: "person",
  planet: "planet",
  spacecraft: "spacecraft",
  star: "star",
  system: "system",
} as const;

export function isCatalogueEntityType(value: string): value is CatalogueEntityTypeFilter {
  return Object.hasOwn(ENTITY_TYPE_VOCABULARY, value);
}

export type ExploreCatalogueOutcome =
  | Readonly<{
      completeSlice: boolean;
      items: Array<EntitySummaryResponse>;
      kind: "ok";
    }>
  | Readonly<{ kind: "invalid-query" }>
  | Readonly<{ kind: "unavailable" }>;

export type CatalogueSearchOutcome =
  | Readonly<{ kind: "empty-query" }>
  | Readonly<{ kind: "invalid-query" }>
  | Readonly<{ items: CatalogSearchResponse["items"]; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type CatalogueSuggestOutcome =
  | Readonly<{ kind: "empty-query" }>
  | Readonly<{ items: Array<EntitySummaryResponse>; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type ObjectBySlugOutcome =
  | Readonly<{ detail: EntityDetailResponse; kind: "ok" }>
  | Readonly<{ kind: "object-not-found" }>
  | Readonly<{ kind: "unavailable" }>;

export type CatalogueLoaderOptions = TransportOptions &
  Readonly<{
    environment?: string;
    origin?: string;
  }>;

export type CatalogueEntityTypeFilter = {
  [Key in keyof typeof ENTITY_TYPE_VOCABULARY]: (typeof ENTITY_TYPE_VOCABULARY)[Key];
}[keyof typeof ENTITY_TYPE_VOCABULARY];

export type CatalogueSearchOptions = CatalogueLoaderOptions &
  Readonly<{
    entityType?: string;
    limit?: number;
  }>;

function transportOptions(options: CatalogueLoaderOptions): TransportOptions {
  return {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };
}

function resolveOriginOrUnreachable(options: CatalogueLoaderOptions): string | null {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  return configured.valid ? configured.origin : null;
}

function endpointWithQuery<T>(endpoint: ApiEndpoint<T>, query: URLSearchParams): ApiEndpoint<T> {
  const encoded = query.toString();
  return { ...endpoint, path: encoded === "" ? endpoint.path : `${endpoint.path}?${encoded}` };
}

export async function loadExploreCatalogue(
  options: CatalogueSearchOptions = {},
): Promise<ExploreCatalogueOutcome> {
  const entityType = options.entityType;
  if (entityType !== undefined && !isCatalogueEntityType(entityType)) {
    return { kind: "invalid-query" };
  }

  const origin = resolveOriginOrUnreachable(options);
  if (origin === null) return { kind: "unavailable" };

  const result = await requestEndpoint(
    origin,
    endpointWithQuery(
      catalogEntitiesEndpoint,
      new URLSearchParams({
        ...(entityType === undefined ? {} : { entity_type: entityType }),
        limit: String(EXPLORE_BROWSE_LIMIT),
      }),
    ),
    transportOptions(options),
  );
  if (result.kind !== "ok") return { kind: "unavailable" };

  return {
    completeSlice: !result.data.page.has_more,
    items: result.data.items,
    kind: "ok",
  };
}

export async function searchCatalogue(
  rawQuery: string,
  options: CatalogueSearchOptions = {},
): Promise<CatalogueSearchOutcome> {
  const query = rawQuery.trim();
  if (query.length < MIN_QUERY_LENGTH) return { kind: "empty-query" };

  const origin = resolveOriginOrUnreachable(options);
  if (origin === null) return { kind: "unavailable" };

  const parameters = new URLSearchParams({
    q: query,
    ...(options.entityType === undefined ? {} : { entity_type: options.entityType }),
    limit: String(options.limit ?? SEARCH_RESULT_LIMIT),
  });

  const result = await requestEndpoint(
    origin,
    endpointWithQuery(catalogSearchEndpoint, parameters),
    transportOptions(options),
  );
  switch (result.kind) {
    case "ok":
      return { items: result.data.items, kind: "ok" };
    case "http-error":
      return result.status === 422 ? { kind: "invalid-query" } : { kind: "unavailable" };
    default:
      return { kind: "unavailable" };
  }
}

export async function suggestCatalogue(
  rawQuery: string,
  options: CatalogueSearchOptions = {},
): Promise<CatalogueSuggestOutcome> {
  const query = rawQuery.trim();
  if (query.length < MIN_QUERY_LENGTH) return { kind: "empty-query" };

  const origin = resolveOriginOrUnreachable(options);
  if (origin === null) return { kind: "unavailable" };

  const parameters = new URLSearchParams({
    q: query,
    ...(options.entityType === undefined ? {} : { entity_type: options.entityType }),
    limit: String(options.limit ?? SUGGESTION_LIMIT),
  });

  const result = await requestEndpoint(
    origin,
    endpointWithQuery(catalogSuggestEndpoint, parameters),
    transportOptions(options),
  );
  if (result.kind !== "ok") return { kind: "unavailable" };
  return { items: result.data.items, kind: "ok" };
}

export async function loadObjectBySlug(
  slug: string,
  options: CatalogueLoaderOptions = {},
): Promise<ObjectBySlugOutcome> {
  if (!isPublicSlug(slug)) return { kind: "object-not-found" };

  const origin = resolveOriginOrUnreachable(options);
  if (origin === null) return { kind: "unavailable" };

  const requestOptions = transportOptions(options);
  const summary = await requestEndpoint(
    origin,
    { ...catalogEntityBySlugEndpoint, path: `/api/v1/catalog/entities/by-slug/${slug}` },
    requestOptions,
  );
  if (summary.kind === "http-error") {
    return summary.status === 404 ? { kind: "object-not-found" } : { kind: "unavailable" };
  }
  if (summary.kind !== "ok") return { kind: "unavailable" };

  const detail = await requestEndpoint(
    origin,
    { ...catalogEntityDetailEndpoint, path: `/api/v1/catalog/entities/${summary.data.id}` },
    requestOptions,
  );
  if (detail.kind === "ok") return { detail: detail.data, kind: "ok" };
  if (detail.kind === "http-error" && detail.status === 404) {
    return { kind: "object-not-found" };
  }
  return { kind: "unavailable" };
}
