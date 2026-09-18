import {
  transitMethodEndpoint,
  validateExactGenerated,
  type TransitMethodCalculationResponse,
} from "@lumina/api-client";

import rawTransitArtifact from "../../../../../data/seed/transit-method-v1.json";

export const TRANSIT_METHOD_MODEL_VERSION = "transit-method-v1" as const;
export const TRANSIT_METHOD_SCHEMA_VERSION = 1 as const;
export const TRANSIT_METHOD_ARTIFACT_VERSION = 1 as const;
export const TRANSIT_METHOD_SHARE_SCHEMA_VERSION = 1 as const;
export const TRANSIT_METHOD_SHARE_STATE_MAX_CHARS = 1_024;
export const TRANSIT_METHOD_LIGHT_CURVE_POINTS = 301;

export type TransitMethodState = Readonly<{
  version: typeof TRANSIT_METHOD_SHARE_SCHEMA_VERSION;
  model_version: typeof TRANSIT_METHOD_MODEL_VERSION;
  stellar_radius_m: number;
  planet_radius_m: number;
  semi_major_axis_m: number;
  orbital_period_s: number;
  inclination_deg: number;
}>;

export type TransitSource = Readonly<{
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

type TransitDefinition = Readonly<{
  slug: "transit-method";
  title: "Transit Method Lab";
  status: "ready";
  version: 1;
  model_version: typeof TRANSIT_METHOD_MODEL_VERSION;
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

type TransitArtifact = Readonly<{
  artifact_version: 1;
  model_version: typeof TRANSIT_METHOD_MODEL_VERSION;
  schema_version: 1;
  share_schema_version: 1;
  definition: TransitDefinition;
  sources: ReadonlyArray<TransitSource>;
  constants: Readonly<Record<string, number>>;
  presets: Readonly<Record<string, Omit<TransitMethodState, "version" | "model_version">>>;
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
  "stellar_radius_m",
  "planet_radius_m",
  "semi_major_axis_m",
  "orbital_period_s",
  "inclination_deg",
] as const;

const EXPECTED_SOURCE_IDS = new Set([
  "winn-2010-transits-occultations",
  "mandel-agol-2002-analytic-lightcurves",
]);

export const TRANSIT_INPUT_RANGES = {
  stellar_radius_m: { min: 1e5, max: 1e12 },
  planet_radius_m: { min: 1, max: 1e12 },
  semi_major_axis_m: { min: 1e5, max: 1e15 },
  orbital_period_s: { min: 60, max: 1e9 },
  inclination_deg: { min: 0, max: 90 },
} as const;

export class TransitMethodStateValidationError extends Error {
  readonly code = "TRANSIT_METHOD_STATE_INVALID";
  constructor() {
    super("TRANSIT_METHOD_STATE_INVALID");
    this.name = "TransitMethodStateValidationError";
  }
}

export class TransitMethodArtifactValidationError extends Error {
  readonly code = "TRANSIT_METHOD_ARTIFACT_INVALID";
  constructor() {
    super("TRANSIT_METHOD_ARTIFACT_INVALID");
    this.name = "TransitMethodArtifactValidationError";
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
  throw new TransitMethodArtifactValidationError();
}

export function validateTransitMethodState(value: unknown): TransitMethodState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STATE_KEYS)) return null;
  if (
    value.version !== TRANSIT_METHOD_SHARE_SCHEMA_VERSION ||
    value.model_version !== TRANSIT_METHOD_MODEL_VERSION ||
    !inRange(value.stellar_radius_m, TRANSIT_INPUT_RANGES.stellar_radius_m) ||
    !inRange(value.planet_radius_m, TRANSIT_INPUT_RANGES.planet_radius_m) ||
    !inRange(value.semi_major_axis_m, TRANSIT_INPUT_RANGES.semi_major_axis_m) ||
    !inRange(value.orbital_period_s, TRANSIT_INPUT_RANGES.orbital_period_s) ||
    !inRange(value.inclination_deg, TRANSIT_INPUT_RANGES.inclination_deg)
  ) {
    return null;
  }
  return {
    version: TRANSIT_METHOD_SHARE_SCHEMA_VERSION,
    model_version: TRANSIT_METHOD_MODEL_VERSION,
    stellar_radius_m: value.stellar_radius_m,
    planet_radius_m: value.planet_radius_m,
    semi_major_axis_m: value.semi_major_axis_m,
    orbital_period_s: value.orbital_period_s,
    inclination_deg: value.inclination_deg,
  };
}

