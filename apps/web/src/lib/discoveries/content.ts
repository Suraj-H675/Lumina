import rawReviewedDiscoveries from "../../content/discoveries/reviewed-discoveries.json";

export const REVIEWED_DISCOVERY_SCHEMA_VERSION = 1 as const;

export type DiscoveryContentType = "mission-update" | "paper" | "science-release";
export type DiscoveryConfirmationState =
  "independently-confirmed" | "official-source-only" | "peer-reviewed-publication";
export type DiscoverySourceKind = "official-agency" | "peer-reviewed-paper";

export type DiscoverySource = Readonly<{
  organization: string;
  source_kind: DiscoverySourceKind;
  title: string;
  url: string;
}>;

export type ReviewedDiscovery = Readonly<{
  content_type: DiscoveryContentType;
  event_date: string | null;
  id: string;
  independent_confirmation_state: DiscoveryConfirmationState;
  publication_date: string;
  slug: string;
  sources: ReadonlyArray<DiscoverySource>;
  summary: string;
  title: string;
  why_it_matters: string;
}>;
export type ReviewedDiscoveryBundle = Readonly<{
  bundle_id: string;
  entries: ReadonlyArray<ReviewedDiscovery>;
  reviewed_at: string;
  reviewed_by: ReadonlyArray<string>;
  schema_version: 1;
}>;

export class DiscoveryContentValidationError extends Error {
  readonly code = "DISCOVERY_CONTENT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "DiscoveryContentValidationError";
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_ENTRIES = 12;
const MAX_SOURCES = 4;

function fail(message: string): never {
  throw new DiscoveryContentValidationError(message);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>, field: string) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${field} contains unexpected or missing fields`);
  }
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    fail(`${field} must be trimmed non-empty text`);
  }
  if (value.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    fail(`${field} exceeds the reviewed text contract`);
  }
  return value;
}

function date(value: unknown, field: string): string {
  const result = text(value, field, 10);
  if (!DATE_PATTERN.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00.000Z`))) {
    fail(`${field} must be an ISO calendar date`);
  }
  return result;
}
function optionalDate(value: unknown, field: string): string | null {
  return value === null ? null : date(value, field);
}

function timestamp(value: unknown, field: string): string {
  const result = text(value, field, 24);
  if (!ISO_TIMESTAMP_PATTERN.test(result) || new Date(result).toISOString() !== result) {
    fail(`${field} must be a canonical UTC timestamp`);
  }
  return result;
}

function slug(value: unknown, field: string): string {
  const result = text(value, field, 120);
  if (!SLUG_PATTERN.test(result)) fail(`${field} must be lowercase kebab-case`);
  return result;
}

