import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  ASTROMETRY_DATASET_CODE,
  DECLINATION_QUANTITY_CODE,
  DEGREES_UNIT_CODE,
  GAIA_REFERENCE_EPOCH,
  RIGHT_ASCENSION_QUANTITY_CODE,
  computeObservationPlan,
  localInstantForNightTime,
} from "../src/lib/observation/domain";
import { analyzeTonightCollection } from "../src/lib/tonight/domain";

const NIGHT = "2026-08-27";
const LOCATION = { latitude: 12.972, longitude: 77.594 } as const;
const PLANNER_P95_BUDGET_MS = 10;
const TONIGHT_100_TARGET_P95_BUDGET_MS = 100;

const selectedInstant = localInstantForNightTime(NIGHT, "22:00");
if (selectedInstant === null) throw new Error("Phase 8D planner fixture instant is invalid.");

const source = {
  dataset: {
    code: ASTROMETRY_DATASET_CODE,
    name: "Phase 8D performance fixture",
    release_version: "dr3",
  },
  provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
  source_record_id: "phase-8d-performance",
} as const;

const plannerCoordinate = {
  declinationDegrees: 7.58781312214569,
  epoch: GAIA_REFERENCE_EPOCH,
  originalDeclination: "7.58781312214569",
  originalRightAscension: "172.5601297577743",
  rightAscensionDegrees: 172.5601297577743,
  source,
  sourceKey: "phase-8d-performance",
} as const;

function identity(slug: string) {
  return { canonical_name: slug.toUpperCase(), entity_type: "star" as const, slug };
}

function detailFor(target: ReturnType<typeof identity>, index: number) {
  const measurement = (code: string, value: string) => ({
    current_selection: {
      measurement: {
        id: `${target.slug}-${code}`,
        original_unit: DEGREES_UNIT_CODE,
        original_value: value,
        source,
        unit: { code: DEGREES_UNIT_CODE, name: "degree", symbol: "deg" },
        value,
      },
      selection: {
        explanation: "Only reviewed measurement for this Phase 8D fixture.",
        rule: "single-reviewed-measurement",
        selected_at: "2026-08-27T00:00:00Z",
        version: "1",
      },
    },
    measurement_count: 1,
    quantity: { code, name: code },
  });

  return {
    canonical_name: target.canonical_name,
    entity_type: target.entity_type,
    id: `${target.slug}-id`,
    quantities: [
      measurement(RIGHT_ASCENSION_QUANTITY_CODE, String((296.0037539639907 + index * 2.173) % 360)),
      measurement(DECLINATION_QUANTITY_CODE, String(-45 + (index % 90))),
    ],
  };
}

const tonightTargets = Array.from({ length: 100 }, (_, index) => {
  const slug = `target-${String(index).padStart(3, "0")}`;
  const item = identity(slug);
  return { detail: detailFor(item, index), item, kind: "ok" as const };
});

function percentile(values: ReadonlyArray<number>, fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]!;
}

function measureLatency(work: () => void, repetitions: number) {
  for (let index = 0; index < 5; index += 1) work();

  const timings: number[] = [];
  for (let index = 0; index < repetitions; index += 1) {
    const started = performance.now();
    work();
    timings.push(performance.now() - started);
  }
  return {
    p50: percentile(timings, 0.5),
    p95: percentile(timings, 0.95),
  };
}

describe("Phase 8D deterministic compute performance", () => {
  it("keeps observation-planner p95 comfortably below the reviewed ceiling", () => {
    const latency = measureLatency(() => {
      const result = computeObservationPlan(plannerCoordinate, LOCATION, NIGHT, selectedInstant);
      if (result === null) throw new Error("Phase 8D planner fixture returned no plan.");
    }, 100);

    console.log("PHASE8D_PLANNER_LATENCY=" + JSON.stringify(latency));
    expect(latency.p95).toBeLessThanOrEqual(PLANNER_P95_BUDGET_MS);
  });

  it("keeps the full one-hundred-target Tonight analysis p95 below the reviewed ceiling", () => {
    const latency = measureLatency(() => {
      const result = analyzeTonightCollection(tonightTargets, LOCATION, NIGHT);
      if (result?.summary.scientificallyAnalyzedCount !== 100) {
        throw new Error("Phase 8D Tonight fixture did not analyze all one hundred targets.");
      }
    }, 30);

    console.log("PHASE8D_TONIGHT_100_LATENCY=" + JSON.stringify(latency));
    expect(latency.p95).toBeLessThanOrEqual(TONIGHT_100_TARGET_P95_BUDGET_MS);
  });
});
