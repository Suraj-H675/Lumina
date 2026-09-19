import {
  relativityVisualizationsEndpoint,
  validateExactGenerated,
  type RelativityVisualizationsCalculationResponse,
  type RelativityVisualizationsInputResponse,
} from "@lumina/api-client";

import rawRelativityArtifact from "../../../../../data/seed/relativity-visualizations-v1.json";

export const RELATIVITY_VISUALIZATIONS_MODEL_VERSION = "relativity-visualizations-v1" as const;
export const RELATIVITY_VISUALIZATIONS_SCHEMA_VERSION = 1 as const;
export const RELATIVITY_VISUALIZATIONS_ARTIFACT_VERSION = 1 as const;
export const RELATIVITY_VISUALIZATIONS_SHARE_SCHEMA_VERSION = 1 as const;
export const RELATIVITY_VISUALIZATIONS_SHARE_STATE_MAX_CHARS = 2048;

export const RELATIVITY_VISUALIZATIONS_LIMITS = {
  minRelativeSpeedFractionC: 0,
  maxRelativeSpeedFractionC: 0.99,
  minProperTimeS: 1e-9,
  maxProperTimeS: 1e9,
  minProperLengthM: 1e-6,
  maxProperLengthM: 1e15,
  minSimultaneousEventSeparationM: 0,
  maxSimultaneousEventSeparationM: 1e15,
} as const;

export type RelativityVisualizationsState = Readonly<{
  version: typeof RELATIVITY_VISUALIZATIONS_SHARE_SCHEMA_VERSION;
  model_version: typeof RELATIVITY_VISUALIZATIONS_MODEL_VERSION;
  relative_speed_fraction_c: number;
  proper_time_s: number;
  proper_length_m: number;
  simultaneous_event_separation_m: number;
}>;

export type RelativityVisualizationsSource = Readonly<{
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

type RelativityVisualizationsEquation = Readonly<{
  id: string;
  expression: string;
  meaning: string;
}>;

export type RelativityLightConeSegment = Readonly<{
  id: string;
  x0: number;
  ct0: number;
  x1: number;
  ct1: number;
}>;

export type RelativityLightCone = Readonly<{
  coordinate_system: string;
  segments: ReadonlyArray<RelativityLightConeSegment>;
  note: string;
}>;

type RelativityVisualizationsDefinition = Readonly<{
  slug: "relativity-visualizations";
  title: "Relativity Visualizations";
  status: "ready";
  version: 1;
  model_version: typeof RELATIVITY_VISUALIZATIONS_MODEL_VERSION;
  share_schema_version: 1;
  summary: string;
  assumptions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  equations: ReadonlyArray<RelativityVisualizationsEquation>;
  references: ReadonlyArray<string>;
}>;

type RelativityVisualizationsArtifact = Readonly<{
  artifact_version: 1;
  model_version: typeof RELATIVITY_VISUALIZATIONS_MODEL_VERSION;
  schema_version: 1;
  share_schema_version: 1;
  generated_at: string;
  definition: RelativityVisualizationsDefinition;
  sources: ReadonlyArray<RelativityVisualizationsSource>;
  constants: Readonly<Record<string, unknown>>;
  light_cone: RelativityLightCone;
  preset: Readonly<Record<string, unknown>>;
  validation_fixtures: ReadonlyArray<Readonly<Record<string, unknown>>>;
  scientific_validation: Readonly<Record<string, unknown>>;
}>;

const STATE_KEYS = [
  "version",
  "model_version",
  "relative_speed_fraction_c",
  "proper_time_s",
  "proper_length_m",
  "simultaneous_event_separation_m",
] as const;
const EXPECTED_SOURCE_IDS = new Set([
  "nist-speed-of-light",
  "openstax-special-relativity",
  "openstax-time-dilation",
  "openstax-length-contraction",
  "openstax-lorentz-transformation",
  "mit-ocw-relativity",
  "einstein-online-light-cone",
  "einstein-online-relativity-space-time",
]);
const EXPECTED_LIGHT_CONE_IDS = ["future-left", "future-right", "past-left", "past-right"] as const;

export class RelativityVisualizationsStateValidationError extends Error {
  readonly code = "RELATIVITY_VISUALIZATIONS_STATE_INVALID";

  constructor() {
    super("RELATIVITY_VISUALIZATIONS_STATE_INVALID");
    this.name = "RelativityVisualizationsStateValidationError";
  }
}

export class RelativityVisualizationsArtifactValidationError extends Error {
  readonly code = "RELATIVITY_VISUALIZATIONS_ARTIFACT_INVALID";

  constructor() {
    super("RELATIVITY_VISUALIZATIONS_ARTIFACT_INVALID");
    this.name = "RelativityVisualizationsArtifactValidationError";
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

function inRange(value: unknown, minimum: number, maximum: number): value is number {
  return finite(value) && value >= minimum && value <= maximum;
}

export function validateRelativityVisualizationsState(
  value: unknown,
): RelativityVisualizationsState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STATE_KEYS)) return null;
  if (
    value.version !== RELATIVITY_VISUALIZATIONS_SHARE_SCHEMA_VERSION ||
    value.model_version !== RELATIVITY_VISUALIZATIONS_MODEL_VERSION ||
    !inRange(
      value.relative_speed_fraction_c,
      RELATIVITY_VISUALIZATIONS_LIMITS.minRelativeSpeedFractionC,
      RELATIVITY_VISUALIZATIONS_LIMITS.maxRelativeSpeedFractionC,
    ) ||
    !inRange(
      value.proper_time_s,
      RELATIVITY_VISUALIZATIONS_LIMITS.minProperTimeS,
      RELATIVITY_VISUALIZATIONS_LIMITS.maxProperTimeS,
    ) ||
    !inRange(
      value.proper_length_m,
      RELATIVITY_VISUALIZATIONS_LIMITS.minProperLengthM,
      RELATIVITY_VISUALIZATIONS_LIMITS.maxProperLengthM,
    ) ||
    !inRange(
      value.simultaneous_event_separation_m,
      RELATIVITY_VISUALIZATIONS_LIMITS.minSimultaneousEventSeparationM,
      RELATIVITY_VISUALIZATIONS_LIMITS.maxSimultaneousEventSeparationM,
    )
  ) {
    return null;
  }
  return {
    version: RELATIVITY_VISUALIZATIONS_SHARE_SCHEMA_VERSION,
    model_version: RELATIVITY_VISUALIZATIONS_MODEL_VERSION,
    relative_speed_fraction_c: value.relative_speed_fraction_c,
    proper_time_s: value.proper_time_s,
    proper_length_m: value.proper_length_m,
    simultaneous_event_separation_m: value.simultaneous_event_separation_m,
  };
}

