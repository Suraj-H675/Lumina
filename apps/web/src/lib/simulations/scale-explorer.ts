/**
 * Presentation-facing boundary for the reviewed Scale Explorer artifact.
 *
 * The scientific calculation is owned by the Python astronomy domain. The browser receives the
 * checked-in, reviewed output snapshot and performs only strict state validation, lookup, and
 * presentation shaping; it does not reimplement unit conversion, diameter derivation, ratios, or
 * logarithmic positioning.
 */

import scaleExplorerArtifact from "../../../../../data/seed/scale-explorer-v1.json";

export const SCALE_EXPLORER_MODEL_VERSION = "scale-explorer-v1" as const;
export const SCALE_EXPLORER_SCHEMA_VERSION = 1 as const;
export const SCALE_EXPLORER_ARTIFACT_VERSION = 2 as const;
export const SCALE_EXPLORER_STATE_MAX_CHARS = 256;
export const SCALE_EXPLORER_ARITHMETIC_RELATIVE_TOLERANCE = 1e-12;

export type ScaleSizeUnit = "km" | "ly";
export type ScaleSourceQuantity = "radius" | "diameter" | "width" | "extent";
export type ScaleNodeCategory = "moon" | "planet" | "star" | "galaxy" | "cosmological";
export type ScaleValueStatus = "reported" | "approximate" | "derived-approximate" | "model-based";
export type ScaleCharacteristicQuantity = "diameter" | "width" | "observable-extent";

export const SCALE_EXPLORER_NODE_IDS = [
  "moon",
  "mercury",
  "mars",
  "venus",
  "earth",
  "neptune",
  "uranus",
  "saturn",
  "jupiter",
  "sun",
  "milky-way",
  "observable-universe",
] as const;

export type ScaleNodeId = (typeof SCALE_EXPLORER_NODE_IDS)[number];

export type ScaleExplorerDerivedQuantityContract = Readonly<{
  algorithm_id: "scale-relative-ratio-v1";
  algorithm_version: 1;
  input_node_ids: ReadonlyArray<string>;
  input_source_ids: ReadonlyArray<string>;
  input_unit: "m";
  output_unit: "dimensionless ratio";
  valid_domain: string;
  numerical_tolerance: string;
  test_references: ReadonlyArray<string>;
  generated_at: string;
  learner_facing_rounding: string;
}>;

export type ScaleExplorerAuthoredClaim = Readonly<{
  text: string;
  source_ids: ReadonlyArray<string>;
  derived_quantity?: ScaleExplorerDerivedQuantityContract | undefined;
}>;

