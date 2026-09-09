import rawHrDiagramArtifact from "../../../../../data/seed/hr-diagram-explorer-v1.json";

export const HR_DIAGRAM_MODEL_VERSION = "hr-diagram-explorer-v1" as const;
export const HR_DIAGRAM_SCHEMA_VERSION = 1 as const;
export const HR_DIAGRAM_ARTIFACT_VERSION = 1 as const;
export const HR_DIAGRAM_SHARE_SCHEMA_VERSION = 1 as const;
export const HR_DIAGRAM_SHARE_STATE_MAX_CHARS = 4_096;
export const HR_DIAGRAM_DATASET_ID = "gaia-dr3-four-cluster-curated-v1" as const;
const HR_DIAGRAM_BROWSER_STAR_FINGERPRINT =
  "sha256:4baaccd98950d1b303d3eec58e82808c6e15a658cb6eaef10a53956346ef4a41";

export const HR_DIAGRAM_VIEWS = ["physical_hr", "gaia_cmd"] as const;
export const HR_DIAGRAM_SPECTRAL_CLASSES = ["O", "B", "A", "F", "G", "K", "M"] as const;
export const HR_DIAGRAM_STAGE_GROUPS = [
  "main_sequence",
  "turnoff_transition",
  "red_giant_branch",
] as const;
export const HR_DIAGRAM_CLUSTERS = ["pleiades", "hyades", "praesepe", "m67"] as const;
export const HR_DIAGRAM_AUDIENCE_MODES = ["explorer", "student", "deep-dive"] as const;

export type HRDiagramView = (typeof HR_DIAGRAM_VIEWS)[number];
export type HRDiagramSpectralClass = (typeof HR_DIAGRAM_SPECTRAL_CLASSES)[number];
export type HRDiagramStageGroup = (typeof HR_DIAGRAM_STAGE_GROUPS)[number];
export type HRDiagramCluster = (typeof HR_DIAGRAM_CLUSTERS)[number];
export type HRDiagramAudienceMode = (typeof HR_DIAGRAM_AUDIENCE_MODES)[number];

const CLUSTER_CATALOGUE_IDS: Readonly<Record<HRDiagramCluster, number>> = {
  pleiades: 4423,
  hyades: 4424,
  praesepe: 4598,
  m67: 4606,
};

const CLUSTER_ACCEPTED_NAMES: Readonly<Record<HRDiagramCluster, string>> = {
  pleiades: "Melotte_22",
  hyades: "Melotte_25",
  praesepe: "NGC_2632",
  m67: "NGC_2682",
};

const EXPECTED_SOURCE_FIELDS = {
  gaia_source: [
    "source_id",
    "designation",
    "phot_g_mean_mag",
    "bp_rp",
    "parallax",
    "parallax_error",
  ],
  astrophysical_parameters: [
    "teff_gspphot",
    "teff_gspphot_lower",
    "teff_gspphot_upper",
    "lum_flame",
    "lum_flame_lower",
    "lum_flame_upper",
    "mg_gspphot",
    "mg_gspphot_lower",
    "mg_gspphot_upper",
    "spectraltype_esphs",
    "flags_esphs",
    "evolstage_flame",
    "flags_flame",
    "ag_gspphot",
    "ag_gspphot_lower",
    "ag_gspphot_upper",
    "ebpminrp_gspphot",
    "ebpminrp_gspphot_lower",
    "ebpminrp_gspphot_upper",
  ],
  cluster_membership: ["ID", "Name", "GaiaDR3", "inrj", "inrt", "Prob"],
} as const;

const EXPECTED_RECORD_PROVENANCE = {
  gaia_source: "gaia-dr3-main-source-catalogue",
  gaia_astrophysical_parameters: "gaia-dr3-astrophysical-parameters",
  cluster_membership: "hunt-reffert-2024-vizier-members",
} as const;

export type HRDiagramState = Readonly<{
  version: typeof HR_DIAGRAM_SHARE_SCHEMA_VERSION;
  model_version: typeof HR_DIAGRAM_MODEL_VERSION;
  view: HRDiagramView;
  selected_star_id: string;
  spectral_classes: ReadonlyArray<HRDiagramSpectralClass>;
  stage_groups: ReadonlyArray<HRDiagramStageGroup>;
  clusters: ReadonlyArray<HRDiagramCluster>;
}>;

