import {
  eclipseSimulatorEndpoint,
  validateExactGenerated,
  type EclipseSimulatorCalculationResponse,
} from "@lumina/api-client";

import rawEclipseArtifact from "../../../../../data/seed/eclipse-simulator-v1.json";

export const ECLIPSE_SIMULATOR_MODEL_VERSION = "eclipse-simulator-v1" as const;
export const ECLIPSE_SIMULATOR_SCHEMA_VERSION = 1 as const;
export const ECLIPSE_SIMULATOR_SHARE_SCHEMA_VERSION = 1 as const;
export const ECLIPSE_SIMULATOR_ARTIFACT_VERSION = 1 as const;
export const ECLIPSE_SIMULATOR_SHARE_STATE_MAX_CHARS = 768;

export const ECLIPSE_SIMULATOR_LIMITS = {
  minUtc: "1973-01-02T00:00:00Z",
  maxUtc: "2027-08-27T23:59:59Z",
  minLatitudeDeg: -90,
  maxLatitudeDeg: 90,
  minLongitudeDeg: -180,
  maxLongitudeDeg: 180,
  minElevationM: -500,
  maxElevationM: 9000,
} as const;

export type EclipseSimulatorState = Readonly<{
  version: typeof ECLIPSE_SIMULATOR_SHARE_SCHEMA_VERSION;
  model_version: typeof ECLIPSE_SIMULATOR_MODEL_VERSION;
  at_utc: string;
  latitude_deg: number;
  longitude_deg: number;
  elevation_m: number;
}>;

export type EclipseSimulatorSource = Readonly<{
  id: string;
  title: string;
  organization_or_authors: string;
  url: string;
  accessed_at: string;
  dataset_or_release: string;
  record_reference: string;
  retrieved_at: string;
  data_date: string;
  terms_or_licence: string;
  citation: string;
  claim_scope: string;
  source_type: string;
}>;

type EclipseArtifact = Readonly<{
  artifact_version: 1;
  model_version: typeof ECLIPSE_SIMULATOR_MODEL_VERSION;
  schema_version: 1;
  share_schema_version: 1;
  definition: Readonly<{
    slug: "eclipse-simulator";
    title: "Eclipse Simulator";
    status: "ready";
    version: 1;
    model_version: typeof ECLIPSE_SIMULATOR_MODEL_VERSION;
    share_schema_version: 1;
    equations: Readonly<Record<string, string>>;
    sampling_policy: string;
    default_preset: string;
    assumptions: ReadonlyArray<string>;
    limitations: ReadonlyArray<string>;
    references: ReadonlyArray<string>;
  }>;
  sources: ReadonlyArray<EclipseSimulatorSource>;
  constants: Readonly<Record<string, string | number>>;
  presets: Readonly<Record<string, Readonly<Record<string, string | number>>>>;
}>;

const STATE_KEYS = [
  "version",
  "model_version",
  "at_utc",
  "latitude_deg",
  "longitude_deg",
  "elevation_m",
] as const;

const EXPECTED_SOURCE_IDS = new Set([
  "astropy-solar-system-ephemerides",
  "erfa-moon98",
  "iau-2015-resolution-b3",
  "nasa-nssdc-moon-fact-sheet",
  "nasa-eclipse-geometry",
  "nasa-eclipse-safety",
  "nasa-2024-eclipse-where-when",
  "nasa-2023-eclipse-where-when",
]);

export class EclipseSimulatorStateValidationError extends Error {
  readonly code = "ECLIPSE_SIMULATOR_STATE_INVALID";
  constructor() {
    super("ECLIPSE_SIMULATOR_STATE_INVALID");
    this.name = "EclipseSimulatorStateValidationError";
  }
}

export class EclipseSimulatorArtifactValidationError extends Error {
  readonly code = "ECLIPSE_SIMULATOR_ARTIFACT_INVALID";
  constructor() {
    super("ECLIPSE_SIMULATOR_ARTIFACT_INVALID");
    this.name = "EclipseSimulatorArtifactValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function canonicalUtc(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) {
    return false;
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return false;
  return new Date(milliseconds).toISOString().replace(".000Z", "Z") === value;
}

function failArtifact(): never {
  throw new EclipseSimulatorArtifactValidationError();
}

export function validateEclipseSimulatorState(value: unknown): EclipseSimulatorState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STATE_KEYS)) return null;
  if (
    value.version !== ECLIPSE_SIMULATOR_SHARE_SCHEMA_VERSION ||
    value.model_version !== ECLIPSE_SIMULATOR_MODEL_VERSION ||
    !canonicalUtc(value.at_utc) ||
    value.at_utc < ECLIPSE_SIMULATOR_LIMITS.minUtc ||
    value.at_utc > ECLIPSE_SIMULATOR_LIMITS.maxUtc ||
    !finite(value.latitude_deg) ||
    value.latitude_deg < ECLIPSE_SIMULATOR_LIMITS.minLatitudeDeg ||
    value.latitude_deg > ECLIPSE_SIMULATOR_LIMITS.maxLatitudeDeg ||
    !finite(value.longitude_deg) ||
    value.longitude_deg < ECLIPSE_SIMULATOR_LIMITS.minLongitudeDeg ||
    value.longitude_deg > ECLIPSE_SIMULATOR_LIMITS.maxLongitudeDeg ||
    !finite(value.elevation_m) ||
    value.elevation_m < ECLIPSE_SIMULATOR_LIMITS.minElevationM ||
    value.elevation_m > ECLIPSE_SIMULATOR_LIMITS.maxElevationM
  ) {
    return null;
  }
  return {
    version: ECLIPSE_SIMULATOR_SHARE_SCHEMA_VERSION,
    model_version: ECLIPSE_SIMULATOR_MODEL_VERSION,
    at_utc: value.at_utc,
    latitude_deg: value.latitude_deg,
    longitude_deg: value.longitude_deg,
    elevation_m: value.elevation_m,
  };
}

