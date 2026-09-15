import voyagerArtifact from "../../../../../data/seed/voyager-1-trajectory-v1.json";

export const VOYAGER_MODEL_VERSION = "voyager-1-trajectory-v1" as const;
export const VOYAGER_SCHEMA_VERSION = 1 as const;
export const VOYAGER_ARTIFACT_VERSION = 1 as const;

export type VoyagerSource = Readonly<{
  id: string;
  title: string;
  organization_or_authors: string;
  url: string;
  accessed_at: string;
  claim_scope: string;
}>;

export type VoyagerMilestone = Readonly<{
  date: string;
  title: string;
  detail: string;
  source_id: string;
}>;

export type VoyagerTrajectorySample = Readonly<{
  jd_tdb: number;
  epoch_tdb: string;
  x_au: number;
  y_au: number;
  z_au: number;
  radius_au: number;
}>;

type VoyagerArtifact = Readonly<{
  artifact_version: typeof VOYAGER_ARTIFACT_VERSION;
  model_version: typeof VOYAGER_MODEL_VERSION;
  schema_version: typeof VOYAGER_SCHEMA_VERSION;
  generated_at: string;
  definition: Readonly<{
    slug: "voyager-1-mission-trajectory";
    title: "Voyager 1 Mission Timeline and Trajectory";
    content_type: "interactive-reference-model";
    status: "ready";
    version: 1;
    reviewed_at: string;
    model_version: typeof VOYAGER_MODEL_VERSION;
    assumptions: ReadonlyArray<string>;
    limitations: ReadonlyArray<string>;
  }>;
  sources: ReadonlyArray<VoyagerSource>;
  raw_snapshot: Readonly<{
    path: string;
    sha256: string;
    bytes: number;
    retrieved_at: string;
    provider: "NASA/JPL Horizons API";
    target_id: "-31";
    center: "Sun (10)";
    reference_frame: "Ecliptic of J2000.0";
    output_units: "AU-D";
    output_type: "GEOMETRIC cartesian states";
    sample_step: "1 calendar year";
    start_tdb: string;
    stop_request_tdb: string;
    last_sample_tdb: string;
    api_documentation_url: string;
  }>;
  milestones: ReadonlyArray<VoyagerMilestone>;
  trajectory_samples: ReadonlyArray<VoyagerTrajectorySample>;
}>;

function fail(): never {
  throw new Error("VOYAGER_1_ARTIFACT_INVALID");
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeHttpsHost(urlText: string, host: string): boolean {
  try {
    const url = new URL(urlText);
    return url.protocol === "https:" && url.hostname === host;
  } catch {
    return false;
  }
}

function validateArtifact(value: unknown): VoyagerArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const artifact = value as Partial<VoyagerArtifact>;
  if (
    artifact.artifact_version !== VOYAGER_ARTIFACT_VERSION ||
    artifact.model_version !== VOYAGER_MODEL_VERSION ||
    artifact.schema_version !== VOYAGER_SCHEMA_VERSION ||
    artifact.definition?.slug !== "voyager-1-mission-trajectory" ||
    artifact.definition.model_version !== VOYAGER_MODEL_VERSION ||
    artifact.raw_snapshot?.provider !== "NASA/JPL Horizons API" ||
    artifact.raw_snapshot.target_id !== "-31" ||
    artifact.raw_snapshot.center !== "Sun (10)" ||
    artifact.raw_snapshot.reference_frame !== "Ecliptic of J2000.0" ||
    artifact.raw_snapshot.output_units !== "AU-D" ||
    !artifact.raw_snapshot.sha256.match(/^[0-9a-f]{64}$/u) ||
    !Array.isArray(artifact.sources) ||
    !Array.isArray(artifact.milestones) ||
    artifact.milestones.length !== 8 ||
    !Array.isArray(artifact.trajectory_samples) ||
    artifact.trajectory_samples.length !== 50
  ) {
    fail();
  }

  for (const source of artifact.sources) {
    if (!source.id || !source.title || !source.claim_scope) fail();
    const allowed =
      source.id === "nasa-voyager-1-mission"
        ? safeHttpsHost(source.url, "science.nasa.gov")
        : source.id === "jpl-horizons-api"
          ? safeHttpsHost(source.url, "ssd-api.jpl.nasa.gov")
          : false;
    if (!allowed) fail();
  }

  let previousJd = -Infinity;
  for (const sample of artifact.trajectory_samples) {
    if (
      !finite(sample.jd_tdb) ||
      !sample.epoch_tdb.startsWith("A.D. ") ||
      !finite(sample.x_au) ||
      !finite(sample.y_au) ||
      !finite(sample.z_au) ||
      !finite(sample.radius_au) ||
      sample.radius_au <= 0 ||
      sample.jd_tdb <= previousJd
    ) {
      fail();
    }
    previousJd = sample.jd_tdb;
  }
  return artifact as VoyagerArtifact;
}

export const VOYAGER_ARTIFACT = validateArtifact(voyagerArtifact);
export const VOYAGER_DEFINITION = VOYAGER_ARTIFACT.definition;
export const VOYAGER_SOURCES = VOYAGER_ARTIFACT.sources;
export const VOYAGER_MILESTONES = VOYAGER_ARTIFACT.milestones;
export const VOYAGER_SAMPLES = VOYAGER_ARTIFACT.trajectory_samples;
export const VOYAGER_RAW_SNAPSHOT = VOYAGER_ARTIFACT.raw_snapshot;

export function voyagerSourceById(id: string): VoyagerSource | null {
  return VOYAGER_SOURCES.find((source) => source.id === id) ?? null;
}

export function voyagerSampleYear(sample: VoyagerTrajectorySample): number {
  const match = /A\.D\. (\d{4})-/u.exec(sample.epoch_tdb);
  if (match?.[1] === undefined) fail();
  return Number(match[1]);
}
