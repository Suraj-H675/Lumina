export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export type SimulationArtifactSource = Readonly<{
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

const SIMULATION_ARTIFACT_SOURCE_KEYS = [
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
] as const satisfies ReadonlyArray<keyof SimulationArtifactSource>;

export function isSimulationArtifactSource(value: unknown): value is SimulationArtifactSource {
  if (!isRecord(value) || !hasOnlyKeys(value, SIMULATION_ARTIFACT_SOURCE_KEYS)) return false;
  if (!SIMULATION_ARTIFACT_SOURCE_KEYS.every((key) => isNonEmptyString(value[key]))) return false;
  try {
    const url = new URL(value.url as string);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

export function hasSimulationArtifactSourceReferences(
  sources: unknown,
  references: unknown,
  expectedSourceIds?: ReadonlySet<string>,
): sources is ReadonlyArray<SimulationArtifactSource> {
  if (
    !Array.isArray(sources) ||
    !sources.every(isSimulationArtifactSource) ||
    !Array.isArray(references)
  ) {
    return false;
  }
  const sourceIds = sources.map((source) => source.id);
  if (new Set(sourceIds).size !== sourceIds.length) return false;
  if (
    expectedSourceIds !== undefined &&
    (sourceIds.length !== expectedSourceIds.size ||
      sourceIds.some((id) => !expectedSourceIds.has(id)))
  ) {
    return false;
  }
  return (
    references.length === sourceIds.length &&
    references.every((id) => typeof id === "string" && sourceIds.includes(id))
  );
}
