import type { EntityType } from "@lumina/api-client";

import {
  isValidNightDate,
  type NightEvent,
  type ObservationPlan,
  type TargetEvent,
} from "./domain";

export const SAVED_OBSERVATION_PLAN_SCHEMA_VERSION = 1 as const;
export const MAX_SAVED_OBSERVATION_PLANS = 50;
export const MAX_SAVED_ALTITUDE_SAMPLES = 100;

export const SAVED_OBSERVATION_PLAN_MODEL = {
  altitude_sample_cap: MAX_SAVED_ALTITUDE_SAMPLES,
  astronomical_darkness_solar_altitude_deg: -18,
  astronomy_engine_version: "2.1.19",
  calculation: "topocentric-geometric-observation-plan-v1",
  refraction: "none",
  solar_boundary: "geometric-center-crossing",
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CODE_PATTERN = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/u;
const ENTITY_TYPES = [
  "star",
  "planet",
  "dwarf_planet",
  "moon",
  "asteroid",
  "comet",
  "exoplanet",
  "galaxy",
  "nebula",
  "cluster",
  "black_hole",
  "compact_object",
  "system",
  "constellation",
  "mission",
  "spacecraft",
  "launch_vehicle",
  "observatory",
  "person",
  "concept",
  "event",
  "sky_region",
] as const satisfies ReadonlyArray<EntityType>;
const COMPASS_POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

type SavedNightEvent =
  Readonly<{ instant_utc: string; kind: "time" }> | Readonly<{ kind: "unavailable" }>;

type SavedTargetEvent =
  | Readonly<{ instant_utc: string; kind: "time" }>
  | Readonly<{ kind: "circumpolar" | "never-rises" | "not-during-night" | "unavailable" }>;

export type SavedObservationPlan = Readonly<{
  id: string;
  schema_version: 1;
  created_at: string;
  updated_at: string;
  target: Readonly<{
    entity_id: string;
    slug: string;
    canonical_name: string;
    entity_type: EntityType;
  }>;
  night_date: string;
  selected_time_utc: string;
  time_zone: string;
  observer: Readonly<{
    latitude_deg: number;
    longitude_deg: number;
  }>;
  coordinate_source: Readonly<{
    provider_code: string;
    provider_name: string;
    dataset_code: string;
    dataset_name: string;
    dataset_release_version: string;
    source_record_id: string;
    reference_epoch: number;
    right_ascension_deg: number;
    declination_deg: number;
    original_right_ascension: string;
    original_declination: string;
  }>;
  model: typeof SAVED_OBSERVATION_PLAN_MODEL;
  planner: Readonly<{
    plot_start_utc: string;
    plot_end_utc: string;
    selected: Readonly<{
      instant_utc: string;
      position: Readonly<{
        altitude_deg: number;
        azimuth_deg: number;
        compass: string;
      }>;
    }>;
    max_during_darkness: Readonly<{ altitude_deg: number; instant_utc: string }> | null;
    target_visibility: ObservationPlan["targetVisibility"];
    night: Readonly<{
      sunset: SavedNightEvent;
      astronomical_dusk: SavedNightEvent;
      astronomical_darkness: Readonly<{ start_utc: string; end_utc: string }> | null;
      astronomical_dawn: SavedNightEvent;
      sunrise: SavedNightEvent;
    }>;
    target_events: Readonly<{
      rise: SavedTargetEvent;
      transit: SavedTargetEvent;
      set: SavedTargetEvent;
    }>;
    altitude_samples: ReadonlyArray<Readonly<{ altitude_deg: number; instant_utc: string }>>;
  }>;
}>;

export type CreateSavedObservationPlanInput = Readonly<{
  id: string;
  createdAt: string;
  target: Readonly<{
    entityId: string;
    slug: string;
    canonicalName: string;
    entityType: EntityType;
  }>;
  nightDate: string;
  timeZone: string;
  plan: ObservationPlan;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedString(value: unknown, maximum: number, pattern?: RegExp): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    [...value].length <= maximum &&
    (pattern === undefined || pattern.test(value))
  );
}

