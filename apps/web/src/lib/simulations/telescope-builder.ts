import {
  telescopeBuilderEndpoint,
  validateExactGenerated,
  type TelescopeBuilderCalculationResponse,
} from "@lumina/api-client";

import rawTelescopeBuilderArtifact from "../../../../../data/seed/telescope-builder-v1.json";

export const TELESCOPE_BUILDER_MODEL_VERSION = "telescope-builder-v1" as const;
export const TELESCOPE_BUILDER_SCHEMA_VERSION = 1 as const;
export const TELESCOPE_BUILDER_ARTIFACT_VERSION = 1 as const;
export const TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION = 1 as const;
export const TELESCOPE_BUILDER_SHARE_STATE_MAX_CHARS = 1_024;

export const TELESCOPE_TYPES = ["refractor", "reflector", "catadioptric"] as const;
export const OPTICAL_MODIFIER_KINDS = ["none", "barlow", "reducer"] as const;
export const TELESCOPE_WARNING_CODES = [
  "high_magnification_guideline",
  "very_small_exit_pupil",
  "exit_pupil_exceeds_reference_pupil",
] as const;

export type TelescopeType = (typeof TELESCOPE_TYPES)[number];
export type OpticalModifierKind = (typeof OPTICAL_MODIFIER_KINDS)[number];
export type TelescopeWarningCode = (typeof TELESCOPE_WARNING_CODES)[number];
export type TelescopeTargetFit = "fits" | "does_not_fit";

export const TELESCOPE_WARNING_COPY: Readonly<Record<TelescopeWarningCode, string>> = {
  high_magnification_guideline:
    "This exceeds the common ~2× per millimetre aperture visual-magnification guideline. Actual useful magnification depends strongly on optical quality, target, atmosphere, and observer.",
  very_small_exit_pupil:
    "This exit pupil is below 0.5 mm. Very small exit pupils can be difficult or dim in visual observing and may emphasize eye floaters or optical and seeing limitations; they are not impossible observations.",
  exit_pupil_exceeds_reference_pupil:
    "The exit pupil exceeds the model's 7 mm reference eye pupil, so not all of the geometric beam would enter that reference pupil. Real pupil size varies.",
};

export type TelescopeBuilderState = Readonly<{
  version: typeof TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION;
  model_version: typeof TELESCOPE_BUILDER_MODEL_VERSION;
  aperture_mm: number;
  telescope_focal_length_mm: number;
  telescope_type: TelescopeType;
  eyepiece_focal_length_mm: number;
  eyepiece_apparent_field_deg: number;
  optical_modifier_kind: OpticalModifierKind;
  optical_modifier_factor: number;
  target_angular_size_arcmin: number;
}>;

export type TelescopeSource = Readonly<{
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
  source_type: "official-education" | "technical-reference";
}>;

type TelescopeInputField = Readonly<{
  name: string;
  meaning: string;
  unit: string;
  valid_range?: string;
  valid_values?: ReadonlyArray<string>;
  default: number | string;
}>;

export type TelescopeDefinition = Readonly<{
  slug: "telescope-builder";
  title: "Telescope Builder";
  content_type: "interactive-simulation";
  language: "en";
  status: "ready";
  version: 1;
  audience_modes: ReadonlyArray<"explorer" | "student" | "deep-dive">;
  reviewed_by: ReadonlyArray<string>;
  reviewed_at: string;
  updated_at: string;
  model_version: typeof TELESCOPE_BUILDER_MODEL_VERSION;
  learning_objectives: ReadonlyArray<string>;
  prerequisite_concepts: ReadonlyArray<string>;
  input_schema: Readonly<{
    fields: ReadonlyArray<TelescopeInputField>;
    invalid_handling: string;
  }>;
  default_state: TelescopeBuilderState;
  default_preset: "balanced-reference";
  calculation_module: Readonly<{
    canonical_units: ReadonlyArray<string>;
    relationships: ReadonlyArray<string>;
    equations: Readonly<Record<string, string>>;
    valid_domain: string;
    numerical_policy: string;
    canonical_module: string;
  }>;
  output_schema: ReadonlyArray<string>;
  warning_semantics: ReadonlyArray<string>;
  telescope_type_disclosure: string;
  modifier_semantics: string;
  target_fit_definition: string;
  visualization_module: string;
  assumptions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  references: ReadonlyArray<string>;
  validation_fixtures: ReadonlyArray<string>;
  share_schema_version: typeof TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION;
}>;

