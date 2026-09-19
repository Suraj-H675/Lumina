import { describe, expect, it } from "vitest";

import type { CoordinatePair, ObservationPlan } from "../src/lib/observation/domain";
import {
  MAX_SAVED_OBSERVATION_PLANS,
  SAVED_OBSERVATION_PLAN_MODEL,
  createSavedObservationPlan,
  validateSavedObservationPlan,
} from "../src/lib/observation/saved-plan";

const SOURCE = {
  dataset: {
    code: "gaia-source-astrometry",
    name: "Gaia Data Release 3 main source catalogue — reviewed astrometry slice",
    release_version: "dr3",
  },
  provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
  source_record_id: "gaia-source-record-3910747531814692736",
} as CoordinatePair["source"];

const coordinate: CoordinatePair = {
  declinationDegrees: 7.58781312214569,
  epoch: 2016,
  originalDeclination: "7.58781312214569",
  originalRightAscension: "172.5601297577743",
  rightAscensionDegrees: 172.5601297577743,
  source: SOURCE,
  sourceKey:
    "esa-gaia\u001fgaia-source-astrometry\u001fdr3\u001fgaia-source-record-3910747531814692736",
};

const plan: ObservationPlan = {
  coordinate,
  location: { latitude: 12.9716, longitude: 77.5946 },
  maxDuringDarkness: {
    altitude: 57.25,
    instant: new Date("2026-09-19T19:15:00.000Z"),
  },
  night: {
    astronomicalDawn: { instant: new Date("2026-09-20T00:13:00.000Z"), kind: "time" },
    astronomicalDarkness: {
      end: new Date("2026-09-20T00:13:00.000Z"),
      start: new Date("2026-09-19T13:38:00.000Z"),
    },
    astronomicalDusk: { instant: new Date("2026-09-19T13:38:00.000Z"), kind: "time" },
    sunrise: { instant: new Date("2026-09-20T00:35:00.000Z"), kind: "time" },
    sunset: { instant: new Date("2026-09-19T12:46:00.000Z"), kind: "time" },
  },
  plotEnd: new Date("2026-09-20T01:13:00.000Z"),
  plotStart: new Date("2026-09-19T12:38:00.000Z"),
  samples: [
    { altitude: 10.5, instant: new Date("2026-09-19T12:38:00.000Z") },
    { altitude: 57.25, instant: new Date("2026-09-19T19:15:00.000Z") },
    { altitude: -4.2, instant: new Date("2026-09-20T01:13:00.000Z") },
  ],
  selected: {
    instant: new Date("2026-09-19T16:30:00.000Z"),
    position: { altitude: 44.2, azimuth: 211.4, compass: "SSW" },
  },
  targetEvents: {
    rise: { instant: new Date("2026-09-19T10:22:00.000Z"), kind: "time" },
    set: { instant: new Date("2026-09-19T22:31:00.000Z"), kind: "time" },
    transit: { instant: new Date("2026-09-19T16:26:00.000Z"), kind: "time" },
  },
  targetVisibility: "rises-and-sets",
};

function savedPlan() {
  return createSavedObservationPlan({
    createdAt: "2026-09-19T14:00:00.000Z",
    id: "13000000-0000-4000-8000-000000000001",
    nightDate: "2026-09-19",
    plan,
    target: {
      canonicalName: "K2-18",
      entityId: "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
      entityType: "star",
      slug: "k2-18",
    },
    timeZone: "Asia/Kolkata",
  });
}

describe("saved observation plan snapshot", () => {
  it("serializes one bounded deterministic plan with explicit provenance and model context", () => {
    const saved = savedPlan();

    expect(saved.schema_version).toBe(1);
    expect(saved.target).toEqual({
      canonical_name: "K2-18",
      entity_id: "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
      entity_type: "star",
      slug: "k2-18",
    });
    expect(saved.observer).toEqual({ latitude_deg: 12.9716, longitude_deg: 77.5946 });
    expect(saved.coordinate_source).toMatchObject({
      dataset_code: "gaia-source-astrometry",
      provider_code: "esa-gaia",
      reference_epoch: 2016,
      source_record_id: "gaia-source-record-3910747531814692736",
    });
    expect(saved.model).toEqual(SAVED_OBSERVATION_PLAN_MODEL);
    expect(saved.planner.altitude_samples).toHaveLength(3);
    expect(saved.planner.selected.position).toEqual({
      altitude_deg: 44.2,
      azimuth_deg: 211.4,
      compass: "SSW",
    });
    expect(validateSavedObservationPlan(saved)).toEqual(saved);
  });

  it("uses immutable canonical timestamp strings rather than persisted Date objects", () => {
    const saved = savedPlan();
    expect(saved.selected_time_utc).toBe("2026-09-19T16:30:00.000Z");
    expect(saved.planner.plot_start_utc).toBe("2026-09-19T12:38:00.000Z");
    expect(saved.planner.night.sunset).toEqual({
      instant_utc: "2026-09-19T12:46:00.000Z",
      kind: "time",
    });
    expect(JSON.stringify(saved)).not.toContain("[object Date]");
  });

  it("rejects unknown fields, invalid coordinates, invalid timestamps, and oversized sample lists", () => {
    const saved = savedPlan();
    expect(validateSavedObservationPlan({ ...saved, secret: "nope" })).toBeNull();
    expect(
      validateSavedObservationPlan({
        ...saved,
        observer: { ...saved.observer, latitude_deg: 91 },
      }),
    ).toBeNull();
    expect(
      validateSavedObservationPlan({ ...saved, updated_at: "2026-09-19T14:00:00Z" }),
    ).toBeNull();
    expect(
      validateSavedObservationPlan({
        ...saved,
        planner: {
          ...saved.planner,
          altitude_samples: Array.from({ length: 101 }, () => saved.planner.altitude_samples[0]),
        },
      }),
    ).toBeNull();
  });

  it("rejects structurally inconsistent timed events and model provenance", () => {
    const saved = savedPlan();
    expect(
      validateSavedObservationPlan({
        ...saved,
        planner: {
          ...saved.planner,
          target_events: {
            ...saved.planner.target_events,
            rise: { kind: "time" },
          },
        },
      }),
    ).toBeNull();
    expect(
      validateSavedObservationPlan({
        ...saved,
        model: { ...saved.model, astronomy_engine_version: "future-version" },
      }),
    ).toBeNull();
  });

  it("freezes the accepted local plan limit at fifty", () => {
    expect(MAX_SAVED_OBSERVATION_PLANS).toBe(50);
  });
});
