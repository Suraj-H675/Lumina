import solarSystemArtifact from "../../../../../data/seed/solar-system-distance-v1.json";

export const SOLAR_SYSTEM_MODEL_VERSION = "solar-system-distance-v1" as const;
export const SOLAR_SYSTEM_SCHEMA_VERSION = 1 as const;
export const SOLAR_SYSTEM_ARTIFACT_VERSION = 1 as const;

export const SOLAR_SYSTEM_BODY_IDS = [
  "sun",
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
] as const;

export type SolarSystemBodyId = (typeof SOLAR_SYSTEM_BODY_IDS)[number];
export type SolarSystemScaleMode = "log" | "linear";
export type SolarSystemBodyKind = "star" | "terrestrial" | "giant";

export type SolarSystemSource = Readonly<{
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
  source_type: "official-agency";
}>;

export type SolarSystemBody = Readonly<{
  id: SolarSystemBodyId;
  name: string;
  kind: SolarSystemBodyKind;
  mean_distance_au: number;
  light_time_value: number;
  light_time_unit: "minutes" | "hours";
  linear_position_percent: number;
  log_position_percent: number | null;
  earth_distance_ratio: number;
  scale_explorer_node_id: SolarSystemBodyId;
  source_ids: ReadonlyArray<string>;
}>;

type SolarSystemArtifact = Readonly<{
  artifact_version: typeof SOLAR_SYSTEM_ARTIFACT_VERSION;
  model_version: typeof SOLAR_SYSTEM_MODEL_VERSION;
  schema_version: typeof SOLAR_SYSTEM_SCHEMA_VERSION;
  generated_at: string;
  definition: Readonly<{
    slug: "solar-system-distance-explorer";
    title: "Solar System Distance Explorer";
    content_type: "interactive-reference-model";
    status: "ready";
    version: 1;
    reviewed_at: string;
    model_version: typeof SOLAR_SYSTEM_MODEL_VERSION;
    default_scale: "log";
    calculation: Readonly<{ log_distance: string; linear_distance: string }>;
    assumptions: ReadonlyArray<string>;
    limitations: ReadonlyArray<string>;
    references: ReadonlyArray<string>;
  }>;
  sources: ReadonlyArray<SolarSystemSource>;
  bodies: ReadonlyArray<SolarSystemBody>;
}>;

function fail(): never {
  throw new Error("SOLAR_SYSTEM_DISTANCE_ARTIFACT_INVALID");
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateArtifact(value: unknown): SolarSystemArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const artifact = value as Partial<SolarSystemArtifact>;
  if (
    artifact.artifact_version !== SOLAR_SYSTEM_ARTIFACT_VERSION ||
    artifact.model_version !== SOLAR_SYSTEM_MODEL_VERSION ||
    artifact.schema_version !== SOLAR_SYSTEM_SCHEMA_VERSION ||
    artifact.definition?.slug !== "solar-system-distance-explorer" ||
    artifact.definition.model_version !== SOLAR_SYSTEM_MODEL_VERSION ||
    artifact.definition.default_scale !== "log" ||
    !Array.isArray(artifact.sources) ||
    !Array.isArray(artifact.bodies) ||
    artifact.bodies.length !== SOLAR_SYSTEM_BODY_IDS.length
  ) {
    fail();
  }

  for (const [index, body] of artifact.bodies.entries()) {
    if (
      body.id !== SOLAR_SYSTEM_BODY_IDS[index] ||
      !body.name ||
      !["star", "terrestrial", "giant"].includes(body.kind) ||
      !finite(body.mean_distance_au) ||
      !finite(body.light_time_value) ||
      !finite(body.linear_position_percent) ||
      !finite(body.earth_distance_ratio) ||
      body.scale_explorer_node_id !== body.id ||
      body.linear_position_percent < 0 ||
      body.linear_position_percent > 100 ||
      (body.id === "sun"
        ? body.log_position_percent !== null || body.mean_distance_au !== 0
        : !finite(body.log_position_percent) ||
          body.log_position_percent < 0 ||
          body.log_position_percent > 100 ||
          body.mean_distance_au <= 0)
    ) {
      fail();
    }
  }

  for (const source of artifact.sources) {
    if (
      !source.id ||
      !source.title ||
      !source.url.startsWith("https://science.nasa.gov/") ||
      !source.citation ||
      !source.claim_scope
    ) {
      fail();
    }
  }
  return artifact as SolarSystemArtifact;
}

export const SOLAR_SYSTEM_ARTIFACT = validateArtifact(solarSystemArtifact);
export const SOLAR_SYSTEM_BODIES = SOLAR_SYSTEM_ARTIFACT.bodies;
export const SOLAR_SYSTEM_PLANETS = SOLAR_SYSTEM_BODIES.slice(1);
export const SOLAR_SYSTEM_SOURCES = SOLAR_SYSTEM_ARTIFACT.sources;
export const SOLAR_SYSTEM_DEFINITION = SOLAR_SYSTEM_ARTIFACT.definition;

export function solarSystemBodyById(id: string): SolarSystemBody | null {
  return SOLAR_SYSTEM_BODIES.find((body) => body.id === id) ?? null;
}

export function solarSystemPosition(
  body: SolarSystemBody,
  mode: SolarSystemScaleMode,
): number | null {
  return mode === "linear" ? body.linear_position_percent : body.log_position_percent;
}