export type TelescopeValidationFixture = Readonly<{
  id: string;
  purpose: string;
  input: TelescopeBuilderState;
  expected: Readonly<Record<string, unknown>>;
}>;

type TelescopeArtifact = Readonly<{
  artifact_version: typeof TELESCOPE_BUILDER_ARTIFACT_VERSION;
  model_version: typeof TELESCOPE_BUILDER_MODEL_VERSION;
  schema_version: typeof TELESCOPE_BUILDER_SCHEMA_VERSION;
  share_schema_version: typeof TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION;
  generated_at: string;
  definition: TelescopeDefinition;
  sources: ReadonlyArray<TelescopeSource>;
  constants: Readonly<Record<string, number>>;
  presets: Readonly<Record<"balanced-reference", TelescopeBuilderState>>;
  validation_fixtures: ReadonlyArray<TelescopeValidationFixture>;
  scientific_validation: Readonly<{
    id: string;
    checked_at: string;
    method: string;
    tools: ReadonlyArray<Readonly<{ name: string; version: string; role: string }>>;
    source_ids: ReadonlyArray<string>;
    test_references: ReadonlyArray<string>;
  }>;
}>;

const SOURCE_METADATA: Readonly<Record<string, Readonly<{ url: string; title: string }>>> = {
  "openstax-telescopes": {
    url: "https://openstax.org/books/astronomy/pages/6-1-telescopes",
    title: "6.1 Telescopes",
  },
  "openstax-circular-apertures": {
    url: "https://openstax.org/books/university-physics-volume-3/pages/4-5-circular-apertures-and-resolution",
    title: "4.5 Circular Apertures and Resolution",
  },
  "sky-telescope-dawes": {
    url: "https://skyandtelescope.org/stargazing-and-observing/pushing-limits-a-spring-sky-double-star-romp/",
    title: "Pushing Limits: A Spring Sky Double Star Romp",
  },
  "celestron-astronomy-glossary": {
    url: "https://www.celestron.com/blogs/knowledgebase/astronomy-glossary-of-terms",
    title: "Astronomy Glossary of Terms",
  },
  "wwu-astropages-telescopes": {
    url: "https://astro101.wwu.edu/a101_telescopes.html",
    title: "Telescopes",
  },
  "celestron-exit-pupil": {
    url: "https://www.celestron.com/blogs/knowledgebase/what-is-exit-pupil-and-eye-relief-for-sport-optics",
    title: "What is Exit Pupil and Eye Relief for Sport Optics?",
  },
  "sky-telescope-magnification": {
    url: "https://skyandtelescope.org/astronomy-equipment/choosing-your-telescopes-magnification/",
    title: "How to Choose Your Telescope Magnification",
  },
};

const ARTIFACT_SOURCE_KEYS = [
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
] as const;

const ARTIFACT_DEFINITION_KEYS = [
  "slug",
  "title",
  "content_type",
  "language",
  "status",
  "version",
  "audience_modes",
  "reviewed_by",
  "reviewed_at",
  "updated_at",
  "model_version",
  "learning_objectives",
  "prerequisite_concepts",
  "input_schema",
  "default_state",
  "default_preset",
  "calculation_module",
  "output_schema",
  "warning_semantics",
  "telescope_type_disclosure",
  "modifier_semantics",
  "target_fit_definition",
  "visualization_module",
  "assumptions",
  "limitations",
  "references",
  "validation_fixtures",
  "share_schema_version",
] as const;

const ARTIFACT_KEYS = [
  "artifact_version",
  "model_version",
  "schema_version",
  "share_schema_version",
  "generated_at",
  "definition",
  "sources",
  "constants",
  "presets",
  "validation_fixtures",
  "scientific_validation",
] as const;

const FIXTURE_IDS = [
  "default",
  "two-times-barlow",
  "half-times-reducer",
  "aperture-scaling",
  "high-magnification-small-exit-pupil",
  "warning-boundary",
  "large-exit-pupil",
  "target-does-not-fit",
  "telescope-type-invariance",
] as const;

