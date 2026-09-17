import {
  orbitSandboxEndpoint,
  validateExactGenerated,
  type OrbitSandboxCalculationResponse,
} from "@lumina/api-client";

import rawOrbitArtifact from "../../../../../data/seed/orbit-sandbox-v1.json";

export const ORBIT_SANDBOX_MODEL_VERSION = "orbit-sandbox-v1" as const;
export const ORBIT_SANDBOX_SCHEMA_VERSION = 1 as const;
export const ORBIT_SANDBOX_ARTIFACT_VERSION = 1 as const;
export const ORBIT_SANDBOX_SHARE_SCHEMA_VERSION = 1 as const;
export const ORBIT_SANDBOX_SHARE_STATE_MAX_CHARS = 2_048;
export const ORBIT_SANDBOX_MAX_TRAJECTORY_POINTS = 4_096;

export type OrbitSandboxState = Readonly<{
  version: typeof ORBIT_SANDBOX_SHARE_SCHEMA_VERSION;
  model_version: typeof ORBIT_SANDBOX_MODEL_VERSION;
  central_mass_kg: number;
  central_radius_m: number;
  orbiting_body_mass_kg: number;
  position_x_m: number;
  position_y_m: number;
  velocity_x_m_s: number;
  velocity_y_m_s: number;
  duration_s: number;
  time_step_s: number;
}>;

export type OrbitSource = Readonly<{
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

type OrbitDefinition = Readonly<{
  slug: "orbit-sandbox";
  title: "Orbit Sandbox";
  status: "ready";
  version: 1;
  model_version: typeof ORBIT_SANDBOX_MODEL_VERSION;
  share_schema_version: 1;
  learning_objectives: ReadonlyArray<string>;
  prerequisite_concepts: ReadonlyArray<string>;
  calculation_module: Readonly<{
    equations: Readonly<Record<string, string>>;
    valid_domain: string;
    numerical_policy: string;
  }>;
  assumptions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  references: ReadonlyArray<string>;
  validation_fixtures: ReadonlyArray<string>;
}>;

type OrbitArtifact = Readonly<{
  artifact_version: 1;
  model_version: typeof ORBIT_SANDBOX_MODEL_VERSION;
  schema_version: 1;
  share_schema_version: 1;
  definition: OrbitDefinition;
  sources: ReadonlyArray<OrbitSource>;
  constants: Readonly<Record<string, number>>;
  presets: Readonly<Record<string, Omit<OrbitSandboxState, "version" | "model_version">>>;
  validation_fixtures: ReadonlyArray<Readonly<{ id: string; purpose: string }>>;
  scientific_validation: Readonly<{
    id: string;
    checked_at: string;
    method: string;
    source_ids: ReadonlyArray<string>;
    test_references: ReadonlyArray<string>;
  }>;
}>;

const STATE_KEYS = [
  "version",
  "model_version",
  "central_mass_kg",
  "central_radius_m",
  "orbiting_body_mass_kg",
  "position_x_m",
  "position_y_m",
  "velocity_x_m_s",
  "velocity_y_m_s",
  "duration_s",
  "time_step_s",
] as const;

export const ORBIT_INPUT_RANGES = {
  central_mass_kg: { min: 1e10, max: 1e32 },
  central_radius_m: { min: 1, max: 1e10 },
  orbiting_body_mass_kg: { min: 0, max: 1e30 },
  position_x_m: { min: -1e13, max: 1e13 },
  position_y_m: { min: -1e13, max: 1e13 },
  velocity_x_m_s: { min: -3e6, max: 3e6 },
  velocity_y_m_s: { min: -3e6, max: 3e6 },
  duration_s: { min: 0.01, max: 1e8 },
  time_step_s: { min: 0.001, max: 1e6 },
} as const;

export class OrbitSandboxStateValidationError extends Error {
  readonly code = "ORBIT_SANDBOX_STATE_INVALID";
  constructor() {
    super("ORBIT_SANDBOX_STATE_INVALID");
    this.name = "OrbitSandboxStateValidationError";
  }
}

export class OrbitSandboxArtifactValidationError extends Error {
  readonly code = "ORBIT_SANDBOX_ARTIFACT_INVALID";
  constructor() {
    super("ORBIT_SANDBOX_ARTIFACT_INVALID");
    this.name = "OrbitSandboxArtifactValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inRange(value: unknown, range: Readonly<{ min: number; max: number }>): value is number {
  return isFiniteNumber(value) && value >= range.min && value <= range.max;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function failArtifact(): never {
  throw new OrbitSandboxArtifactValidationError();
}

export function validateOrbitSandboxState(value: unknown): OrbitSandboxState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STATE_KEYS)) return null;
  if (
    value.version !== ORBIT_SANDBOX_SHARE_SCHEMA_VERSION ||
    value.model_version !== ORBIT_SANDBOX_MODEL_VERSION ||
    !inRange(value.central_mass_kg, ORBIT_INPUT_RANGES.central_mass_kg) ||
    !inRange(value.central_radius_m, ORBIT_INPUT_RANGES.central_radius_m) ||
    !inRange(value.orbiting_body_mass_kg, ORBIT_INPUT_RANGES.orbiting_body_mass_kg) ||
    !inRange(value.position_x_m, ORBIT_INPUT_RANGES.position_x_m) ||
    !inRange(value.position_y_m, ORBIT_INPUT_RANGES.position_y_m) ||
    !inRange(value.velocity_x_m_s, ORBIT_INPUT_RANGES.velocity_x_m_s) ||
    !inRange(value.velocity_y_m_s, ORBIT_INPUT_RANGES.velocity_y_m_s) ||
    !inRange(value.duration_s, ORBIT_INPUT_RANGES.duration_s) ||
    !inRange(value.time_step_s, ORBIT_INPUT_RANGES.time_step_s)
  ) {
    return null;
  }
  return {
    version: ORBIT_SANDBOX_SHARE_SCHEMA_VERSION,
    model_version: ORBIT_SANDBOX_MODEL_VERSION,
    central_mass_kg: value.central_mass_kg,
    central_radius_m: value.central_radius_m,
    orbiting_body_mass_kg: value.orbiting_body_mass_kg,
    position_x_m: value.position_x_m,
    position_y_m: value.position_y_m,
    velocity_x_m_s: value.velocity_x_m_s,
    velocity_y_m_s: value.velocity_y_m_s,
    duration_s: value.duration_s,
    time_step_s: value.time_step_s,
  };
}