function canonicalUtc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function validEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && (ENTITY_TYPES as ReadonlyArray<string>).includes(value);
}

function validTimeZone(value: unknown): value is string {
  if (!boundedString(value, 100)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function serializeNightEvent(event: NightEvent): SavedNightEvent {
  return event.kind === "time"
    ? { instant_utc: event.instant.toISOString(), kind: "time" }
    : { kind: "unavailable" };
}

function serializeTargetEvent(event: TargetEvent): SavedTargetEvent {
  if (event.kind === "time" && event.instant !== undefined) {
    return { instant_utc: event.instant.toISOString(), kind: "time" };
  }
  return { kind: event.kind === "time" ? "unavailable" : event.kind };
}

function validSavedNightEvent(value: unknown): value is SavedNightEvent {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "time") {
    return hasExactKeys(value, ["instant_utc", "kind"]) && canonicalUtc(value.instant_utc);
  }
  return value.kind === "unavailable" && hasExactKeys(value, ["kind"]);
}

function validSavedTargetEvent(value: unknown): value is SavedTargetEvent {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "time") {
    return hasExactKeys(value, ["instant_utc", "kind"]) && canonicalUtc(value.instant_utc);
  }
  return (
    ["circumpolar", "never-rises", "not-during-night", "unavailable"].includes(value.kind) &&
    hasExactKeys(value, ["kind"])
  );
}

function validPosition(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ["altitude_deg", "azimuth_deg", "compass"])) {
    return false;
  }
  return (
    finiteInRange(value.altitude_deg, -90, 90) &&
    finiteInRange(value.azimuth_deg, 0, 360) &&
    value.azimuth_deg < 360 &&
    typeof value.compass === "string" &&
    (COMPASS_POINTS as ReadonlyArray<string>).includes(value.compass)
  );
}

function validAltitudeSample(value: unknown): value is Readonly<{
  altitude_deg: number;
  instant_utc: string;
}> {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["altitude_deg", "instant_utc"]) &&
    finiteInRange(value.altitude_deg, -90, 90) &&
    canonicalUtc(value.instant_utc)
  );
}

function validTarget(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["canonical_name", "entity_id", "entity_type", "slug"]) &&
    typeof value.entity_id === "string" &&
    UUID_PATTERN.test(value.entity_id) &&
    boundedString(value.slug, 100, SLUG_PATTERN) &&
    boundedString(value.canonical_name, 200) &&
    validEntityType(value.entity_type)
  );
}

function validCoordinateSource(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "provider_code",
      "provider_name",
      "dataset_code",
      "dataset_name",
      "dataset_release_version",
      "source_record_id",
      "reference_epoch",
      "right_ascension_deg",
      "declination_deg",
      "original_right_ascension",
      "original_declination",
    ])
  ) {
    return false;
  }
  return (
    boundedString(value.provider_code, 80, CODE_PATTERN) &&
    boundedString(value.provider_name, 200) &&
    boundedString(value.dataset_code, 100, CODE_PATTERN) &&
    boundedString(value.dataset_name, 300) &&
    boundedString(value.dataset_release_version, 100) &&
    boundedString(value.source_record_id, 200) &&
    finiteInRange(value.reference_epoch, 1000, 3000) &&
    finiteInRange(value.right_ascension_deg, 0, 360) &&
    value.right_ascension_deg < 360 &&
    finiteInRange(value.declination_deg, -90, 90) &&
    boundedString(value.original_right_ascension, 100) &&
    boundedString(value.original_declination, 100)
  );
}

function validModel(value: unknown): value is typeof SAVED_OBSERVATION_PLAN_MODEL {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, [
      "altitude_sample_cap",
      "astronomical_darkness_solar_altitude_deg",
      "astronomy_engine_version",
      "calculation",
      "refraction",
      "solar_boundary",
    ]) &&
    value.altitude_sample_cap === SAVED_OBSERVATION_PLAN_MODEL.altitude_sample_cap &&
    value.astronomical_darkness_solar_altitude_deg ===
      SAVED_OBSERVATION_PLAN_MODEL.astronomical_darkness_solar_altitude_deg &&
    value.astronomy_engine_version === SAVED_OBSERVATION_PLAN_MODEL.astronomy_engine_version &&
    value.calculation === SAVED_OBSERVATION_PLAN_MODEL.calculation &&
    value.refraction === SAVED_OBSERVATION_PLAN_MODEL.refraction &&
    value.solar_boundary === SAVED_OBSERVATION_PLAN_MODEL.solar_boundary
  );
}

