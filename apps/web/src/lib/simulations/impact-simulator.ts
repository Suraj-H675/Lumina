import {
  impactSimulatorEndpoint,
  validateExactGenerated,
  type ImpactSimulatorCalculationResponse,
  type ImpactSimulatorInputResponse,
} from "@lumina/api-client";

import rawImpactArtifact from "../../../../../data/seed/impact-simulator-v1.json";

export const IMPACT_SIMULATOR_MODEL_VERSION = "impact-simulator-v1" as const;
export const IMPACT_SIMULATOR_SCHEMA_VERSION = 1 as const;
export const IMPACT_SIMULATOR_ARTIFACT_VERSION = 1 as const;
export const IMPACT_SIMULATOR_SHARE_SCHEMA_VERSION = 1 as const;
export const IMPACT_SIMULATOR_SHARE_STATE_MAX_CHARS = 1024;

export const IMPACT_SIMULATOR_LIMITS = {
  minDiameterM: 1_500,
  maxDiameterM: 20_000,
  minImpactorDensityKgM3: 500,
  maxImpactorDensityKgM3: 8_000,
  minSpeedKmS: 11,
  maxSpeedKmS: 72,
  minImpactAngleDeg: 15,
  maxImpactAngleDeg: 90,
} as const;

export type ImpactSimulatorTargetMaterial =
  ImpactSimulatorCalculationResponse["inputs"]["target_material"];

export type ImpactSimulatorState = Readonly<{
  version: typeof IMPACT_SIMULATOR_SHARE_SCHEMA_VERSION;
  model_version: typeof IMPACT_SIMULATOR_MODEL_VERSION;
  diameter_m: number;
  impactor_density_kg_m3: number;
  speed_km_s: number;
  impact_angle_deg: number;
  target_material: ImpactSimulatorTargetMaterial;
}>;

export type ImpactSimulatorSource = Readonly<{
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

type ImpactSimulatorDefinition = Readonly<{
  slug: "impact-simulator";
  title: "Impact Simulator";
  status: "ready";
  version: 1;
  model_version: typeof IMPACT_SIMULATOR_MODEL_VERSION;
  share_schema_version: 1;
  summary: string;
  assumptions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  equations: ReadonlyArray<
    Readonly<{
      id: string;
      expression: string;
      units?: string;
      source_equation?: string;
    }>
  >;
  references: ReadonlyArray<string>;
}>;

type ImpactSimulatorArtifact = Readonly<{
  artifact_version: 1;
  model_version: typeof IMPACT_SIMULATOR_MODEL_VERSION;
  schema_version: 1;
  share_schema_version: 1;
  generated_at: string;
  definition: ImpactSimulatorDefinition;
  sources: ReadonlyArray<ImpactSimulatorSource>;
  constants: Readonly<Record<string, string | number>>;
  target_materials: ReadonlyArray<Readonly<{ id: string; density_kg_m3: number }>>;
  preset: Readonly<Record<string, unknown>>;
  validation_fixtures: ReadonlyArray<Readonly<Record<string, unknown>>>;
  scientific_validation: Readonly<Record<string, unknown>>;
}>;

const STATE_KEYS = [
  "version",
  "model_version",
  "diameter_m",
  "impactor_density_kg_m3",
  "speed_km_s",
  "impact_angle_deg",
  "target_material",
] as const;
const TARGET_MATERIALS = new Set<ImpactSimulatorTargetMaterial>([
  "sedimentary_rock",
  "crystalline_rock",
]);
const EXPECTED_SOURCE_IDS = new Set([
  "collins-melosh-marcus-2005",
  "impact-earth-current-calculator",
]);

export class ImpactSimulatorStateValidationError extends Error {
  readonly code = "IMPACT_SIMULATOR_STATE_INVALID";
  constructor() {
    super("IMPACT_SIMULATOR_STATE_INVALID");
    this.name = "ImpactSimulatorStateValidationError";
  }
}

export class ImpactSimulatorArtifactValidationError extends Error {
  readonly code = "IMPACT_SIMULATOR_ARTIFACT_INVALID";
  constructor() {
    super("IMPACT_SIMULATOR_ARTIFACT_INVALID");
    this.name = "ImpactSimulatorArtifactValidationError";
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

export function validateImpactSimulatorState(value: unknown): ImpactSimulatorState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STATE_KEYS)) return null;
  if (
    value.version !== IMPACT_SIMULATOR_SHARE_SCHEMA_VERSION ||
    value.model_version !== IMPACT_SIMULATOR_MODEL_VERSION ||
    !inRange(
      value.diameter_m,
      IMPACT_SIMULATOR_LIMITS.minDiameterM,
      IMPACT_SIMULATOR_LIMITS.maxDiameterM,
    ) ||
    !inRange(
      value.impactor_density_kg_m3,
      IMPACT_SIMULATOR_LIMITS.minImpactorDensityKgM3,
      IMPACT_SIMULATOR_LIMITS.maxImpactorDensityKgM3,
    ) ||
    !inRange(
      value.speed_km_s,
      IMPACT_SIMULATOR_LIMITS.minSpeedKmS,
      IMPACT_SIMULATOR_LIMITS.maxSpeedKmS,
    ) ||
    !inRange(
      value.impact_angle_deg,
      IMPACT_SIMULATOR_LIMITS.minImpactAngleDeg,
      IMPACT_SIMULATOR_LIMITS.maxImpactAngleDeg,
    ) ||
    !TARGET_MATERIALS.has(value.target_material as ImpactSimulatorTargetMaterial)
  ) {
    return null;
  }
  return {
    version: IMPACT_SIMULATOR_SHARE_SCHEMA_VERSION,
    model_version: IMPACT_SIMULATOR_MODEL_VERSION,
    diameter_m: value.diameter_m,
    impactor_density_kg_m3: value.impactor_density_kg_m3,
    speed_km_s: value.speed_km_s,
    impact_angle_deg: value.impact_angle_deg,
    target_material: value.target_material as ImpactSimulatorTargetMaterial,
  };
}

