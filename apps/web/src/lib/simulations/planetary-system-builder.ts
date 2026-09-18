import {
  planetarySystemBuilderEndpoint,
  validateExactGenerated,
  type PlanetarySystemBuilderCalculationResponse,
} from "@lumina/api-client";

import rawBuilderArtifact from "../../../../../data/seed/planetary-system-builder-v1.json";

export const PLANETARY_SYSTEM_BUILDER_MODEL_VERSION = "planetary-system-builder-v1" as const;
export const PLANETARY_SYSTEM_BUILDER_SCHEMA_VERSION = 1 as const;
export const PLANETARY_SYSTEM_BUILDER_ARTIFACT_VERSION = 1 as const;
export const PLANETARY_SYSTEM_BUILDER_SHARE_SCHEMA_VERSION = 1 as const;
export const PLANETARY_SYSTEM_BUILDER_SHARE_STATE_MAX_CHARS = 4096;

export const PLANETARY_SYSTEM_BUILDER_LIMITS = {
  minStellarMassMsun: 0.1,
  maxStellarMassMsun: 2,
  minStellarLuminosityLsun: 0.001,
  maxStellarLuminosityLsun: 20,
  minStellarEffectiveTemperatureK: 2600,
  maxStellarEffectiveTemperatureK: 7200,
  minPlanetCount: 1,
  maxPlanetCount: 8,
  minPlanetMassMearth: 0.01,
  maxPlanetMassMearth: 320,
  minSemiMajorAxisAu: 0.01,
  maxSemiMajorAxisAu: 20,
} as const;

export type PlanetarySystemBuilderPlanetState = Readonly<{
  mass_mearth: number;
  semi_major_axis_au: number;
}>;

export type PlanetarySystemBuilderState = Readonly<{
  version: typeof PLANETARY_SYSTEM_BUILDER_SHARE_SCHEMA_VERSION;
  model_version: typeof PLANETARY_SYSTEM_BUILDER_MODEL_VERSION;
  stellar_mass_msun: number;
  stellar_luminosity_lsun: number;
  stellar_effective_temperature_k: number;
  planets: ReadonlyArray<PlanetarySystemBuilderPlanetState>;
}>;

export type PlanetarySystemBuilderSource = Readonly<{
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

type PlanetarySystemBuilderDefinition = Readonly<{
  slug: "planetary-system-builder";
  title: "Planetary System Builder";
  content_type: "interactive-simulation";
  language: "en";
  status: "ready";
  version: 1;
  share_schema_version: 1;
  model_version: typeof PLANETARY_SYSTEM_BUILDER_MODEL_VERSION;
  learning_objectives: ReadonlyArray<string>;
  prerequisite_concepts: ReadonlyArray<string>;
  input_schema: Readonly<Record<string, unknown>>;
  output_schema: ReadonlyArray<string>;
  equations: Readonly<Record<string, string>>;
  sampling_policy: string;
  default_preset: string;
  assumptions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  references: ReadonlyArray<string>;
  validation_fixtures: ReadonlyArray<string>;
}>;

type PlanetarySystemBuilderArtifact = Readonly<{
  artifact_version: 1;
  model_version: typeof PLANETARY_SYSTEM_BUILDER_MODEL_VERSION;
  schema_version: 1;
  share_schema_version: 1;
  generated_at: string;
  definition: PlanetarySystemBuilderDefinition;
  sources: ReadonlyArray<PlanetarySystemBuilderSource>;
  constants: Readonly<Record<string, string | number>>;
  presets: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  validation_fixtures: ReadonlyArray<Readonly<Record<string, unknown>>>;
  scientific_validation: Readonly<Record<string, unknown>>;
}>;

const STATE_KEYS = [
  "version",
  "model_version",
  "stellar_mass_msun",
  "stellar_luminosity_lsun",
  "stellar_effective_temperature_k",
  "planets",
] as const;
const PLANET_KEYS = ["mass_mearth", "semi_major_axis_au"] as const;
const EXPECTED_SOURCE_IDS = new Set([
  "murray-correia-2010-keplerian-orbits",
  "kopparapu-2014-habitable-zone",
  "iau-2015-resolution-b3",
  "fabrycky-2014-kepler-architecture",
]);

export class PlanetarySystemBuilderStateValidationError extends Error {
  readonly code = "PLANETARY_SYSTEM_BUILDER_STATE_INVALID";
  constructor() {
    super("PLANETARY_SYSTEM_BUILDER_STATE_INVALID");
    this.name = "PlanetarySystemBuilderStateValidationError";
  }
}

export class PlanetarySystemBuilderArtifactValidationError extends Error {
  readonly code = "PLANETARY_SYSTEM_BUILDER_ARTIFACT_INVALID";
  constructor() {
    super("PLANETARY_SYSTEM_BUILDER_ARTIFACT_INVALID");
    this.name = "PlanetarySystemBuilderArtifactValidationError";
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

function validatePlanetState(value: unknown): PlanetarySystemBuilderPlanetState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, PLANET_KEYS)) return null;
  if (
    !inRange(
      value.mass_mearth,
      PLANETARY_SYSTEM_BUILDER_LIMITS.minPlanetMassMearth,
      PLANETARY_SYSTEM_BUILDER_LIMITS.maxPlanetMassMearth,
    ) ||
    !inRange(
      value.semi_major_axis_au,
      PLANETARY_SYSTEM_BUILDER_LIMITS.minSemiMajorAxisAu,
      PLANETARY_SYSTEM_BUILDER_LIMITS.maxSemiMajorAxisAu,
    )
  ) {
    return null;
  }
  return { mass_mearth: value.mass_mearth, semi_major_axis_au: value.semi_major_axis_au };
}

