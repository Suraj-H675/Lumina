export const JOURNAL_ENTRY_SCHEMA_VERSION = 1 as const;
export const MAX_JOURNAL_ENTRIES = 500;
export const MAX_JOURNAL_OBJECTS = 100;
export const MAX_JOURNAL_EQUIPMENT_ITEMS = 20;
export const MAX_JOURNAL_TAGS = 20;
export const MAX_JOURNAL_ATTACHMENTS = 8;
export const MAX_JOURNAL_TITLE_CODE_POINTS = 120;
export const MAX_JOURNAL_NOTES_CODE_POINTS = 10_000;
export const MAX_JOURNAL_CONDITIONS_CODE_POINTS = 2_000;

const MAX_SHORT_TEXT = 200;
const MAX_EQUIPMENT_TEXT = 160;
const MAX_TAG_CODE_POINTS = 40;
const MAX_LOCATION_LABEL_CODE_POINTS = 120;
const MAX_FRAME_CODE_POINTS = 40;
const MAX_SOLVER_VERSION_CODE_POINTS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export type JournalObjectSource = "catalog" | "manual" | "plate_annotation";

export type JournalObjectReference = Readonly<{
  entity_id: string | null;
  name: string;
  source: JournalObjectSource;
}>;

export type ConfirmedObservationTime = Readonly<{
  confirmed_by_user: true;
  utc: string;
}>;

export type ConfirmedJournalLocation = Readonly<{
  confirmed_by_user: true;
  label: string;
  latitude_deg: number | null;
  longitude_deg: number | null;
}>;

export type JournalPlateSolveSnapshot = Readonly<{
  snapshot_id: string;
  center_ra_deg: number;
  center_dec_deg: number;
  frame: string;
  orientation_deg: number;
  parity: "negative" | "positive";
  pixel_scale_arcsec: number;
  radius_deg: number;
  solved_at: string;
  solver_version: string;
  wcs_source_sha256: string;
}>;

export type JournalImportProvenance = Readonly<{
  exported_at: string;
  imported_at: string;
}>;

export type JournalEntry = Readonly<{
  id: string;
  schema_version: 1;
  created_at: string;
  updated_at: string;
  title: string;
  observed_time: ConfirmedObservationTime | null;
  location: ConfirmedJournalLocation | null;
  objects: Array<JournalObjectReference>;
  equipment: string[];
  conditions: string | null;
  notes: string;
  rating: number | null;
  tags: string[];
  follow_up: boolean;
  plate_solve: JournalPlateSolveSnapshot | null;
  attachment_ids: string[];
  import_provenance: JournalImportProvenance | null;
}>;

export type JournalEntryInput = Readonly<{
  title: string;
  observed_time?: ConfirmedObservationTime | null;
  location?: ConfirmedJournalLocation | null;
  objects?: ReadonlyArray<JournalObjectReference>;
  equipment?: ReadonlyArray<string>;
  conditions?: string | null;
  notes?: string;
  rating?: number | null;
  tags?: ReadonlyArray<string>;
  follow_up?: boolean;
  plate_solve?: JournalPlateSolveSnapshot | null;
  attachment_ids?: ReadonlyArray<string>;
}>;

export class JournalValidationError extends Error {
  readonly code = "JOURNAL_INVALID";

  constructor() {
    super("This journal entry could not be validated.");
    this.name = "JournalValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}

function codePointLength(value: string): number {
  return [...value].length;
}

function isBoundedText(value: unknown, maximum: number, allowEmpty = false): value is string {
  if (typeof value !== "string") return false;
  const length = codePointLength(value);
  return (allowEmpty || length > 0) && length <= maximum;
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function canonicalUtcTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new JournalValidationError();
  return parsed.toISOString();
}

export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isJournalObjectReference(value: unknown): value is JournalObjectReference {
  if (!isRecord(value) || !hasOnlyKeys(value, ["entity_id", "name", "source"])) return false;
  return (
    (value.entity_id === null || isUuid(value.entity_id)) &&
    isBoundedText(value.name, MAX_SHORT_TEXT) &&
    ["catalog", "manual", "plate_annotation"].includes(String(value.source))
  );
}

function isConfirmedObservationTime(value: unknown): value is ConfirmedObservationTime {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["confirmed_by_user", "utc"]) &&
    value.confirmed_by_user === true &&
    isCanonicalUtcTimestamp(value.utc)
  );
}

