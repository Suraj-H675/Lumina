import {
  blackHoleRelativityEndpoint,
  validateExactGenerated,
  type BlackHoleRelativityCalculationResponse,
  type BlackHoleRelativityInputResponse,
} from "@lumina/api-client";

import rawBlackHoleArtifact from "../../../../../data/seed/black-hole-relativity-v1.json";

export const BLACK_HOLE_RELATIVITY_MODEL_VERSION = "black-hole-relativity-v1" as const;
export const BLACK_HOLE_RELATIVITY_SCHEMA_VERSION = 1 as const;
export const BLACK_HOLE_RELATIVITY_ARTIFACT_VERSION = 1 as const;
export const BLACK_HOLE_RELATIVITY_SHARE_SCHEMA_VERSION = 1 as const;
export const BLACK_HOLE_RELATIVITY_SHARE_STATE_MAX_CHARS = 1024;

export const BLACK_HOLE_RELATIVITY_LIMITS = {
  minMassNominalSolar: 1,
  maxMassNominalSolar: 1e10,
  minStaticObserverRadiusRs: 1.01,
  maxStaticObserverRadiusRs: 100,
} as const;

export type BlackHoleRelativityState = Readonly<{
  version: typeof BLACK_HOLE_RELATIVITY_SHARE_SCHEMA_VERSION;
  model_version: typeof BLACK_HOLE_RELATIVITY_MODEL_VERSION;
  mass_nominal_solar: number;
  static_observer_radius_rs: number;
}>;

export type BlackHoleRelativitySource = Readonly<{
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

type BlackHoleRelativityEquation = Readonly<{
  id: string;
  expression: string;
  meaning: string;
}>;

type BlackHoleRelativityLandmarkDefinition = Readonly<{
  id: string;
  label: string;
  radius_rs: number;
  interpretation: string;
}>;

type BlackHoleRelativityDefinition = Readonly<{
  slug: "black-hole-relativity";
  title: "Black-Hole / Relativity Lab";
  status: "ready";
  version: 1;
  model_version: typeof BLACK_HOLE_RELATIVITY_MODEL_VERSION;
  share_schema_version: 1;
  summary: string;
  assumptions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  equations: ReadonlyArray<BlackHoleRelativityEquation>;
  references: ReadonlyArray<string>;
}>;

type BlackHoleRelativityArtifact = Readonly<{
  artifact_version: 1;
  model_version: typeof BLACK_HOLE_RELATIVITY_MODEL_VERSION;
  schema_version: 1;
  share_schema_version: 1;
  generated_at: string;
  definition: BlackHoleRelativityDefinition;
  sources: ReadonlyArray<BlackHoleRelativitySource>;
  constants: Readonly<Record<string, string | number>>;
  landmark_definitions: ReadonlyArray<BlackHoleRelativityLandmarkDefinition>;
  preset: Readonly<Record<string, unknown>>;
  validation_fixtures: ReadonlyArray<Readonly<Record<string, unknown>>>;
  scientific_validation: Readonly<Record<string, unknown>>;
}>;

const STATE_KEYS = [
  "version",
  "model_version",
  "mass_nominal_solar",
  "static_observer_radius_rs",
] as const;
const EXPECTED_SOURCE_IDS = new Set([
  "iau-2015-resolution-b3",
  "nist-speed-of-light",
  "openstax-einstein-gravity",
  "oregon-state-schwarzschild-geometry",
  "oregon-state-null-orbits",
  "mit-ocw-black-holes-i",
  "umd-astr406-black-holes",
]);
const EXPECTED_LANDMARK_IDS = ["event_horizon", "photon_sphere", "isco"] as const;

export class BlackHoleRelativityStateValidationError extends Error {
  readonly code = "BLACK_HOLE_RELATIVITY_STATE_INVALID";

  constructor() {
    super("BLACK_HOLE_RELATIVITY_STATE_INVALID");
    this.name = "BlackHoleRelativityStateValidationError";
  }
}

export class BlackHoleRelativityArtifactValidationError extends Error {
  readonly code = "BLACK_HOLE_RELATIVITY_ARTIFACT_INVALID";

  constructor() {
    super("BLACK_HOLE_RELATIVITY_ARTIFACT_INVALID");
    this.name = "BlackHoleRelativityArtifactValidationError";
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

function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function inRange(value: unknown, minimum: number, maximum: number): value is number {
  return finite(value) && value >= minimum && value <= maximum;
}

export function validateBlackHoleRelativityState(value: unknown): BlackHoleRelativityState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STATE_KEYS)) return null;
  if (
    value.version !== BLACK_HOLE_RELATIVITY_SHARE_SCHEMA_VERSION ||
    value.model_version !== BLACK_HOLE_RELATIVITY_MODEL_VERSION ||
    !inRange(
      value.mass_nominal_solar,
      BLACK_HOLE_RELATIVITY_LIMITS.minMassNominalSolar,
      BLACK_HOLE_RELATIVITY_LIMITS.maxMassNominalSolar,
    ) ||
    !inRange(
      value.static_observer_radius_rs,
      BLACK_HOLE_RELATIVITY_LIMITS.minStaticObserverRadiusRs,
      BLACK_HOLE_RELATIVITY_LIMITS.maxStaticObserverRadiusRs,
    )
  ) {
    return null;
  }
  return {
    version: BLACK_HOLE_RELATIVITY_SHARE_SCHEMA_VERSION,
    model_version: BLACK_HOLE_RELATIVITY_MODEL_VERSION,
    mass_nominal_solar: value.mass_nominal_solar,
    static_observer_radius_rs: value.static_observer_radius_rs,
  };
}