export type HRDiagramSource = Readonly<{
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
  source_type: "official-agency" | "official-education" | "catalogue";
}>;

export type HRDiagramMembership = Readonly<{
  catalogue: "Hunt & Reffert 2024";
  catalogue_id: number;
  accepted_name: string;
  inrj: 0 | 1;
  inrt: 0 | 1;
  membership_probability: number;
}>;

export type HRDiagramRecord = Readonly<{
  star_id: string;
  gaia_source_id: string;
  designation: string;
  cluster: HRDiagramCluster;
  cluster_label: string;
  membership: HRDiagramMembership;
  spectral_class: HRDiagramSpectralClass;
  flags_esphs: string;
  evolstage_flame: number;
  flags_flame: string;
  stage_group: HRDiagramStageGroup;
  phot_g_mean_mag: number;
  bp_rp_mag: number;
  parallax_mas: number;
  parallax_error_mas: number;
  teff_k_p16: number;
  teff_k_p50: number;
  teff_k_p84: number;
  luminosity_lsun_p16: number;
  luminosity_lsun_p50: number;
  luminosity_lsun_p84: number;
  mg_gspphot_mag_p16: number;
  mg_gspphot_mag_p50: number;
  mg_gspphot_mag_p84: number;
  ag_gspphot_mag: number | null;
  ag_gspphot_mag_p16: number | null;
  ag_gspphot_mag_p84: number | null;
  ebpminrp_gspphot_mag: number | null;
  ebpminrp_gspphot_mag_p16: number | null;
  ebpminrp_gspphot_mag_p84: number | null;
  source_fields: Readonly<{
    gaia_source: ReadonlyArray<string>;
    astrophysical_parameters: ReadonlyArray<string>;
    cluster_membership: ReadonlyArray<string>;
  }>;
  provenance: Readonly<{
    gaia_source: string;
    gaia_astrophysical_parameters: string;
    cluster_membership: string;
  }>;
}>;

export type HRDiagramDefinition = Readonly<{
  slug: "hr-diagram-explorer";
  title: "H-R Diagram Explorer";
  content_type: "interactive-dataset-explorer";
  language: "en";
  status: "ready";
  version: 1;
  audience_modes: ReadonlyArray<HRDiagramAudienceMode>;
  reviewed_by: ReadonlyArray<string>;
  reviewed_at: string;
  updated_at: string;
  model_version: typeof HR_DIAGRAM_MODEL_VERSION;
  dataset_id: typeof HR_DIAGRAM_DATASET_ID;
  data_release: string;
  learning_objectives: ReadonlyArray<string>;
  prerequisite_concepts: ReadonlyArray<string>;
  source_fields: Readonly<Record<string, ReadonlyArray<string>>>;
  uncertainty_semantics: string;
  default_state: HRDiagramState;
  default_selected_star_id: string;
  views: Readonly<Record<HRDiagramView, Readonly<Record<string, unknown>>>>;
  filters: Readonly<Record<string, unknown>>;
  stage_groups: ReadonlyArray<Readonly<Record<string, unknown>>>;
  selection_method: Readonly<Record<string, unknown>>;
  calculation_module: Readonly<{
    canonical_module: string;
    relationships: ReadonlyArray<string>;
    equations: Readonly<Record<string, string>>;
    valid_domain: string;
    numerical_policy: string;
  }>;
  output_schema: ReadonlyArray<string>;
  visualization_module: string;
  assumptions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  references: ReadonlyArray<string>;
  share_schema_version: typeof HR_DIAGRAM_SHARE_SCHEMA_VERSION;
}>;

type HRDiagramArtifact = Readonly<{
  artifact_version: typeof HR_DIAGRAM_ARTIFACT_VERSION;
  model_version: typeof HR_DIAGRAM_MODEL_VERSION;
  schema_version: typeof HR_DIAGRAM_SCHEMA_VERSION;
  share_schema_version: typeof HR_DIAGRAM_SHARE_SCHEMA_VERSION;
  generated_at: string;
  definition: HRDiagramDefinition;
  sources: ReadonlyArray<HRDiagramSource>;
  cluster_provenance: ReadonlyArray<Readonly<Record<string, unknown>>>;
  dataset: Readonly<Record<string, unknown>>;
  validation_fixtures: Readonly<Record<string, unknown>>;
  source_spot_checks: ReadonlyArray<Readonly<Record<string, unknown>>>;
  stars: ReadonlyArray<HRDiagramRecord>;
  scientific_validation: Readonly<Record<string, unknown>>;
}>;