function isConfirmedLocation(value: unknown): value is ConfirmedJournalLocation {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["confirmed_by_user", "label", "latitude_deg", "longitude_deg"]) ||
    value.confirmed_by_user !== true ||
    !isBoundedText(value.label, MAX_LOCATION_LABEL_CODE_POINTS)
  ) {
    return false;
  }
  const lat = value.latitude_deg;
  const lon = value.longitude_deg;
  if ((lat === null) !== (lon === null)) return false;
  if (lat === null && lon === null) return true;
  return (
    isFiniteNumber(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    isFiniteNumber(lon) &&
    lon >= -180 &&
    lon <= 180
  );
}

function isPlateSolveSnapshot(value: unknown): value is JournalPlateSolveSnapshot {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "snapshot_id",
      "center_ra_deg",
      "center_dec_deg",
      "frame",
      "orientation_deg",
      "parity",
      "pixel_scale_arcsec",
      "radius_deg",
      "solved_at",
      "solver_version",
      "wcs_source_sha256",
    ])
  ) {
    return false;
  }
  return (
    isUuidV4(value.snapshot_id) &&
    isFiniteNumber(value.center_ra_deg) &&
    value.center_ra_deg >= 0 &&
    value.center_ra_deg < 360 &&
    isFiniteNumber(value.center_dec_deg) &&
    value.center_dec_deg >= -90 &&
    value.center_dec_deg <= 90 &&
    isBoundedText(value.frame, MAX_FRAME_CODE_POINTS) &&
    isFiniteNumber(value.orientation_deg) &&
    value.orientation_deg >= -360 &&
    value.orientation_deg <= 360 &&
    (value.parity === "positive" || value.parity === "negative") &&
    isFiniteNumber(value.pixel_scale_arcsec) &&
    value.pixel_scale_arcsec > 0 &&
    value.pixel_scale_arcsec <= 3600 &&
    isFiniteNumber(value.radius_deg) &&
    value.radius_deg > 0 &&
    value.radius_deg <= 180 &&
    isCanonicalUtcTimestamp(value.solved_at) &&
    isBoundedText(value.solver_version, MAX_SOLVER_VERSION_CODE_POINTS) &&
    typeof value.wcs_source_sha256 === "string" &&
    SHA256_PATTERN.test(value.wcs_source_sha256)
  );
}

function isImportProvenance(value: unknown): value is JournalImportProvenance {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["exported_at", "imported_at"]) &&
    isCanonicalUtcTimestamp(value.exported_at) &&
    isCanonicalUtcTimestamp(value.imported_at)
  );
}

function uniqueStrings(values: ReadonlyArray<string>): boolean {
  return new Set(values).size === values.length;
}

function validateStringList(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximumItems &&
    value.every((item) => isBoundedText(item, maximumLength)) &&
    uniqueStrings(value)
  );
}

const ENTRY_KEYS = [
  "id",
  "schema_version",
  "created_at",
  "updated_at",
  "title",
  "observed_time",
  "location",
  "objects",
  "equipment",
  "conditions",
  "notes",
  "rating",
  "tags",
  "follow_up",
  "plate_solve",
  "attachment_ids",
  "import_provenance",
] as const;