export function encodeRelativityVisualizationsState(value: unknown): string {
  const state = validateRelativityVisualizationsState(value);
  if (state === null) throw new RelativityVisualizationsStateValidationError();
  return JSON.stringify(state);
}

export function decodeRelativityVisualizationsState(
  value: unknown,
): RelativityVisualizationsState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > RELATIVITY_VISUALIZATIONS_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateRelativityVisualizationsState(decoded);
    return state !== null && encodeRelativityVisualizationsState(state) === value ? state : null;
  } catch {
    return null;
  }
}

export function relativityVisualizationsRequestEndpoint(state: RelativityVisualizationsState) {
  const query = new URLSearchParams({
    relative_speed_fraction_c: String(state.relative_speed_fraction_c),
    proper_time_s: String(state.proper_time_s),
    proper_length_m: String(state.proper_length_m),
    simultaneous_event_separation_m: String(state.simultaneous_event_separation_m),
  });
  return {
    ...relativityVisualizationsEndpoint,
    path: `${relativityVisualizationsEndpoint.path}?${query}`,
  };
}

function sameInputs(
  returned: RelativityVisualizationsInputResponse,
  state: RelativityVisualizationsState,
): boolean {
  return (
    returned.relative_speed_fraction_c === state.relative_speed_fraction_c &&
    returned.proper_time_s === state.proper_time_s &&
    returned.proper_length_m === state.proper_length_m &&
    returned.simultaneous_event_separation_m === state.simultaneous_event_separation_m
  );
}

export function validateRelativityVisualizationsCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): RelativityVisualizationsCalculationResponse | null {
  const state = validateRelativityVisualizationsState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(relativityVisualizationsEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== RELATIVITY_VISUALIZATIONS_MODEL_VERSION ||
    result.schema_version !== RELATIVITY_VISUALIZATIONS_SCHEMA_VERSION ||
    !sameInputs(result.inputs, state) ||
    !finite(result.relative_speed_m_s) ||
    result.relative_speed_m_s < 0 ||
    !finite(result.lorentz_factor) ||
    result.lorentz_factor < 1 ||
    !finite(result.dilated_time_s) ||
    result.dilated_time_s <= 0 ||
    !finite(result.contracted_length_m) ||
    result.contracted_length_m <= 0 ||
    !finite(result.simultaneity_offset_s) ||
    result.simultaneity_offset_s > 0 ||
    !nonEmptyString(result.simultaneity_interpretation) ||
    !nonEmptyString(result.time_dilation_note) ||
    !result.time_dilation_note.includes("same position") ||
    !nonEmptyString(result.length_contraction_note) ||
    !result.length_contraction_note.includes("simultaneous endpoint positions") ||
    !result.length_contraction_note.includes("not a photographic appearance") ||
    !nonEmptyString(result.light_cone_note) ||
    !result.light_cone_note.includes("fixed reviewed normalized") ||
    !nonEmptyString(result.model_note) ||
    !result.model_note.includes("general relativity") ||
    !result.model_note.includes("gravitational-redshift calculations")
  ) {
    return null;
  }
  return result;
}

