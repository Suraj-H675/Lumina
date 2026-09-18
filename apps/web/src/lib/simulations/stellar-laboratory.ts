import {
  stellarLaboratoryEndpoint,
  validateExactGenerated,
  type StellarLaboratoryCalculationResponse,
} from "@lumina/api-client";

import rawStellarLaboratoryArtifact from "../../../../../data/seed/stellar-laboratory-v1.json";

export const STELLAR_LABORATORY_MODEL_VERSION = "stellar-laboratory-v1" as const;
export const STELLAR_LABORATORY_SCHEMA_VERSION = 1 as const;
export const STELLAR_LABORATORY_ARTIFACT_VERSION = 1 as const;
export const STELLAR_LABORATORY_SHARE_SCHEMA_VERSION = 1 as const;
export const STELLAR_LABORATORY_SHARE_STATE_MAX_CHARS = 512;

export type StellarLaboratoryState = Readonly<{
  version: typeof STELLAR_LABORATORY_SHARE_SCHEMA_VERSION;
  model_version: typeof STELLAR_LABORATORY_MODEL_VERSION;
  initial_mass_msun: number;
}>;

export type StellarLaboratorySource = Readonly<{
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

type StellarLaboratoryDefinition = Readonly<{
  slug: "stellar-laboratory";
  title: "Stellar Laboratory";
  status: "ready";
  version: 1;
  model_version: typeof STELLAR_LABORATORY_MODEL_VERSION;
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

type StellarLaboratoryArtifact = Readonly<{
  artifact_version: 1;
  model_version: typeof STELLAR_LABORATORY_MODEL_VERSION;
  schema_version: 1;
  share_schema_version: 1;
  definition: StellarLaboratoryDefinition;
  sources: ReadonlyArray<StellarLaboratorySource>;
  constants: Readonly<Record<string, number>>;
  calibrations: Readonly<Record<string, unknown>>;
  presets: Readonly<Record<string, Readonly<{ initial_mass_msun: number }>>>;
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

const STATE_KEYS = ["version", "model_version", "initial_mass_msun"] as const;

const EXPECTED_SOURCE_IDS = new Set([
  "eker-2018-main-sequence-relations",
  "iau-2015-resolution-b3",
  "openstax-astronomy-2e-main-sequence-lifetimes",
  "openstax-astronomy-2e-low-mass-death",
  "openstax-astronomy-2e-stellar-end-states",
]);

export const STELLAR_LABORATORY_INPUT_RANGE = { min: 0.4, max: 29.669 } as const;

export class StellarLaboratoryStateValidationError extends Error {
  readonly code = "STELLAR_LABORATORY_STATE_INVALID";
  constructor() {
    super("STELLAR_LABORATORY_STATE_INVALID");
    this.name = "StellarLaboratoryStateValidationError";
  }
}

export class StellarLaboratoryArtifactValidationError extends Error {
  readonly code = "STELLAR_LABORATORY_ARTIFACT_INVALID";
  constructor() {
    super("STELLAR_LABORATORY_ARTIFACT_INVALID");
    this.name = "StellarLaboratoryArtifactValidationError";
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

function failArtifact(): never {
  throw new StellarLaboratoryArtifactValidationError();
}

export function validateStellarLaboratoryState(value: unknown): StellarLaboratoryState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STATE_KEYS)) return null;
  if (
    value.version !== STELLAR_LABORATORY_SHARE_SCHEMA_VERSION ||
    value.model_version !== STELLAR_LABORATORY_MODEL_VERSION ||
    !finite(value.initial_mass_msun) ||
    value.initial_mass_msun < STELLAR_LABORATORY_INPUT_RANGE.min ||
    value.initial_mass_msun > STELLAR_LABORATORY_INPUT_RANGE.max
  ) {
    return null;
  }
  return {
    version: STELLAR_LABORATORY_SHARE_SCHEMA_VERSION,
    model_version: STELLAR_LABORATORY_MODEL_VERSION,
    initial_mass_msun: value.initial_mass_msun,
  };
}

export function encodeStellarLaboratoryState(value: unknown): string {
  const state = validateStellarLaboratoryState(value);
  if (state === null) throw new StellarLaboratoryStateValidationError();
  return JSON.stringify(state);
}

export function decodeStellarLaboratoryState(value: unknown): StellarLaboratoryState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > STELLAR_LABORATORY_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateStellarLaboratoryState(decoded);
    return state !== null && encodeStellarLaboratoryState(state) === value ? state : null;
  } catch {
    return null;
  }
}

export function stellarLaboratoryRequestEndpoint(state: StellarLaboratoryState) {
  const query = new URLSearchParams({ initial_mass_msun: String(state.initial_mass_msun) });
  return { ...stellarLaboratoryEndpoint, path: `${stellarLaboratoryEndpoint.path}?${query}` };
}

