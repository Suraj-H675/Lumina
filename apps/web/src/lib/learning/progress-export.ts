import { validateLearningProgress, type LearningProgressData } from "./progress-model";

export const LEARNING_PROGRESS_EXPORT_FORMAT = "lumina-personal-data" as const;
export const LEARNING_PROGRESS_EXPORT_SCHEMA_VERSION = 1 as const;
export const MAX_LEARNING_PROGRESS_IMPORT_BYTES = 1_000_000;

export type LearningProgressExport = {
  format: "lumina-personal-data";
  schema_version: 1;
  exported_at: string;
  sections: { learning_progress: LearningProgressData };
  checksums: { learning_progress: string };
};

export class LearningProgressImportError extends Error {
  readonly code = "LEARNING_PROGRESS_IMPORT_INVALID";

  constructor() {
    super("This learning-progress file could not be validated, so nothing was imported.");
    this.name = "LearningProgressImportError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

async function sha256(value: string): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) throw new LearningProgressImportError();
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalProgress(progress: LearningProgressData): string {
  return JSON.stringify(progress);
}

export async function createLearningProgressExport(
  progress: LearningProgressData,
  exportedAt: string,
): Promise<LearningProgressExport> {
  const validated = validateLearningProgress(progress);
  if (validated === null || !isTimestamp(exportedAt)) throw new LearningProgressImportError();
  return {
    checksums: { learning_progress: await sha256(canonicalProgress(validated)) },
    exported_at: exportedAt,
    format: LEARNING_PROGRESS_EXPORT_FORMAT,
    schema_version: LEARNING_PROGRESS_EXPORT_SCHEMA_VERSION,
    sections: { learning_progress: validated },
  };
}

/** Parse and checksum-verify untrusted JSON before it reaches the progress store. */
export async function parseLearningProgressExport(raw: string): Promise<LearningProgressData> {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).byteLength > MAX_LEARNING_PROGRESS_IMPORT_BYTES
  ) {
    throw new LearningProgressImportError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new LearningProgressImportError();
  }
  if (
    !isRecord(parsed) ||
    !hasOnlyKeys(parsed, ["checksums", "exported_at", "format", "schema_version", "sections"]) ||
    parsed.format !== LEARNING_PROGRESS_EXPORT_FORMAT ||
    parsed.schema_version !== LEARNING_PROGRESS_EXPORT_SCHEMA_VERSION ||
    !isTimestamp(parsed.exported_at) ||
    !isRecord(parsed.sections) ||
    !hasOnlyKeys(parsed.sections, ["learning_progress"]) ||
    !isRecord(parsed.checksums) ||
    !hasOnlyKeys(parsed.checksums, ["learning_progress"]) ||
    typeof parsed.checksums.learning_progress !== "string"
  ) {
    throw new LearningProgressImportError();
  }
  const progress = validateLearningProgress(parsed.sections.learning_progress);
  if (progress === null) throw new LearningProgressImportError();
  const expected = await sha256(canonicalProgress(progress));
  if (expected !== parsed.checksums.learning_progress) throw new LearningProgressImportError();
  return progress;
}
