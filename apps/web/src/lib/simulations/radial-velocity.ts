import {
  radialVelocityEndpoint,
  validateExactGenerated,
  type RadialVelocityCalculationResponse,
} from "@lumina/api-client";

import rawRadialVelocityArtifact from "../../../../../data/seed/radial-velocity-v1.json";

export const RADIAL_VELOCITY_MODEL_VERSION = "radial-velocity-v1" as const;
export const RADIAL_VELOCITY_SCHEMA_VERSION = 1 as const;
export const RADIAL_VELOCITY_ARTIFACT_VERSION = 1 as const;
export const RADIAL_VELOCITY_SHARE_SCHEMA_VERSION = 1 as const;
export const RADIAL_VELOCITY_SHARE_STATE_MAX_CHARS = 1_536;
export const RADIAL_VELOCITY_CURVE_POINTS = 301;

export type RadialVelocityState = Readonly<{
  version: typeof RADIAL_VELOCITY_SHARE_SCHEMA_VERSION;
  model_version: typeof RADIAL_VELOCITY_MODEL_VERSION;
  stellar_mass_kg: number;
  planet_mass_kg: number;
  orbital_period_s: number;
  eccentricity: number;
  inclination_deg: number;
  stellar_argument_of_periastron_deg: number;
  mean_anomaly_at_epoch_deg: number;
}>;