export function validatePlanetarySystemBuilderState(
  value: unknown,
): PlanetarySystemBuilderState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STATE_KEYS)) return null;
  if (
    value.version !== PLANETARY_SYSTEM_BUILDER_SHARE_SCHEMA_VERSION ||
    value.model_version !== PLANETARY_SYSTEM_BUILDER_MODEL_VERSION ||
    !inRange(
      value.stellar_mass_msun,
      PLANETARY_SYSTEM_BUILDER_LIMITS.minStellarMassMsun,
      PLANETARY_SYSTEM_BUILDER_LIMITS.maxStellarMassMsun,
    ) ||
    !inRange(
      value.stellar_luminosity_lsun,
      PLANETARY_SYSTEM_BUILDER_LIMITS.minStellarLuminosityLsun,
      PLANETARY_SYSTEM_BUILDER_LIMITS.maxStellarLuminosityLsun,
    ) ||
    !inRange(
      value.stellar_effective_temperature_k,
      PLANETARY_SYSTEM_BUILDER_LIMITS.minStellarEffectiveTemperatureK,
      PLANETARY_SYSTEM_BUILDER_LIMITS.maxStellarEffectiveTemperatureK,
    ) ||
    !Array.isArray(value.planets) ||
    value.planets.length < PLANETARY_SYSTEM_BUILDER_LIMITS.minPlanetCount ||
    value.planets.length > PLANETARY_SYSTEM_BUILDER_LIMITS.maxPlanetCount
  ) {
    return null;
  }
  const planets = value.planets.map(validatePlanetState);
  if (planets.some((planet) => planet === null)) return null;
  const accepted = planets as PlanetarySystemBuilderPlanetState[];
  if (
    accepted.some(
      (planet, index) =>
        index > 0 && planet.semi_major_axis_au <= accepted[index - 1]!.semi_major_axis_au,
    )
  ) {
    return null;
  }
  return {
    version: PLANETARY_SYSTEM_BUILDER_SHARE_SCHEMA_VERSION,
    model_version: PLANETARY_SYSTEM_BUILDER_MODEL_VERSION,
    stellar_mass_msun: value.stellar_mass_msun,
    stellar_luminosity_lsun: value.stellar_luminosity_lsun,
    stellar_effective_temperature_k: value.stellar_effective_temperature_k,
    planets: accepted.map((planet) => ({ ...planet })),
  };
}

export function encodePlanetarySystemBuilderState(value: unknown): string {
  const state = validatePlanetarySystemBuilderState(value);
  if (state === null) throw new PlanetarySystemBuilderStateValidationError();
  return JSON.stringify(state);
}

export function decodePlanetarySystemBuilderState(
  value: unknown,
): PlanetarySystemBuilderState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > PLANETARY_SYSTEM_BUILDER_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validatePlanetarySystemBuilderState(decoded);
    return state !== null && encodePlanetarySystemBuilderState(state) === value ? state : null;
  } catch {
    return null;
  }
}

export function planetarySystemBuilderRequestEndpoint(state: PlanetarySystemBuilderState) {
  const query = new URLSearchParams();
  query.append("stellar_mass_msun", String(state.stellar_mass_msun));
  query.append("stellar_luminosity_lsun", String(state.stellar_luminosity_lsun));
  query.append("stellar_effective_temperature_k", String(state.stellar_effective_temperature_k));
  state.planets.forEach((planet) => query.append("planet_mass_mearth", String(planet.mass_mearth)));
  state.planets.forEach((planet) =>
    query.append("semi_major_axis_au", String(planet.semi_major_axis_au)),
  );
  return {
    ...planetarySystemBuilderEndpoint,
    path: `${planetarySystemBuilderEndpoint.path}?${query}`,
  };
}

