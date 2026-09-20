import "server-only";

import type { EntityDetailResponse, EntitySummaryResponse } from "@lumina/api-client";

import {
  coordinateDisclosureForProfile,
  coordinateProfileForSource,
  extractCoordinatePairs,
  type CoordinateDisclosure,
  type CoordinatePair,
} from "../observation/domain";
import { loadExploreCatalogue, loadObjectBySlug, type CatalogueLoaderOptions } from "./catalog";

export const DEEP_SKY_ENTITY_TYPES = ["galaxy", "nebula", "cluster"] as const;
export type DeepSkyEntityType = (typeof DEEP_SKY_ENTITY_TYPES)[number];

export type DeepSkyBrowseOutcome =
  | Readonly<{
      items: Array<EntitySummaryResponse>;
      kind: "ok";
      truncatedTypes: Array<DeepSkyEntityType>;
      unavailableTypes: Array<DeepSkyEntityType>;
    }>
  | Readonly<{ kind: "unavailable" }>;

export type DeepSkySelectionOutcome =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "invalid-object" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ detail: EntityDetailResponse; kind: "coordinate-unavailable"; slug: string }>
  | Readonly<{ detail: EntityDetailResponse; kind: "coordinate-ambiguous"; slug: string }>
  | Readonly<{
      coordinate: CoordinatePair;
      coordinateDisclosure: CoordinateDisclosure;
      detail: EntityDetailResponse;
      kind: "ready";
      slug: string;
    }>;

export function isDeepSkyEntityType(value: string): value is DeepSkyEntityType {
  return (DEEP_SKY_ENTITY_TYPES as ReadonlyArray<string>).includes(value);
}

function summaryOrder(first: EntitySummaryResponse, second: EntitySummaryResponse): number {
  if (first.canonical_name < second.canonical_name) return -1;
  if (first.canonical_name > second.canonical_name) return 1;
  if (first.slug < second.slug) return -1;
  if (first.slug > second.slug) return 1;
  return 0;
}

export async function loadDeepSkyBrowse(
  options: CatalogueLoaderOptions = {},
): Promise<DeepSkyBrowseOutcome> {
  const results = await Promise.all(
    DEEP_SKY_ENTITY_TYPES.map(async (entityType) => ({
      entityType,
      outcome: await loadExploreCatalogue({ ...options, entityType }),
    })),
  );

  const available = results.filter((entry) => entry.outcome.kind === "ok");
  if (available.length === 0) return { kind: "unavailable" };

  const byId = new Map<string, EntitySummaryResponse>();
  const truncatedTypes: Array<DeepSkyEntityType> = [];
  const unavailableTypes: Array<DeepSkyEntityType> = [];
  for (const entry of results) {
    if (entry.outcome.kind !== "ok") {
      unavailableTypes.push(entry.entityType);
      continue;
    }
    if (!entry.outcome.completeSlice) truncatedTypes.push(entry.entityType);
    for (const item of entry.outcome.items) {
      if (item.entity_type === entry.entityType) byId.set(item.id, item);
    }
  }

  return {
    items: [...byId.values()].sort(summaryOrder),
    kind: "ok",
    truncatedTypes,
    unavailableTypes,
  };
}

export async function loadDeepSkySelection(
  slug: string | undefined,
  options: CatalogueLoaderOptions = {},
): Promise<DeepSkySelectionOutcome> {
  if (slug === undefined || slug.trim() === "") return { kind: "none" };
  const outcome = await loadObjectBySlug(slug, options);
  if (outcome.kind === "object-not-found") return { kind: "invalid-object" };
  if (outcome.kind !== "ok") return { kind: "unavailable" };
  if (!isDeepSkyEntityType(outcome.detail.entity_type)) return { kind: "invalid-object" };

  const coordinates = extractCoordinatePairs(outcome.detail);
  if (coordinates.length === 0) {
    return { detail: outcome.detail, kind: "coordinate-unavailable", slug };
  }
  if (coordinates.length !== 1) {
    return { detail: outcome.detail, kind: "coordinate-ambiguous", slug };
  }
  const coordinate = coordinates[0];
  if (coordinate === undefined) {
    return { detail: outcome.detail, kind: "coordinate-unavailable", slug };
  }
  const profile = coordinateProfileForSource(coordinate.source);
  if (profile === null) {
    return { detail: outcome.detail, kind: "coordinate-unavailable", slug };
  }
  return {
    coordinate,
    coordinateDisclosure: coordinateDisclosureForProfile(profile),
    detail: outcome.detail,
    kind: "ready",
    slug,
  };
}