export function encodeImpactSimulatorState(value: unknown): string {
  const state = validateImpactSimulatorState(value);
  if (state === null) throw new ImpactSimulatorStateValidationError();
  return JSON.stringify(state);
}

export function decodeImpactSimulatorState(value: unknown): ImpactSimulatorState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > IMPACT_SIMULATOR_SHARE_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    const state = validateImpactSimulatorState(decoded);
    return state !== null && encodeImpactSimulatorState(state) === value ? state : null;
  } catch {
    return null;
  }
}

export function impactSimulatorRequestEndpoint(state: ImpactSimulatorState) {
  const query = new URLSearchParams({
    diameter_m: String(state.diameter_m),
    impactor_density_kg_m3: String(state.impactor_density_kg_m3),
    speed_km_s: String(state.speed_km_s),
    impact_angle_deg: String(state.impact_angle_deg),
    target_material: state.target_material,
  });
  return {
    ...impactSimulatorEndpoint,
    path: `${impactSimulatorEndpoint.path}?${query}`,
  };
}

function sameInputs(returned: ImpactSimulatorInputResponse, state: ImpactSimulatorState): boolean {
  return (
    returned.diameter_m === state.diameter_m &&
    returned.impactor_density_kg_m3 === state.impactor_density_kg_m3 &&
    returned.speed_km_s === state.speed_km_s &&
    returned.impact_angle_deg === state.impact_angle_deg &&
    returned.target_material === state.target_material
  );
}

export function validateImpactSimulatorCalculationResult(
  stateValue: unknown,
  resultValue: unknown,
): ImpactSimulatorCalculationResponse | null {
  const state = validateImpactSimulatorState(stateValue);
  if (state === null) return null;
  const parsed = validateExactGenerated(impactSimulatorEndpoint.validator, resultValue);
  if (!parsed.valid) return null;
  const result = parsed.data;
  if (
    result.model_version !== IMPACT_SIMULATOR_MODEL_VERSION ||
    result.schema_version !== IMPACT_SIMULATOR_SCHEMA_VERSION ||
    !sameInputs(result.inputs, state) ||
    !positive(result.target_density_kg_m3) ||
    !positive(result.impactor_mass_kg) ||
    !positive(result.kinetic_energy_j) ||
    !positive(result.tnt_equivalent_megatons) ||
    result.best_estimate_crater.classification !== "complex" ||
    !positive(result.best_estimate_crater.scaling_coefficient) ||
    !positive(result.best_estimate_crater.transient_diameter_m) ||
    !positive(result.best_estimate_crater.final_diameter_m) ||
    result.coefficient_sensitivity.length !== 3 ||
    result.coefficient_sensitivity.some(
      (row) =>
        row.classification !== "complex" ||
        !positive(row.scaling_coefficient) ||
        !positive(row.transient_diameter_m) ||
        !positive(row.final_diameter_m),
    ) ||
    result.ejecta_thickness_radii.length !== 4 ||
    result.ejecta_thickness_radii.some(
      (row) => !positive(row.thickness_m) || !positive(row.radius_m),
    ) ||
    !nonEmptyString(result.uncertainty_note) ||
    !result.uncertainty_note.includes("not a complete statistical confidence interval") ||
    !nonEmptyString(result.model_note) ||
    !result.model_note.includes("targeting") ||
    !result.model_note.includes("lower-bound")
  ) {
    return null;
  }
  return result;
}