export function encodeOrbitSandboxState(value: unknown): string {
  const state = validateOrbitSandboxState(value);
  if (state === null) throw new OrbitSandboxStateValidationError();
  return JSON.stringify(state);
}

export function decodeOrbitSandboxState(value: unknown): OrbitSandboxState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > ORBIT_SANDBOX_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateOrbitSandboxState(decoded);
    return state !== null && encodeOrbitSandboxState(state) === value ? state : null;
  } catch {
    return null;
  }
}

function exactEcho(state: OrbitSandboxState, result: OrbitSandboxCalculationResponse): boolean {
  return (
    result.inputs.central_mass_kg === state.central_mass_kg &&
    result.inputs.central_radius_m === state.central_radius_m &&
    result.inputs.orbiting_body_mass_kg === state.orbiting_body_mass_kg &&
    result.inputs.position_x_m === state.position_x_m &&
    result.inputs.position_y_m === state.position_y_m &&
    result.inputs.velocity_x_m_s === state.velocity_x_m_s &&
    result.inputs.velocity_y_m_s === state.velocity_y_m_s &&
    result.inputs.duration_s === state.duration_s &&
    result.inputs.time_step_s === state.time_step_s
  );
}

function validNullableNumber(value: number | null): boolean {
  return value === null || Number.isFinite(value);
}