export function encodeEclipseSimulatorState(value: unknown): string {
  const state = validateEclipseSimulatorState(value);
  if (state === null) throw new EclipseSimulatorStateValidationError();
  return JSON.stringify(state);
}

export function decodeEclipseSimulatorState(value: unknown): EclipseSimulatorState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > ECLIPSE_SIMULATOR_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateEclipseSimulatorState(decoded);
    return state !== null && encodeEclipseSimulatorState(state) === value ? state : null;
  } catch {
    return null;
  }
}

export function eclipseSimulatorRequestEndpoint(state: EclipseSimulatorState) {
  const query = new URLSearchParams({
    at_utc: state.at_utc,
    latitude_deg: String(state.latitude_deg),
    longitude_deg: String(state.longitude_deg),
    elevation_m: String(state.elevation_m),
  });
  return { ...eclipseSimulatorEndpoint, path: `${eclipseSimulatorEndpoint.path}?${query}` };
}

function validInstant(result: EclipseSimulatorCalculationResponse): boolean {
  const instant = result.instant;
  const shadowForPhase = {
    none: "outside",
    partial: "penumbra",
    total: "umbra",
    annular: "antumbra",
  } as const;
  return (
    finite(instant.sun_angular_radius_deg) &&
    instant.sun_angular_radius_deg > 0 &&
    finite(instant.moon_angular_radius_deg) &&
    instant.moon_angular_radius_deg > 0 &&
    finite(instant.center_separation_deg) &&
    instant.center_separation_deg >= 0 &&
    finite(instant.obscuration_fraction) &&
    instant.obscuration_fraction >= 0 &&
    instant.obscuration_fraction <= 1 &&
    finite(instant.sun_distance_km) &&
    instant.sun_distance_km > 0 &&
    finite(instant.moon_distance_km) &&
    instant.moon_distance_km > 0 &&
    finite(instant.sun_altitude_deg) &&
    instant.sun_altitude_deg >= -90 &&
    instant.sun_altitude_deg <= 90 &&
    instant.shadow_region === shadowForPhase[instant.phase] &&
    (instant.phase !== "none" || instant.obscuration_fraction === 0)
  );
}

function validEvent(result: EclipseSimulatorCalculationResponse): boolean {
  const event = result.local_event;
  if (event === null) return result.instant.phase === "none";
  if (
    !canonicalUtc(event.partial_begin_utc) ||
    !canonicalUtc(event.maximum_utc) ||
    !canonicalUtc(event.partial_end_utc) ||
    event.partial_begin_utc > event.maximum_utc ||
    event.maximum_utc > event.partial_end_utc ||
    !finite(event.maximum_obscuration_fraction) ||
    event.maximum_obscuration_fraction < 0 ||
    event.maximum_obscuration_fraction > 1 ||
    !finite(event.sun_altitude_deg_at_maximum) ||
    event.sun_altitude_deg_at_maximum < -90 ||
    event.sun_altitude_deg_at_maximum > 90
  ) {
    return false;
  }
  if (event.classification === "partial") {
    return event.central_begin_utc === null && event.central_end_utc === null;
  }
  return (
    canonicalUtc(event.central_begin_utc) &&
    canonicalUtc(event.central_end_utc) &&
    event.partial_begin_utc <= event.central_begin_utc &&
    event.central_begin_utc <= event.maximum_utc &&
    event.maximum_utc <= event.central_end_utc &&
    event.central_end_utc <= event.partial_end_utc
  );
}

export function validateEclipseSimulatorCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): EclipseSimulatorCalculationResponse | null {
  const state = validateEclipseSimulatorState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(eclipseSimulatorEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== ECLIPSE_SIMULATOR_MODEL_VERSION ||
    result.schema_version !== ECLIPSE_SIMULATOR_SCHEMA_VERSION ||
    result.inputs.at_utc !== state.at_utc ||
    result.inputs.latitude_deg !== state.latitude_deg ||
    result.inputs.longitude_deg !== state.longitude_deg ||
    result.inputs.elevation_m !== state.elevation_m ||
    result.safety_reference_id !== "nasa-eclipse-safety" ||
    !nonEmptyString(result.ephemeris_note) ||
    !nonEmptyString(result.timing_note) ||
    !validInstant(result) ||
    !validEvent(result)
  ) {
    return null;
  }
  return result;
}