function validPlanner(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "plot_start_utc",
      "plot_end_utc",
      "selected",
      "max_during_darkness",
      "target_visibility",
      "night",
      "target_events",
      "altitude_samples",
    ]) ||
    !canonicalUtc(value.plot_start_utc) ||
    !canonicalUtc(value.plot_end_utc) ||
    value.plot_start_utc >= value.plot_end_utc ||
    !isRecord(value.selected) ||
    !hasExactKeys(value.selected, ["instant_utc", "position"]) ||
    !canonicalUtc(value.selected.instant_utc) ||
    !validPosition(value.selected.position) ||
    !["circumpolar", "never-rises", "rises-and-sets", "unavailable"].includes(
      String(value.target_visibility),
    ) ||
    !isRecord(value.night) ||
    !hasExactKeys(value.night, [
      "sunset",
      "astronomical_dusk",
      "astronomical_darkness",
      "astronomical_dawn",
      "sunrise",
    ]) ||
    !validSavedNightEvent(value.night.sunset) ||
    !validSavedNightEvent(value.night.astronomical_dusk) ||
    !validSavedNightEvent(value.night.astronomical_dawn) ||
    !validSavedNightEvent(value.night.sunrise) ||
    !isRecord(value.target_events) ||
    !hasExactKeys(value.target_events, ["rise", "transit", "set"]) ||
    !validSavedTargetEvent(value.target_events.rise) ||
    !validSavedTargetEvent(value.target_events.transit) ||
    !validSavedTargetEvent(value.target_events.set) ||
    !Array.isArray(value.altitude_samples) ||
    value.altitude_samples.length < 2 ||
    value.altitude_samples.length > MAX_SAVED_ALTITUDE_SAMPLES ||
    !value.altitude_samples.every(validAltitudeSample)
  ) {
    return false;
  }

  if (value.max_during_darkness !== null) {
    if (
      !validAltitudeSample(value.max_during_darkness) ||
      !hasExactKeys(value.max_during_darkness, ["altitude_deg", "instant_utc"])
    ) {
      return false;
    }
  }

  if (value.night.astronomical_darkness !== null) {
    if (
      !isRecord(value.night.astronomical_darkness) ||
      !hasExactKeys(value.night.astronomical_darkness, ["start_utc", "end_utc"]) ||
      !canonicalUtc(value.night.astronomical_darkness.start_utc) ||
      !canonicalUtc(value.night.astronomical_darkness.end_utc) ||
      value.night.astronomical_darkness.start_utc >= value.night.astronomical_darkness.end_utc
    ) {
      return false;
    }
  }

  const samples = value.altitude_samples as Array<{ altitude_deg: number; instant_utc: string }>;
  if (
    samples[0]?.instant_utc !== value.plot_start_utc ||
    samples.at(-1)?.instant_utc !== value.plot_end_utc
  ) {
    return false;
  }
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index - 1]!.instant_utc >= samples[index]!.instant_utc) return false;
  }
  return true;
}