const SOURCE_METADATA: Readonly<Record<string, Readonly<{ url: string; title: string }>>> = {
  "gaia-dr3-main-source-catalogue": {
    url: "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html",
    title: "20.1.1 gaia_source",
  },
  "gaia-dr3-astrophysical-parameters": {
    url: "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_astrophysical_parameter_tables/ssec_dm_astrophysical_parameters.html",
    title: "20.2.1 astrophysical_parameters",
  },
  "gaia-dr3-documentation": {
    url: "https://gea.esac.esa.int/archive/documentation/GDR3/",
    title: "Gaia Data Release 3 Documentation release 1.3",
  },
  "hunt-reffert-2024-vizier-members": {
    url: "https://cdsarc.cds.unistra.fr/viz-bin/cat/J/A%2BA/686/A42",
    title: "Improving the open cluster census. III. : J/A+A/686/A42",
  },
  "esa-gaia-hr-diagram": {
    url: "https://www.esa.int/ESA_Multimedia/Images/2018/04/Gaia_s_Hertzsprung-Russell_diagram",
    title: "Gaia’s Hertzsprung-Russell diagram",
  },
};

const DEFAULT_FILTERS = {
  spectral_classes: HR_DIAGRAM_SPECTRAL_CLASSES,
  stage_groups: HR_DIAGRAM_STAGE_GROUPS,
  clusters: HR_DIAGRAM_CLUSTERS,
} as const;

export const DEFAULT_HR_DIAGRAM_STATE: HRDiagramState = {
  version: HR_DIAGRAM_SHARE_SCHEMA_VERSION,
  model_version: HR_DIAGRAM_MODEL_VERSION,
  view: "physical_hr",
  selected_star_id: "gaia-dr3-598546371788334080",
  spectral_classes: [...DEFAULT_FILTERS.spectral_classes],
  stage_groups: [...DEFAULT_FILTERS.stage_groups],
  clusters: [...DEFAULT_FILTERS.clusters],
};

export class HRDiagramStateValidationError extends Error {
  readonly code = "HR_DIAGRAM_STATE_INVALID";

  constructor() {
    super("HR_DIAGRAM_STATE_INVALID");
    this.name = "HRDiagramStateValidationError";
  }
}

export class HRDiagramArtifactValidationError extends Error {
  readonly code = "HR_DIAGRAM_ARTIFACT_INVALID";

  constructor() {
    super("HR_DIAGRAM_ARTIFACT_INVALID");
    this.name = "HRDiagramArtifactValidationError";
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isEnumArray<T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
): value is ReadonlyArray<T> {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && allowed.includes(entry as T))
  );
}

function failArtifact(): never {
  throw new HRDiagramArtifactValidationError();
}

function isView(value: unknown): value is HRDiagramView {
  return typeof value === "string" && HR_DIAGRAM_VIEWS.includes(value as HRDiagramView);
}

function isCluster(value: unknown): value is HRDiagramCluster {
  return typeof value === "string" && HR_DIAGRAM_CLUSTERS.includes(value as HRDiagramCluster);
}

function isSpectralClass(value: unknown): value is HRDiagramSpectralClass {
  return (
    typeof value === "string" &&
    HR_DIAGRAM_SPECTRAL_CLASSES.includes(value as HRDiagramSpectralClass)
  );
}

function isStageGroup(value: unknown): value is HRDiagramStageGroup {
  return (
    typeof value === "string" && HR_DIAGRAM_STAGE_GROUPS.includes(value as HRDiagramStageGroup)
  );
}

function hasCanonicalValues<T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
): value is ReadonlyArray<T> {
  return (
    isEnumArray(value, allowed) &&
    new Set(value).size === value.length &&
    value.every(
      (entry, index) => entry === allowed.filter((candidate) => value.includes(candidate))[index],
    )
  );
}

function validateSource(source: unknown): source is HRDiagramSource {
  if (!isRecord(source)) return false;
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
  if (!hasOnlyKeys(source, keys) || !isNonEmptyString(source.id)) return false;
  const expected = SOURCE_METADATA[source.id];
  if (expected === undefined || source.url !== expected.url || source.title !== expected.title)
    return false;
  if (typeof source.url !== "string" || !source.url.startsWith("https://")) return false;
  if (
    !(["official-agency", "official-education", "catalogue"] as const).includes(
      source.source_type as never,
    )
  )
    return false;
  return keys.every((key) => key === "source_type" || isNonEmptyString(source[key]));
}