export function encodeBlackHoleRelativityState(value: unknown): string {
  const state = validateBlackHoleRelativityState(value);
  if (state === null) throw new BlackHoleRelativityStateValidationError();
  return JSON.stringify(state);
}

export function decodeBlackHoleRelativityState(value: unknown): BlackHoleRelativityState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > BLACK_HOLE_RELATIVITY_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateBlackHoleRelativityState(decoded);
    return state !== null && encodeBlackHoleRelativityState(state) === value ? state : null;
  } catch {
    return null;
  }
}

export function blackHoleRelativityRequestEndpoint(state: BlackHoleRelativityState) {
  const query = new URLSearchParams({
    mass_nominal_solar: String(state.mass_nominal_solar),
    static_observer_radius_rs: String(state.static_observer_radius_rs),
  });
  return {
    ...blackHoleRelativityEndpoint,
    path: `${blackHoleRelativityEndpoint.path}?${query}`,
  };
}

function sameInputs(
  returned: BlackHoleRelativityInputResponse,
  state: BlackHoleRelativityState,
): boolean {
  return (
    returned.mass_nominal_solar === state.mass_nominal_solar &&
    returned.static_observer_radius_rs === state.static_observer_radius_rs
  );
}

function artifactLandmarkDefinition(id: string): BlackHoleRelativityLandmarkDefinition | undefined {
  return BLACK_HOLE_RELATIVITY_LANDMARK_DEFINITIONS.find((row) => row.id === id);
}

export function validateBlackHoleRelativityCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): BlackHoleRelativityCalculationResponse | null {
  const state = validateBlackHoleRelativityState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(blackHoleRelativityEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== BLACK_HOLE_RELATIVITY_MODEL_VERSION ||
    result.schema_version !== BLACK_HOLE_RELATIVITY_SCHEMA_VERSION ||
    !sameInputs(result.inputs, state) ||
    !positive(result.gravitational_parameter_m3_s2) ||
    !positive(result.schwarzschild_radius_m) ||
    result.landmarks.length !== EXPECTED_LANDMARK_IDS.length ||
    result.landmarks.some((row, index) => {
      const expectedId = EXPECTED_LANDMARK_IDS[index];
      const definition =
        expectedId === undefined ? undefined : artifactLandmarkDefinition(expectedId);
      return (
        definition === undefined ||
        row.id !== definition.id ||
        row.label !== definition.label ||
        row.radius_rs !== definition.radius_rs ||
        !positive(row.radius_m) ||
        row.interpretation !== definition.interpretation
      );
    }) ||
    !positive(result.static_observer_areal_radius_m) ||
    !inRange(result.proper_time_rate_vs_infinity, Number.MIN_VALUE, 1) ||
    !inRange(result.frequency_ratio_at_infinity, Number.MIN_VALUE, 1) ||
    !positive(result.far_away_interval_per_local_interval) ||
    !positive(result.gravitational_redshift_z) ||
    !nonEmptyString(result.observer_note) ||
    !result.observer_note.includes("accelerated") ||
    !result.observer_note.includes("not freely falling") ||
    !result.observer_note.includes("not a circular geodesic") ||
    !nonEmptyString(result.model_note) ||
    !result.model_note.includes("areal radius") ||
    !result.model_note.includes("ray tracing") ||
    !result.model_note.includes("observed-source fitting")
  ) {
    return null;
  }
  return result;
}