export type ScaleExplorerSource = Readonly<{
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

export type ScaleExplorerComparisonDefinition =
  | Readonly<{
      kind: "contextual";
      text: string;
    }>
  | Readonly<{
      kind: "ratio";
      reference_node_id: string;
    }>;

export type ScaleExplorerLink = Readonly<{
  label: string;
  href: string;
  kind: "entity-reference" | "source-reference";
}>;

export type ScaleExplorerComparison = Readonly<{
  kind: "contextual" | "calculated-ratio";
  text: string;
  algorithm_id: "authored-context-v1" | "scale-relative-ratio-v1";
  algorithm_version: 1;
  input_node_ids: ReadonlyArray<string>;
  input_source_ids: ReadonlyArray<string>;
  unit: "not-applicable" | "dimensionless";
  rounding: string;
  reference_node_id?: string;
  ratio?: number;
}>;

export type ScaleExplorerNode = Readonly<{
  id: ScaleNodeId;
  name: string;
  category: ScaleNodeCategory;
  /** Source quantity and unit are preserved exactly as reviewed before Python calculation. */
  source_value: number;
  source_unit: ScaleSizeUnit;
  source_quantity: ScaleSourceQuantity;
  characteristic_quantity: ScaleCharacteristicQuantity;
  display_value: string;
  value_status: ScaleValueStatus;
  source_basis: string;
  comparison: ScaleExplorerComparisonDefinition;
  /** Learner-facing text checked against the Python ratio output during artifact validation. */
  comparison_text: string;
  transition_explanation: ScaleExplorerAuthoredClaim;
  entity_links: ReadonlyArray<ScaleExplorerLink>;
  source_ids: ReadonlyArray<string>;
  /** Precomputed by the Python astronomy model and checked against the reviewed artifact in Python. */
  calculated_characteristic_size_m: number;
  /** Dimensionless normalized display coordinate, precomputed by the Python astronomy model. */
  display_position_percent: number;
}>;

type ScaleExplorerArtifact = Readonly<{
  artifact_version: typeof SCALE_EXPLORER_ARTIFACT_VERSION;
  model_version: typeof SCALE_EXPLORER_MODEL_VERSION;
  schema_version: typeof SCALE_EXPLORER_SCHEMA_VERSION;
  light_year_metres_approx: number;
  generated_at: string;
  definition: ScaleExplorerDefinition;
  sources: ReadonlyArray<ScaleExplorerSource>;
  nodes: ReadonlyArray<ScaleExplorerNode>;
  pairwise_ratios: ReadonlyArray<
    Readonly<{
      selected_node_id: string;
      reference_node_id: string;
      ratio: number;
    }>
  >;
  validation_fixtures: ReadonlyArray<ScaleExplorerValidationFixture>;
  scientific_validation: ScaleExplorerScientificValidation;
}>;

type ScaleExplorerScientificValidation = Readonly<{
  id: "scale-explorer-independent-validation-v1";
  checked_at: string;
  method: string;
  tools: ReadonlyArray<
    Readonly<{
      name: string;
      version: string;
      role: string;
    }>
  >;
  source_ids: ReadonlyArray<string>;
  test_references: ReadonlyArray<string>;
}>;

type ScaleExplorerAlgorithmMetadata = Readonly<{
  algorithm_id: string;
  algorithm_version: 1;
  inputs: string;
  output_unit: string;
  valid_domain: string;
  numerical_tolerance: string;
  test_references: ReadonlyArray<string>;
  generated_at: string;
}>;

type ScaleExplorerDefinition = Readonly<{
  slug: "scale-explorer";
  title: "Scale Explorer";
  content_type: "interactive-simulation";
  language: "en";
  status: "ready";
  version: 1;
  audience_modes: ReadonlyArray<"explorer" | "student" | "deep-dive">;
  reviewed_by: ReadonlyArray<string>;
  reviewed_at: string;
  updated_at: string;
  model_version: typeof SCALE_EXPLORER_MODEL_VERSION;
  learning_objectives: ReadonlyArray<string>;
  prerequisite_concepts: ReadonlyArray<string>;
  input_schema: Readonly<{
    name: "selected_node_id";
    unit: "curated node identifier";
    valid_values: ReadonlyArray<string>;
    invalid_handling: string;
  }>;
  default_preset: string;
  calculation_module: Readonly<{
    canonical_unit: "m";
    relationships: ReadonlyArray<string>;
    characteristic_size: ScaleExplorerAlgorithmMetadata;
    derived_comparison: ScaleExplorerAlgorithmMetadata;
  }>;
  output_schema: ReadonlyArray<string>;
  visualization_module: string;
  assumptions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  references: ReadonlyArray<string>;
  validation_fixtures: ReadonlyArray<string>;
  share_schema_version: typeof SCALE_EXPLORER_SCHEMA_VERSION;
}>;

export type ScaleExplorerValidationFixture = Readonly<{
  id: string;
  node_id: string;
  expected_characteristic_size_m: number;
  tolerance_m: number;
  expected_position_percent?: number;
  position_tolerance_percent?: number;
  expected_comparison?: Readonly<{
    reference_node_id: string;
    expected_ratio: number;
    ratio_relative_tolerance: number;
  }>;
  purpose: string;
}>;

const SCALE_EXPLORER_ARTIFACT = scaleExplorerArtifact as ScaleExplorerArtifact;

const SOURCE_METADATA: Readonly<Record<string, Readonly<{ url: string; title: string }>>> = {
  "nasa-solar-system-sizes": {
    url: "https://science.nasa.gov/resource/solar-system-sizes/",
    title: "Solar System Sizes",
  },
  "nasa-moon-lithograph": {
    url: "https://science.nasa.gov/wp-content/uploads/2024/01/62217main-moon-lithograph.pdf",
    title: "Moon lithograph: fast facts",
  },
  "nasa-sun-facts": {
    url: "https://science.nasa.gov/sun/facts/",
    title: "Our Sun: Facts",
  },
  "nasa-milky-way-size": {
    url: "https://science.nasa.gov/universe/exoplanets/our-milky-way-galaxy-how-big-is-space/",
    title: "Our Milky Way Galaxy: How Big is Space?",
  },
  "nasa-observable-universe-size": {
    url: "https://www.nasa.gov/science-research/astrophysics/how-big-is-space-we-asked-a-nasa-expert-episode-61/",
    title: "How Big is Space? We Asked a NASA Expert",
  },
  "nasa-light-year": {
    url: "https://science.nasa.gov/exoplanets/what-is-a-light-year/",
    title: "What is a light-year?",
  },
};

export const SCALE_EXPLORER_SOURCES = SCALE_EXPLORER_ARTIFACT.sources;
export const SCALE_EXPLORER_NODES = SCALE_EXPLORER_ARTIFACT.nodes;
export const SCALE_EXPLORER_VALIDATION_FIXTURES = SCALE_EXPLORER_ARTIFACT.validation_fixtures;
export const SCALE_EXPLORER_SCIENTIFIC_VALIDATION = SCALE_EXPLORER_ARTIFACT.scientific_validation;
export const SCALE_EXPLORER_DEFINITION = SCALE_EXPLORER_ARTIFACT.definition;

export const DEFAULT_SCALE_EXPLORER_STATE: ScaleExplorerState = {
  model_version: SCALE_EXPLORER_MODEL_VERSION,
  version: SCALE_EXPLORER_SCHEMA_VERSION,
  node_id: "earth",
};

export type ScaleExplorerState = Readonly<{
  version: typeof SCALE_EXPLORER_SCHEMA_VERSION;
  node_id: ScaleNodeId;
  model_version: typeof SCALE_EXPLORER_MODEL_VERSION;
}>;

export class ScaleExplorerValidationError extends Error {
  readonly code = "SCALE_EXPLORER_STATE_INVALID";

  constructor() {
    super("SCALE_EXPLORER_STATE_INVALID");
    this.name = "ScaleExplorerValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function hasNoUnknownKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonEmptyStringArray(value: unknown): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function hasRequiredKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isExactStringArray(value: unknown, expected: ReadonlyArray<string>): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every(isNonEmptyString)
    ? value.every((entry, index) => entry === expected[index])
    : false;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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
      (url.hostname === "science.nasa.gov" || url.hostname === "www.nasa.gov")
    );
  } catch {
    return false;
  }
}