function validateRecord(record: unknown): record is HRDiagramRecord {
  if (!isRecord(record)) return false;
  const keys = [
    "star_id",
    "gaia_source_id",
    "designation",
    "cluster",
    "cluster_label",
    "membership",
    "spectral_class",
    "flags_esphs",
    "evolstage_flame",
    "flags_flame",
    "stage_group",
    "phot_g_mean_mag",
    "bp_rp_mag",
    "parallax_mas",
    "parallax_error_mas",
    "teff_k_p16",
    "teff_k_p50",
    "teff_k_p84",
    "luminosity_lsun_p16",
    "luminosity_lsun_p50",
    "luminosity_lsun_p84",
    "mg_gspphot_mag_p16",
    "mg_gspphot_mag_p50",
    "mg_gspphot_mag_p84",
    "ag_gspphot_mag",
    "ag_gspphot_mag_p16",
    "ag_gspphot_mag_p84",
    "ebpminrp_gspphot_mag",
    "ebpminrp_gspphot_mag_p16",
    "ebpminrp_gspphot_mag_p84",
    "source_fields",
    "provenance",
  ];
  const sourceId = record.gaia_source_id;
  const starId = record.star_id;
  const designation = record.designation;
  const cluster = record.cluster;
  const clusterLabel = record.cluster_label;
  const spectralClass = record.spectral_class;
  const flagsEsphs = record.flags_esphs;
  const evolstage = record.evolstage_flame;
  const stageGroup = record.stage_group;
  const flagsFlame = record.flags_flame;
  if (
    !hasOnlyKeys(record, keys) ||
    typeof sourceId !== "string" ||
    !/^\d+$/.test(sourceId) ||
    starId !== `gaia-dr3-${sourceId}` ||
    !isNonEmptyString(designation) ||
    !isCluster(cluster) ||
    clusterLabel !==
      { pleiades: "Pleiades", hyades: "Hyades", praesepe: "Praesepe", m67: "M 67" }[cluster] ||
    !isSpectralClass(spectralClass) ||
    typeof flagsEsphs !== "string" ||
    flagsEsphs.length < 2 ||
    !"1234".includes(flagsEsphs.charAt(1)) ||
    typeof evolstage !== "number" ||
    !Number.isInteger(evolstage) ||
    !isStageGroup(stageGroup) ||
    typeof flagsFlame !== "string"
  )
    return false;
  if (evolstage < 100 || evolstage > 1290) return false;
  const numericValues = [
    record.phot_g_mean_mag,
    record.bp_rp_mag,
    record.parallax_mas,
    record.parallax_error_mas,
    record.teff_k_p16,
    record.teff_k_p50,
    record.teff_k_p84,
    record.luminosity_lsun_p16,
    record.luminosity_lsun_p50,
    record.luminosity_lsun_p84,
    record.mg_gspphot_mag_p16,
    record.mg_gspphot_mag_p50,
    record.mg_gspphot_mag_p84,
  ];
  if (!numericValues.every(isFiniteNumber)) return false;
  const photG = record.phot_g_mean_mag;
  const colour = record.bp_rp_mag;
  const parallax = record.parallax_mas;
  const parallaxError = record.parallax_error_mas;
  const teff16 = record.teff_k_p16;
  const teff50 = record.teff_k_p50;
  const teff84 = record.teff_k_p84;
  const luminosity16 = record.luminosity_lsun_p16;
  const luminosity50 = record.luminosity_lsun_p50;
  const luminosity84 = record.luminosity_lsun_p84;
  const magnitude16 = record.mg_gspphot_mag_p16;
  const magnitude50 = record.mg_gspphot_mag_p50;
  const magnitude84 = record.mg_gspphot_mag_p84;
  if (
    !isFiniteNumber(photG) ||
    !isFiniteNumber(colour) ||
    !isFiniteNumber(parallax) ||
    !isFiniteNumber(parallaxError) ||
    !isFiniteNumber(teff16) ||
    !isFiniteNumber(teff50) ||
    !isFiniteNumber(teff84) ||
    !isFiniteNumber(luminosity16) ||
    !isFiniteNumber(luminosity50) ||
    !isFiniteNumber(luminosity84) ||
    !isFiniteNumber(magnitude16) ||
    !isFiniteNumber(magnitude50) ||
    !isFiniteNumber(magnitude84)
  )
    return false;
  if (
    !(teff16 < teff50 && teff50 < teff84) ||
    !(luminosity16 > 0 && luminosity16 < luminosity50 && luminosity50 < luminosity84) ||
    !(magnitude16 < magnitude50 && magnitude50 < magnitude84) ||
    teff50 < 2500 ||
    teff50 > 50000 ||
    luminosity50 < 1e-3 ||
    luminosity50 > 1e5 ||
    colour < -0.5 ||
    colour > 4 ||
    magnitude50 < -5 ||
    magnitude50 > 15
  )
    return false;
  const optional = [
    record.ag_gspphot_mag,
    record.ag_gspphot_mag_p16,
    record.ag_gspphot_mag_p84,
    record.ebpminrp_gspphot_mag,
    record.ebpminrp_gspphot_mag_p16,
    record.ebpminrp_gspphot_mag_p84,
  ];
  if (!optional.every((value) => value === null || isFiniteNumber(value))) return false;
  const membership = record.membership;
  if (
    !isRecord(membership) ||
    membership.catalogue !== "Hunt & Reffert 2024" ||
    membership.catalogue_id !== CLUSTER_CATALOGUE_IDS[cluster] ||
    membership.accepted_name !== CLUSTER_ACCEPTED_NAMES[cluster] ||
    !isFiniteNumber(membership.membership_probability)
  )
    return false;
  if (
    membership.membership_probability < 0 ||
    membership.membership_probability > 1 ||
    (membership.inrj !== 0 && membership.inrj !== 1) ||
    (membership.inrt !== 0 && membership.inrt !== 1)
  )
    return false;
  if (
    !isRecord(record.source_fields) ||
    !isRecord(record.provenance) ||
    JSON.stringify(record.source_fields) !== JSON.stringify(EXPECTED_SOURCE_FIELDS) ||
    JSON.stringify(record.provenance) !== JSON.stringify(EXPECTED_RECORD_PROVENANCE)
  )
    return false;
  return true;
}

