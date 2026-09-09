import {
  seasonsSimulatorEndpoint,
  validateExactGenerated,
  type SeasonsCalculationResponse,
} from "@lumina/api-client";

import rawSeasonsArtifact from "../../../../../data/seed/seasons-simulator-v1.json";

export const SEASONS_MODEL_VERSION = "seasons-simulator-v1" as const;
export const SEASONS_SCHEMA_VERSION = 1 as const;
export const SEASONS_ARTIFACT_VERSION = 1 as const;
export const SEASONS_SHARE_STATE_MAX_CHARS = 512;
export const SEASONS_ECCENTRICITY_PRESETS = ["circular", "earth", "exaggerated"] as const;

export type SeasonsEccentricityPreset = (typeof SEASONS_ECCENTRICITY_PRESETS)[number];
export type SeasonsPolarState = "none" | "polar_day" | "polar_night" | "horizon_all_day";

export type SeasonsState = Readonly<{
  version: typeof SEASONS_SCHEMA_VERSION;
  model_version: typeof SEASONS_MODEL_VERSION;
  axial_tilt_deg: number;
  orbital_position_deg: number;
  latitude_deg: number;
  eccentricity_preset: SeasonsEccentricityPreset;
}>;

export type SeasonsSource = Readonly<{
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
  source_type: "official-agency" | "official-education";
}>;

type SeasonsInputField = Readonly<{
  name: string;
  meaning: string;
  unit: string;
  valid_range?: string;
  valid_values?: ReadonlyArray<string>;
  default: number | string;
  phase_convention?: Readonly<Record<string, string>>;
}>;

export type SeasonsDefinition = Readonly<{
  slug: "seasons-simulator";
  title: "Seasons Simulator";
  content_type: "interactive-simulation";
  language: "en";
  status: "ready";
  version: 1;
  audience_modes: ReadonlyArray<"explorer" | "student" | "deep-dive">;
  reviewed_by: ReadonlyArray<string>;
  reviewed_at: string;
  updated_at: string;
  model_version: typeof SEASONS_MODEL_VERSION;
  learning_objectives: ReadonlyArray<string>;
  prerequisite_concepts: ReadonlyArray<string>;
  input_schema: Readonly<{
    fields: ReadonlyArray<SeasonsInputField>;
    invalid_handling: string;
  }>;
  default_preset: string;
  calculation_module: Readonly<{
    canonical_units: ReadonlyArray<string>;
    relationships: ReadonlyArray<string>;
    equations: Readonly<Record<string, string>>;
    valid_domain: string;
    numerical_policy: string;
    canonical_module: string;
  }>;
  output_schema: ReadonlyArray<string>;
  visualization_module: string;
  assumptions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  references: ReadonlyArray<string>;
  validation_fixtures: ReadonlyArray<string>;
  share_schema_version: typeof SEASONS_SCHEMA_VERSION;
}>;

export type SeasonsValidationFixture = Readonly<{
  id: string;
  purpose: string;
  input: Readonly<{
    axial_tilt_deg: number;
    orbital_position_deg: number;
    latitude_deg: number;
    eccentricity_preset: SeasonsEccentricityPreset;
  }>;
  expected: Readonly<Record<string, unknown>>;
}>;

type SeasonsArtifact = Readonly<{
  artifact_version: typeof SEASONS_ARTIFACT_VERSION;
  model_version: typeof SEASONS_MODEL_VERSION;
  schema_version: typeof SEASONS_SCHEMA_VERSION;
  share_schema_version: typeof SEASONS_SCHEMA_VERSION;
  generated_at: string;
  definition: SeasonsDefinition;
  sources: ReadonlyArray<SeasonsSource>;
  constants: Readonly<Record<string, number>>;
  presets: Readonly<Record<SeasonsEccentricityPreset, number>>;
  validation_fixtures: ReadonlyArray<SeasonsValidationFixture>;
  scientific_validation: Readonly<{
    id: string;
    checked_at: string;
    method: string;
    tools: ReadonlyArray<Readonly<{ name: string; version: string; role: string }>>;
    source_ids: ReadonlyArray<string>;
    test_references: ReadonlyArray<string>;
  }>;
}>;

export const DEFAULT_SEASONS_STATE: SeasonsState = {
  version: SEASONS_SCHEMA_VERSION,
  model_version: SEASONS_MODEL_VERSION,
  axial_tilt_deg: 23.43928,
  orbital_position_deg: 90,
  latitude_deg: 40,
  eccentricity_preset: "earth",
};

export class SeasonsStateValidationError extends Error {
  readonly code = "SEASONS_STATE_INVALID";

  constructor() {
    super("SEASONS_STATE_INVALID");
    this.name = "SeasonsStateValidationError";
  }
}