function failArtifact(): never {
  throw new BlackHoleRelativityArtifactValidationError();
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

export function validateBlackHoleRelativityArtifact(
  value: unknown,
): asserts value is BlackHoleRelativityArtifact {
  if (!isRecord(value)) failArtifact();
  if (
    value.artifact_version !== BLACK_HOLE_RELATIVITY_ARTIFACT_VERSION ||
    value.model_version !== BLACK_HOLE_RELATIVITY_MODEL_VERSION ||
    value.schema_version !== BLACK_HOLE_RELATIVITY_SCHEMA_VERSION ||
    value.share_schema_version !== BLACK_HOLE_RELATIVITY_SHARE_SCHEMA_VERSION ||
    !nonEmptyString(value.generated_at) ||
    !isRecord(value.definition) ||
    !Array.isArray(value.sources) ||
    !isRecord(value.constants) ||
    !Array.isArray(value.landmark_definitions) ||
    !isRecord(value.preset) ||
    !Array.isArray(value.validation_fixtures) ||
    !isRecord(value.scientific_validation)
  ) {
    failArtifact();
  }
  const definition = value.definition;
  if (
    definition.slug !== "black-hole-relativity" ||
    definition.title !== "Black-Hole / Relativity Lab" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== BLACK_HOLE_RELATIVITY_MODEL_VERSION ||
    definition.share_schema_version !== 1 ||
    !nonEmptyString(definition.summary) ||
    !Array.isArray(definition.assumptions) ||
    !Array.isArray(definition.limitations) ||
    !Array.isArray(definition.equations) ||
    !Array.isArray(definition.references)
  ) {
    failArtifact();
  }
  if (
    definition.equations.length === 0 ||
    definition.equations.some(
      (equation) =>
        !isRecord(equation) ||
        !hasOnlyKeys(equation, ["id", "expression", "meaning"]) ||
        !nonEmptyString(equation.id) ||
        !nonEmptyString(equation.expression) ||
        !nonEmptyString(equation.meaning),
    )
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
  const constants = value.constants;
  if (
    constants.MIN_MASS_NOMINAL_SOLAR !== BLACK_HOLE_RELATIVITY_LIMITS.minMassNominalSolar ||
    constants.MAX_MASS_NOMINAL_SOLAR !== BLACK_HOLE_RELATIVITY_LIMITS.maxMassNominalSolar ||
    constants.MIN_STATIC_OBSERVER_RADIUS_RS !==
      BLACK_HOLE_RELATIVITY_LIMITS.minStaticObserverRadiusRs ||
    constants.MAX_STATIC_OBSERVER_RADIUS_RS !==
      BLACK_HOLE_RELATIVITY_LIMITS.maxStaticObserverRadiusRs
  ) {
    failArtifact();
  }
  if (
    value.landmark_definitions.length !== EXPECTED_LANDMARK_IDS.length ||
    value.landmark_definitions.some(
      (landmark, index) =>
        !isRecord(landmark) ||
        !hasOnlyKeys(landmark, ["id", "label", "radius_rs", "interpretation"]) ||
        landmark.id !== EXPECTED_LANDMARK_IDS[index] ||
        !nonEmptyString(landmark.label) ||
        !positive(landmark.radius_rs) ||
        !nonEmptyString(landmark.interpretation),
    )
  ) {
    failArtifact();
  }
  if (
    validateBlackHoleRelativityState({
      version: BLACK_HOLE_RELATIVITY_SHARE_SCHEMA_VERSION,
      model_version: BLACK_HOLE_RELATIVITY_MODEL_VERSION,
      ...value.preset,
    }) === null
  ) {
    failArtifact();
  }
}

validateBlackHoleRelativityArtifact(rawBlackHoleArtifact);
const BLACK_HOLE_RELATIVITY_ARTIFACT = rawBlackHoleArtifact as BlackHoleRelativityArtifact;

export const BLACK_HOLE_RELATIVITY_DEFINITION = BLACK_HOLE_RELATIVITY_ARTIFACT.definition;
export const BLACK_HOLE_RELATIVITY_SOURCES = BLACK_HOLE_RELATIVITY_ARTIFACT.sources;
export const BLACK_HOLE_RELATIVITY_CONSTANTS = BLACK_HOLE_RELATIVITY_ARTIFACT.constants;
export const BLACK_HOLE_RELATIVITY_LANDMARK_DEFINITIONS =
  BLACK_HOLE_RELATIVITY_ARTIFACT.landmark_definitions;

const defaultState = validateBlackHoleRelativityState({
  version: BLACK_HOLE_RELATIVITY_SHARE_SCHEMA_VERSION,
  model_version: BLACK_HOLE_RELATIVITY_MODEL_VERSION,
  ...BLACK_HOLE_RELATIVITY_ARTIFACT.preset,
});
if (defaultState === null) failArtifact();
export const DEFAULT_BLACK_HOLE_RELATIVITY_STATE = defaultState;