export function validateHRDiagramArtifact(value: unknown): asserts value is HRDiagramArtifact {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "artifact_version",
      "model_version",
      "schema_version",
      "share_schema_version",
      "generated_at",
      "definition",
      "sources",
      "cluster_provenance",
      "dataset",
      "validation_fixtures",
      "source_spot_checks",
      "stars",
      "scientific_validation",
    ])
  )
    failArtifact();
  if (
    value.artifact_version !== HR_DIAGRAM_ARTIFACT_VERSION ||
    value.model_version !== HR_DIAGRAM_MODEL_VERSION ||
    value.schema_version !== HR_DIAGRAM_SCHEMA_VERSION ||
    value.share_schema_version !== HR_DIAGRAM_SHARE_SCHEMA_VERSION ||
    !isNonEmptyString(value.generated_at)
  )
    failArtifact();
  if (
    !isRecord(value.definition) ||
    value.definition.slug !== "hr-diagram-explorer" ||
    value.definition.title !== "H-R Diagram Explorer" ||
    value.definition.model_version !== HR_DIAGRAM_MODEL_VERSION ||
    value.definition.dataset_id !== HR_DIAGRAM_DATASET_ID ||
    value.definition.share_schema_version !== HR_DIAGRAM_SHARE_SCHEMA_VERSION
  )
    failArtifact();
  if (
    !isStringArray(value.definition.audience_modes) ||
    value.definition.audience_modes.join(",") !== "explorer,student,deep-dive" ||
    !isStringArray(value.definition.references) ||
    !isRecord(value.definition.default_state)
  )
    failArtifact();
  const sources = value.sources;
  if (
    !Array.isArray(sources) ||
    sources.length !== Object.keys(SOURCE_METADATA).length ||
    !sources.every(validateSource)
  )
    failArtifact();
  const sourceIds = sources.map((source) => source.id);
  if (
    new Set(sourceIds).size !== sourceIds.length ||
    sourceIds.some((id) => SOURCE_METADATA[id] === undefined)
  )
    failArtifact();
  if (
    !Array.isArray(value.stars) ||
    value.stars.length !== 128 ||
    !value.stars.every(validateRecord)
  )
    failArtifact();
  const records = value.stars;
  if (new Set(records.map((record) => record.star_id)).size !== records.length) failArtifact();
  if (
    records.filter((record) => record.cluster === "pleiades").length !== 32 ||
    records.filter((record) => record.cluster === "hyades").length !== 32 ||
    records.filter((record) => record.cluster === "praesepe").length !== 32 ||
    records.filter((record) => record.cluster === "m67").length !== 32
  )
    failArtifact();
  if (
    value.definition.default_selected_star_id !== DEFAULT_HR_DIAGRAM_STATE.selected_star_id ||
    !records.some((record) => record.star_id === DEFAULT_HR_DIAGRAM_STATE.selected_star_id)
  )
    failArtifact();
  if (
    !isRecord(value.dataset) ||
    value.dataset.identifier !== HR_DIAGRAM_DATASET_ID ||
    value.dataset.record_count !== 128 ||
    value.dataset.per_cluster_count !== 32 ||
    value.dataset.source_record_fingerprint !==
      "sha256:3d1f2a32cee1f834bdd5c9f07162884789096385323a36bb3712a1f52659be9f"
  )
    failArtifact();
  const defaultState = value.definition.default_state;
  if (
    !validateHRDiagramState(
      defaultState,
      records.map((record) => record.star_id),
    ) ||
    JSON.stringify(defaultState) !== JSON.stringify(DEFAULT_HR_DIAGRAM_STATE)
  )
    failArtifact();
}

