import type { EntityDetailResponse, EntityType } from "@lumina/api-client";

import {
  calculateHorizontalPosition,
  computeNightBoundaries,
  computeObservationPlan,
  extractCoordinatePairs,
  localInstantForNightTime,
  type CoordinatePair,
  type NightBoundaries,
  type ObserverLocation,
  type TargetEvent,
} from "../observation/domain";
import { computeLunarConditionsAtInstant, type LunarInstantConditions } from "../observation/lunar";

export const TONIGHT_MAX_TARGETS = 100;

export type TonightSort = "highest-altitude" | "peak-time" | "name";

/** Identity read from a local collection; it contains no scientific values. */
export type TonightTargetIdentity = Readonly<{
  canonical_name: string;
  entity_type: EntityType;
  slug: string;
}>;

export type TonightDetailCandidate =
  | Readonly<{
      detail: EntityDetailResponse;
      item: TonightTargetIdentity;
      kind: "ok";
    }>
  | Readonly<{
      item: TonightTargetIdentity;
      kind: "catalogue-not-found" | "catalogue-unavailable";
    }>;

export type TonightPeak = Readonly<{
  altitude: number;
  azimuth: number;
  compass: string;
  instant: Date;
}>;

export type TonightAnalyzedTarget = Readonly<{
  coordinate: CoordinatePair;
  item: TonightTargetIdentity;
  kind: "above-horizon" | "below-horizon";
  moon: LunarInstantConditions | null;
  peak: TonightPeak;
  targetEvents: Readonly<{
    rise: TargetEvent;
    set: TargetEvent;
    transit: TargetEvent;
  }>;
}>;

export type TonightUnresolvedTarget = Readonly<{
  coordinateSourceCount?: number;
  item: TonightTargetIdentity;
  kind:
    | "analysis-unavailable"
    | "catalogue-not-found"
    | "catalogue-unavailable"
    | "missing-coordinate"
    | "multiple-coordinate-sources";
}>;

export type TonightNotRankedTarget = Readonly<{
  item: TonightTargetIdentity;
  kind: "no-darkness";
}>;

export type TonightSummary = Readonly<{
  aboveHorizonCount: number;
  loadedDetailCount: number;
  scientificallyAnalyzedCount: number;
  savedTargetCount: number;
  unavailableOrUnresolvedCount: number;
}>;

export type TonightAnalysis = Readonly<{
  aboveHorizon: ReadonlyArray<TonightAnalyzedTarget>;
  belowHorizon: ReadonlyArray<TonightAnalyzedTarget>;
  night: NightBoundaries;
  notRanked: ReadonlyArray<TonightNotRankedTarget>;
  summary: TonightSummary;
  unresolved: ReadonlyArray<TonightUnresolvedTarget>;
}>;

type CollectionSelectionCandidate = Readonly<{
  id: string;
  items: ReadonlyArray<unknown>;
}>;

/** Picks the first non-empty collection, falling back to the first collection. */
export function initialTonightCollectionId(
  collections: ReadonlyArray<CollectionSelectionCandidate>,
): string | null {
  return (
    collections.find((collection) => collection.items.length > 0)?.id ?? collections[0]?.id ?? null
  );
}

/** Picks the first non-empty collection after the selected collection was deleted. */
export function fallbackTonightCollectionId(
  collections: ReadonlyArray<CollectionSelectionCandidate>,
): string | null {
  return collections.find((collection) => collection.items.length > 0)?.id ?? null;
}

function authoritativeIdentity(
  candidate: Extract<TonightDetailCandidate, { kind: "ok" }>,
): TonightTargetIdentity {
  return {
    canonical_name: candidate.detail.canonical_name,
    entity_type: candidate.detail.entity_type,
    slug: candidate.item.slug,
  };
}

/**
 * Computes one selected-night cross-object result using the accepted planner
 * and lunar calculation paths. Collection snapshots are used only for failure
 * context; loaded catalogue detail supplies the scientific identity.
 */
