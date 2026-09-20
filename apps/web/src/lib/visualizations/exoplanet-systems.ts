import exoplanetArtifact from "../../../../../data/seed/exoplanet-system-layout-v1.json";

export const EXOPLANET_SYSTEM_MODEL_VERSION = "exoplanet-system-layout-v1" as const;
export const EXOPLANET_SYSTEM_SCHEMA_VERSION = 1 as const;
export const EXOPLANET_SYSTEM_ARTIFACT_VERSION = 1 as const;
export const EXOPLANET_ARCHIVE_TAP_NAME = "TAP" as const;
export const EXOPLANET_ARCHIVE_COLUMN_SET_NAME = "PS / PSCompPars" as const;
export const EXOPLANET_COMPOSITE_TABLE_NAME = "PSCompPars" as const;
export const EXOPLANET_DISTANCE_UNIT = "AU" as const;
export const EXOPLANET_PERIOD_UNIT = "days" as const;

export type ExoplanetScaleMode = "log" | "linear";

export type ExoplanetParameterReference = Readonly<{
  text: string;
  url: string;
}>;

export type ExoplanetUncertainty = Readonly<{
  plus: number | null;
  minus: number | null;
}>;

export type ExoplanetLayoutPlanet = Readonly<{
  name: string;
  semimajor_axis_au: number;
  semimajor_axis_uncertainty_au: ExoplanetUncertainty;
  semimajor_axis_reference: ExoplanetParameterReference;
  orbital_period_days: number;
  orbital_period_uncertainty_days: ExoplanetUncertainty;
  orbital_period_reference: ExoplanetParameterReference;
  discovery_year: number;
  discovery_method: string;
  linear_position_percent: number;
  log_position_percent: number;
}>;

export type ExoplanetLayoutSystem = Readonly<{
  archive_hostname: string;
  display_name: string;
  host_slug: string;
  archive_planet_count: number;
  planets: ReadonlyArray<ExoplanetLayoutPlanet>;
}>;

type ExoplanetSystemArtifact = Readonly<{
  artifact_version: typeof EXOPLANET_SYSTEM_ARTIFACT_VERSION;
  model_version: typeof EXOPLANET_SYSTEM_MODEL_VERSION;
  schema_version: typeof EXOPLANET_SYSTEM_SCHEMA_VERSION;
  generated_at: string;
  raw_snapshot: Readonly<{
    path: string;
    sha256: string;
    bytes: number;
    retrieved_at: string;
    provider: "NASA Exoplanet Archive";
    table: "pscomppars";
    tap_endpoint: string;
    query: string;
    documentation_url: string;
    column_documentation_url: string;
  }>;
  definition: Readonly<{
    slug: "exoplanet-system-layout";
    title: "Exoplanet System Layout";
    content_type: "interactive-reference-model";
    status: "ready";
    version: 1;
    reviewed_at: string;
    model_version: typeof EXOPLANET_SYSTEM_MODEL_VERSION;
    default_scale: "log";
    shared_scale_domain_au: Readonly<{ minimum: number; maximum: number }>;
    assumptions: ReadonlyArray<string>;
    limitations: ReadonlyArray<string>;
  }>;
  systems: ReadonlyArray<ExoplanetLayoutSystem>;
}>;

function fail(): never {
  throw new Error("EXOPLANET_SYSTEM_ARTIFACT_INVALID");
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function referenceIsSafe(reference: ExoplanetParameterReference): boolean {
  if (!reference.text) return false;
  try {
    const url = new URL(reference.url);
    return url.protocol === "https:" && url.hostname === "ui.adsabs.harvard.edu";
  } catch {
    return false;
  }
}

function validateArtifact(value: unknown): ExoplanetSystemArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const artifact = value as Partial<ExoplanetSystemArtifact>;
  if (
    artifact.artifact_version !== EXOPLANET_SYSTEM_ARTIFACT_VERSION ||
    artifact.model_version !== EXOPLANET_SYSTEM_MODEL_VERSION ||
    artifact.schema_version !== EXOPLANET_SYSTEM_SCHEMA_VERSION ||
    artifact.definition?.slug !== "exoplanet-system-layout" ||
    artifact.definition.model_version !== EXOPLANET_SYSTEM_MODEL_VERSION ||
    artifact.definition.default_scale !== "log" ||
    artifact.raw_snapshot?.provider !== "NASA Exoplanet Archive" ||
    artifact.raw_snapshot.table !== "pscomppars" ||
    !artifact.raw_snapshot.sha256.match(/^[0-9a-f]{64}$/u) ||
    !Array.isArray(artifact.systems) ||
    artifact.systems.length !== 5
  ) {
    fail();
  }

  let planetCount = 0;
  const hostSlugs = new Set<string>();
  for (const system of artifact.systems) {
    if (
      !system.archive_hostname ||
      !system.display_name ||
      !system.host_slug ||
      !Number.isInteger(system.archive_planet_count) ||
      system.archive_planet_count <= 0 ||
      !Array.isArray(system.planets) ||
      system.planets.length !== system.archive_planet_count ||
      hostSlugs.has(system.host_slug)
    ) {
      fail();
    }
    hostSlugs.add(system.host_slug);
    for (const planet of system.planets) {
      if (
        !planet.name ||
        !finitePositive(planet.semimajor_axis_au) ||
        !finitePositive(planet.orbital_period_days) ||
        !Number.isInteger(planet.discovery_year) ||
        !planet.discovery_method ||
        !referenceIsSafe(planet.semimajor_axis_reference) ||
        !referenceIsSafe(planet.orbital_period_reference) ||
        !Number.isFinite(planet.linear_position_percent) ||
        !Number.isFinite(planet.log_position_percent) ||
        planet.linear_position_percent < 0 ||
        planet.linear_position_percent > 100 ||
        planet.log_position_percent < 0 ||
        planet.log_position_percent > 100
      ) {
        fail();
      }
      planetCount += 1;
    }
  }
  if (planetCount !== 10) fail();
  return artifact as ExoplanetSystemArtifact;
}

export const EXOPLANET_SYSTEM_ARTIFACT = validateArtifact(exoplanetArtifact);
export const EXOPLANET_SYSTEMS = EXOPLANET_SYSTEM_ARTIFACT.systems;
export const EXOPLANET_SYSTEM_DEFINITION = EXOPLANET_SYSTEM_ARTIFACT.definition;
export const EXOPLANET_RAW_SNAPSHOT = EXOPLANET_SYSTEM_ARTIFACT.raw_snapshot;

export function exoplanetSystemBySlug(slug: string): ExoplanetLayoutSystem | null {
  return EXOPLANET_SYSTEMS.find((system) => system.host_slug === slug) ?? null;
}

export function exoplanetPosition(planet: ExoplanetLayoutPlanet, mode: ExoplanetScaleMode): number {
  return mode === "linear" ? planet.linear_position_percent : planet.log_position_percent;
}