export function encodeTransitMethodState(value: unknown): string {
  const state = validateTransitMethodState(value);
  if (state === null) throw new TransitMethodStateValidationError();
  return JSON.stringify(state);
}

export function decodeTransitMethodState(value: unknown): TransitMethodState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > TRANSIT_METHOD_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateTransitMethodState(decoded);
    return state !== null && encodeTransitMethodState(state) === value ? state : null;
  } catch {
    return null;
  }
}

function exactEcho(state: TransitMethodState, result: TransitMethodCalculationResponse): boolean {
  return (
    result.inputs.stellar_radius_m === state.stellar_radius_m &&
    result.inputs.planet_radius_m === state.planet_radius_m &&
    result.inputs.semi_major_axis_m === state.semi_major_axis_m &&
    result.inputs.orbital_period_s === state.orbital_period_s &&
    result.inputs.inclination_deg === state.inclination_deg
  );
}

function validPositiveNullable(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value > 0);
}

export function transitMethodRequestEndpoint(state: TransitMethodState) {
  const query = new URLSearchParams({
    stellar_radius_m: String(state.stellar_radius_m),
    planet_radius_m: String(state.planet_radius_m),
    semi_major_axis_m: String(state.semi_major_axis_m),
    orbital_period_s: String(state.orbital_period_s),
    inclination_deg: String(state.inclination_deg),
  });
  return { ...transitMethodEndpoint, path: `${transitMethodEndpoint.path}?${query}` };
}

export function validateTransitMethodCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): TransitMethodCalculationResponse | null {
  const state = validateTransitMethodState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(transitMethodEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== TRANSIT_METHOD_MODEL_VERSION ||
    result.schema_version !== TRANSIT_METHOD_SCHEMA_VERSION ||
    !exactEcho(state, result) ||
    !Number.isFinite(result.radius_ratio) ||
    result.radius_ratio <= 0 ||
    !Number.isFinite(result.scaled_semi_major_axis) ||
    result.scaled_semi_major_axis <= 0 ||
    !Number.isFinite(result.impact_parameter) ||
    result.impact_parameter < 0 ||
    !Number.isFinite(result.central_depth_approximation_fraction) ||
    result.central_depth_approximation_fraction < 0 ||
    result.central_depth_approximation_fraction > 1 ||
    !Number.isFinite(result.maximum_depth_fraction) ||
    result.maximum_depth_fraction < 0 ||
    result.maximum_depth_fraction > 1 ||
    !Number.isFinite(result.maximum_depth_ppm) ||
    result.maximum_depth_ppm < 0 ||
    !validPositiveNullable(result.total_duration_s) ||
    !validPositiveNullable(result.full_duration_s) ||
    result.light_curve.length !== TRANSIT_METHOD_LIGHT_CURVE_POINTS
  ) {
    return null;
  }
  if (
    (result.classification === "full" &&
      (result.total_duration_s === null || result.full_duration_s === null)) ||
    (result.classification === "grazing" &&
      (result.total_duration_s === null || result.full_duration_s !== null)) ||
    (result.classification === "no_transit" &&
      (result.total_duration_s !== null ||
        result.full_duration_s !== null ||
        result.maximum_depth_fraction !== 0 ||
        result.maximum_depth_ppm !== 0))
  ) {
    return null;
  }
  let previousTime = Number.NEGATIVE_INFINITY;
  for (const point of result.light_curve) {
    if (
      !Number.isFinite(point.time_from_mid_transit_s) ||
      !Number.isFinite(point.orbital_phase) ||
      !Number.isFinite(point.projected_separation_stellar_radii) ||
      point.projected_separation_stellar_radii < 0 ||
      !Number.isFinite(point.relative_flux) ||
      point.relative_flux < 0 ||
      point.relative_flux > 1 ||
      point.time_from_mid_transit_s <= previousTime
    ) {
      return null;
    }
    previousTime = point.time_from_mid_transit_s;
  }
  if (
    result.light_curve[Math.floor(TRANSIT_METHOD_LIGHT_CURVE_POINTS / 2)]
      ?.time_from_mid_transit_s !== 0
  ) {
    return null;
  }
  return result;
}

export type TransitLightCurveVisual = Readonly<{
  path: string;
  points: ReadonlyArray<Readonly<{ x: number; y: number; time_s: number; relative_flux: number }>>;
  minimum_flux: number;
  maximum_flux: number;
}>;