function samePlanets(
  left: ReadonlyArray<Readonly<{ mass_mearth: number; semi_major_axis_au: number }>>,
  right: ReadonlyArray<Readonly<{ mass_mearth: number; semi_major_axis_au: number }>>,
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (planet, index) =>
        planet.mass_mearth === right[index]?.mass_mearth &&
        planet.semi_major_axis_au === right[index]?.semi_major_axis_au,
    )
  );
}

export function validatePlanetarySystemBuilderCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): PlanetarySystemBuilderCalculationResponse | null {
  const state = validatePlanetarySystemBuilderState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(planetarySystemBuilderEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== PLANETARY_SYSTEM_BUILDER_MODEL_VERSION ||
    result.schema_version !== PLANETARY_SYSTEM_BUILDER_SCHEMA_VERSION ||
    result.inputs.stellar_mass_msun !== state.stellar_mass_msun ||
    result.inputs.stellar_luminosity_lsun !== state.stellar_luminosity_lsun ||
    result.inputs.stellar_effective_temperature_k !== state.stellar_effective_temperature_k ||
    !samePlanets(result.inputs.planets, state.planets) ||
    result.habitable_zone.model_id !== "kopparapu-2014-1earth-conservative" ||
    !finite(result.habitable_zone.inner_edge_au) ||
    !finite(result.habitable_zone.outer_edge_au) ||
    result.habitable_zone.inner_edge_au <= 0 ||
    result.habitable_zone.outer_edge_au <= result.habitable_zone.inner_edge_au ||
    !finite(result.habitable_zone.inner_effective_flux) ||
    !finite(result.habitable_zone.outer_effective_flux) ||
    result.habitable_zone.inner_effective_flux <= 0 ||
    result.habitable_zone.outer_effective_flux <= 0 ||
    !nonEmptyString(result.habitable_zone.habitability_note) ||
    !result.habitable_zone.habitability_note.includes("does not establish habitability or life") ||
    result.planets.length !== state.planets.length ||
    result.planets.some(
      (planet, index) =>
        planet.index !== index + 1 ||
        planet.mass_mearth !== state.planets[index]?.mass_mearth ||
        planet.semi_major_axis_au !== state.planets[index]?.semi_major_axis_au ||
        !finite(planet.orbital_period_s) ||
        planet.orbital_period_s <= 0 ||
        !finite(planet.orbital_period_days) ||
        planet.orbital_period_days <= 0,
    ) ||
    result.adjacent_pairs.length !== Math.max(0, state.planets.length - 1) ||
    result.adjacent_pairs.some(
      (pair, index) =>
        pair.inner_index !== index + 1 ||
        pair.outer_index !== index + 2 ||
        !finite(pair.mutual_hill_radius_au) ||
        pair.mutual_hill_radius_au <= 0 ||
        !finite(pair.separation_mutual_hill) ||
        pair.separation_mutual_hill <= 0 ||
        !finite(pair.pairwise_reference_threshold) ||
        pair.pairwise_reference_threshold <= 0 ||
        !nonEmptyString(pair.interpretation),
    ) ||
    !nonEmptyString(result.stellar_consistency_note) ||
    !nonEmptyString(result.stability_note) ||
    !result.stability_note.includes("no long-term multi-planet stability claim")
  ) {
    return null;
  }
  return result;
}

