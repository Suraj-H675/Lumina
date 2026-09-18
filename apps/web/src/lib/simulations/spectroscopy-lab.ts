import {
  spectroscopyLabEndpoint,
  validateExactGenerated,
  type SpectroscopyCalculationResponse,
} from "@lumina/api-client";

import rawSpectroscopyArtifact from "../../../../../data/seed/spectroscopy-lab-v1.json";

export const SPECTROSCOPY_MODEL_VERSION = "spectroscopy-lab-v1" as const;
export const SPECTROSCOPY_SCHEMA_VERSION = 1 as const;
export const SPECTROSCOPY_ARTIFACT_VERSION = 1 as const;
export const SPECTROSCOPY_SHARE_SCHEMA_VERSION = 1 as const;
export const SPECTROSCOPY_SHARE_STATE_MAX_CHARS = 1024;

export const SPECTROSCOPY_MODES = [
  "continuum",
  "emission",
  "absorption",
  "doppler",
  "element_match",
] as const;
export const SPECTROSCOPY_ELEMENTS = ["H I", "He I", "Na I", "Ca II"] as const;

export type SpectroscopyMode = (typeof SPECTROSCOPY_MODES)[number];
export type SpectroscopyElement = (typeof SPECTROSCOPY_ELEMENTS)[number];

export const SPECTROSCOPY_LIMITS = {
  minTemperatureK: 2500,
  maxTemperatureK: 15000,
  minRadialVelocityKmS: -300,
  maxRadialVelocityKmS: 300,
  minResolvingPower: 100,
  maxResolvingPower: 500,
  minNoiseSigma: 0,
  maxNoiseSigma: 0.05,
  minNoiseSeed: 0,
  maxNoiseSeed: 4_294_967_295,
  wavelengthStartNm: 380,
  wavelengthEndNm: 750,
  spectrumPointCount: 741,
} as const;

export type SpectroscopyState = Readonly<{
  version: typeof SPECTROSCOPY_SHARE_SCHEMA_VERSION;
  model_version: typeof SPECTROSCOPY_MODEL_VERSION;
  mode: SpectroscopyMode;
  temperature_k: number;
  selected_elements: ReadonlyArray<SpectroscopyElement>;
  radial_velocity_km_s: number;
  resolving_power: number;
  noise_sigma: number;
  noise_seed: number;
}>;