/** Normalize API-returned time/flux values for SVG display; no transit physics is computed here. */
export function buildTransitLightCurveVisual(resultValue: unknown): TransitLightCurveVisual | null {
  const parsed = validateExactGenerated(transitMethodEndpoint.validator, resultValue);
  if (!parsed.valid || parsed.data.light_curve.length !== TRANSIT_METHOD_LIGHT_CURVE_POINTS) {
    return null;
  }
  const curve = parsed.data.light_curve;
  const first = curve[0];
  const last = curve.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    last.time_from_mid_transit_s <= first.time_from_mid_transit_s
  ) {
    return null;
  }
  const minimumFlux = Math.min(...curve.map((point) => point.relative_flux));
  const maximumFlux = Math.max(...curve.map((point) => point.relative_flux));
  if (!Number.isFinite(minimumFlux) || !Number.isFinite(maximumFlux)) return null;
  const timeSpan = last.time_from_mid_transit_s - first.time_from_mid_transit_s;
  const fluxSpan = maximumFlux - minimumFlux;
  const points = curve.map((point) => ({
    x: 5 + ((point.time_from_mid_transit_s - first.time_from_mid_transit_s) / timeSpan) * 90,
    y: fluxSpan === 0 ? 50 : 12 + ((maximumFlux - point.relative_flux) / fluxSpan) * 76,
    time_s: point.time_from_mid_transit_s,
    relative_flux: point.relative_flux,
  }));
  return {
    path: points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" "),
    points,
    minimum_flux: minimumFlux,
    maximum_flux: maximumFlux,
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

export function validateTransitMethodArtifact(value: unknown): asserts value is TransitArtifact {
  if (!isRecord(value)) failArtifact();
  if (
    value.artifact_version !== TRANSIT_METHOD_ARTIFACT_VERSION ||
    value.model_version !== TRANSIT_METHOD_MODEL_VERSION ||
    value.schema_version !== TRANSIT_METHOD_SCHEMA_VERSION ||
    value.share_schema_version !== TRANSIT_METHOD_SHARE_SCHEMA_VERSION ||
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
    definition.slug !== "transit-method" ||
    definition.title !== "Transit Method Lab" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== TRANSIT_METHOD_MODEL_VERSION ||
    definition.share_schema_version !== 1 ||
    !isRecord(definition.equations) ||
    !Array.isArray(definition.assumptions) ||
    !Array.isArray(definition.limitations) ||
    !Array.isArray(definition.references) ||
    !Array.isArray(definition.validation_fixtures) ||
    !isNonEmptyString(definition.sampling_policy) ||
    !isNonEmptyString(definition.default_preset)
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
  if (value.constants.LIGHT_CURVE_POINTS !== TRANSIT_METHOD_LIGHT_CURVE_POINTS) failArtifact();
  const defaultPreset = value.presets["illustrative-central-transit"];
  if (!isRecord(defaultPreset)) failArtifact();
  if (
    validateTransitMethodState({
      version: TRANSIT_METHOD_SHARE_SCHEMA_VERSION,
      model_version: TRANSIT_METHOD_MODEL_VERSION,
      ...defaultPreset,
    }) === null
  ) {
    failArtifact();
  }
}

validateTransitMethodArtifact(rawTransitArtifact);
const TRANSIT_ARTIFACT = rawTransitArtifact as TransitArtifact;

export const TRANSIT_DEFINITION = TRANSIT_ARTIFACT.definition;
export const TRANSIT_SOURCES = TRANSIT_ARTIFACT.sources;
export const TRANSIT_CONSTANTS = TRANSIT_ARTIFACT.constants;
export const TRANSIT_PRESETS = TRANSIT_ARTIFACT.presets;
export const TRANSIT_VALIDATION_FIXTURES = TRANSIT_ARTIFACT.validation_fixtures;
export const TRANSIT_SCIENTIFIC_VALIDATION = TRANSIT_ARTIFACT.scientific_validation;

const defaultPreset = TRANSIT_PRESETS["illustrative-central-transit"]!;
export const DEFAULT_TRANSIT_METHOD_STATE: TransitMethodState = {
  version: TRANSIT_METHOD_SHARE_SCHEMA_VERSION,
  model_version: TRANSIT_METHOD_MODEL_VERSION,
  ...defaultPreset,
};