export function validateJournalEntry(value: unknown): JournalEntry | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ENTRY_KEYS)) return null;
  if (
    !isUuidV4(value.id) ||
    value.schema_version !== JOURNAL_ENTRY_SCHEMA_VERSION ||
    !isCanonicalUtcTimestamp(value.created_at) ||
    !isCanonicalUtcTimestamp(value.updated_at) ||
    value.updated_at < value.created_at ||
    !isBoundedText(value.title, MAX_JOURNAL_TITLE_CODE_POINTS) ||
    !(value.observed_time === null || isConfirmedObservationTime(value.observed_time)) ||
    !(value.location === null || isConfirmedLocation(value.location)) ||
    !Array.isArray(value.objects) ||
    value.objects.length > MAX_JOURNAL_OBJECTS ||
    !value.objects.every(isJournalObjectReference) ||
    !validateStringList(value.equipment, MAX_JOURNAL_EQUIPMENT_ITEMS, MAX_EQUIPMENT_TEXT) ||
    !(
      value.conditions === null ||
      isBoundedText(value.conditions, MAX_JOURNAL_CONDITIONS_CODE_POINTS, true)
    ) ||
    !isBoundedText(value.notes, MAX_JOURNAL_NOTES_CODE_POINTS, true) ||
    !(
      value.rating === null ||
      (Number.isInteger(value.rating) && Number(value.rating) >= 1 && Number(value.rating) <= 5)
    ) ||
    !validateStringList(value.tags, MAX_JOURNAL_TAGS, MAX_TAG_CODE_POINTS) ||
    typeof value.follow_up !== "boolean" ||
    !(value.plate_solve === null || isPlateSolveSnapshot(value.plate_solve)) ||
    !validateStringList(value.attachment_ids, MAX_JOURNAL_ATTACHMENTS, 36) ||
    !value.attachment_ids.every(isUuidV4) ||
    !(value.import_provenance === null || isImportProvenance(value.import_provenance))
  ) {
    return null;
  }
  const objectKeys = value.objects.map(
    (item) => `${item.source}:${item.entity_id ?? ""}:${item.name}`,
  );
  if (!uniqueStrings(objectKeys)) return null;
  return value as JournalEntry;
}

function normalizeRequiredText(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ");
}

function cloneObjects(
  values: ReadonlyArray<JournalObjectReference>,
): Array<JournalObjectReference> {
  return values.map((value) => ({ ...value, name: normalizeRequiredText(value.name) }));
}

function normalizeList(values: ReadonlyArray<string>): string[] {
  return values.map(normalizeRequiredText).filter((value) => value.length > 0);
}

function normalizeConfirmedTime(
  value: ConfirmedObservationTime | null | undefined,
): ConfirmedObservationTime | null {
  if (value == null) return null;
  return { confirmed_by_user: true, utc: canonicalUtcTimestamp(value.utc) };
}

function normalizeLocation(
  value: ConfirmedJournalLocation | null | undefined,
): ConfirmedJournalLocation | null {
  if (value == null) return null;
  return { ...value, label: normalizeRequiredText(value.label) };
}

function normalizePlateSolve(
  value: JournalPlateSolveSnapshot | null | undefined,
): JournalPlateSolveSnapshot | null {
  if (value == null) return null;
  return {
    ...value,
    frame: normalizeRequiredText(value.frame),
    solved_at: canonicalUtcTimestamp(value.solved_at),
    solver_version: normalizeRequiredText(value.solver_version),
  };
}

export function createJournalEntry(
  input: JournalEntryInput,
  id: string,
  now: string,
): JournalEntry {
  const timestamp = canonicalUtcTimestamp(now);
  const candidate: JournalEntry = {
    attachment_ids: [...(input.attachment_ids ?? [])],
    conditions: input.conditions?.trim() ?? null,
    created_at: timestamp,
    equipment: normalizeList(input.equipment ?? []),
    follow_up: input.follow_up ?? false,
    id,
    import_provenance: null,
    location: normalizeLocation(input.location),
    notes: input.notes?.trim() ?? "",
    objects: cloneObjects(input.objects ?? []),
    observed_time: normalizeConfirmedTime(input.observed_time),
    plate_solve: normalizePlateSolve(input.plate_solve),
    rating: input.rating ?? null,
    schema_version: JOURNAL_ENTRY_SCHEMA_VERSION,
    tags: normalizeList(input.tags ?? []),
    title: normalizeRequiredText(input.title),
    updated_at: timestamp,
  };
  const validated = validateJournalEntry(candidate);
  if (validated === null) throw new JournalValidationError();
  return validated;
}

export function journalEntryWithImportProvenance(
  entry: JournalEntry,
  exportedAt: string,
  importedAt: string,
): JournalEntry {
  const candidate: JournalEntry = {
    ...entry,
    import_provenance: {
      exported_at: canonicalUtcTimestamp(exportedAt),
      imported_at: canonicalUtcTimestamp(importedAt),
    },
  };
  const validated = validateJournalEntry(candidate);
  if (validated === null) throw new JournalValidationError();
  return validated;
}