export function orbitSandboxRequestEndpoint(state: OrbitSandboxState) {
  const query = new URLSearchParams({
    central_mass_kg: String(state.central_mass_kg),
    central_radius_m: String(state.central_radius_m),
    orbiting_body_mass_kg: String(state.orbiting_body_mass_kg),
    position_x_m: String(state.position_x_m),
    position_y_m: String(state.position_y_m),
    velocity_x_m_s: String(state.velocity_x_m_s),
    velocity_y_m_s: String(state.velocity_y_m_s),
    duration_s: String(state.duration_s),
    time_step_s: String(state.time_step_s),
  });
  return { ...orbitSandboxEndpoint, path: `${orbitSandboxEndpoint.path}?${query}` };
}

export function validateOrbitSandboxCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): OrbitSandboxCalculationResponse | null {
  const state = validateOrbitSandboxState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(orbitSandboxEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== ORBIT_SANDBOX_MODEL_VERSION ||
    result.schema_version !== ORBIT_SANDBOX_SCHEMA_VERSION ||
    !exactEcho(state, result) ||
    !Number.isFinite(result.gravitational_parameter_m3_s2) ||
    !validNullableNumber(result.reduced_mass_kg) ||
    !Number.isFinite(result.specific_orbital_energy_j_per_kg) ||
    !validNullableNumber(result.orbital_energy_j) ||
    !Number.isFinite(result.specific_angular_momentum_m2_per_s) ||
    !validNullableNumber(result.angular_momentum_kg_m2_per_s) ||
    !Number.isFinite(result.eccentricity) ||
    result.eccentricity < 0 ||
    !validNullableNumber(result.semi_major_axis_m) ||
    !validNullableNumber(result.period_s) ||
    !Number.isFinite(result.periapsis_m) ||
    result.periapsis_m < 0 ||
    !validNullableNumber(result.apoapsis_m) ||
    !validNullableNumber(result.collision_time_s) ||
    !Number.isFinite(result.max_specific_energy_drift_fraction) ||
    result.max_specific_energy_drift_fraction < 0 ||
    !Number.isFinite(result.max_specific_angular_momentum_drift_fraction) ||
    result.max_specific_angular_momentum_drift_fraction < 0 ||
    result.trajectory.length === 0 ||
    result.trajectory.length > ORBIT_SANDBOX_MAX_TRAJECTORY_POINTS
  ) {
    return null;
  }
  if ((result.classification === "collision") !== (result.collision_time_s !== null)) return null;
  if (result.classification === "bound") {
    if (
      result.semi_major_axis_m === null ||
      result.period_s === null ||
      result.apoapsis_m === null
    ) {
      return null;
    }
  } else if (
    result.classification !== "collision" &&
    (result.semi_major_axis_m !== null || result.period_s !== null || result.apoapsis_m !== null)
  ) {
    return null;
  }
  let previousTime = -1;
  for (const point of result.trajectory) {
    if (
      !Number.isFinite(point.time_s) ||
      !Number.isFinite(point.x_m) ||
      !Number.isFinite(point.y_m) ||
      !Number.isFinite(point.distance_m) ||
      !Number.isFinite(point.speed_m_s) ||
      point.time_s < 0 ||
      point.time_s <= previousTime ||
      point.time_s > state.duration_s ||
      point.distance_m < 0 ||
      point.speed_m_s < 0
    ) {
      return null;
    }
    previousTime = point.time_s;
  }
  if (result.trajectory[0]?.time_s !== 0) return null;
  return result;
}

export type OrbitVisualTransform = Readonly<{
  path: string;
  points: ReadonlyArray<Readonly<{ x: number; y: number; time_s: number }>>;
  central_radius_percent: number;
  scale_m: number;
}>;