export class SeasonsArtifactValidationError extends Error {
  readonly code = "SEASONS_ARTIFACT_INVALID";

  constructor() {
    super("SEASONS_ARTIFACT_INVALID");
    this.name = "SeasonsArtifactValidationError";
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

function isOfficialHttpsUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      [
        "aa.usno.navy.mil",
        "science.nasa.gov",
        "spaceplace.nasa.gov",
        "ssd.jpl.nasa.gov",
        "www.gml.noaa.gov",
      ].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function failArtifact(): never {
  throw new SeasonsArtifactValidationError();
}

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
  "default_preset",
  "calculation_module",
  "output_schema",
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

const SOURCE_IDS = [
  "nasa-space-place-seasons",
  "nasa-earth-facts",
  "jpl-approximate-planetary-elements",
  "usno-sun-declination",
  "usno-daylight-geometry",
  "noaa-solar-calculator-details",
] as const;

const FIXTURE_IDS = [
  "equinox-40-north",
  "june-solstice-40-north",
  "december-solstice-40-north",
  "equator-june-solstice",
  "zero-tilt-distance-only",
  "arctic-circle-boundary",
  "pole-equinox-degeneracy",
  "circular-orbit",
  "earth-perihelion-distance",
  "earth-aphelion-distance",
  "exaggerated-eccentricity-distance",
] as const;

const CONSTANTS = {
  EARTH_OBLIQUITY_J2000_DEG: 23.43928,
  EARTH_ECCENTRICITY: 0.01671123,
  EARTH_PERIHELION_LONGITUDE_DEG: 102.93768193,
  PERIHELION_SEASONAL_LONGITUDE_DEG: 282.93768193,
  MEAN_SOLAR_DAY_HOURS: 24,
  CIRCULAR_ECCENTRICITY: 0,
  EXAGGERATED_ECCENTRICITY: 0.1,
} as const;

export function validateSeasonsArtifact(value: unknown): asserts value is SeasonsArtifact {
  if (!isRecord(value) || !hasOnlyKeys(value, ARTIFACT_KEYS)) failArtifact();
  if (
    value.artifact_version !== SEASONS_ARTIFACT_VERSION ||
    value.model_version !== SEASONS_MODEL_VERSION ||
    value.schema_version !== SEASONS_SCHEMA_VERSION ||
    value.share_schema_version !== SEASONS_SCHEMA_VERSION ||
    !isNonEmptyString(value.generated_at)
  ) {
    failArtifact();
  }

  if (!isRecord(value.definition) || !hasOnlyKeys(value.definition, ARTIFACT_DEFINITION_KEYS)) {
    failArtifact();
  }
  const definition = value.definition;
  if (
    definition.slug !== "seasons-simulator" ||
    definition.title !== "Seasons Simulator" ||
    definition.content_type !== "interactive-simulation" ||
    definition.language !== "en" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== SEASONS_MODEL_VERSION ||
    definition.share_schema_version !== SEASONS_SCHEMA_VERSION ||
    !isStringArray(definition.audience_modes) ||
    definition.audience_modes.join(",") !== "explorer,student,deep-dive" ||
    !isStringArray(definition.reviewed_by) ||
    !isNonEmptyString(definition.reviewed_at) ||
    !isNonEmptyString(definition.updated_at) ||
    !isStringArray(definition.learning_objectives) ||
    !isStringArray(definition.prerequisite_concepts) ||
    !isNonEmptyString(definition.default_preset) ||
    !isStringArray(definition.output_schema) ||
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
    definition.input_schema.fields.length !== 4 ||
    !definition.input_schema.fields.every(
      (field) =>
        isRecord(field) &&
        isNonEmptyString(field.name) &&
        isNonEmptyString(field.meaning) &&
        isNonEmptyString(field.unit),
    )
  ) {
    failArtifact();
  }
  if (!isNonEmptyString(definition.input_schema.invalid_handling)) failArtifact();
  if (!isRecord(definition.calculation_module)) failArtifact();
  if (
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

  if (!Array.isArray(value.sources) || value.sources.length !== SOURCE_IDS.length) failArtifact();
  const sourceIds = new Set<string>();
  for (const source of value.sources) {
    if (
      !isRecord(source) ||
      !hasOnlyKeys(source, ARTIFACT_SOURCE_KEYS) ||
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
      (source.source_type !== "official-agency" && source.source_type !== "official-education")
    ) {
      failArtifact();
    }
    sourceIds.add(source.id);
  }
  if (sourceIds.size !== SOURCE_IDS.length || SOURCE_IDS.some((id) => !sourceIds.has(id))) {
    failArtifact();
  }

  if (!isRecord(value.constants) || !hasOnlyKeys(value.constants, Object.keys(CONSTANTS))) {
    failArtifact();
  }
  for (const [key, expected] of Object.entries(CONSTANTS)) {
    if (!isFiniteNumber(value.constants[key]) || value.constants[key] !== expected) failArtifact();
  }
  const expectedPresets: Record<SeasonsEccentricityPreset, number> = {
    circular: 0,
    earth: 0.01671123,
    exaggerated: 0.1,
  };
  if (!isRecord(value.presets) || !hasOnlyKeys(value.presets, SEASONS_ECCENTRICITY_PRESETS)) {
    failArtifact();
  }
  for (const preset of SEASONS_ECCENTRICITY_PRESETS) {
    if (
      !isFiniteNumber(value.presets[preset]) ||
      value.presets[preset] !== expectedPresets[preset]
    ) {
      failArtifact();
    }
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
      !isNonEmptyString(fixture.id) ||
      !isNonEmptyString(fixture.purpose) ||
      !isRecord(fixture.input) ||
      !isFiniteNumber(fixture.input.axial_tilt_deg) ||
      !isFiniteNumber(fixture.input.orbital_position_deg) ||
      !isFiniteNumber(fixture.input.latitude_deg) ||
      !SEASONS_ECCENTRICITY_PRESETS.includes(
        fixture.input.eccentricity_preset as SeasonsEccentricityPreset,
      ) ||
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
  if (!isRecord(scientificValidation)) failArtifact();
  const scientificSourceIds = scientificValidation.source_ids;
  const testReferences = scientificValidation.test_references;
  if (
    !isNonEmptyString(scientificValidation.id) ||
    scientificValidation.id !== "seasons-simulator-independent-validation-v1" ||
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
    !isStringArray(testReferences)
  ) {
    failArtifact();
  }
  if (SOURCE_IDS.some((id) => !scientificSourceIds.includes(id))) failArtifact();
}

const SEASONS_ARTIFACT = rawSeasonsArtifact as unknown as SeasonsArtifact;
validateSeasonsArtifact(SEASONS_ARTIFACT);

export const SEASONS_SOURCES = SEASONS_ARTIFACT.sources;
export const SEASONS_DEFINITION = SEASONS_ARTIFACT.definition;
export const SEASONS_CONSTANTS = SEASONS_ARTIFACT.constants;
export const SEASONS_PRESETS = SEASONS_ARTIFACT.presets;
export const SEASONS_VALIDATION_FIXTURES = SEASONS_ARTIFACT.validation_fixtures;
export const SEASONS_SCIENTIFIC_VALIDATION = SEASONS_ARTIFACT.scientific_validation;

function hasExactStateKeys(value: Record<string, unknown>): boolean {
  return hasOnlyKeys(value, [
    "version",
    "model_version",
    "axial_tilt_deg",
    "orbital_position_deg",
    "latitude_deg",
    "eccentricity_preset",
  ]);
}

function isSeasonsEccentricityPreset(value: unknown): value is SeasonsEccentricityPreset {
  return (
    typeof value === "string" &&
    SEASONS_ECCENTRICITY_PRESETS.includes(value as SeasonsEccentricityPreset)
  );
}

export function validateSeasonsState(value: unknown): SeasonsState | null {
  if (!isRecord(value) || !hasExactStateKeys(value)) return null;
  if (
    value.version !== SEASONS_SCHEMA_VERSION ||
    value.model_version !== SEASONS_MODEL_VERSION ||
    !isFiniteNumber(value.axial_tilt_deg) ||
    value.axial_tilt_deg < 0 ||
    value.axial_tilt_deg > 90 ||
    !isFiniteNumber(value.orbital_position_deg) ||
    value.orbital_position_deg < 0 ||
    value.orbital_position_deg >= 360 ||
    !isFiniteNumber(value.latitude_deg) ||
    value.latitude_deg < -90 ||
    value.latitude_deg > 90 ||
    !isSeasonsEccentricityPreset(value.eccentricity_preset)
  ) {
    return null;
  }
  return {
    version: SEASONS_SCHEMA_VERSION,
    model_version: SEASONS_MODEL_VERSION,
    axial_tilt_deg: value.axial_tilt_deg,
    orbital_position_deg: value.orbital_position_deg,
    latitude_deg: value.latitude_deg,
    eccentricity_preset: value.eccentricity_preset,
  };
}

/** Canonicalize only the closed visual slider endpoint; arbitrary invalid values are rejected. */
export function canonicalizeSeasonsOrbitalPosition(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value === 360) return 0;
  return value >= 0 && value < 360 ? value : null;
}

export function encodeSeasonsState(value: unknown): string {
  const state = validateSeasonsState(value);
  if (state === null) throw new SeasonsStateValidationError();
  return JSON.stringify({
    version: state.version,
    model_version: state.model_version,
    axial_tilt_deg: state.axial_tilt_deg,
    orbital_position_deg: state.orbital_position_deg,
    latitude_deg: state.latitude_deg,
    eccentricity_preset: state.eccentricity_preset,
  });
}

export function decodeSeasonsState(value: unknown): SeasonsState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > SEASONS_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateSeasonsState(decoded);
    return state !== null && encodeSeasonsState(state) === value ? state : null;
  } catch {
    return null;
  }
}

function isSeasonsPolarState(value: unknown): value is SeasonsPolarState {
  return (
    value === "none" ||
    value === "polar_day" ||
    value === "polar_night" ||
    value === "horizon_all_day"
  );
}

function validGeometry(
  value: SeasonsCalculationResponse["selected"],
  expectedLatitude: number,
): boolean {
  return (
    value.latitude_deg === expectedLatitude &&
    isFiniteNumber(value.noon_solar_zenith_deg) &&
    isFiniteNumber(value.noon_sun_altitude_deg) &&
    isFiniteNumber(value.illumination_incidence_deg) &&
    (value.day_length_hours === null || isFiniteNumber(value.day_length_hours)) &&
    isSeasonsPolarState(value.polar_state)
  );
}

/** Validate the API result and state relationship without reproducing any science formula. */
export function validateSeasonsCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): SeasonsCalculationResponse | null {
  const state = validateSeasonsState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(seasonsSimulatorEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== SEASONS_MODEL_VERSION ||
    result.schema_version !== SEASONS_SCHEMA_VERSION ||
    result.inputs.axial_tilt_deg !== state.axial_tilt_deg ||
    result.inputs.orbital_position_deg !== state.orbital_position_deg ||
    result.inputs.latitude_deg !== state.latitude_deg ||
    result.inputs.eccentricity_preset !== state.eccentricity_preset ||
    !isFiniteNumber(result.solar_declination_deg) ||
    !validGeometry(result.selected, state.latitude_deg) ||
    result.comparison_latitude_deg !== -state.latitude_deg ||
    !validGeometry(result.opposite_hemisphere, -state.latitude_deg) ||
    !isFiniteNumber(result.eccentricity) ||
    result.eccentricity !== SEASONS_PRESETS[state.eccentricity_preset] ||
    !isFiniteNumber(result.distance_over_semimajor_axis) ||
    result.distance_over_semimajor_axis <= 0 ||
    !isFiniteNumber(result.relative_solar_flux) ||
    result.relative_solar_flux <= 0
  ) {
    return null;
  }
  return result;
}

