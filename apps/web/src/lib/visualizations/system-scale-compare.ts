import compareArtifact from "../../../../../data/seed/system-scale-compare-v1.json";

export const SYSTEM_COMPARE_MODEL_VERSION = "system-scale-compare-v1" as const;
export const SYSTEM_COMPARE_SCHEMA_VERSION = 1 as const;
export const SYSTEM_COMPARE_ARTIFACT_VERSION = 1 as const;

export type SystemCompareKind =
  "solar-mean-distance" | "exoplanet-semimajor-axis" | "voyager-radius";
export type SystemCompareScaleMode = "log" | "linear";

export type SystemCompareItem = Readonly<{
  id: string;
  kind: SystemCompareKind;
  group_label: string;
  name: string;
  value_au: number;
  quantity_label: string;
  semantic_note: string;
  source: Readonly<{ label: string; url: string }>;
  detail_href: string;
  epoch_tdb?: string;
  linear_position_percent: number;
  log_position_percent: number;
  earth_reference_ratio: number;
}>;

type SystemCompareArtifact = Readonly<{
  artifact_version: typeof SYSTEM_COMPARE_ARTIFACT_VERSION;
  model_version: typeof SYSTEM_COMPARE_MODEL_VERSION;
  schema_version: typeof SYSTEM_COMPARE_SCHEMA_VERSION;
  generated_at: string;
  definition: Readonly<{
    slug: "system-scale-compare";
    title: "System Scale Compare";
    content_type: "interactive-reference-model";
    status: "ready";
    version: 1;
    reviewed_at: string;
    model_version: typeof SYSTEM_COMPARE_MODEL_VERSION;
    shared_domain_au: Readonly<{ minimum: number; maximum: number }>;
    default_item_ids: ReadonlyArray<string>;
    assumptions: ReadonlyArray<string>;
    limitations: ReadonlyArray<string>;
  }>;
  items: ReadonlyArray<SystemCompareItem>;
}>;

function fail(): never {
  throw new Error("SYSTEM_SCALE_COMPARE_ARTIFACT_INVALID");
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function sourceUrlAllowed(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["science.nasa.gov", "ui.adsabs.harvard.edu", "ssd-api.jpl.nasa.gov"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function validateArtifact(value: unknown): SystemCompareArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const artifact = value as Partial<SystemCompareArtifact>;
  if (
    artifact.artifact_version !== SYSTEM_COMPARE_ARTIFACT_VERSION ||
    artifact.model_version !== SYSTEM_COMPARE_MODEL_VERSION ||
    artifact.schema_version !== SYSTEM_COMPARE_SCHEMA_VERSION ||
    artifact.definition?.slug !== "system-scale-compare" ||
    artifact.definition.model_version !== SYSTEM_COMPARE_MODEL_VERSION ||
    artifact.definition.default_item_ids.length !== 3 ||
    !Array.isArray(artifact.items) ||
    artifact.items.length !== 68
  ) {
    fail();
  }

  const ids = new Set<string>();
  for (const item of artifact.items) {
    if (
      !item.id ||
      ids.has(item.id) ||
      !["solar-mean-distance", "exoplanet-semimajor-axis", "voyager-radius"].includes(item.kind) ||
      !item.name ||
      !item.quantity_label ||
      !item.semantic_note ||
      !finitePositive(item.value_au) ||
      !finitePositive(item.earth_reference_ratio) ||
      !Number.isFinite(item.linear_position_percent) ||
      !Number.isFinite(item.log_position_percent) ||
      item.linear_position_percent <= 0 ||
      item.linear_position_percent > 100 ||
      item.log_position_percent < 0 ||
      item.log_position_percent > 100 ||
      !sourceUrlAllowed(item.source.url) ||
      !item.source.label ||
      ![
        "/explore/solar-system",
        "/explore/exoplanet-systems",
        "/explore/missions/voyager-1",
      ].includes(item.detail_href)
    ) {
      fail();
    }
    ids.add(item.id);
  }
  for (const defaultId of artifact.definition.default_item_ids) {
    if (!ids.has(defaultId)) fail();
  }
  return artifact as SystemCompareArtifact;
}

export const SYSTEM_COMPARE_ARTIFACT = validateArtifact(compareArtifact);
export const SYSTEM_COMPARE_DEFINITION = SYSTEM_COMPARE_ARTIFACT.definition;
export const SYSTEM_COMPARE_ITEMS = SYSTEM_COMPARE_ARTIFACT.items;
export const SYSTEM_COMPARE_SOLAR_ITEMS = SYSTEM_COMPARE_ITEMS.filter(
  (item) => item.kind === "solar-mean-distance",
);
export const SYSTEM_COMPARE_EXOPLANET_ITEMS = SYSTEM_COMPARE_ITEMS.filter(
  (item) => item.kind === "exoplanet-semimajor-axis",
);
export const SYSTEM_COMPARE_VOYAGER_ITEMS = SYSTEM_COMPARE_ITEMS.filter(
  (item) => item.kind === "voyager-radius",
);

export function systemCompareItemById(id: string): SystemCompareItem | null {
  return SYSTEM_COMPARE_ITEMS.find((item) => item.id === id) ?? null;
}

export function systemComparePosition(
  item: SystemCompareItem,
  mode: SystemCompareScaleMode,
): number {
  return mode === "linear" ? item.linear_position_percent : item.log_position_percent;
}