export type RadialVelocitySource = Readonly<{
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

type RadialVelocityDefinition = Readonly<{
  slug: "radial-velocity";
  title: "Radial Velocity Lab";
  status: "ready";
  version: 1;
  model_version: typeof RADIAL_VELOCITY_MODEL_VERSION;
  share_schema_version: 1;
  learning_objectives: ReadonlyArray<string>;
  prerequisite_concepts: ReadonlyArray<string>;
  equations: Readonly<Record<string, string>>;
  sampling_policy: string;
  default_preset: string;
  assumptions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  references: ReadonlyArray<string>;
  validation_fixtures: ReadonlyArray<string>;
}>;

type RadialVelocityArtifact = Readonly<{
  artifact_version: 1;
  model_version: typeof RADIAL_VELOCITY_MODEL_VERSION;
  schema_version: 1;
  share_schema_version: 1;
  definition: RadialVelocityDefinition;
  sources: ReadonlyArray<RadialVelocitySource>;
  constants: Readonly<Record<string, number>>;
  presets: Readonly<Record<string, Omit<RadialVelocityState, "version" | "model_version">>>;
  validation_fixtures: ReadonlyArray<Readonly<{ id: string; purpose: string }>>;
  scientific_validation: Readonly<{
    id: string;
    checked_at: string;
    method: string;
    tools: ReadonlyArray<Readonly<{ name: string; version: string; role: string }>>;
    source_ids: ReadonlyArray<string>;
    test_references: ReadonlyArray<string>;
  }>;
}>;

const STATE_KEYS = [
  "version",
  "model_version",
  "stellar_mass_kg",
  "planet_mass_kg",
  "orbital_period_s",
  "eccentricity",
  "inclination_deg",
  "stellar_argument_of_periastron_deg",
  "mean_anomaly_at_epoch_deg",
] as const;

const EXPECTED_SOURCE_IDS = new Set([
  "murray-correia-2010-keplerian-orbits",
  "wright-gaudi-2013-detection-methods",
  "nist-codata-2022",
]);

export const RADIAL_VELOCITY_INPUT_RANGES = {
  stellar_mass_kg: { min: 1e28, max: 1e32 },
  planet_mass_kg: { min: 1e18, max: 1e29 },
  orbital_period_s: { min: 3600, max: 1e10 },
  eccentricity: { min: 0, max: 0.95 },
  inclination_deg: { min: 0, max: 90 },
  stellar_argument_of_periastron_deg: { min: 0, max: 360 },
  mean_anomaly_at_epoch_deg: { min: 0, max: 360 },
} as const;

export class RadialVelocityStateValidationError extends Error {
  readonly code = "RADIAL_VELOCITY_STATE_INVALID";
  constructor() {
    super("RADIAL_VELOCITY_STATE_INVALID");
    this.name = "RadialVelocityStateValidationError";
  }
}

export class RadialVelocityArtifactValidationError extends Error {
  readonly code = "RADIAL_VELOCITY_ARTIFACT_INVALID";
  constructor() {
    super("RADIAL_VELOCITY_ARTIFACT_INVALID");
    this.name = "RadialVelocityArtifactValidationError";
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

function inRange(value: unknown, range: Readonly<{ min: number; max: number }>): value is number {
  return finite(value) && value >= range.min && value <= range.max;
}

function inHalfOpenAngle(value: unknown): value is number {
  return finite(value) && value >= 0 && value < 360;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function failArtifact(): never {
  throw new RadialVelocityArtifactValidationError();
}

export function validateRadialVelocityState(value: unknown): RadialVelocityState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STATE_KEYS)) return null;
  if (
    value.version !== RADIAL_VELOCITY_SHARE_SCHEMA_VERSION ||
    value.model_version !== RADIAL_VELOCITY_MODEL_VERSION ||
    !inRange(value.stellar_mass_kg, RADIAL_VELOCITY_INPUT_RANGES.stellar_mass_kg) ||
    !inRange(value.planet_mass_kg, RADIAL_VELOCITY_INPUT_RANGES.planet_mass_kg) ||
    !inRange(value.orbital_period_s, RADIAL_VELOCITY_INPUT_RANGES.orbital_period_s) ||
    !inRange(value.eccentricity, RADIAL_VELOCITY_INPUT_RANGES.eccentricity) ||
    !inRange(value.inclination_deg, RADIAL_VELOCITY_INPUT_RANGES.inclination_deg) ||
    !inHalfOpenAngle(value.stellar_argument_of_periastron_deg) ||
    !inHalfOpenAngle(value.mean_anomaly_at_epoch_deg) ||
    value.planet_mass_kg > 0.1 * value.stellar_mass_kg
  ) {
    return null;
  }
  return {
    version: RADIAL_VELOCITY_SHARE_SCHEMA_VERSION,
    model_version: RADIAL_VELOCITY_MODEL_VERSION,
    stellar_mass_kg: value.stellar_mass_kg,
    planet_mass_kg: value.planet_mass_kg,
    orbital_period_s: value.orbital_period_s,
    eccentricity: value.eccentricity,
    inclination_deg: value.inclination_deg,
    stellar_argument_of_periastron_deg: value.stellar_argument_of_periastron_deg,
    mean_anomaly_at_epoch_deg: value.mean_anomaly_at_epoch_deg,
  };
}

export function encodeRadialVelocityState(value: unknown): string {
  const state = validateRadialVelocityState(value);
  if (state === null) throw new RadialVelocityStateValidationError();
  return JSON.stringify(state);
}

export function decodeRadialVelocityState(value: unknown): RadialVelocityState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > RADIAL_VELOCITY_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateRadialVelocityState(decoded);
    return state !== null && encodeRadialVelocityState(state) === value ? state : null;
  } catch {
    return null;
  }
}

function exactEcho(state: RadialVelocityState, result: RadialVelocityCalculationResponse): boolean {
  return (
    result.inputs.stellar_mass_kg === state.stellar_mass_kg &&
    result.inputs.planet_mass_kg === state.planet_mass_kg &&
    result.inputs.orbital_period_s === state.orbital_period_s &&
    result.inputs.eccentricity === state.eccentricity &&
    result.inputs.inclination_deg === state.inclination_deg &&
    result.inputs.stellar_argument_of_periastron_deg === state.stellar_argument_of_periastron_deg &&
    result.inputs.mean_anomaly_at_epoch_deg === state.mean_anomaly_at_epoch_deg
  );
}