export type SeasonsVisualTransform = Readonly<{
  orbit: Readonly<{
    earth_x_percent: number;
    earth_y_percent: number;
    major_radius_percent: number;
    minor_radius_percent: number;
    sun_x_percent: number;
    sun_y_percent: number;
  }>;
  illumination: Readonly<{
    axis_x1_percent: number;
    axis_y1_percent: number;
    axis_x2_percent: number;
    axis_y2_percent: number;
  }>;
}>;

/**
 * Build only normalized SVG coordinates. These are disclosed visual transforms,
 * not additional astronomical calculations or scale-accurate geometry.
 */
export function buildSeasonsVisualTransform(
  stateValue: unknown,
  resultValue: unknown,
): SeasonsVisualTransform | null {
  const state = validateSeasonsState(stateValue);
  const result = validateSeasonsCalculationResult(state, resultValue);
  if (state === null || result === null) return null;

  const phaseRadians = (state.orbital_position_deg / 360) * Math.PI * 2;
  const majorRadius = 32;
  const minorRadius = majorRadius * (1 - result.eccentricity);
  const earthX = 50 + majorRadius * Math.cos(phaseRadians);
  const earthY = 50 + minorRadius * Math.sin(phaseRadians);
  const tiltRadians = (state.axial_tilt_deg / 90) * (Math.PI / 2);
  const axisHalfLength = 28;

  return {
    orbit: {
      earth_x_percent: earthX,
      earth_y_percent: earthY,
      major_radius_percent: majorRadius,
      minor_radius_percent: minorRadius,
      sun_x_percent: 50 - majorRadius * Math.min(result.eccentricity, 0.1),
      sun_y_percent: 50,
    },
    illumination: {
      axis_x1_percent: 50 - axisHalfLength * Math.sin(tiltRadians),
      axis_y1_percent: 50 + axisHalfLength * Math.cos(tiltRadians),
      axis_x2_percent: 50 + axisHalfLength * Math.sin(tiltRadians),
      axis_y2_percent: 50 - axisHalfLength * Math.cos(tiltRadians),
    },
  };
}

export { seasonsSimulatorEndpoint };