function validateSource(source: unknown): void {
  if (!isRecord(source)) failArtifact();
  const keys = [
    "id",
    "title",
    "organization_or_authors",
    "url",
    "accessed_at",
    "dataset_or_release",
    "record_reference",
    "retrieved_at",
    "data_date",
    "terms_or_licence",
    "citation",
    "claim_scope",
    "source_type",
  ];
  if (!hasOnlyKeys(source, keys)) failArtifact();
  for (const key of keys) if (!nonEmptyString(source[key])) failArtifact();
  try {
    const url = new URL(source.url as string);
    if (url.protocol !== "https:" || url.username || url.password || url.port) failArtifact();
  } catch {
    failArtifact();
  }
}

export function validateEclipseSimulatorArtifact(value: unknown): asserts value is EclipseArtifact {
  if (!isRecord(value)) failArtifact();
  if (
    value.artifact_version !== ECLIPSE_SIMULATOR_ARTIFACT_VERSION ||
    value.model_version !== ECLIPSE_SIMULATOR_MODEL_VERSION ||
    value.schema_version !== ECLIPSE_SIMULATOR_SCHEMA_VERSION ||
    value.share_schema_version !== ECLIPSE_SIMULATOR_SHARE_SCHEMA_VERSION ||
    !isRecord(value.definition) ||
    !Array.isArray(value.sources) ||
    !isRecord(value.constants) ||
    !isRecord(value.presets)
  ) {
    failArtifact();
  }
  const definition = value.definition;
  if (
    definition.slug !== "eclipse-simulator" ||
    definition.title !== "Eclipse Simulator" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== ECLIPSE_SIMULATOR_MODEL_VERSION ||
    definition.share_schema_version !== 1 ||
    !isRecord(definition.equations) ||
    !Array.isArray(definition.assumptions) ||
    !Array.isArray(definition.limitations) ||
    !Array.isArray(definition.references) ||
    !nonEmptyString(definition.sampling_policy) ||
    !nonEmptyString(definition.default_preset)
  ) {
    failArtifact();
  }
  value.sources.forEach(validateSource);
  const sourceIds = value.sources.map((source) => (source as Record<string, unknown>).id);
  if (
    sourceIds.length !== EXPECTED_SOURCE_IDS.size ||
    sourceIds.some((id) => typeof id !== "string" || !EXPECTED_SOURCE_IDS.has(id)) ||
    new Set(sourceIds).size !== sourceIds.length ||
    definition.references.length !== sourceIds.length ||
    !definition.references.every((id) => typeof id === "string" && sourceIds.includes(id))
  ) {
    failArtifact();
  }
  if (
    value.constants["SOLAR_RADIUS_KM"] !== 695700 ||
    value.constants["MOON_RADIUS_KM"] !== 1737.4 ||
    value.constants["MIN_UTC"] !== ECLIPSE_SIMULATOR_LIMITS.minUtc ||
    value.constants["MAX_UTC"] !== ECLIPSE_SIMULATOR_LIMITS.maxUtc ||
    value.constants["EPHEMERIS"] !== "builtin"
  ) {
    failArtifact();
  }
  const defaultPreset = value.presets["nasa-2024-dallas-total-reference"];
  if (!isRecord(defaultPreset)) failArtifact();
  if (
    validateEclipseSimulatorState({
      version: 1,
      model_version: ECLIPSE_SIMULATOR_MODEL_VERSION,
      ...defaultPreset,
    }) === null
  ) {
    failArtifact();
  }
}

validateEclipseSimulatorArtifact(rawEclipseArtifact);
const ECLIPSE_SIMULATOR_ARTIFACT = rawEclipseArtifact as EclipseArtifact;

export const ECLIPSE_SIMULATOR_DEFINITION = ECLIPSE_SIMULATOR_ARTIFACT.definition;
export const ECLIPSE_SIMULATOR_SOURCES = ECLIPSE_SIMULATOR_ARTIFACT.sources;
export const ECLIPSE_SIMULATOR_CONSTANTS = ECLIPSE_SIMULATOR_ARTIFACT.constants;
export const ECLIPSE_SIMULATOR_PRESETS = ECLIPSE_SIMULATOR_ARTIFACT.presets;

const defaultPreset = ECLIPSE_SIMULATOR_PRESETS["nasa-2024-dallas-total-reference"]!;
export const DEFAULT_ECLIPSE_SIMULATOR_STATE: EclipseSimulatorState = {
  version: 1,
  model_version: ECLIPSE_SIMULATOR_MODEL_VERSION,
  at_utc: String(defaultPreset.at_utc),
  latitude_deg: Number(defaultPreset.latitude_deg),
  longitude_deg: Number(defaultPreset.longitude_deg),
  elevation_m: Number(defaultPreset.elevation_m),
};