export function radialVelocityRequestEndpoint(state: RadialVelocityState) {
  const query = new URLSearchParams({
    stellar_mass_kg: String(state.stellar_mass_kg),
    planet_mass_kg: String(state.planet_mass_kg),
    orbital_period_s: String(state.orbital_period_s),
    eccentricity: String(state.eccentricity),
    inclination_deg: String(state.inclination_deg),
    stellar_argument_of_periastron_deg: String(state.stellar_argument_of_periastron_deg),
    mean_anomaly_at_epoch_deg: String(state.mean_anomaly_at_epoch_deg),
  });
  return { ...radialVelocityEndpoint, path: `${radialVelocityEndpoint.path}?${query}` };
}

export function validateRadialVelocityCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): RadialVelocityCalculationResponse | null {
  const state = validateRadialVelocityState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(radialVelocityEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== RADIAL_VELOCITY_MODEL_VERSION ||
    result.schema_version !== RADIAL_VELOCITY_SCHEMA_VERSION ||
    !exactEcho(state, result) ||
    !finite(result.inclination_projection) ||
    result.inclination_projection < 0 ||
    result.inclination_projection > 1 ||
    !finite(result.semi_amplitude_m_s) ||
    result.semi_amplitude_m_s < 0 ||
    !finite(result.projected_planet_mass_kg) ||
    result.projected_planet_mass_kg < 0 ||
    !finite(result.mass_function_kg) ||
    result.mass_function_kg < 0 ||
    !finite(result.edge_on_minimum_mass_kg) ||
    result.edge_on_minimum_mass_kg < 0 ||
    result.curve.length !== RADIAL_VELOCITY_CURVE_POINTS
  ) {
    return null;
  }
  let previousTime = Number.NEGATIVE_INFINITY;
  let previousPhase = Number.NEGATIVE_INFINITY;
  for (const point of result.curve) {
    if (
      !finite(point.time_s) ||
      !finite(point.orbital_phase) ||
      !finite(point.radial_velocity_m_s) ||
      point.time_s <= previousTime ||
      point.orbital_phase <= previousPhase ||
      point.orbital_phase < 0 ||
      point.orbital_phase > 1
    ) {
      return null;
    }
    previousTime = point.time_s;
    previousPhase = point.orbital_phase;
  }
  const first = result.curve[0];
  const last = result.curve.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    first.time_s !== 0 ||
    first.orbital_phase !== 0 ||
    last.time_s !== state.orbital_period_s ||
    last.orbital_phase !== 1
  ) {
    return null;
  }
  return result;
}

export type RadialVelocityVisual = Readonly<{
  path: string;
  points: ReadonlyArray<Readonly<{ x: number; y: number; time_s: number; velocity_m_s: number }>>;
  minimum_velocity_m_s: number;
  maximum_velocity_m_s: number;
}>;

/** Normalize API-returned time/velocity values for SVG display; no RV physics is computed here. */
export function buildRadialVelocityVisual(resultValue: unknown): RadialVelocityVisual | null {
  const parsed = validateExactGenerated(radialVelocityEndpoint.validator, resultValue);
  if (!parsed.valid || parsed.data.curve.length !== RADIAL_VELOCITY_CURVE_POINTS) return null;
  const curve = parsed.data.curve;
  const first = curve[0];
  const last = curve.at(-1);
  if (first === undefined || last === undefined || last.time_s <= first.time_s) return null;
  const minimum = Math.min(...curve.map((point) => point.radial_velocity_m_s));
  const maximum = Math.max(...curve.map((point) => point.radial_velocity_m_s));
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return null;
  const timeSpan = last.time_s - first.time_s;
  const velocitySpan = maximum - minimum;
  const points = curve.map((point) => ({
    x: 5 + ((point.time_s - first.time_s) / timeSpan) * 90,
    y: velocitySpan === 0 ? 50 : 12 + ((maximum - point.radial_velocity_m_s) / velocitySpan) * 76,
    time_s: point.time_s,
    velocity_m_s: point.radial_velocity_m_s,
  }));
  return {
    path: points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" "),
    points,
    minimum_velocity_m_s: minimum,
    maximum_velocity_m_s: maximum,
  };
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