export type SpectroscopySource = Readonly<{
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

type SpectroscopyDefinition = Readonly<{
  slug: "spectroscopy-lab";
  title: "Spectroscopy Lab";
  status: "ready";
  version: 1;
  model_version: typeof SPECTROSCOPY_MODEL_VERSION;
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

type SpectroscopyArtifact = Readonly<{
  artifact_version: 1;
  model_version: typeof SPECTROSCOPY_MODEL_VERSION;
  schema_version: 1;
  share_schema_version: 1;
  definition: SpectroscopyDefinition;
  sources: ReadonlyArray<SpectroscopySource>;
  constants: Readonly<Record<string, string | number>>;
  supported_modes: ReadonlyArray<SpectroscopyMode>;
  supported_elements: ReadonlyArray<SpectroscopyElement>;
  representative_lines: ReadonlyArray<
    Readonly<{
      element: SpectroscopyElement;
      label: string;
      observed_vacuum_wavelength_nm: number;
      nist_relative_intensity: string;
    }>
  >;
  line_selection_policy: Readonly<{
    wavelength_medium: "vacuum";
    selection: string;
    intensity_use: string;
  }>;
  presets: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}>;

const STATE_KEYS = [
  "version",
  "model_version",
  "mode",
  "temperature_k",
  "selected_elements",
  "radial_velocity_km_s",
  "resolving_power",
  "noise_sigma",
  "noise_seed",
] as const;

const EXPECTED_SOURCE_IDS = new Set([
  "openstax-astronomy-electromagnetic-spectrum",
  "openstax-astronomy-spectroscopy",
  "openstax-astronomy-doppler",
  "nist-2022-codata",
  "nist-asd-lines",
  "eso-uves-resolution",
  "stsci-nirspec-resolution",
]);

export class SpectroscopyStateValidationError extends Error {
  readonly code = "SPECTROSCOPY_STATE_INVALID";
  constructor() {
    super("SPECTROSCOPY_STATE_INVALID");
    this.name = "SpectroscopyStateValidationError";
  }
}

export class SpectroscopyArtifactValidationError extends Error {
  readonly code = "SPECTROSCOPY_ARTIFACT_INVALID";
  constructor() {
    super("SPECTROSCOPY_ARTIFACT_INVALID");
    this.name = "SpectroscopyArtifactValidationError";
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

function isMode(value: unknown): value is SpectroscopyMode {
  return typeof value === "string" && SPECTROSCOPY_MODES.includes(value as SpectroscopyMode);
}

function isElement(value: unknown): value is SpectroscopyElement {
  return typeof value === "string" && SPECTROSCOPY_ELEMENTS.includes(value as SpectroscopyElement);
}

function canonicalElements(value: unknown): ReadonlyArray<SpectroscopyElement> | null {
  if (!Array.isArray(value) || value.length > SPECTROSCOPY_ELEMENTS.length) return null;
  if (value.some((element) => !isElement(element))) return null;
  if (new Set(value).size !== value.length) return null;
  const positions = value.map((element) => SPECTROSCOPY_ELEMENTS.indexOf(element));
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1]!)) {
    return null;
  }
  return value as ReadonlyArray<SpectroscopyElement>;
}

function failArtifact(): never {
  throw new SpectroscopyArtifactValidationError();
}

export function validateSpectroscopyState(value: unknown): SpectroscopyState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STATE_KEYS)) return null;
  const elements = canonicalElements(value.selected_elements);
  if (
    value.version !== SPECTROSCOPY_SHARE_SCHEMA_VERSION ||
    value.model_version !== SPECTROSCOPY_MODEL_VERSION ||
    !isMode(value.mode) ||
    elements === null ||
    !finite(value.temperature_k) ||
    value.temperature_k < SPECTROSCOPY_LIMITS.minTemperatureK ||
    value.temperature_k > SPECTROSCOPY_LIMITS.maxTemperatureK ||
    !finite(value.radial_velocity_km_s) ||
    value.radial_velocity_km_s < SPECTROSCOPY_LIMITS.minRadialVelocityKmS ||
    value.radial_velocity_km_s > SPECTROSCOPY_LIMITS.maxRadialVelocityKmS ||
    !finite(value.resolving_power) ||
    value.resolving_power < SPECTROSCOPY_LIMITS.minResolvingPower ||
    value.resolving_power > SPECTROSCOPY_LIMITS.maxResolvingPower ||
    !finite(value.noise_sigma) ||
    value.noise_sigma < SPECTROSCOPY_LIMITS.minNoiseSigma ||
    value.noise_sigma > SPECTROSCOPY_LIMITS.maxNoiseSigma ||
    !Number.isInteger(value.noise_seed) ||
    !finite(value.noise_seed) ||
    value.noise_seed < SPECTROSCOPY_LIMITS.minNoiseSeed ||
    value.noise_seed > SPECTROSCOPY_LIMITS.maxNoiseSeed ||
    (value.mode === "continuum" ? elements.length !== 0 : elements.length === 0)
  ) {
    return null;
  }
  return {
    version: SPECTROSCOPY_SHARE_SCHEMA_VERSION,
    model_version: SPECTROSCOPY_MODEL_VERSION,
    mode: value.mode,
    temperature_k: value.temperature_k,
    selected_elements: [...elements],
    radial_velocity_km_s: value.radial_velocity_km_s,
    resolving_power: value.resolving_power,
    noise_sigma: value.noise_sigma,
    noise_seed: value.noise_seed,
  };
}