function failArtifact(): never {
  throw new PlanetarySystemBuilderArtifactValidationError();
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

export function validatePlanetarySystemBuilderArtifact(
  value: unknown,
): asserts value is PlanetarySystemBuilderArtifact {
  if (!isRecord(value)) failArtifact();
  if (
    value.artifact_version !== PLANETARY_SYSTEM_BUILDER_ARTIFACT_VERSION ||
    value.model_version !== PLANETARY_SYSTEM_BUILDER_MODEL_VERSION ||
    value.schema_version !== PLANETARY_SYSTEM_BUILDER_SCHEMA_VERSION ||
    value.share_schema_version !== PLANETARY_SYSTEM_BUILDER_SHARE_SCHEMA_VERSION ||
    !nonEmptyString(value.generated_at) ||
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
    definition.slug !== "planetary-system-builder" ||
    definition.title !== "Planetary System Builder" ||
    definition.content_type !== "interactive-simulation" ||
    definition.language !== "en" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.share_schema_version !== 1 ||
    definition.model_version !== PLANETARY_SYSTEM_BUILDER_MODEL_VERSION ||
    !Array.isArray(definition.learning_objectives) ||
    !Array.isArray(definition.prerequisite_concepts) ||
    !isRecord(definition.input_schema) ||
    !Array.isArray(definition.output_schema) ||
    !isRecord(definition.equations) ||
    !nonEmptyString(definition.sampling_policy) ||
    !nonEmptyString(definition.default_preset) ||
    !Array.isArray(definition.assumptions) ||
    !Array.isArray(definition.limitations) ||
    !Array.isArray(definition.references) ||
    !Array.isArray(definition.validation_fixtures)
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
    constants.MIN_STELLAR_MASS_MSUN !== PLANETARY_SYSTEM_BUILDER_LIMITS.minStellarMassMsun ||
    constants.MAX_STELLAR_MASS_MSUN !== PLANETARY_SYSTEM_BUILDER_LIMITS.maxStellarMassMsun ||
    constants.MIN_STELLAR_LUMINOSITY_LSUN !==
      PLANETARY_SYSTEM_BUILDER_LIMITS.minStellarLuminosityLsun ||
    constants.MAX_STELLAR_LUMINOSITY_LSUN !==
      PLANETARY_SYSTEM_BUILDER_LIMITS.maxStellarLuminosityLsun ||
    constants.MIN_STELLAR_EFFECTIVE_TEMPERATURE_K !==
      PLANETARY_SYSTEM_BUILDER_LIMITS.minStellarEffectiveTemperatureK ||
    constants.MAX_STELLAR_EFFECTIVE_TEMPERATURE_K !==
      PLANETARY_SYSTEM_BUILDER_LIMITS.maxStellarEffectiveTemperatureK ||
    constants.MIN_PLANET_COUNT !== PLANETARY_SYSTEM_BUILDER_LIMITS.minPlanetCount ||
    constants.MAX_PLANET_COUNT !== PLANETARY_SYSTEM_BUILDER_LIMITS.maxPlanetCount ||
    constants.MIN_PLANET_MASS_MEARTH !== PLANETARY_SYSTEM_BUILDER_LIMITS.minPlanetMassMearth ||
    constants.MAX_PLANET_MASS_MEARTH !== PLANETARY_SYSTEM_BUILDER_LIMITS.maxPlanetMassMearth ||
    constants.MIN_SEMI_MAJOR_AXIS_AU !== PLANETARY_SYSTEM_BUILDER_LIMITS.minSemiMajorAxisAu ||
    constants.MAX_SEMI_MAJOR_AXIS_AU !== PLANETARY_SYSTEM_BUILDER_LIMITS.maxSemiMajorAxisAu
  ) {
    failArtifact();
  }
  const defaultPreset = value.presets["illustrative-three-planet"];
  if (
    !isRecord(defaultPreset) ||
    validatePlanetarySystemBuilderState({
      version: PLANETARY_SYSTEM_BUILDER_SHARE_SCHEMA_VERSION,
      model_version: PLANETARY_SYSTEM_BUILDER_MODEL_VERSION,
      ...defaultPreset,
    }) === null
  ) {
    failArtifact();
  }
}

validatePlanetarySystemBuilderArtifact(rawBuilderArtifact);
const PLANETARY_SYSTEM_BUILDER_ARTIFACT = rawBuilderArtifact as PlanetarySystemBuilderArtifact;

export const PLANETARY_SYSTEM_BUILDER_DEFINITION = PLANETARY_SYSTEM_BUILDER_ARTIFACT.definition;
export const PLANETARY_SYSTEM_BUILDER_SOURCES = PLANETARY_SYSTEM_BUILDER_ARTIFACT.sources;
export const PLANETARY_SYSTEM_BUILDER_CONSTANTS = PLANETARY_SYSTEM_BUILDER_ARTIFACT.constants;
export const PLANETARY_SYSTEM_BUILDER_PRESETS = PLANETARY_SYSTEM_BUILDER_ARTIFACT.presets;

const defaultPreset = PLANETARY_SYSTEM_BUILDER_PRESETS["illustrative-three-planet"]!;
const defaultState = validatePlanetarySystemBuilderState({
  version: PLANETARY_SYSTEM_BUILDER_SHARE_SCHEMA_VERSION,
  model_version: PLANETARY_SYSTEM_BUILDER_MODEL_VERSION,
  ...defaultPreset,
});
if (defaultState === null) failArtifact();
export const DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE = defaultState;