export function validateRadialVelocityArtifact(
  value: unknown,
): asserts value is RadialVelocityArtifact {
  if (!isRecord(value)) failArtifact();
  if (
    value.artifact_version !== RADIAL_VELOCITY_ARTIFACT_VERSION ||
    value.model_version !== RADIAL_VELOCITY_MODEL_VERSION ||
    value.schema_version !== RADIAL_VELOCITY_SCHEMA_VERSION ||
    value.share_schema_version !== RADIAL_VELOCITY_SHARE_SCHEMA_VERSION ||
    !isRecord(value.definition) ||
    !Array.isArray(value.sources) ||
    !isRecord(value.constants) ||
    !isRecord(value.presets) ||
    !Array.isArray(value.validation_fixtures) ||
    !isRecord(value.scientific_validation)
  ) {
    failArtifact();
  }
  const definition = value.definition;
  if (
    definition.slug !== "radial-velocity" ||
    definition.title !== "Radial Velocity Lab" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== RADIAL_VELOCITY_MODEL_VERSION ||
    definition.share_schema_version !== 1 ||
    !isRecord(definition.equations) ||
    !Array.isArray(definition.assumptions) ||
    !Array.isArray(definition.limitations) ||
    !Array.isArray(definition.references) ||
    !Array.isArray(definition.validation_fixtures) ||
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
    new Set(sourceIds).size !== sourceIds.length
  ) {
    failArtifact();
  }
  if (
    definition.references.length !== sourceIds.length ||
    !definition.references.every((id) => typeof id === "string" && sourceIds.includes(id))
  ) {
    failArtifact();
  }
  if (value.constants.CURVE_POINTS !== RADIAL_VELOCITY_CURVE_POINTS) failArtifact();
  const defaultPreset = value.presets["illustrative-circular-edge-on"];
  if (!isRecord(defaultPreset)) failArtifact();
  if (
    validateRadialVelocityState({
      version: RADIAL_VELOCITY_SHARE_SCHEMA_VERSION,
      model_version: RADIAL_VELOCITY_MODEL_VERSION,
      ...defaultPreset,
    }) === null
  ) {
    failArtifact();
  }
}

validateRadialVelocityArtifact(rawRadialVelocityArtifact);
const RADIAL_VELOCITY_ARTIFACT = rawRadialVelocityArtifact as RadialVelocityArtifact;

export const RADIAL_VELOCITY_DEFINITION = RADIAL_VELOCITY_ARTIFACT.definition;
export const RADIAL_VELOCITY_SOURCES = RADIAL_VELOCITY_ARTIFACT.sources;
export const RADIAL_VELOCITY_CONSTANTS = RADIAL_VELOCITY_ARTIFACT.constants;
export const RADIAL_VELOCITY_PRESETS = RADIAL_VELOCITY_ARTIFACT.presets;
export const RADIAL_VELOCITY_VALIDATION_FIXTURES = RADIAL_VELOCITY_ARTIFACT.validation_fixtures;
export const RADIAL_VELOCITY_SCIENTIFIC_VALIDATION = RADIAL_VELOCITY_ARTIFACT.scientific_validation;

const defaultPreset = RADIAL_VELOCITY_PRESETS["illustrative-circular-edge-on"]!;
export const DEFAULT_RADIAL_VELOCITY_STATE: RadialVelocityState = {
  version: RADIAL_VELOCITY_SHARE_SCHEMA_VERSION,
  model_version: RADIAL_VELOCITY_MODEL_VERSION,
  ...defaultPreset,
};