function httpsUrl(value: unknown, field: string): string {
  const result = text(value, field, 2048);
  let parsed: URL;
  try {
    parsed = new URL(result);
  } catch {
    fail(`${field} must be an absolute HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    fail(`${field} must be an absolute HTTPS URL without credentials`);
  }
  return result;
}
function contentType(value: unknown, field: string): DiscoveryContentType {
  if (value !== "mission-update" && value !== "paper" && value !== "science-release") {
    fail(`${field} has an unsupported content type`);
  }
  return value;
}

function confirmationState(value: unknown, field: string): DiscoveryConfirmationState {
  if (
    value !== "independently-confirmed" &&
    value !== "official-source-only" &&
    value !== "peer-reviewed-publication"
  ) {
    fail(`${field} has an unsupported confirmation state`);
  }
  return value;
}

function sourceKind(value: unknown, field: string): DiscoverySourceKind {
  if (value !== "official-agency" && value !== "peer-reviewed-paper") {
    fail(`${field} has an unsupported source kind`);
  }
  return value;
}

function validateSource(value: unknown, field: string): DiscoverySource {
  if (!isRecord(value)) fail(`${field} must be an object`);
  exactKeys(value, ["organization", "source_kind", "title", "url"], field);
  return {
    organization: text(value.organization, `${field}.organization`, 180),
    source_kind: sourceKind(value.source_kind, `${field}.source_kind`),
    title: text(value.title, `${field}.title`, 300),
    url: httpsUrl(value.url, `${field}.url`),
  };
}
function validateEntry(value: unknown, index: number): ReviewedDiscovery {
  const field = `entries[${index}]`;
  if (!isRecord(value)) fail(`${field} must be an object`);
  exactKeys(
    value,
    [
      "content_type",
      "event_date",
      "id",
      "independent_confirmation_state",
      "publication_date",
      "slug",
      "sources",
      "summary",
      "title",
      "why_it_matters",
    ],
    field,
  );
  if (
    !Array.isArray(value.sources) ||
    value.sources.length < 1 ||
    value.sources.length > MAX_SOURCES
  ) {
    fail(`${field}.sources must contain between 1 and ${MAX_SOURCES} sources`);
  }
  const publicationDate = date(value.publication_date, `${field}.publication_date`);
  const eventDate = optionalDate(value.event_date, `${field}.event_date`);
  if (eventDate !== null && eventDate > publicationDate) {
    fail(`${field}.event_date cannot follow publication_date`);
  }
  return {
    content_type: contentType(value.content_type, `${field}.content_type`),
    event_date: eventDate,
    id: slug(value.id, `${field}.id`),
    independent_confirmation_state: confirmationState(
      value.independent_confirmation_state,
      `${field}.independent_confirmation_state`,
    ),
    publication_date: publicationDate,
    slug: slug(value.slug, `${field}.slug`),
    sources: value.sources.map((source, sourceIndex) =>
      validateSource(source, `${field}.sources[${sourceIndex}]`),
    ),
    summary: text(value.summary, `${field}.summary`, 900),
    title: text(value.title, `${field}.title`, 220),
    why_it_matters: text(value.why_it_matters, `${field}.why_it_matters`, 900),
  };
}

export function validateReviewedDiscoveries(value: unknown): ReviewedDiscoveryBundle {
  if (!isRecord(value)) fail("reviewed discovery bundle must be an object");
  exactKeys(
    value,
    ["bundle_id", "entries", "reviewed_at", "reviewed_by", "schema_version"],
    "bundle",
  );
  if (value.schema_version !== REVIEWED_DISCOVERY_SCHEMA_VERSION) {
    fail("reviewed discovery schema version is unsupported");
  }
  if (
    !Array.isArray(value.entries) ||
    value.entries.length < 1 ||
    value.entries.length > MAX_ENTRIES
  ) {
    fail(`entries must contain between 1 and ${MAX_ENTRIES} reviewed discoveries`);
  }
  if (
    !Array.isArray(value.reviewed_by) ||
    value.reviewed_by.length < 1 ||
    !value.reviewed_by.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    fail("reviewed_by must contain at least one reviewer label");
  }
  const reviewedAt = timestamp(value.reviewed_at, "reviewed_at");
  const entries = value.entries.map(validateEntry);
  const ids = new Set(entries.map((entry) => entry.id));
  const slugs = new Set(entries.map((entry) => entry.slug));
  if (ids.size !== entries.length || slugs.size !== entries.length)
    fail("reviewed discovery identity is duplicated");
  const ordered = [...entries].sort(
    (left, right) =>
      right.publication_date.localeCompare(left.publication_date) ||
      left.id.localeCompare(right.id),
  );
  if (ordered.some((entry, index) => entry.id !== entries[index]?.id)) {
    fail("reviewed discoveries must be canonically ordered by publication date");
  }
  const reviewedDate = reviewedAt.slice(0, 10);
  if (entries.some((entry) => entry.publication_date > reviewedDate)) {
    fail("reviewed discoveries cannot post-date the review timestamp");
  }
  return {
    bundle_id: slug(value.bundle_id, "bundle_id"),
    entries,
    reviewed_at: reviewedAt,
    reviewed_by: value.reviewed_by.map((item, index) => text(item, `reviewed_by[${index}]`, 120)),
    schema_version: REVIEWED_DISCOVERY_SCHEMA_VERSION,
  };
}

let cached: ReviewedDiscoveryBundle | null = null;

export function loadReviewedDiscoveries(): ReviewedDiscoveryBundle {
  cached ??= validateReviewedDiscoveries(rawReviewedDiscoveries as unknown);
  return cached;
}

export function latestReviewedDiscovery(): ReviewedDiscovery {
  const first = loadReviewedDiscoveries().entries[0];
  if (first === undefined) fail("reviewed discovery bundle is empty");
  return first;
}