const CONSTANTS = {
  DAWES_COEFFICIENT_ARCSEC_MM: 116,
  RAYLEIGH_REFERENCE_WAVELENGTH_NM: 550,
  REFERENCE_EYE_PUPIL_MM: 7,
  HIGH_MAGNIFICATION_PER_MM: 2,
  SMALL_EXIT_PUPIL_MM: 0.5,
  MIN_APERTURE_MM: 20,
  MAX_APERTURE_MM: 1000,
  MIN_TELESCOPE_FOCAL_LENGTH_MM: 100,
  MAX_TELESCOPE_FOCAL_LENGTH_MM: 10000,
  MIN_NATIVE_FOCAL_RATIO: 2,
  MAX_NATIVE_FOCAL_RATIO: 30,
  MIN_EYEPIECE_FOCAL_LENGTH_MM: 1,
  MAX_EYEPIECE_FOCAL_LENGTH_MM: 60,
  MIN_EYEPIECE_APPARENT_FIELD_DEG: 30,
  MAX_EYEPIECE_APPARENT_FIELD_DEG: 120,
  MIN_BARLOW_FACTOR: 1.1,
  MAX_BARLOW_FACTOR: 5,
  MIN_REDUCER_FACTOR: 0.5,
  MAX_REDUCER_FACTOR: 0.95,
  MIN_TARGET_ANGULAR_SIZE_ARCMIN: 0.01,
  MAX_TARGET_ANGULAR_SIZE_ARCMIN: 600,
  MIN_MAGNIFICATION_X: 1,
} as const;

export const DEFAULT_TELESCOPE_BUILDER_STATE: TelescopeBuilderState = {
  version: TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION,
  model_version: TELESCOPE_BUILDER_MODEL_VERSION,
  aperture_mm: 100,
  telescope_focal_length_mm: 1000,
  telescope_type: "refractor",
  eyepiece_focal_length_mm: 20,
  eyepiece_apparent_field_deg: 50,
  optical_modifier_kind: "none",
  optical_modifier_factor: 1,
  target_angular_size_arcmin: 30,
};

export class TelescopeBuilderStateValidationError extends Error {
  readonly code = "TELESCOPE_BUILDER_STATE_INVALID";

  constructor() {
    super("TELESCOPE_BUILDER_STATE_INVALID");
    this.name = "TelescopeBuilderStateValidationError";
  }
}

export class TelescopeBuilderArtifactValidationError extends Error {
  readonly code = "TELESCOPE_BUILDER_ARTIFACT_INVALID";