function isScaleSourceUnit(value: unknown): value is ScaleSizeUnit {
  return value === "km" || value === "ly";
}

function isScaleSourceQuantity(value: unknown): value is ScaleSourceQuantity {
  return value === "radius" || value === "diameter" || value === "width" || value === "extent";
}

function isScaleCharacteristicQuantity(value: unknown): value is ScaleCharacteristicQuantity {
  return value === "diameter" || value === "width" || value === "observable-extent";
}

function isScaleNodeCategory(value: unknown): value is ScaleNodeCategory {
  return (
    value === "moon" ||
    value === "planet" ||
    value === "star" ||
    value === "galaxy" ||
    value === "cosmological"
  );
}

function isScaleValueStatus(value: unknown): value is ScaleValueStatus {
  return (
    value === "reported" ||
    value === "approximate" ||
    value === "derived-approximate" ||
    value === "model-based"
  );
}

function isScaleNodeId(value: unknown): value is ScaleNodeId {
  return typeof value === "string" && SCALE_EXPLORER_NODE_IDS.includes(value as ScaleNodeId);
}

/** Validate untrusted share/import state without clamping or guessing. */
export function validateScaleExplorerState(value: unknown): ScaleExplorerState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["model_version", "node_id", "version"])) {
    return null;
  }
  if (
    value.model_version !== SCALE_EXPLORER_MODEL_VERSION ||
    value.version !== SCALE_EXPLORER_SCHEMA_VERSION ||
    !isScaleNodeId(value.node_id)
  ) {
    return null;
  }
  return {
    model_version: SCALE_EXPLORER_MODEL_VERSION,
    node_id: value.node_id,
    version: SCALE_EXPLORER_SCHEMA_VERSION,
  };
}

/** Serialize only the minimum state needed to reproduce the selected result. */
export function encodeScaleExplorerState(value: unknown): string {
  const state = validateScaleExplorerState(value);
  if (state === null) throw new ScaleExplorerValidationError();
  return JSON.stringify({
    model_version: state.model_version,
    node_id: state.node_id,
    version: state.version,
  });
}

/** Decode only the bounded canonical URL state emitted by the encoder. */
export function decodeScaleExplorerState(value: unknown): ScaleExplorerState | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > SCALE_EXPLORER_STATE_MAX_CHARS
  ) {
    return null;
  }
  try {
    const state = validateScaleExplorerState(JSON.parse(value) as unknown);
    if (state === null || encodeScaleExplorerState(state) !== value) return null;
    return state;
  } catch {
    return null;
  }
}

/** Return the reviewed Python-calculated characteristic size without recomputing it in the browser. */
export function canonicalSizeMetres(node: ScaleExplorerNode): number {
  if (
    !Number.isFinite(node.source_value) ||
    node.source_value <= 0 ||
    !Number.isFinite(node.calculated_characteristic_size_m) ||
    node.calculated_characteristic_size_m <= 0
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
  return node.calculated_characteristic_size_m;
}

/** Look up a deterministic ratio from the reviewed Python-calculated pairwise output table. */
export function calculateScaleExplorerRatio(
  selectedNodeId: ScaleNodeId,
  referenceNodeId: ScaleNodeId,
): number {
  if (selectedNodeId === referenceNodeId) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
  const pair = SCALE_EXPLORER_ARTIFACT.pairwise_ratios.find(
    (candidate) =>
      candidate.selected_node_id === selectedNodeId &&
      candidate.reference_node_id === referenceNodeId,
  );
  if (pair === undefined || !Number.isFinite(pair.ratio) || pair.ratio <= 0) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
  return pair.ratio;
}

type ScaleExplorerPositionedBaseNode = Readonly<{
  node: ScaleExplorerNode;
  characteristic_size_m: number;
  position_percent: number;
}>;

export type ScaleExplorerPositionedNode = Readonly<{
  node: ScaleExplorerNode;
  characteristic_size_m: number;
  position_percent: number;
  comparison: ScaleExplorerComparison;
}>;

export type ScaleExplorerModel = Readonly<{
  state: ScaleExplorerState;
  model_version: typeof SCALE_EXPLORER_MODEL_VERSION;
  nodes: ReadonlyArray<ScaleExplorerPositionedNode>;
  selected: ScaleExplorerPositionedNode &
    Readonly<{
      index: number;
      previous?: ScaleExplorerPositionedNode;
      next?: ScaleExplorerPositionedNode;
    }>;
  range: Readonly<{
    minimum_size_m: number;
    maximum_size_m: number;
  }>;
}>;

function assertScaleExplorerAlgorithmMetadata(
  value: unknown,
  expected: Readonly<{
    algorithm_id: string;
    output_unit: string;
    test_references: ReadonlyArray<string>;
  }>,
): void {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "algorithm_id",
      "algorithm_version",
      "inputs",
      "output_unit",
      "valid_domain",
      "numerical_tolerance",
      "test_references",
      "generated_at",
    ]) ||
    value.algorithm_id !== expected.algorithm_id ||
    value.algorithm_version !== 1 ||
    !isNonEmptyString(value.inputs) ||
    value.output_unit !== expected.output_unit ||
    !isNonEmptyString(value.valid_domain) ||
    !isNonEmptyString(value.numerical_tolerance) ||
    !isExactStringArray(value.test_references, expected.test_references) ||
    !isNonEmptyString(value.generated_at) ||
    !value.generated_at.includes("T")
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
}