function failArtifact(): never {
  throw new ImpactSimulatorArtifactValidationError();
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

export function validateImpactSimulatorArtifact(
  value: unknown,
): asserts value is ImpactSimulatorArtifact {
  if (!isRecord(value)) failArtifact();
  if (
    value.artifact_version !== IMPACT_SIMULATOR_ARTIFACT_VERSION ||
    value.model_version !== IMPACT_SIMULATOR_MODEL_VERSION ||
    value.schema_version !== IMPACT_SIMULATOR_SCHEMA_VERSION ||
    value.share_schema_version !== IMPACT_SIMULATOR_SHARE_SCHEMA_VERSION ||
    !nonEmptyString(value.generated_at) ||
    !isRecord(value.definition) ||
    !Array.isArray(value.sources) ||
    !isRecord(value.constants) ||
    !Array.isArray(value.target_materials) ||
    !isRecord(value.preset) ||
    !Array.isArray(value.validation_fixtures) ||
    !isRecord(value.scientific_validation)
  ) {
    failArtifact();
  }
  const definition = value.definition;
  if (
    definition.slug !== "impact-simulator" ||
    definition.title !== "Impact Simulator" ||
    definition.status !== "ready" ||
    definition.version !== 1 ||
    definition.model_version !== IMPACT_SIMULATOR_MODEL_VERSION ||
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
        !nonEmptyString(equation.id) ||
        !nonEmptyString(equation.expression) ||
        (equation.units !== undefined && !nonEmptyString(equation.units)) ||
        (equation.source_equation !== undefined && !nonEmptyString(equation.source_equation)),
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
    constants.MIN_DIAMETER_M !== IMPACT_SIMULATOR_LIMITS.minDiameterM ||
    constants.MAX_DIAMETER_M !== IMPACT_SIMULATOR_LIMITS.maxDiameterM ||
    constants.MIN_IMPACTOR_DENSITY_KG_M3 !== IMPACT_SIMULATOR_LIMITS.minImpactorDensityKgM3 ||
    constants.MAX_IMPACTOR_DENSITY_KG_M3 !== IMPACT_SIMULATOR_LIMITS.maxImpactorDensityKgM3 ||
    constants.MIN_SPEED_KM_S !== IMPACT_SIMULATOR_LIMITS.minSpeedKmS ||
    constants.MAX_SPEED_KM_S !== IMPACT_SIMULATOR_LIMITS.maxSpeedKmS ||
    constants.MIN_IMPACT_ANGLE_DEG !== IMPACT_SIMULATOR_LIMITS.minImpactAngleDeg ||
    constants.MAX_IMPACT_ANGLE_DEG !== IMPACT_SIMULATOR_LIMITS.maxImpactAngleDeg
  ) {
    failArtifact();
  }
  if (
    value.target_materials.length !== TARGET_MATERIALS.size ||
    value.target_materials.some(
      (target) =>
        !isRecord(target) ||
        !hasOnlyKeys(target, ["id", "density_kg_m3"]) ||
        !TARGET_MATERIALS.has(target.id as ImpactSimulatorTargetMaterial) ||
        !positive(target.density_kg_m3),
    )
  ) {
    failArtifact();
  }
  if (
    validateImpactSimulatorState({
      version: IMPACT_SIMULATOR_SHARE_SCHEMA_VERSION,
      model_version: IMPACT_SIMULATOR_MODEL_VERSION,
      ...value.preset,
    }) === null
  ) {
    failArtifact();
  }
}

validateImpactSimulatorArtifact(rawImpactArtifact);
const IMPACT_SIMULATOR_ARTIFACT = rawImpactArtifact as ImpactSimulatorArtifact;

export const IMPACT_SIMULATOR_DEFINITION = IMPACT_SIMULATOR_ARTIFACT.definition;
export const IMPACT_SIMULATOR_SOURCES = IMPACT_SIMULATOR_ARTIFACT.sources;
export const IMPACT_SIMULATOR_CONSTANTS = IMPACT_SIMULATOR_ARTIFACT.constants;
export const IMPACT_SIMULATOR_TARGET_MATERIALS = IMPACT_SIMULATOR_ARTIFACT.target_materials;

const defaultState = validateImpactSimulatorState({
  version: IMPACT_SIMULATOR_SHARE_SCHEMA_VERSION,
  model_version: IMPACT_SIMULATOR_MODEL_VERSION,
  ...IMPACT_SIMULATOR_ARTIFACT.preset,
});
if (defaultState === null) failArtifact();
export const DEFAULT_IMPACT_SIMULATOR_STATE = defaultState;