export function analyzeTonightCollection(
  candidates: ReadonlyArray<TonightDetailCandidate>,
  location: ObserverLocation,
  nightDate: string,
): TonightAnalysis | null {
  const night = computeNightBoundaries(location, nightDate);
  if (night === null) return null;

  const unresolved: Array<TonightUnresolvedTarget> = [];
  const notRanked: Array<TonightNotRankedTarget> = [];
  const aboveHorizon: Array<TonightAnalyzedTarget> = [];
  const belowHorizon: Array<TonightAnalyzedTarget> = [];
  let loadedDetailCount = 0;

  const analysisInstant = localInstantForNightTime(nightDate, "22:00");
  for (const candidate of candidates) {
    if (candidate.kind !== "ok") {
      unresolved.push({ item: candidate.item, kind: candidate.kind });
      continue;
    }

    loadedDetailCount += 1;
    const item = authoritativeIdentity(candidate);
    const coordinatePairs = extractCoordinatePairs(candidate.detail);
    if (coordinatePairs.length === 0) {
      unresolved.push({ item, kind: "missing-coordinate" });
      continue;
    }
    if (coordinatePairs.length > 1) {
      unresolved.push({
        coordinateSourceCount: coordinatePairs.length,
        item,
        kind: "multiple-coordinate-sources",
      });
      continue;
    }

    const coordinate = coordinatePairs[0];
    if (night.astronomicalDarkness === null) {
      notRanked.push({ item, kind: "no-darkness" });
      continue;
    }
    if (coordinate === undefined || analysisInstant === null) {
      unresolved.push({ item, kind: "analysis-unavailable" });
      continue;
    }

    const plan = computeObservationPlan(coordinate, location, nightDate, analysisInstant);
    if (plan === null || plan.maxDuringDarkness === null) {
      unresolved.push({ item, kind: "analysis-unavailable" });
      continue;
    }
    const maximum = plan.maxDuringDarkness;

    const peakPosition = calculateHorizontalPosition(coordinate, location, maximum.instant);
    if (peakPosition === null) {
      unresolved.push({ item, kind: "analysis-unavailable" });
      continue;
    }

    const analyzed: TonightAnalyzedTarget = {
      coordinate,
      item,
      kind: maximum.altitude > 0 ? "above-horizon" : "below-horizon",
      moon: computeLunarConditionsAtInstant(coordinate, location, maximum.instant),
      peak: {
        altitude: maximum.altitude,
        azimuth: peakPosition.azimuth,
        compass: peakPosition.compass,
        instant: maximum.instant,
      },
      targetEvents: plan.targetEvents,
    };
    if (analyzed.kind === "above-horizon") aboveHorizon.push(analyzed);
    else belowHorizon.push(analyzed);
  }

  return {
    aboveHorizon,
    belowHorizon,
    night,
    notRanked,
    summary: {
      aboveHorizonCount: aboveHorizon.length,
      loadedDetailCount,
      scientificallyAnalyzedCount: aboveHorizon.length + belowHorizon.length,
      savedTargetCount: candidates.length,
      unavailableOrUnresolvedCount: unresolved.length,
    },
    unresolved,
  };
}

function compareLexical(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareName(left: TonightAnalyzedTarget, right: TonightAnalyzedTarget): number {
  return (
    compareLexical(left.item.canonical_name, right.item.canonical_name) ||
    compareLexical(left.item.slug, right.item.slug)
  );
}

/** Sorts only a factual target section; it never combines secondary states. */
export function sortTonightTargets(
  targets: ReadonlyArray<TonightAnalyzedTarget>,
  sort: TonightSort,
): Array<TonightAnalyzedTarget> {
  return [...targets].sort((left, right) => {
    if (sort === "highest-altitude") {
      return (
        right.peak.altitude - left.peak.altitude ||
        left.peak.instant.getTime() - right.peak.instant.getTime() ||
        compareName(left, right)
      );
    }
    if (sort === "peak-time") {
      return (
        left.peak.instant.getTime() - right.peak.instant.getTime() ||
        right.peak.altitude - left.peak.altitude ||
        compareName(left, right)
      );
    }
    return compareName(left, right);
  });
}