  constructor() {
    super("TELESCOPE_BUILDER_ARTIFACT_INVALID");
    this.name = "TelescopeBuilderArtifactValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function failArtifact(): never {
  throw new TelescopeBuilderArtifactValidationError();
}

function isTelescopeType(value: unknown): value is TelescopeType {
  return typeof value === "string" && TELESCOPE_TYPES.includes(value as TelescopeType);
}

function isOpticalModifierKind(value: unknown): value is OpticalModifierKind {
  return typeof value === "string" && OPTICAL_MODIFIER_KINDS.includes(value as OpticalModifierKind);
}

function isWarningCode(value: unknown): value is TelescopeWarningCode {
  return (
    typeof value === "string" && TELESCOPE_WARNING_CODES.includes(value as TelescopeWarningCode)
  );
}

function isOfficialHttpsUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.pathname.length > 1 &&
      ["astro101.wwu.edu", "openstax.org", "skyandtelescope.org", "www.celestron.com"].includes(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}

function isValidNumericInput(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

const stateKeys = [
  "version",
  "model_version",
  "aperture_mm",
  "telescope_focal_length_mm",
  "telescope_type",
  "eyepiece_focal_length_mm",
  "eyepiece_apparent_field_deg",
  "optical_modifier_kind",
  "optical_modifier_factor",
  "target_angular_size_arcmin",
] as const;

function isValidStateObject(value: Record<string, unknown>): value is Record<string, unknown> {
  // Derived relational validity belongs to the canonical Python calculation
  // boundary. The browser checks only share shape, finite input ranges, and
  // enum/factor consistency before it sends the state for evaluation.
  if (
    value.version !== TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION ||
    value.model_version !== TELESCOPE_BUILDER_MODEL_VERSION ||
    !isValidNumericInput(value.aperture_mm, CONSTANTS.MIN_APERTURE_MM, CONSTANTS.MAX_APERTURE_MM) ||
    !isValidNumericInput(
      value.telescope_focal_length_mm,
      CONSTANTS.MIN_TELESCOPE_FOCAL_LENGTH_MM,
      CONSTANTS.MAX_TELESCOPE_FOCAL_LENGTH_MM,
    ) ||
    !isTelescopeType(value.telescope_type) ||
    !isValidNumericInput(
      value.eyepiece_focal_length_mm,
      CONSTANTS.MIN_EYEPIECE_FOCAL_LENGTH_MM,
      CONSTANTS.MAX_EYEPIECE_FOCAL_LENGTH_MM,
    ) ||
    !isValidNumericInput(
      value.eyepiece_apparent_field_deg,
      CONSTANTS.MIN_EYEPIECE_APPARENT_FIELD_DEG,
      CONSTANTS.MAX_EYEPIECE_APPARENT_FIELD_DEG,
    ) ||
    !isOpticalModifierKind(value.optical_modifier_kind) ||
    !isValidNumericInput(
      value.optical_modifier_factor,
      CONSTANTS.MIN_REDUCER_FACTOR,
      CONSTANTS.MAX_BARLOW_FACTOR,
    ) ||
    !isValidNumericInput(
      value.target_angular_size_arcmin,
      CONSTANTS.MIN_TARGET_ANGULAR_SIZE_ARCMIN,
      CONSTANTS.MAX_TARGET_ANGULAR_SIZE_ARCMIN,
    )
  ) {
    return false;
  }

  if (value.optical_modifier_kind === "none" && value.optical_modifier_factor !== 1) {
    return false;
  }
  if (
    value.optical_modifier_kind === "barlow" &&
    (value.optical_modifier_factor < CONSTANTS.MIN_BARLOW_FACTOR ||
      value.optical_modifier_factor > CONSTANTS.MAX_BARLOW_FACTOR)
  ) {
    return false;
  }
  if (
    value.optical_modifier_kind === "reducer" &&
    (value.optical_modifier_factor < CONSTANTS.MIN_REDUCER_FACTOR ||
      value.optical_modifier_factor > CONSTANTS.MAX_REDUCER_FACTOR)
  ) {
    return false;
  }
  return true;
}

function hasExactStateKeys(value: Record<string, unknown>): boolean {
  return hasOnlyKeys(value, stateKeys);
}

export function validateTelescopeBuilderState(value: unknown): TelescopeBuilderState | null {
  if (!isRecord(value) || !hasExactStateKeys(value) || !isValidStateObject(value)) return null;
  return {
    version: TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION,
    model_version: TELESCOPE_BUILDER_MODEL_VERSION,
    aperture_mm: value.aperture_mm as number,
    telescope_focal_length_mm: value.telescope_focal_length_mm as number,
    telescope_type: value.telescope_type as TelescopeType,
    eyepiece_focal_length_mm: value.eyepiece_focal_length_mm as number,
    eyepiece_apparent_field_deg: value.eyepiece_apparent_field_deg as number,
    optical_modifier_kind: value.optical_modifier_kind as OpticalModifierKind,
    optical_modifier_factor: value.optical_modifier_factor as number,
    target_angular_size_arcmin: value.target_angular_size_arcmin as number,
  };
}

export function encodeTelescopeBuilderState(value: unknown): string {
  const state = validateTelescopeBuilderState(value);
  if (state === null) throw new TelescopeBuilderStateValidationError();
  return JSON.stringify({
    version: state.version,
    model_version: state.model_version,
    aperture_mm: state.aperture_mm,
    telescope_focal_length_mm: state.telescope_focal_length_mm,
    telescope_type: state.telescope_type,
    eyepiece_focal_length_mm: state.eyepiece_focal_length_mm,
    eyepiece_apparent_field_deg: state.eyepiece_apparent_field_deg,
    optical_modifier_kind: state.optical_modifier_kind,
    optical_modifier_factor: state.optical_modifier_factor,
    target_angular_size_arcmin: state.target_angular_size_arcmin,
  });
}

export function decodeTelescopeBuilderState(value: unknown): TelescopeBuilderState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > TELESCOPE_BUILDER_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateTelescopeBuilderState(decoded);
    return state !== null && encodeTelescopeBuilderState(state) === value ? state : null;
  } catch {
    return null;
  }
}