export function validateSavedObservationPlan(value: unknown): SavedObservationPlan | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "schema_version",
      "created_at",
      "updated_at",
      "target",
      "night_date",
      "selected_time_utc",
      "time_zone",
      "observer",
      "coordinate_source",
      "model",
      "planner",
    ]) ||
    typeof value.id !== "string" ||
    !UUID_V4_PATTERN.test(value.id) ||
    value.schema_version !== SAVED_OBSERVATION_PLAN_SCHEMA_VERSION ||
    !canonicalUtc(value.created_at) ||
    !canonicalUtc(value.updated_at) ||
    value.updated_at < value.created_at ||
    !validTarget(value.target) ||
    typeof value.night_date !== "string" ||
    !isValidNightDate(value.night_date) ||
    !canonicalUtc(value.selected_time_utc) ||
    !validTimeZone(value.time_zone) ||
    !isRecord(value.observer) ||
    !hasExactKeys(value.observer, ["latitude_deg", "longitude_deg"]) ||
    !finiteInRange(value.observer.latitude_deg, -90, 90) ||
    !finiteInRange(value.observer.longitude_deg, -180, 180) ||
    !validCoordinateSource(value.coordinate_source) ||
    !validModel(value.model) ||
    !validPlanner(value.planner)
  ) {
    return null;
  }
  return value as unknown as SavedObservationPlan;
}

export function createSavedObservationPlan(
  input: CreateSavedObservationPlanInput,
): SavedObservationPlan {
  const { coordinate } = input.plan;
  const saved: SavedObservationPlan = {
    coordinate_source: {
      dataset_code: coordinate.source.dataset.code,
      dataset_name: coordinate.source.dataset.name,
      dataset_release_version: coordinate.source.dataset.release_version,
      declination_deg: coordinate.declinationDegrees,
      original_declination: coordinate.originalDeclination,
      original_right_ascension: coordinate.originalRightAscension,
      provider_code: coordinate.source.provider.code,
      provider_name: coordinate.source.provider.name,
      reference_epoch: coordinate.epoch,
      right_ascension_deg: coordinate.rightAscensionDegrees,
      source_record_id: coordinate.source.source_record_id,
    },
    created_at: input.createdAt,
    id: input.id,
    model: SAVED_OBSERVATION_PLAN_MODEL,
    night_date: input.nightDate,
    observer: {
      latitude_deg: input.plan.location.latitude,
      longitude_deg: input.plan.location.longitude,
    },
    planner: {
      altitude_samples: input.plan.samples.map((sample) => ({
        altitude_deg: sample.altitude,
        instant_utc: sample.instant.toISOString(),
      })),
      max_during_darkness:
        input.plan.maxDuringDarkness === null
          ? null
          : {
              altitude_deg: input.plan.maxDuringDarkness.altitude,
              instant_utc: input.plan.maxDuringDarkness.instant.toISOString(),
            },
      night: {
        astronomical_darkness:
          input.plan.night.astronomicalDarkness === null
            ? null
            : {
                end_utc: input.plan.night.astronomicalDarkness.end.toISOString(),
                start_utc: input.plan.night.astronomicalDarkness.start.toISOString(),
              },
        astronomical_dawn: serializeNightEvent(input.plan.night.astronomicalDawn),
        astronomical_dusk: serializeNightEvent(input.plan.night.astronomicalDusk),
        sunrise: serializeNightEvent(input.plan.night.sunrise),
        sunset: serializeNightEvent(input.plan.night.sunset),
      },
      plot_end_utc: input.plan.plotEnd.toISOString(),
      plot_start_utc: input.plan.plotStart.toISOString(),
      selected: {
        instant_utc: input.plan.selected.instant.toISOString(),
        position: {
          altitude_deg: input.plan.selected.position.altitude,
          azimuth_deg: input.plan.selected.position.azimuth,
          compass: input.plan.selected.position.compass,
        },
      },
      target_events: {
        rise: serializeTargetEvent(input.plan.targetEvents.rise),
        set: serializeTargetEvent(input.plan.targetEvents.set),
        transit: serializeTargetEvent(input.plan.targetEvents.transit),
      },
      target_visibility: input.plan.targetVisibility,
    },
    schema_version: SAVED_OBSERVATION_PLAN_SCHEMA_VERSION,
    selected_time_utc: input.plan.selected.instant.toISOString(),
    target: {
      canonical_name: input.target.canonicalName,
      entity_id: input.target.entityId,
      entity_type: input.target.entityType,
      slug: input.target.slug,
    },
    time_zone: input.timeZone,
    updated_at: input.createdAt,
  };

  const validated = validateSavedObservationPlan(saved);
  if (validated === null) throw new TypeError("Saved observation plan input is invalid.");
  return validated;
}