function failArtifact(): never {
  throw new RelativityVisualizationsArtifactValidationError();
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

function validateLightCone(value: unknown): asserts value is RelativityLightCone {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["coordinate_system", "segments", "note"]) ||
    !nonEmptyString(value.coordinate_system) ||
    value.coordinate_system !== "normalized ct-versus-x teaching coordinates with c=1" ||
    !Array.isArray(value.segments) ||
    value.segments.length !== EXPECTED_LIGHT_CONE_IDS.length ||
    !nonEmptyString(value.note)
  ) {
    failArtifact();
  }
  const expectedCoordinates = [
    [0, 0, -1, 1],
    [0, 0, 1, 1],
    [0, 0, -1, -1],
    [0, 0, 1, -1],
  ] as const;
  value.segments.forEach((segment, index) => {
    const expected = expectedCoordinates[index];
    if (
      expected === undefined ||
      !isRecord(segment) ||
      !hasOnlyKeys(segment, ["id", "x0", "ct0", "x1", "ct1"]) ||
      segment.id !== EXPECTED_LIGHT_CONE_IDS[index] ||
      segment.x0 !== expected[0] ||
      segment.ct0 !== expected[1] ||
      segment.x1 !== expected[2] ||
      segment.ct1 !== expected[3]
    ) {
      failArtifact();
    }
  });
}

export function validateRelativityVisualizationsArtifact(
  value: unknown,
): asserts value is RelativityVisualizationsArtifact {
  if (!isRecord(value)) failArtifact();
  if (
    value.artifact_version !== RELATIVITY_VISUALIZATIONS_ARTIFACT_VERSION ||
    value.model_version !== RELATIVITY_VISUALIZATIONS_MODEL_VERSION ||
    value.schema_version !== RELATIVITY_VISUALIZATIONS_SCHEMA_VERSION ||
    value.share_schema_version !== RELATIVITY_VISUALIZATIONS_SHARE_SCHEMA_VERSION ||
    !nonEmptyString(value.generated_at) ||
    !isRecord(value.definition) ||
    !Array.isArray(value.sources) ||
    !isRecord(value.constants) ||
    !isRecord(value.light_cone) ||
    !isRecord(value.preset) ||
    !Array.isArray(value.validation_fixtures) ||
    !isRecord(value.scientific_validation)
  ) {
    failArtifact();
  }
  const definition = value.definition;
  if (
    definition.slug !== "relativity-visualizations" ||
    definition.title !== "Relativity Visualizations" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== RELATIVITY_VISUALIZATIONS_MODEL_VERSION ||
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
    definition.equations.length !== 4 ||
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
    constants.MIN_RELATIVE_SPEED_FRACTION_C !==
      RELATIVITY_VISUALIZATIONS_LIMITS.minRelativeSpeedFractionC ||
    constants.MAX_RELATIVE_SPEED_FRACTION_C !==
      RELATIVITY_VISUALIZATIONS_LIMITS.maxRelativeSpeedFractionC ||
    constants.MIN_PROPER_TIME_S !== RELATIVITY_VISUALIZATIONS_LIMITS.minProperTimeS ||
    constants.MAX_PROPER_TIME_S !== RELATIVITY_VISUALIZATIONS_LIMITS.maxProperTimeS ||
    constants.MIN_PROPER_LENGTH_M !== RELATIVITY_VISUALIZATIONS_LIMITS.minProperLengthM ||
    constants.MAX_PROPER_LENGTH_M !== RELATIVITY_VISUALIZATIONS_LIMITS.maxProperLengthM ||
    constants.MIN_SIMULTANEOUS_EVENT_SEPARATION_M !==
      RELATIVITY_VISUALIZATIONS_LIMITS.minSimultaneousEventSeparationM ||
    constants.MAX_SIMULTANEOUS_EVENT_SEPARATION_M !==
      RELATIVITY_VISUALIZATIONS_LIMITS.maxSimultaneousEventSeparationM ||
    !finite(constants.SPEED_OF_LIGHT_M_S) ||
    constants.SPEED_OF_LIGHT_M_S <= 0
  ) {
    failArtifact();
  }
  validateLightCone(value.light_cone);
  if (
    validateRelativityVisualizationsState({
      version: RELATIVITY_VISUALIZATIONS_SHARE_SCHEMA_VERSION,
      model_version: RELATIVITY_VISUALIZATIONS_MODEL_VERSION,
      ...value.preset,
    }) === null
  ) {
    failArtifact();
  }
}

validateRelativityVisualizationsArtifact(rawRelativityArtifact);
const RELATIVITY_VISUALIZATIONS_ARTIFACT =
  rawRelativityArtifact as RelativityVisualizationsArtifact;

export const RELATIVITY_VISUALIZATIONS_DEFINITION = RELATIVITY_VISUALIZATIONS_ARTIFACT.definition;
export const RELATIVITY_VISUALIZATIONS_SOURCES = RELATIVITY_VISUALIZATIONS_ARTIFACT.sources;
export const RELATIVITY_LIGHT_CONE = RELATIVITY_VISUALIZATIONS_ARTIFACT.light_cone;

const defaultState = validateRelativityVisualizationsState({
  version: RELATIVITY_VISUALIZATIONS_SHARE_SCHEMA_VERSION,
  model_version: RELATIVITY_VISUALIZATIONS_MODEL_VERSION,
  ...RELATIVITY_VISUALIZATIONS_ARTIFACT.preset,
});
if (defaultState === null) failArtifact();
export const DEFAULT_RELATIVITY_VISUALIZATIONS_STATE = defaultState;