function validOutputNumber(value: unknown): value is number {
  return isFiniteNumber(value);
}

/** Validate the API payload against the requested state without reproducing optical formulas. */
export function validateTelescopeBuilderCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): TelescopeBuilderCalculationResponse | null {
  const state = validateTelescopeBuilderState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(telescopeBuilderEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== TELESCOPE_BUILDER_MODEL_VERSION ||
    result.schema_version !== TELESCOPE_BUILDER_SCHEMA_VERSION ||
    result.inputs.aperture_mm !== state.aperture_mm ||
    result.inputs.telescope_focal_length_mm !== state.telescope_focal_length_mm ||
    result.inputs.telescope_type !== state.telescope_type ||
    result.inputs.eyepiece_focal_length_mm !== state.eyepiece_focal_length_mm ||
    result.inputs.eyepiece_apparent_field_deg !== state.eyepiece_apparent_field_deg ||
    result.inputs.optical_modifier_kind !== state.optical_modifier_kind ||
    result.inputs.optical_modifier_factor !== state.optical_modifier_factor ||
    result.inputs.target_angular_size_arcmin !== state.target_angular_size_arcmin ||
    !validOutputNumber(result.effective_focal_length_mm) ||
    !validOutputNumber(result.native_focal_ratio) ||
    !validOutputNumber(result.effective_focal_ratio) ||
    !validOutputNumber(result.magnification_x) ||
    !validOutputNumber(result.approx_true_field_deg) ||
    !validOutputNumber(result.exit_pupil_mm) ||
    !validOutputNumber(result.dawes_limit_arcsec) ||
    !validOutputNumber(result.rayleigh_limit_arcsec) ||
    !validOutputNumber(result.ideal_light_gathering_ratio_vs_7mm_pupil) ||
    !validOutputNumber(result.target_angular_size_deg) ||
    !validOutputNumber(result.target_field_fraction) ||
    !["fits", "does_not_fit"].includes(result.target_fit) ||
    result.warning_codes.some((code) => !isWarningCode(code)) ||
    new Set(result.warning_codes).size !== result.warning_codes.length
  ) {
    return null;
  }
  return result;
}

export type TelescopeBuilderVisualTransform = Readonly<{
  opticalTrain: Readonly<{
    aperture_x_percent: number;
    aperture_width_percent: number;
    telescope_x_percent: number;
    telescope_width_percent: number;
    modifier_x_percent: number | null;
    eyepiece_x_percent: number;
    native_focal_length_label: string;
    effective_focal_length_label: string;
  }>;
  field: Readonly<{
    field_diameter_percent: number;
    target_diameter_percent: number;
    target_exceeds_field: boolean;
  }>;
}>;

/** Map canonical output to disclosed schematic coordinates; this performs no optical science. */
export function buildTelescopeBuilderVisualTransform(
  stateValue: unknown,
  resultValue: unknown,
): TelescopeBuilderVisualTransform | null {
  const state = validateTelescopeBuilderState(stateValue);
  const result = validateTelescopeBuilderCalculationResult(state, resultValue);
  if (state === null || result === null) return null;
  return {
    opticalTrain: {
      aperture_x_percent: 10,
      aperture_width_percent: 12,
      telescope_x_percent: 25,
      telescope_width_percent: 48,
      modifier_x_percent: state.optical_modifier_kind === "none" ? null : 58,
      eyepiece_x_percent: 82,
      native_focal_length_label: `${result.inputs.telescope_focal_length_mm} mm native`,
      effective_focal_length_label: `${result.effective_focal_length_mm} mm effective`,
    },
    field: {
      field_diameter_percent: 100,
      target_diameter_percent: result.target_field_fraction * 100,
      target_exceeds_field: result.target_fit === "does_not_fit",
    },
  };
}