export function validateStellarLaboratoryCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): StellarLaboratoryCalculationResponse | null {
  const state = validateStellarLaboratoryState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(stellarLaboratoryEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== STELLAR_LABORATORY_MODEL_VERSION ||
    result.schema_version !== STELLAR_LABORATORY_SCHEMA_VERSION ||
    result.inputs.initial_mass_msun !== state.initial_mass_msun ||
    !finite(result.luminosity_lsun) ||
    result.luminosity_lsun <= 0 ||
    !finite(result.radius_rsun) ||
    result.radius_rsun <= 0 ||
    !finite(result.effective_temperature_k) ||
    result.effective_temperature_k <= 0 ||
    !nonEmptyString(result.nearest_spectral_type_anchor) ||
    !finite(result.colour_anchor_mass_msun) ||
    !finite(result.approximate_b_minus_v_mag) ||
    !finite(result.main_sequence_lifetime_years) ||
    result.main_sequence_lifetime_years <= 0 ||
    result.evolutionary_path.length < 3 ||
    result.evolutionary_path.length > 4 ||
    result.evolutionary_path.some((item) => !nonEmptyString(item)) ||
    !nonEmptyString(result.expected_remnant) ||
    result.evolutionary_path.at(-1) !== result.expected_remnant ||
    !nonEmptyString(result.remnant_boundary_note) ||
    !nonEmptyString(result.metallicity_scope)
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

export function validateStellarLaboratoryArtifact(
  value: unknown,
): asserts value is StellarLaboratoryArtifact {
  if (!isRecord(value)) failArtifact();
  if (
    value.artifact_version !== STELLAR_LABORATORY_ARTIFACT_VERSION ||
    value.model_version !== STELLAR_LABORATORY_MODEL_VERSION ||
    value.schema_version !== STELLAR_LABORATORY_SCHEMA_VERSION ||
    value.share_schema_version !== STELLAR_LABORATORY_SHARE_SCHEMA_VERSION ||
    !isRecord(value.definition) ||
    !Array.isArray(value.sources) ||
    !isRecord(value.constants) ||
    !isRecord(value.calibrations) ||
    !isRecord(value.presets) ||
    !Array.isArray(value.validation_fixtures) ||
    !isRecord(value.scientific_validation)
  ) {
    failArtifact();
  }
  const definition = value.definition;
  if (
    definition.slug !== "stellar-laboratory" ||
    definition.title !== "Stellar Laboratory" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== STELLAR_LABORATORY_MODEL_VERSION ||
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
    new Set(sourceIds).size !== sourceIds.length ||
    definition.references.length !== sourceIds.length ||
    !definition.references.every((id) => typeof id === "string" && sourceIds.includes(id))
  ) {
    failArtifact();
  }
  if (
    value.constants.MIN_INITIAL_MASS_MSUN !== STELLAR_LABORATORY_INPUT_RANGE.min ||
    value.constants.MAX_INITIAL_MASS_MSUN !== STELLAR_LABORATORY_INPUT_RANGE.max
  ) {
    failArtifact();
  }
  const defaultPreset = value.presets["illustrative-solar-mass"];
  if (!isRecord(defaultPreset)) failArtifact();
  if (
    validateStellarLaboratoryState({
      version: STELLAR_LABORATORY_SHARE_SCHEMA_VERSION,
      model_version: STELLAR_LABORATORY_MODEL_VERSION,
      ...defaultPreset,
    }) === null
  ) {
    failArtifact();
  }
}

validateStellarLaboratoryArtifact(rawStellarLaboratoryArtifact);
const STELLAR_LABORATORY_ARTIFACT = rawStellarLaboratoryArtifact as StellarLaboratoryArtifact;

export const STELLAR_LABORATORY_DEFINITION = STELLAR_LABORATORY_ARTIFACT.definition;
export const STELLAR_LABORATORY_SOURCES = STELLAR_LABORATORY_ARTIFACT.sources;
export const STELLAR_LABORATORY_CONSTANTS = STELLAR_LABORATORY_ARTIFACT.constants;
export const STELLAR_LABORATORY_PRESETS = STELLAR_LABORATORY_ARTIFACT.presets;
export const STELLAR_LABORATORY_VALIDATION_FIXTURES =
  STELLAR_LABORATORY_ARTIFACT.validation_fixtures;
export const STELLAR_LABORATORY_SCIENTIFIC_VALIDATION =
  STELLAR_LABORATORY_ARTIFACT.scientific_validation;

const defaultPreset = STELLAR_LABORATORY_PRESETS["illustrative-solar-mass"]!;
export const DEFAULT_STELLAR_LABORATORY_STATE: StellarLaboratoryState = {
  version: STELLAR_LABORATORY_SHARE_SCHEMA_VERSION,
  model_version: STELLAR_LABORATORY_MODEL_VERSION,
  ...defaultPreset,
};