const HR_DIAGRAM_ARTIFACT = rawHrDiagramArtifact as unknown;
validateHRDiagramArtifact(HR_DIAGRAM_ARTIFACT);

export const HR_DIAGRAM_DEFINITION = HR_DIAGRAM_ARTIFACT.definition;
export const HR_DIAGRAM_SOURCES = HR_DIAGRAM_ARTIFACT.sources;
export const HR_DIAGRAM_RECORDS = HR_DIAGRAM_ARTIFACT.stars;
export const HR_DIAGRAM_VALIDATION_FIXTURES = HR_DIAGRAM_ARTIFACT.validation_fixtures;
export const HR_DIAGRAM_CLUSTER_PROVENANCE = HR_DIAGRAM_ARTIFACT.cluster_provenance;

/**
 * Verify the browser's imported star records against a reviewed byte-stable
 * digest. This is an integrity check, not a scientific calculation. The
 * canonical source-record fingerprint remains Python-owned; this additional
 * browser check catches a changed imported record even if its declared
 * artifact fingerprint was left stale.
 */
export async function verifyHRDiagramBrowserArtifact(): Promise<boolean | null> {
  if (globalThis.crypto?.subtle === undefined || typeof TextEncoder === "undefined") return null;
  function normalize(value: unknown): unknown {
    if (typeof value === "number") return Number(value.toPrecision(14));
    if (Array.isArray(value)) return value.map(normalize);
    if (isRecord(value)) {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, normalize(value[key])]),
      );
    }
    return value;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(normalize(HR_DIAGRAM_RECORDS)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return "sha256:" + actual === HR_DIAGRAM_BROWSER_STAR_FINGERPRINT;
}

export function validateHRDiagramState(
  value: unknown,
  knownStarIds: ReadonlyArray<string> = HR_DIAGRAM_RECORDS.map((record) => record.star_id),
): value is HRDiagramState {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "version",
      "model_version",
      "view",
      "selected_star_id",
      "spectral_classes",
      "stage_groups",
      "clusters",
    ])
  )
    return false;
  if (
    value.version !== HR_DIAGRAM_SHARE_SCHEMA_VERSION ||
    value.model_version !== HR_DIAGRAM_MODEL_VERSION ||
    !isView(value.view) ||
    typeof value.selected_star_id !== "string" ||
    !knownStarIds.includes(value.selected_star_id)
  )
    return false;
  return (
    hasCanonicalValues(value.spectral_classes, HR_DIAGRAM_SPECTRAL_CLASSES) &&
    hasCanonicalValues(value.stage_groups, HR_DIAGRAM_STAGE_GROUPS) &&
    hasCanonicalValues(value.clusters, HR_DIAGRAM_CLUSTERS)
  );
}

/** Serialize only the minimum scientific state, in deterministic key/array order. */
export function encodeHRDiagramState(value: unknown): string {
  const state = validateHRDiagramState(value) ? value : null;
  if (state === null) throw new HRDiagramStateValidationError();
  return JSON.stringify({
    version: state.version,
    model_version: state.model_version,
    view: state.view,
    selected_star_id: state.selected_star_id,
    spectral_classes: [...state.spectral_classes],
    stage_groups: [...state.stage_groups],
    clusters: [...state.clusters],
  });
}