function validateArtifactSource(source: unknown): void {
  if (!isRecord(source) || !hasOnlyKeys(source, ARTIFACT_SOURCE_KEYS)) failArtifact();
  if (
    !isNonEmptyString(source.id) ||
    !isNonEmptyString(source.title) ||
    !isNonEmptyString(source.organization_or_authors) ||
    !isOfficialHttpsUrl(source.url) ||
    !isNonEmptyString(source.accessed_at) ||
    !isNonEmptyString(source.dataset_or_release) ||
    !isNonEmptyString(source.record_reference) ||
    !isNonEmptyString(source.retrieved_at) ||
    !isNonEmptyString(source.data_date) ||
    !isNonEmptyString(source.terms_or_licence) ||
    !isNonEmptyString(source.citation) ||
    !isNonEmptyString(source.claim_scope) ||
    (source.source_type !== "official-education" && source.source_type !== "technical-reference")
  ) {
    failArtifact();
  }
  const expected = SOURCE_METADATA[source.id];
  if (expected === undefined || source.url !== expected.url || source.title !== expected.title) {
    failArtifact();
  }
}

export function validateTelescopeBuilderArtifact(
  value: unknown,
): asserts value is TelescopeArtifact {
  if (!isRecord(value) || !hasOnlyKeys(value, ARTIFACT_KEYS)) failArtifact();
  if (
    value.artifact_version !== TELESCOPE_BUILDER_ARTIFACT_VERSION ||
    value.model_version !== TELESCOPE_BUILDER_MODEL_VERSION ||
    value.schema_version !== TELESCOPE_BUILDER_SCHEMA_VERSION ||
    value.share_schema_version !== TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION ||
    !isNonEmptyString(value.generated_at)
  ) {
    failArtifact();
  }
  if (!isRecord(value.definition) || !hasOnlyKeys(value.definition, ARTIFACT_DEFINITION_KEYS)) {
    failArtifact();
  }
  const definition = value.definition;
  if (
    definition.slug !== "telescope-builder" ||
    definition.title !== "Telescope Builder" ||
    definition.content_type !== "interactive-simulation" ||
    definition.language !== "en" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== TELESCOPE_BUILDER_MODEL_VERSION ||
    definition.share_schema_version !== TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION ||
    !isStringArray(definition.audience_modes) ||
    definition.audience_modes.join(",") !== "explorer,student,deep-dive" ||
    !isStringArray(definition.reviewed_by) ||
    !isNonEmptyString(definition.reviewed_at) ||
    !isNonEmptyString(definition.updated_at) ||
    !isStringArray(definition.learning_objectives) ||
    !isStringArray(definition.prerequisite_concepts) ||
    !isNonEmptyString(definition.reviewed_at) ||
    !isNonEmptyString(definition.default_preset) ||
    !isStringArray(definition.output_schema) ||
    !isStringArray(definition.warning_semantics) ||
    !isNonEmptyString(definition.telescope_type_disclosure) ||
    !isNonEmptyString(definition.modifier_semantics) ||
    !isNonEmptyString(definition.target_fit_definition) ||
    !isNonEmptyString(definition.visualization_module) ||
    !isStringArray(definition.assumptions) ||
    !isStringArray(definition.limitations) ||
    !isStringArray(definition.references) ||
    !isStringArray(definition.validation_fixtures)
  ) {
    failArtifact();
  }
  if (
    !isRecord(definition.input_schema) ||
    !Array.isArray(definition.input_schema.fields) ||
    definition.input_schema.fields.length !== 8 ||
    !definition.input_schema.fields.every(
      (field) =>
        isRecord(field) &&
        isNonEmptyString(field.name) &&
        isNonEmptyString(field.meaning) &&
        isNonEmptyString(field.unit),
    ) ||
    !isNonEmptyString(definition.input_schema.invalid_handling) ||
    !isRecord(definition.calculation_module) ||
    !isStringArray(definition.calculation_module.canonical_units) ||
    !isStringArray(definition.calculation_module.relationships) ||
    !isRecord(definition.calculation_module.equations) ||
    !Object.values(definition.calculation_module.equations).every(isNonEmptyString) ||
    !isNonEmptyString(definition.calculation_module.valid_domain) ||
    !isNonEmptyString(definition.calculation_module.numerical_policy) ||
    !isNonEmptyString(definition.calculation_module.canonical_module)
  ) {
    failArtifact();
  }
  if (validateTelescopeBuilderState(definition.default_state) === null) failArtifact();
  if (
    !Array.isArray(value.sources) ||
    value.sources.length !== Object.keys(SOURCE_METADATA).length
  ) {
    failArtifact();
  }
  for (const source of value.sources) validateArtifactSource(source);
  const sourceIds = new Set(value.sources.map((source) => source.id));
  if (sourceIds.size !== Object.keys(SOURCE_METADATA).length) failArtifact();
  for (const sourceId of Object.keys(SOURCE_METADATA)) {
    if (!sourceIds.has(sourceId)) failArtifact();
  }
  if (!isRecord(value.constants) || !hasOnlyKeys(value.constants, Object.keys(CONSTANTS))) {
    failArtifact();
  }
  for (const [key, expected] of Object.entries(CONSTANTS)) {
    if (!isFiniteNumber(value.constants[key]) || value.constants[key] !== expected) failArtifact();
  }
  if (
    !isRecord(value.presets) ||
    !hasOnlyKeys(value.presets, ["balanced-reference"]) ||
    validateTelescopeBuilderState(value.presets["balanced-reference"]) === null ||
    JSON.stringify(value.presets["balanced-reference"]) !== JSON.stringify(definition.default_state)
  ) {
    failArtifact();
  }
  if (
    !Array.isArray(value.validation_fixtures) ||
    value.validation_fixtures.length !== FIXTURE_IDS.length
  ) {
    failArtifact();
  }
  const fixtureIds = new Set<string>();
  for (const fixture of value.validation_fixtures) {
    if (
      !isRecord(fixture) ||
      !hasOnlyKeys(fixture, ["id", "purpose", "input", "expected"]) ||
      !isNonEmptyString(fixture.id) ||
      !isNonEmptyString(fixture.purpose) ||
      validateTelescopeBuilderState(fixture.input) === null ||
      !isRecord(fixture.expected)
    ) {
      failArtifact();
    }
    fixtureIds.add(fixture.id);
  }
  if (fixtureIds.size !== FIXTURE_IDS.length || FIXTURE_IDS.some((id) => !fixtureIds.has(id))) {
    failArtifact();
  }
  const scientificValidation = value.scientific_validation;
  const scientificSourceIds = isRecord(scientificValidation)
    ? scientificValidation.source_ids
    : undefined;
  if (
    !isRecord(scientificValidation) ||
    !hasOnlyKeys(scientificValidation, [
      "id",
      "checked_at",
      "method",
      "tools",
      "source_ids",
      "test_references",
    ]) ||
    scientificValidation.id !== "telescope-builder-independent-validation-v1" ||
    !isNonEmptyString(scientificValidation.checked_at) ||
    !isNonEmptyString(scientificValidation.method) ||
    !Array.isArray(scientificValidation.tools) ||
    scientificValidation.tools.length === 0 ||
    !scientificValidation.tools.every(
      (tool) =>
        isRecord(tool) &&
        hasOnlyKeys(tool, ["name", "version", "role"]) &&
        isNonEmptyString(tool.name) &&
        isNonEmptyString(tool.version) &&
        isNonEmptyString(tool.role),
    ) ||
    !isStringArray(scientificSourceIds) ||
    !isStringArray(scientificValidation.test_references) ||
    Object.keys(SOURCE_METADATA).some((id) => !scientificSourceIds.includes(id))
  ) {
    failArtifact();
  }
}

const TELESCOPE_BUILDER_ARTIFACT = rawTelescopeBuilderArtifact as unknown as TelescopeArtifact;
validateTelescopeBuilderArtifact(TELESCOPE_BUILDER_ARTIFACT);

export const TELESCOPE_SOURCES = TELESCOPE_BUILDER_ARTIFACT.sources;
export const TELESCOPE_DEFINITION = TELESCOPE_BUILDER_ARTIFACT.definition;
export const TELESCOPE_CONSTANTS = TELESCOPE_BUILDER_ARTIFACT.constants;
export const TELESCOPE_PRESETS = TELESCOPE_BUILDER_ARTIFACT.presets;
export const TELESCOPE_VALIDATION_FIXTURES = TELESCOPE_BUILDER_ARTIFACT.validation_fixtures;
export const TELESCOPE_SCIENTIFIC_VALIDATION = TELESCOPE_BUILDER_ARTIFACT.scientific_validation;

export { telescopeBuilderEndpoint };