/** Normalize API-returned coordinates for SVG display. This performs no orbital dynamics. */
export function buildOrbitVisualTransform(resultValue: unknown): OrbitVisualTransform | null {
  const parsed = validateExactGenerated(orbitSandboxEndpoint.validator, resultValue);
  if (!parsed.valid || parsed.data.trajectory.length === 0) return null;
  const result = parsed.data;
  const extent = Math.max(
    result.inputs.central_radius_m,
    ...result.trajectory.flatMap((point) => [Math.abs(point.x_m), Math.abs(point.y_m)]),
  );
  if (!Number.isFinite(extent) || extent <= 0) return null;
  const scale = 44 / extent;
  const points = result.trajectory.map((point) => ({
    x: 50 + point.x_m * scale,
    y: 50 - point.y_m * scale,
    time_s: point.time_s,
  }));
  return {
    points,
    path: points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" "),
    central_radius_percent: Math.max(0.8, Math.min(12, result.inputs.central_radius_m * scale)),
    scale_m: extent,
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
  for (const key of keys) if (!isNonEmptyString(source[key])) failArtifact();
  try {
    const url = new URL(source.url as string);
    if (url.protocol !== "https:" || url.username || url.password || url.port) failArtifact();
  } catch {
    failArtifact();
  }
}

export function validateOrbitSandboxArtifact(value: unknown): asserts value is OrbitArtifact {
  if (!isRecord(value)) failArtifact();
  if (
    value.artifact_version !== ORBIT_SANDBOX_ARTIFACT_VERSION ||
    value.model_version !== ORBIT_SANDBOX_MODEL_VERSION ||
    value.schema_version !== ORBIT_SANDBOX_SCHEMA_VERSION ||
    value.share_schema_version !== ORBIT_SANDBOX_SHARE_SCHEMA_VERSION ||
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
    definition.slug !== "orbit-sandbox" ||
    definition.title !== "Orbit Sandbox" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== ORBIT_SANDBOX_MODEL_VERSION ||
    definition.share_schema_version !== 1 ||
    !Array.isArray(definition.assumptions) ||
    !Array.isArray(definition.limitations) ||
    !Array.isArray(definition.references) ||
    !Array.isArray(definition.validation_fixtures) ||
    !isRecord(definition.calculation_module) ||
    !isRecord(definition.calculation_module.equations)
  ) {
    failArtifact();
  }
  value.sources.forEach(validateSource);
  const sourceIds = value.sources.map((source) => (source as Record<string, unknown>).id);
  if (new Set(sourceIds).size !== sourceIds.length) failArtifact();
  if (
    definition.references.length !== sourceIds.length ||
    !definition.references.every((id) => typeof id === "string" && sourceIds.includes(id))
  ) {
    failArtifact();
  }
  if (value.constants.MAX_TRAJECTORY_POINTS !== ORBIT_SANDBOX_MAX_TRAJECTORY_POINTS) failArtifact();
  const defaultPreset = value.presets["earth-low-orbit"];
  if (!isRecord(defaultPreset)) failArtifact();
  const state = validateOrbitSandboxState({
    version: 1,
    model_version: ORBIT_SANDBOX_MODEL_VERSION,
    ...defaultPreset,
  });
  if (state === null) failArtifact();
}

validateOrbitSandboxArtifact(rawOrbitArtifact);
const ORBIT_ARTIFACT = rawOrbitArtifact as OrbitArtifact;

export const ORBIT_DEFINITION = ORBIT_ARTIFACT.definition;
export const ORBIT_SOURCES = ORBIT_ARTIFACT.sources;
export const ORBIT_CONSTANTS = ORBIT_ARTIFACT.constants;
export const ORBIT_PRESETS = ORBIT_ARTIFACT.presets;
export const ORBIT_VALIDATION_FIXTURES = ORBIT_ARTIFACT.validation_fixtures;
export const ORBIT_SCIENTIFIC_VALIDATION = ORBIT_ARTIFACT.scientific_validation;

const defaultPreset = ORBIT_PRESETS["earth-low-orbit"]!;
export const DEFAULT_ORBIT_SANDBOX_STATE: OrbitSandboxState = {
  version: ORBIT_SANDBOX_SHARE_SCHEMA_VERSION,
  model_version: ORBIT_SANDBOX_MODEL_VERSION,
  ...defaultPreset,
};