export function encodeSpectroscopyState(value: unknown): string {
  const state = validateSpectroscopyState(value);
  if (state === null) throw new SpectroscopyStateValidationError();
  return JSON.stringify(state);
}

export function decodeSpectroscopyState(value: unknown): SpectroscopyState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > SPECTROSCOPY_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateSpectroscopyState(decoded);
    return state !== null && encodeSpectroscopyState(state) === value ? state : null;
  } catch {
    return null;
  }
}

export function spectroscopyRequestEndpoint(state: SpectroscopyState) {
  const query = new URLSearchParams({
    mode: state.mode,
    temperature_k: String(state.temperature_k),
    selected_elements: state.selected_elements.join(","),
    radial_velocity_km_s: String(state.radial_velocity_km_s),
    resolving_power: String(state.resolving_power),
    noise_sigma: String(state.noise_sigma),
    noise_seed: String(state.noise_seed),
  });
  return { ...spectroscopyLabEndpoint, path: `${spectroscopyLabEndpoint.path}?${query}` };
}

function sameElements(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateSpectroscopyCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): SpectroscopyCalculationResponse | null {
  const state = validateSpectroscopyState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(spectroscopyLabEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  const wavelengths = result.wavelength_nm;
  const flux = result.normalized_flux;
  if (
    result.model_version !== SPECTROSCOPY_MODEL_VERSION ||
    result.schema_version !== SPECTROSCOPY_SCHEMA_VERSION ||
    result.inputs.mode !== state.mode ||
    result.inputs.temperature_k !== state.temperature_k ||
    !sameElements(result.inputs.selected_elements, state.selected_elements) ||
    result.inputs.radial_velocity_km_s !== state.radial_velocity_km_s ||
    result.inputs.resolving_power !== state.resolving_power ||
    result.inputs.noise_sigma !== state.noise_sigma ||
    result.inputs.noise_seed !== state.noise_seed ||
    !finite(result.wien_peak_nm) ||
    result.wien_peak_nm <= 0 ||
    !finite(result.doppler_factor) ||
    result.doppler_factor <= 0 ||
    wavelengths.length !== SPECTROSCOPY_LIMITS.spectrumPointCount ||
    flux.length !== SPECTROSCOPY_LIMITS.spectrumPointCount ||
    wavelengths.some((value) => !finite(value)) ||
    flux.some((value) => !finite(value) || value < 0 || value > 1) ||
    wavelengths[0] !== SPECTROSCOPY_LIMITS.wavelengthStartNm ||
    wavelengths.at(-1) !== SPECTROSCOPY_LIMITS.wavelengthEndNm ||
    wavelengths.some((value, index) => index > 0 && value <= wavelengths[index - 1]!) ||
    result.representative_lines.some(
      (line) =>
        !state.selected_elements.includes(line.element) ||
        !nonEmptyString(line.label) ||
        !finite(line.rest_wavelength_vacuum_nm) ||
        !finite(line.shifted_wavelength_vacuum_nm) ||
        !finite(line.illustrative_fwhm_nm) ||
        line.illustrative_fwhm_nm <= 0 ||
        !nonEmptyString(line.nist_relative_intensity),
    ) ||
    result.fingerprints.some(
      (fingerprint) =>
        !state.selected_elements.includes(fingerprint.element) ||
        !Number.isInteger(fingerprint.representative_line_count) ||
        fingerprint.representative_line_count <= 0,
    ) ||
    !nonEmptyString(result.identification_explanation) ||
    !nonEmptyString(result.continuum_note) ||
    !nonEmptyString(result.line_strength_note) ||
    !nonEmptyString(result.resolution_note) ||
    !nonEmptyString(result.noise_note)
  ) {
    return null;
  }
  if (
    state.mode === "continuum" &&
    (result.representative_lines.length !== 0 || result.fingerprints.length !== 0)
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

export function validateSpectroscopyArtifact(
  value: unknown,
): asserts value is SpectroscopyArtifact {
  if (!isRecord(value)) failArtifact();
  if (
    value.artifact_version !== SPECTROSCOPY_ARTIFACT_VERSION ||
    value.model_version !== SPECTROSCOPY_MODEL_VERSION ||
    value.schema_version !== SPECTROSCOPY_SCHEMA_VERSION ||
    value.share_schema_version !== SPECTROSCOPY_SHARE_SCHEMA_VERSION ||
    !isRecord(value.definition) ||
    !Array.isArray(value.sources) ||
    !isRecord(value.constants) ||
    !Array.isArray(value.supported_modes) ||
    !Array.isArray(value.supported_elements) ||
    !Array.isArray(value.representative_lines) ||
    !isRecord(value.line_selection_policy) ||
    !isRecord(value.presets)
  ) {
    failArtifact();
  }
  const definition = value.definition;
  if (
    definition.slug !== "spectroscopy-lab" ||
    definition.title !== "Spectroscopy Lab" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== SPECTROSCOPY_MODEL_VERSION ||
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
    value.supported_modes.length !== SPECTROSCOPY_MODES.length ||
    !value.supported_modes.every((mode, index) => mode === SPECTROSCOPY_MODES[index]) ||
    value.supported_elements.length !== SPECTROSCOPY_ELEMENTS.length ||
    !value.supported_elements.every((element, index) => element === SPECTROSCOPY_ELEMENTS[index]) ||
    value.constants.WAVELENGTH_START_NM !== SPECTROSCOPY_LIMITS.wavelengthStartNm ||
    value.constants.WAVELENGTH_END_NM !== SPECTROSCOPY_LIMITS.wavelengthEndNm ||
    value.constants.SPECTRUM_POINT_COUNT !== SPECTROSCOPY_LIMITS.spectrumPointCount ||
    value.line_selection_policy.wavelength_medium !== "vacuum"
  ) {
    failArtifact();
  }
  for (const line of value.representative_lines) {
    if (
      !isRecord(line) ||
      !isElement(line.element) ||
      !nonEmptyString(line.label) ||
      !finite(line.observed_vacuum_wavelength_nm) ||
      line.observed_vacuum_wavelength_nm < SPECTROSCOPY_LIMITS.wavelengthStartNm ||
      line.observed_vacuum_wavelength_nm > SPECTROSCOPY_LIMITS.wavelengthEndNm ||
      !nonEmptyString(line.nist_relative_intensity)
    ) {
      failArtifact();
    }
  }
  const defaultPreset = value.presets["solar-like-absorption"];
  if (
    !isRecord(defaultPreset) ||
    validateSpectroscopyState({
      version: SPECTROSCOPY_SHARE_SCHEMA_VERSION,
      model_version: SPECTROSCOPY_MODEL_VERSION,
      ...defaultPreset,
    }) === null
  ) {
    failArtifact();
  }
}

validateSpectroscopyArtifact(rawSpectroscopyArtifact);
const SPECTROSCOPY_ARTIFACT = rawSpectroscopyArtifact as SpectroscopyArtifact;

export const SPECTROSCOPY_DEFINITION = SPECTROSCOPY_ARTIFACT.definition;
export const SPECTROSCOPY_SOURCES = SPECTROSCOPY_ARTIFACT.sources;
export const SPECTROSCOPY_CONSTANTS = SPECTROSCOPY_ARTIFACT.constants;
export const SPECTROSCOPY_REPRESENTATIVE_LINES = SPECTROSCOPY_ARTIFACT.representative_lines;
export const SPECTROSCOPY_PRESETS = SPECTROSCOPY_ARTIFACT.presets;

const defaultPreset = SPECTROSCOPY_PRESETS["solar-like-absorption"]!;
const defaultState = validateSpectroscopyState({
  version: SPECTROSCOPY_SHARE_SCHEMA_VERSION,
  model_version: SPECTROSCOPY_MODEL_VERSION,
  ...defaultPreset,
});
if (defaultState === null) failArtifact();
export const DEFAULT_SPECTROSCOPY_STATE = defaultState;
