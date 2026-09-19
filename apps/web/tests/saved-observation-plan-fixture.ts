import type { CoordinatePair, ObservationPlan } from "../src/lib/observation/domain";
import {
  createSavedObservationPlan,
  type SavedObservationPlan,
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
  sourceKey: "fixture-source-key",
};

export const observationPlanFixture: ObservationPlan = {
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

export const savedPlanTargetFixture = {
  canonicalName: "K2-18",
  entityId: "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
  entityType: "star" as const,
  slug: "k2-18",
};

export function savedObservationPlanFixture(
  index = 1,
  timestamp = "2026-09-19T14:00:00.000Z",
): SavedObservationPlan {
  const suffix = String(index).padStart(12, "0");
  return createSavedObservationPlan({
    createdAt: timestamp,
    id: `13000000-0000-4000-8000-${suffix}`,
    nightDate: "2026-09-19",
    plan: observationPlanFixture,
    target: {
      canonicalName: `K2-18 ${index}`,
      entityId: savedPlanTargetFixture.entityId,
      entityType: savedPlanTargetFixture.entityType,
      slug: index === 1 ? "k2-18" : `k2-18-${index}`,
    },
    timeZone: "Asia/Kolkata",
  });
}