/** Validate the complete checked-in artifact before exposing it to the client model. */
export function validateScaleExplorerArtifact(value: unknown): void {
  const rawArtifact: unknown = value;
  if (
    !isRecord(rawArtifact) ||
    !hasOnlyKeys(rawArtifact, [
      "artifact_version",
      "model_version",
      "schema_version",
      "light_year_metres_approx",
      "generated_at",
      "definition",
      "sources",
      "nodes",
      "pairwise_ratios",
      "validation_fixtures",
      "scientific_validation",
    ])
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
  if (
    rawArtifact.artifact_version !== SCALE_EXPLORER_ARTIFACT_VERSION ||
    rawArtifact.model_version !== SCALE_EXPLORER_MODEL_VERSION ||
    rawArtifact.schema_version !== SCALE_EXPLORER_SCHEMA_VERSION ||
    rawArtifact.light_year_metres_approx !== 9.46e15 ||
    !isNonEmptyString(rawArtifact.generated_at)
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }

  const rawSources = rawArtifact.sources;
  if (!Array.isArray(rawSources) || rawSources.length === 0) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
  const sourceIds = new Set<string>();
  for (const rawSource of rawSources) {
    if (
      !isRecord(rawSource) ||
      !hasOnlyKeys(rawSource, [
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
      ]) ||
      !isNonEmptyString(rawSource.id) ||
      !isNonEmptyString(rawSource.title) ||
      !isNonEmptyString(rawSource.organization_or_authors) ||
      !isOfficialHttpsUrl(rawSource.url) ||
      !isNonEmptyString(rawSource.accessed_at) ||
      !isNonEmptyString(rawSource.dataset_or_release) ||
      !isNonEmptyString(rawSource.record_reference) ||
      !isNonEmptyString(rawSource.retrieved_at) ||
      !isNonEmptyString(rawSource.data_date) ||
      !isNonEmptyString(rawSource.terms_or_licence) ||
      !isNonEmptyString(rawSource.citation) ||
      !isNonEmptyString(rawSource.claim_scope) ||
      (rawSource.source_type !== "official-agency" &&
        rawSource.source_type !== "official-education") ||
      sourceIds.has(rawSource.id)
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    const expectedSource = SOURCE_METADATA[rawSource.id];
    if (
      expectedSource === undefined ||
      rawSource.url !== expectedSource.url ||
      rawSource.title !== expectedSource.title
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    sourceIds.add(rawSource.id);
  }

  const rawDefinition = rawArtifact.definition;
  if (
    !isRecord(rawDefinition) ||
    !hasOnlyKeys(rawDefinition, [
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
    ]) ||
    rawDefinition.slug !== "scale-explorer" ||
    rawDefinition.title !== "Scale Explorer" ||
    rawDefinition.content_type !== "interactive-simulation" ||
    rawDefinition.language !== "en" ||
    rawDefinition.status !== "ready" ||
    rawDefinition.version !== 1 ||
    !isExactStringArray(rawDefinition.audience_modes, ["explorer", "student", "deep-dive"]) ||
    !isNonEmptyStringArray(rawDefinition.reviewed_by) ||
    !isNonEmptyString(rawDefinition.reviewed_at) ||
    !rawDefinition.reviewed_at.includes("T") ||
    !isNonEmptyString(rawDefinition.updated_at) ||
    !rawDefinition.updated_at.includes("T") ||
    rawDefinition.model_version !== SCALE_EXPLORER_MODEL_VERSION ||
    !isNonEmptyStringArray(rawDefinition.learning_objectives) ||
    !isNonEmptyStringArray(rawDefinition.prerequisite_concepts) ||
    !isNonEmptyString(rawDefinition.default_preset) ||
    rawDefinition.default_preset !== "earth" ||
    !isNonEmptyStringArray(rawDefinition.output_schema) ||
    !isNonEmptyString(rawDefinition.visualization_module) ||
    !isNonEmptyStringArray(rawDefinition.assumptions) ||
    !isNonEmptyStringArray(rawDefinition.limitations) ||
    !isNonEmptyStringArray(rawDefinition.references) ||
    rawDefinition.references.some((sourceId) => !sourceIds.has(sourceId)) ||
    !isNonEmptyStringArray(rawDefinition.validation_fixtures) ||
    rawDefinition.share_schema_version !== SCALE_EXPLORER_SCHEMA_VERSION
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }

  const rawInputSchema = rawDefinition.input_schema;
  if (
    !isRecord(rawInputSchema) ||
    !hasOnlyKeys(rawInputSchema, ["name", "unit", "valid_values", "invalid_handling"]) ||
    rawInputSchema.name !== "selected_node_id" ||
    rawInputSchema.unit !== "curated node identifier" ||
    !isExactStringArray(rawInputSchema.valid_values, [...SCALE_EXPLORER_NODE_IDS]) ||
    !isNonEmptyString(rawInputSchema.invalid_handling)
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }

  const rawCalculationModule = rawDefinition.calculation_module;
  if (
    !isRecord(rawCalculationModule) ||
    !hasOnlyKeys(rawCalculationModule, [
      "canonical_unit",
      "relationships",
      "characteristic_size",
      "derived_comparison",
    ]) ||
    rawCalculationModule.canonical_unit !== "m" ||
    !isNonEmptyStringArray(rawCalculationModule.relationships)
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
  assertScaleExplorerAlgorithmMetadata(rawCalculationModule.characteristic_size, {
    algorithm_id: "scale-characteristic-size-v1",
    output_unit: "m",
    test_references: [
      "scale-explorer-characteristic-size-known-cases",
      "scale-explorer-independent-source-known-cases",
      "scale-explorer-log-endpoints-edge-cases",
    ],
  });
  assertScaleExplorerAlgorithmMetadata(rawCalculationModule.derived_comparison, {
    algorithm_id: "scale-relative-ratio-v1",
    output_unit: "dimensionless ratio",
    test_references: [
      "scale-explorer-derived-comparison-known-cases",
      "scale-explorer-log-endpoints-edge-cases",
    ],
  });

  const rawScientificValidation = rawArtifact.scientific_validation;
  if (
    !isRecord(rawScientificValidation) ||
    !hasOnlyKeys(rawScientificValidation, [
      "id",
      "checked_at",
      "method",
      "tools",
      "source_ids",
      "test_references",
    ]) ||
    rawScientificValidation.id !== "scale-explorer-independent-validation-v1" ||
    !isNonEmptyString(rawScientificValidation.checked_at) ||
    !rawScientificValidation.checked_at.includes("T") ||
    !isNonEmptyString(rawScientificValidation.method) ||
    !isExactStringArray(rawScientificValidation.source_ids, [...sourceIds]) ||
    !isExactStringArray(rawScientificValidation.test_references, [
      "scale-explorer-independent-decimal-cross-check",
      "scale-explorer-independent-source-known-cases",
    ])
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
  const rawScientificTools = rawScientificValidation.tools;
  if (!Array.isArray(rawScientificTools) || rawScientificTools.length !== 1) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
  const rawScientificTool = rawScientificTools[0];
  if (
    !isRecord(rawScientificTool) ||
    !hasOnlyKeys(rawScientificTool, ["name", "version", "role"]) ||
    rawScientificTool.name !== "Python decimal" ||
    !isNonEmptyString(rawScientificTool.version) ||
    !isNonEmptyString(rawScientificTool.role)
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }

  const rawNodes = rawArtifact.nodes;
  const expectedNodeIds = [...SCALE_EXPLORER_NODE_IDS];
  if (
    !Array.isArray(rawNodes) ||
    rawNodes.length !== expectedNodeIds.length ||
    rawNodes
      .map((rawNode) => (isRecord(rawNode) && typeof rawNode.id === "string" ? rawNode.id : ""))
      .join("|") !== expectedNodeIds.join("|")
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }

  const nodeIds = new Set<string>();
  const rawNodesById = new Map<
    string,
    Pick<ScaleExplorerNode, "calculated_characteristic_size_m" | "display_position_percent">
  >();
  let previousCharacteristicSize: number | undefined;
  let previousDisplayPosition: number | undefined;
  for (const rawNode of rawNodes) {
    if (
      !isRecord(rawNode) ||
      !hasOnlyKeys(rawNode, [
        "id",
        "name",
        "category",
        "source_value",
        "source_unit",
        "source_quantity",
        "characteristic_quantity",
        "display_value",
        "value_status",
        "source_basis",
        "comparison",
        "comparison_text",
        "transition_explanation",
        "entity_links",
        "source_ids",
        "calculated_characteristic_size_m",
        "display_position_percent",
      ]) ||
      !isScaleNodeId(rawNode.id) ||
      nodeIds.has(rawNode.id) ||
      !isNonEmptyString(rawNode.name) ||
      !isScaleNodeCategory(rawNode.category) ||
      !isFinitePositiveNumber(rawNode.source_value) ||
      !isScaleSourceUnit(rawNode.source_unit) ||
      !isScaleSourceQuantity(rawNode.source_quantity) ||
      !isScaleCharacteristicQuantity(rawNode.characteristic_quantity) ||
      !isNonEmptyString(rawNode.display_value) ||
      !isScaleValueStatus(rawNode.value_status) ||
      !isNonEmptyString(rawNode.source_basis) ||
      !isNonEmptyString(rawNode.comparison_text) ||
      !isFinitePositiveNumber(rawNode.calculated_characteristic_size_m) ||
      typeof rawNode.display_position_percent !== "number" ||
      !Number.isFinite(rawNode.display_position_percent) ||
      rawNode.display_position_percent < 0 ||
      rawNode.display_position_percent > 100 ||
      !isNonEmptyStringArray(rawNode.source_ids) ||
      rawNode.source_ids.some((sourceId) => !sourceIds.has(sourceId))
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    const node = rawNode as unknown as ScaleExplorerNode;
    const rawComparison = rawNode.comparison;
    if (!isRecord(rawComparison)) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    if (rawComparison.kind === "contextual") {
      if (!hasOnlyKeys(rawComparison, ["kind", "text"]) || !isNonEmptyString(rawComparison.text)) {
        throw new Error("SCALE_EXPLORER_MODEL_INVALID");
      }
    } else if (
      !hasOnlyKeys(rawComparison, ["kind", "reference_node_id"]) ||
      rawComparison.kind !== "ratio" ||
      !isScaleNodeId(rawComparison.reference_node_id) ||
      rawComparison.reference_node_id === node.id
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }

    const rawTransition = rawNode.transition_explanation;
    if (
      !isRecord(rawTransition) ||
      !hasNoUnknownKeys(rawTransition, ["text", "source_ids", "derived_quantity"]) ||
      !isNonEmptyString(rawTransition.text) ||
      !isNonEmptyStringArray(rawTransition.source_ids) ||
      rawTransition.source_ids.some((sourceId) => !sourceIds.has(sourceId))
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }

    const rawLinks = rawNode.entity_links;
    if (!Array.isArray(rawLinks) || rawLinks.length === 0) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    for (const rawLink of rawLinks) {
      if (
        !isRecord(rawLink) ||
        !hasOnlyKeys(rawLink, ["label", "href", "kind"]) ||
        !isNonEmptyString(rawLink.label) ||
        !isNonEmptyString(rawLink.href) ||
        (rawLink.kind !== "entity-reference" && rawLink.kind !== "source-reference")
      ) {
        throw new Error("SCALE_EXPLORER_MODEL_INVALID");
      }
      if (!isOfficialHttpsUrl(rawLink.href)) {
        throw new Error("SCALE_EXPLORER_MODEL_INVALID");
      }
    }

    const rawDerivedQuantity = rawTransition.derived_quantity;
    if (rawDerivedQuantity !== undefined) {
      if (
        !isRecord(rawDerivedQuantity) ||
        !hasOnlyKeys(rawDerivedQuantity, [
          "algorithm_id",
          "algorithm_version",
          "input_node_ids",
          "input_source_ids",
          "input_unit",
          "output_unit",
          "valid_domain",
          "numerical_tolerance",
          "test_references",
          "generated_at",
          "learner_facing_rounding",
        ]) ||
        rawDerivedQuantity.algorithm_id !== "scale-relative-ratio-v1" ||
        rawDerivedQuantity.algorithm_version !== 1 ||
        !isNonEmptyStringArray(rawDerivedQuantity.input_node_ids) ||
        !isNonEmptyStringArray(rawDerivedQuantity.input_source_ids) ||
        rawDerivedQuantity.input_unit !== "m" ||
        rawDerivedQuantity.output_unit !== "dimensionless ratio" ||
        !isNonEmptyString(rawDerivedQuantity.valid_domain) ||
        !isNonEmptyString(rawDerivedQuantity.numerical_tolerance) ||
        !isNonEmptyStringArray(rawDerivedQuantity.test_references) ||
        !isNonEmptyString(rawDerivedQuantity.generated_at) ||
        !rawDerivedQuantity.generated_at.includes("T") ||
        !isNonEmptyString(rawDerivedQuantity.learner_facing_rounding)
      ) {
        throw new Error("SCALE_EXPLORER_MODEL_INVALID");
      }
    }

    if (
      nodeIds.has(node.id) ||
      node.source_ids.length < 1 ||
      node.source_ids.some((sourceId) => !sourceIds.has(sourceId)) ||
      node.transition_explanation.source_ids.length < 1 ||
      node.transition_explanation.source_ids.some((sourceId) => !sourceIds.has(sourceId)) ||
      node.transition_explanation.text.length === 0 ||
      node.comparison_text.length === 0 ||
      node.entity_links.length < 1 ||
      node.entity_links.some((link) => !isOfficialHttpsUrl(link.href)) ||
      !Number.isFinite(node.calculated_characteristic_size_m) ||
      node.calculated_characteristic_size_m <= 0 ||
      !Number.isFinite(node.display_position_percent) ||
      node.display_position_percent < 0 ||
      node.display_position_percent > 100
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    nodeIds.add(node.id);
    rawNodesById.set(node.id, {
      calculated_characteristic_size_m: node.calculated_characteristic_size_m,
      display_position_percent: node.display_position_percent,
    });

    const expectedQuantity =
      node.source_quantity === "radius"
        ? "diameter"
        : node.source_quantity === "extent"
          ? "observable-extent"
          : node.source_quantity === "width"
            ? "width"
            : "diameter";
    if (node.characteristic_quantity !== expectedQuantity) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }

    if (node.comparison.kind === "contextual") {
      if (node.comparison.text.length === 0 || node.comparison_text !== node.comparison.text) {
        throw new Error("SCALE_EXPLORER_MODEL_INVALID");
      }
    } else if (
      !isScaleNodeId(node.comparison.reference_node_id) ||
      node.comparison.reference_node_id === node.id
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }

    const derivedQuantity = node.transition_explanation.derived_quantity;
    if (derivedQuantity !== undefined) {
      if (
        derivedQuantity.algorithm_id !== "scale-relative-ratio-v1" ||
        derivedQuantity.algorithm_version !== 1 ||
        derivedQuantity.input_unit !== "m" ||
        derivedQuantity.output_unit !== "dimensionless ratio" ||
        derivedQuantity.input_node_ids.length < 2 ||
        derivedQuantity.input_node_ids.some((nodeId) => !isScaleNodeId(nodeId)) ||
        new Set(derivedQuantity.input_node_ids).size !== derivedQuantity.input_node_ids.length ||
        !derivedQuantity.input_node_ids.includes(node.id) ||
        derivedQuantity.input_source_ids.length < 1 ||
        derivedQuantity.input_source_ids.some((sourceId) => !sourceIds.has(sourceId)) ||
        derivedQuantity.valid_domain.length === 0 ||
        derivedQuantity.numerical_tolerance.length === 0 ||
        derivedQuantity.test_references.length === 0 ||
        derivedQuantity.generated_at.length === 0 ||
        !derivedQuantity.generated_at.includes("T") ||
        derivedQuantity.learner_facing_rounding.length === 0
      ) {
        throw new Error("SCALE_EXPLORER_MODEL_INVALID");
      }
    }

    if (
      (previousCharacteristicSize !== undefined &&
        node.calculated_characteristic_size_m <= previousCharacteristicSize) ||
      (previousDisplayPosition !== undefined &&
        node.display_position_percent <= previousDisplayPosition)
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    previousCharacteristicSize = node.calculated_characteristic_size_m;
    previousDisplayPosition = node.display_position_percent;
  }

  if (
    rawNodes[0] === undefined ||
    !isRecord(rawNodes[0]) ||
    rawNodes.at(-1) === undefined ||
    !isRecord(rawNodes.at(-1)) ||
    rawNodes[0].display_position_percent !== 0 ||
    rawNodes.at(-1).display_position_percent !== 100
  ) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }

  const rawPairs = rawArtifact.pairwise_ratios;
  if (!Array.isArray(rawPairs)) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
  const expectedPairCount = SCALE_EXPLORER_NODE_IDS.length * (SCALE_EXPLORER_NODE_IDS.length - 1);
  const pairKeys = new Set<string>();
  const pairRatios = new Map<string, number>();
  for (const rawPair of rawPairs) {
    if (
      !isRecord(rawPair) ||
      !hasOnlyKeys(rawPair, ["selected_node_id", "reference_node_id", "ratio"]) ||
      !isScaleNodeId(rawPair.selected_node_id) ||
      !isScaleNodeId(rawPair.reference_node_id) ||
      !isFinitePositiveNumber(rawPair.ratio)
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    const selectedNode = rawNodesById.get(rawPair.selected_node_id);
    const referenceNode = rawNodesById.get(rawPair.reference_node_id);
    if (
      selectedNode === undefined ||
      referenceNode === undefined ||
      !Number.isFinite(selectedNode.calculated_characteristic_size_m) ||
      !Number.isFinite(referenceNode.calculated_characteristic_size_m)
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    // This is an integrity cross-check for the checked-in artifact, not the browser's
    // user-facing scientific model. Python owns the model calculations; the browser rejects a
    // tampered artifact whose supplied ratio no longer agrees with its reviewed node outputs.
    const expectedRatio =
      selectedNode.calculated_characteristic_size_m /
      referenceNode.calculated_characteristic_size_m;
    if (
      !Number.isFinite(expectedRatio) ||
      expectedRatio <= 0 ||
      Math.abs(rawPair.ratio - expectedRatio) >
        expectedRatio * SCALE_EXPLORER_ARITHMETIC_RELATIVE_TOLERANCE
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    const key = `${rawPair.selected_node_id}|${rawPair.reference_node_id}`;
    if (
      pairKeys.has(key) ||
      rawPair.selected_node_id === rawPair.reference_node_id ||
      !isScaleNodeId(rawPair.selected_node_id) ||
      !isScaleNodeId(rawPair.reference_node_id) ||
      !Number.isFinite(rawPair.ratio) ||
      rawPair.ratio <= 0
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    pairKeys.add(key);
    pairRatios.set(key, rawPair.ratio);
  }
  if (pairKeys.size !== expectedPairCount) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }

  const rawFixtures = rawArtifact.validation_fixtures;
  if (!Array.isArray(rawFixtures) || rawFixtures.length === 0) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
  const fixtureIds: string[] = [];
  const requiredFixtureKeys = [
    "id",
    "node_id",
    "expected_characteristic_size_m",
    "tolerance_m",
    "purpose",
  ];
  for (const rawFixture of rawFixtures) {
    if (
      !isRecord(rawFixture) ||
      !hasNoUnknownKeys(rawFixture, [
        ...requiredFixtureKeys,
        "expected_position_percent",
        "position_tolerance_percent",
        "expected_comparison",
      ]) ||
      !hasRequiredKeys(rawFixture, requiredFixtureKeys) ||
      !isNonEmptyString(rawFixture.id) ||
      fixtureIds.includes(rawFixture.id) ||
      !isScaleNodeId(rawFixture.node_id) ||
      !isFinitePositiveNumber(rawFixture.expected_characteristic_size_m) ||
      !isFiniteNonNegativeNumber(rawFixture.tolerance_m) ||
      !isNonEmptyString(rawFixture.purpose)
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    fixtureIds.push(rawFixture.id);
    if (rawFixture.expected_position_percent !== undefined) {
      if (
        !isFiniteNonNegativeNumber(rawFixture.expected_position_percent) ||
        rawFixture.expected_position_percent > 100
      ) {
        throw new Error("SCALE_EXPLORER_MODEL_INVALID");
      }
      if (
        rawFixture.position_tolerance_percent !== undefined &&
        !isFiniteNonNegativeNumber(rawFixture.position_tolerance_percent)
      ) {
        throw new Error("SCALE_EXPLORER_MODEL_INVALID");
      }
    } else if (rawFixture.position_tolerance_percent !== undefined) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    const rawExpectedComparison = rawFixture.expected_comparison;
    if (rawExpectedComparison !== undefined) {
      if (
        !isRecord(rawExpectedComparison) ||
        !hasOnlyKeys(rawExpectedComparison, [
          "reference_node_id",
          "expected_ratio",
          "ratio_relative_tolerance",
        ]) ||
        !isScaleNodeId(rawExpectedComparison.reference_node_id) ||
        rawExpectedComparison.reference_node_id === rawFixture.node_id ||
        !isFinitePositiveNumber(rawExpectedComparison.expected_ratio) ||
        !isFinitePositiveNumber(rawExpectedComparison.ratio_relative_tolerance)
      ) {
        throw new Error("SCALE_EXPLORER_MODEL_INVALID");
      }
      const pairKey = `${rawFixture.node_id}|${rawExpectedComparison.reference_node_id}`;
      const pairRatio = pairRatios.get(pairKey);
      if (
        pairRatio === undefined ||
        Math.abs(pairRatio - rawExpectedComparison.expected_ratio) >
          rawExpectedComparison.expected_ratio * rawExpectedComparison.ratio_relative_tolerance
      ) {
        throw new Error("SCALE_EXPLORER_MODEL_INVALID");
      }
    }

    const node = rawNodesById.get(rawFixture.node_id);
    if (
      node === undefined ||
      Math.abs(node.calculated_characteristic_size_m - rawFixture.expected_characteristic_size_m) >
        rawFixture.tolerance_m
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
    if (
      rawFixture.expected_position_percent !== undefined &&
      Math.abs(node.display_position_percent - rawFixture.expected_position_percent) >
        (rawFixture.position_tolerance_percent ?? 0)
    ) {
      throw new Error("SCALE_EXPLORER_MODEL_INVALID");
    }
  }
  if (!isExactStringArray(rawDefinition.validation_fixtures, fixtureIds)) {
    throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  }
}

validateScaleExplorerArtifact(scaleExplorerArtifact);

function uniqueStrings(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)];
}

function buildComparison(entry: ScaleExplorerPositionedBaseNode): ScaleExplorerComparison {
  const definition = entry.node.comparison;
  if (definition.kind === "contextual") {
    return {
      algorithm_id: "authored-context-v1",
      algorithm_version: 1,
      input_node_ids: [entry.node.id],
      input_source_ids: entry.node.source_ids,
      kind: "contextual",
      rounding: "No numeric comparison; this is an authored reference context.",
      text: entry.node.comparison_text,
      unit: "not-applicable",
    };
  }

  const reference = SCALE_EXPLORER_NODES.find(
    (candidate) => candidate.id === definition.reference_node_id,
  );
  if (reference === undefined) throw new Error("SCALE_EXPLORER_MODEL_INVALID");
  return {
    algorithm_id: "scale-relative-ratio-v1",
    algorithm_version: 1,
    input_node_ids: [entry.node.id, reference.id],
    input_source_ids: uniqueStrings([...entry.node.source_ids, ...reference.source_ids]),
    kind: "calculated-ratio",
    ratio: calculateScaleExplorerRatio(entry.node.id, reference.id),
    reference_node_id: reference.id,
    rounding:
      "The learner-facing comparison sentence is rounded to two significant figures; the source values remain approximate.",
    text: entry.node.comparison_text,
    unit: "dimensionless",
  };
}

/** Build the complete deterministic output consumed by the visual renderer. */
export function buildScaleExplorerModel(value: unknown): ScaleExplorerModel {
  const state = validateScaleExplorerState(value);
  if (state === null) throw new ScaleExplorerValidationError();

  const positionedNodes: ReadonlyArray<ScaleExplorerPositionedBaseNode> = SCALE_EXPLORER_NODES.map(
    (node) => ({
      node,
      characteristic_size_m: node.calculated_characteristic_size_m,
      position_percent: node.display_position_percent,
    }),
  );
  const nodes: ReadonlyArray<ScaleExplorerPositionedNode> = positionedNodes.map((entry) => ({
    ...entry,
    comparison: buildComparison(entry),
  }));

  const selectedIndex = SCALE_EXPLORER_NODES.findIndex((node) => node.id === state.node_id);
  const selectedNode = nodes[selectedIndex];
  if (selectedIndex < 0 || selectedNode === undefined) {
    throw new ScaleExplorerValidationError();
  }

  const previous = nodes[selectedIndex - 1];
  const next = nodes[selectedIndex + 1];
  return {
    model_version: SCALE_EXPLORER_MODEL_VERSION,
    nodes,
    range: {
      maximum_size_m: nodes.at(-1)?.characteristic_size_m ?? 0,
      minimum_size_m: nodes[0]?.characteristic_size_m ?? 0,
    },
    selected: {
      index: selectedIndex,
      ...selectedNode,
      ...(previous === undefined ? {} : { previous }),
      ...(next === undefined ? {} : { next }),
    },
    state,
  };
}