export function decodeHRDiagramState(value: unknown): HRDiagramState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > HR_DIAGRAM_SHARE_STATE_MAX_CHARS
  )
    return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!validateHRDiagramState(parsed) || encodeHRDiagramState(parsed) !== value) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function filterHRDiagramRecords(state: HRDiagramState): ReadonlyArray<HRDiagramRecord> {
  if (!validateHRDiagramState(state)) throw new HRDiagramStateValidationError();
  return HR_DIAGRAM_RECORDS.filter(
    (record) =>
      state.spectral_classes.includes(record.spectral_class) &&
      state.stage_groups.includes(record.stage_group) &&
      state.clusters.includes(record.cluster),
  );
}

export function selectedHRDiagramRecord(state: HRDiagramState): HRDiagramRecord {
  if (!validateHRDiagramState(state)) throw new HRDiagramStateValidationError();
  const record = HR_DIAGRAM_RECORDS.find(
    (candidate) => candidate.star_id === state.selected_star_id,
  );
  if (record === undefined) throw new HRDiagramStateValidationError();
  return record;
}

function coordinateFraction(
  value: number,
  minimum: number,
  maximum: number,
  logarithmic: boolean,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new HRDiagramArtifactValidationError();
  const numerator = logarithmic ? Math.log10(value) - Math.log10(minimum) : value - minimum;
  const denominator = logarithmic ? Math.log10(maximum) - Math.log10(minimum) : maximum - minimum;
  const result = numerator / denominator;
  if (!Number.isFinite(result) || result < 0 || result > 1)
    throw new HRDiagramArtifactValidationError();
  return result;
}

/** Presentation-only map: hotter temperature is placed farther left on the H-R x-axis. */
export function physicalTemperatureXFraction(value: number): number {
  return 1 - coordinateFraction(value, 2500, 50000, true);
}

/** Presentation-only map: larger luminosity is placed higher on the screen. */
export function physicalLuminosityYFraction(value: number): number {
  return 1 - coordinateFraction(value, 1e-3, 1e5, true);
}

/** Presentation-only map for the ordinary linear CMD colour axis. */
export function cmdColourXFraction(value: number): number {
  return coordinateFraction(value, -0.5, 4, false);
}

/** Presentation-only map for the vertically reversed CMD magnitude axis. */
export function cmdMagnitudeYFraction(value: number): number {
  return coordinateFraction(value, -5, 15, false);
}

export function displayXFraction(record: HRDiagramRecord, view: HRDiagramView): number {
  return view === "physical_hr"
    ? physicalTemperatureXFraction(record.teff_k_p50)
    : cmdColourXFraction(record.bp_rp_mag);
}

export function displayYFraction(record: HRDiagramRecord, view: HRDiagramView): number {
  return view === "physical_hr"
    ? physicalLuminosityYFraction(record.luminosity_lsun_p50)
    : cmdMagnitudeYFraction(record.mg_gspphot_mag_p50);
}

export function displayUncertainty(
  record: HRDiagramRecord,
  view: HRDiagramView,
): Readonly<{ x: readonly [number, number] | null; y: readonly [number, number] }> {
  if (view === "physical_hr") {
    return {
      x: [
        physicalTemperatureXFraction(record.teff_k_p16),
        physicalTemperatureXFraction(record.teff_k_p84),
      ],
      y: [
        physicalLuminosityYFraction(record.luminosity_lsun_p16),
        physicalLuminosityYFraction(record.luminosity_lsun_p84),
      ],
    };
  }
  return {
    x: null,
    y: [
      cmdMagnitudeYFraction(record.mg_gspphot_mag_p16),
      cmdMagnitudeYFraction(record.mg_gspphot_mag_p84),
    ],
  };
}

export function resetHRDiagramState(): HRDiagramState {
  return {
    ...DEFAULT_HR_DIAGRAM_STATE,
    spectral_classes: [...DEFAULT_HR_DIAGRAM_STATE.spectral_classes],
    stage_groups: [...DEFAULT_HR_DIAGRAM_STATE.stage_groups],
    clusters: [...DEFAULT_HR_DIAGRAM_STATE.clusters],
  };
}
