"use client";

import Dexie, { type EntityTable } from "dexie";

import {
  MAX_JOURNAL_ATTACHMENTS,
  MAX_JOURNAL_ENTRIES,
  createJournalEntry,
  isUuidV4,
  validateJournalEntry,
  type JournalEntry,
  type JournalEntryInput,
} from "./model";

export const LUMINA_PERSONAL_DB_NAME = "lumina-personal";
export const JOURNAL_DATABASE_VERSION = 1;
export const JOURNAL_ATTACHMENT_SCHEMA_VERSION = 1 as const;
export const MAX_JOURNAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const JOURNAL_MIME_TYPES = ["image/jpeg", "image/png"] as const;
const JOURNAL_ATTACHMENT_KEYS = [
  "id",
  "schema_version",
  "journal_entry_id",
  "created_at",
  "updated_at",
  "mime_type",
  "byte_size",
  "sha256",
  "blob",
] as const;
type JournalImageMimeType = (typeof JOURNAL_MIME_TYPES)[number];

export type JournalImageAttachment = Readonly<{
  id: string;
  schema_version: 1;
  journal_entry_id: string;
  created_at: string;
  updated_at: string;
  mime_type: JournalImageMimeType;
  byte_size: number;
  sha256: string;
  blob: Blob;
}>;

type LuminaPersonalDatabase = Dexie & {
  journalEntries: EntityTable<JournalEntry, "id">;
  journalAttachments: EntityTable<JournalImageAttachment, "id">;
};

let database: LuminaPersonalDatabase | null = null;

export type JournalStorageFailureReason =
  | "storage-unavailable"
  | "storage-corrupted"
  | "entry-limit"
  | "attachment-limit"
  | "entry-not-found"
  | "invalid-entry"
  | "invalid-attachment"
  | "storage-write-failed";

export class JournalStorageError extends Error {
  readonly reason: JournalStorageFailureReason;

  constructor(reason: JournalStorageFailureReason) {
    super("Local journal storage is unavailable or rejected the operation.");
    this.name = "JournalStorageError";
    this.reason = reason;
  }
}

function createDatabase(): LuminaPersonalDatabase {
  const db = new Dexie(LUMINA_PERSONAL_DB_NAME) as LuminaPersonalDatabase;
  db.version(JOURNAL_DATABASE_VERSION).stores({
    journalEntries: "&id, updated_at, created_at",
    journalAttachments: "&id, journal_entry_id, created_at",
  });
  return db;
}

function journalDatabase(): LuminaPersonalDatabase {
  database ??= createDatabase();
  return database;
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomUuid(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new JournalStorageError("storage-unavailable");
  }
  return crypto.randomUUID();
}

function classifyStorageError(error: unknown): JournalStorageError {
  if (error instanceof JournalStorageError) return error;
  if (error instanceof Dexie.DatabaseClosedError || error instanceof Dexie.MissingAPIError) {
    return new JournalStorageError("storage-unavailable");
  }
  return new JournalStorageError("storage-write-failed");
}

async function validatedEntries(db: LuminaPersonalDatabase): Promise<JournalEntry[]> {
  const entries = await db.journalEntries.orderBy("updated_at").reverse().toArray();
  const validated: JournalEntry[] = [];
  for (const entry of entries) {
    const safe = validateJournalEntry(entry);
    if (safe === null) throw new JournalStorageError("storage-corrupted");
    validated.push(safe);
  }
  return validated;
}

export async function listJournalEntries(): Promise<JournalEntry[]> {
  try {
    return await validatedEntries(journalDatabase());
  } catch (error) {
    throw classifyStorageError(error);
  }
}

export async function getJournalEntry(id: string): Promise<JournalEntry | null> {
  if (!isUuidV4(id)) throw new JournalStorageError("invalid-entry");
  try {
    const entry = await journalDatabase().journalEntries.get(id);
    if (entry === undefined) return null;
    const validated = validateJournalEntry(entry);
    if (validated === null) throw new JournalStorageError("storage-corrupted");
    return validated;
  } catch (error) {
    throw classifyStorageError(error);
  }
}

export async function createJournalEntryInDatabase(
  input: JournalEntryInput,
): Promise<JournalEntry> {
  const entry = createJournalEntry(input, randomUuid(), nowIso());
  const db = journalDatabase();
  try {
    await db.transaction("rw", db.journalEntries, async () => {
      if ((await db.journalEntries.count()) >= MAX_JOURNAL_ENTRIES) {
        throw new JournalStorageError("entry-limit");
      }
      await db.journalEntries.add(entry);
    });
    return entry;
  } catch (error) {
    throw classifyStorageError(error);
  }
}

export async function putValidatedJournalEntry(entry: JournalEntry): Promise<void> {
  const validated = validateJournalEntry(entry);
  if (validated === null) throw new JournalStorageError("invalid-entry");
  const db = journalDatabase();
  try {
    await db.transaction("rw", db.journalEntries, async () => {
      const existing = await db.journalEntries.get(validated.id);
      if (existing === undefined && (await db.journalEntries.count()) >= MAX_JOURNAL_ENTRIES) {
        throw new JournalStorageError("entry-limit");
      }
      await db.journalEntries.put(validated);
    });
  } catch (error) {
    throw classifyStorageError(error);
  }
}

function isJournalMimeType(value: string): value is JournalImageMimeType {
  return (JOURNAL_MIME_TYPES as ReadonlyArray<string>).includes(value);
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isBlobLike(value: unknown): value is Blob {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { arrayBuffer?: unknown; size?: unknown; type?: unknown };
  return (
    typeof candidate.arrayBuffer === "function" &&
    typeof candidate.size === "number" &&
    Number.isFinite(candidate.size) &&
    typeof candidate.type === "string"
  );
}

export function validateJournalImageAttachment(value: unknown): JournalImageAttachment | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) => !JOURNAL_ATTACHMENT_KEYS.includes(key as (typeof JOURNAL_ATTACHMENT_KEYS)[number]),
    )
  ) {
    return null;
  }
  const attachment = value as JournalImageAttachment;
  const valid =
    isUuidV4(attachment.id) &&
    attachment.schema_version === JOURNAL_ATTACHMENT_SCHEMA_VERSION &&
    isUuidV4(attachment.journal_entry_id) &&
    isCanonicalTimestamp(attachment.created_at) &&
    isCanonicalTimestamp(attachment.updated_at) &&
    attachment.updated_at >= attachment.created_at &&
    isJournalMimeType(attachment.mime_type) &&
    Number.isInteger(attachment.byte_size) &&
    attachment.byte_size > 0 &&
    attachment.byte_size <= MAX_JOURNAL_ATTACHMENT_BYTES &&
    isBlobLike(attachment.blob) &&
    attachment.blob.size === attachment.byte_size &&
    attachment.blob.type === attachment.mime_type &&
    /^[0-9a-f]{64}$/u.test(attachment.sha256);
  return valid ? attachment : null;
}

async function sha256Blob(value: Blob): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new JournalStorageError("storage-unavailable");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await value.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function attachJournalImage(
  entryId: string,
  source: Blob,
): Promise<JournalImageAttachment> {
  if (
    !isUuidV4(entryId) ||
    !isJournalMimeType(source.type) ||
    source.size <= 0 ||
    source.size > MAX_JOURNAL_ATTACHMENT_BYTES
  ) {
    throw new JournalStorageError("invalid-attachment");
  }
  const db = journalDatabase();
  const timestamp = nowIso();
  const blob = new Blob([source], { type: source.type });
  const attachment: JournalImageAttachment = {
    blob,
    byte_size: source.size,
    created_at: timestamp,
    id: randomUuid(),
    journal_entry_id: entryId,
    mime_type: source.type,
    schema_version: JOURNAL_ATTACHMENT_SCHEMA_VERSION,
    sha256: await sha256Blob(blob),
    updated_at: timestamp,
  };
  if (validateJournalImageAttachment(attachment) === null) {
    throw new JournalStorageError("invalid-attachment");
  }
  try {
    await db.transaction("rw", db.journalEntries, db.journalAttachments, async () => {
      const entry = await db.journalEntries.get(entryId);
      const validated = entry === undefined ? null : validateJournalEntry(entry);
      if (validated === null) throw new JournalStorageError("entry-not-found");
      if (validated.attachment_ids.length >= MAX_JOURNAL_ATTACHMENTS) {
        throw new JournalStorageError("attachment-limit");
      }
      const next = validateJournalEntry({
        ...validated,
        attachment_ids: [...validated.attachment_ids, attachment.id],
        updated_at: timestamp,
      });
      if (next === null) throw new JournalStorageError("invalid-entry");
      await db.journalAttachments.add(attachment);
      await db.journalEntries.put(next);
    });
    return attachment;
  } catch (error) {
    throw classifyStorageError(error);
  }
}

export async function listJournalAttachments(
  entryIds?: ReadonlySet<string>,
): Promise<JournalImageAttachment[]> {
  try {
    const rows = await journalDatabase().journalAttachments.toArray();
    const validated: JournalImageAttachment[] = [];
    for (const row of rows) {
      if (entryIds !== undefined && !entryIds.has(row.journal_entry_id)) continue;
      const safe = validateJournalImageAttachment(row);
      if (safe === null) throw new JournalStorageError("storage-corrupted");
      validated.push(safe);
    }
    return validated.sort((left, right) => left.id.localeCompare(right.id));
  } catch (error) {
    throw classifyStorageError(error);
  }
}

export async function getJournalAttachment(id: string): Promise<JournalImageAttachment | null> {
  if (!isUuidV4(id)) throw new JournalStorageError("invalid-attachment");
  try {
    const attachment = await journalDatabase().journalAttachments.get(id);
    if (attachment === undefined) return null;
    const validated = validateJournalImageAttachment(attachment);
    if (validated === null) throw new JournalStorageError("storage-corrupted");
    return validated;
  } catch (error) {
    throw classifyStorageError(error);
  }
}

export type JournalImportWriteResult = Readonly<{
  added: number;
  kept_local: number;
  replaced: number;
}>;

export async function applyJournalImport(
  entries: ReadonlyArray<JournalEntry>,
  attachments: ReadonlyArray<JournalImageAttachment>,
  replaceEntryIds: ReadonlySet<string>,
): Promise<JournalImportWriteResult> {
  const validatedEntries = new Map<string, JournalEntry>();
  for (const entry of entries) {
    const safe = validateJournalEntry(entry);
    if (safe === null || validatedEntries.has(safe.id)) {
      throw new JournalStorageError("invalid-entry");
    }
    validatedEntries.set(safe.id, safe);
  }

  const attachmentsByEntry = new Map<string, JournalImageAttachment[]>();
  const seenAttachmentIds = new Set<string>();
  for (const attachment of attachments) {
    const safe = validateJournalImageAttachment(attachment);
    if (
      safe === null ||
      seenAttachmentIds.has(safe.id) ||
      !validatedEntries.has(safe.journal_entry_id)
    ) {
      throw new JournalStorageError("invalid-attachment");
    }
    seenAttachmentIds.add(safe.id);
    const group = attachmentsByEntry.get(safe.journal_entry_id) ?? [];
    group.push(safe);
    attachmentsByEntry.set(safe.journal_entry_id, group);
  }

  for (const entry of validatedEntries.values()) {
    const expected = new Set(entry.attachment_ids);
    const actual = attachmentsByEntry.get(entry.id) ?? [];
    if (expected.size !== actual.length || actual.some((item) => !expected.has(item.id))) {
      throw new JournalStorageError("invalid-attachment");
    }
  }

  const db = journalDatabase();
  try {
    return await db.transaction("rw", db.journalEntries, db.journalAttachments, async () => {
      const existingRows = await db.journalEntries.bulkGet([...validatedEntries.keys()]);
      const existingIds = new Set(
        existingRows
          .filter((entry): entry is JournalEntry => entry !== undefined)
          .map((entry) => entry.id),
      );
      const additions = entries.filter((entry) => !existingIds.has(entry.id));
      if ((await db.journalEntries.count()) + additions.length > MAX_JOURNAL_ENTRIES) {
        throw new JournalStorageError("entry-limit");
      }

      let added = 0;
      let keptLocal = 0;
      let replaced = 0;
      for (const entry of entries) {
        const exists = existingIds.has(entry.id);
        if (exists && !replaceEntryIds.has(entry.id)) {
          keptLocal += 1;
          continue;
        }
        if (exists) {
          await db.journalAttachments.where("journal_entry_id").equals(entry.id).delete();
          replaced += 1;
        } else {
          added += 1;
        }
        await db.journalEntries.put(entry);
        const group = attachmentsByEntry.get(entry.id) ?? [];
        if (group.length > 0) await db.journalAttachments.bulkPut(group);
      }
      return { added, kept_local: keptLocal, replaced };
    });
  } catch (error) {
    throw classifyStorageError(error);
  }
}

export async function deleteJournalEntry(id: string): Promise<boolean> {
  if (!isUuidV4(id)) throw new JournalStorageError("invalid-entry");
  const db = journalDatabase();
  try {
    return await db.transaction("rw", db.journalEntries, db.journalAttachments, async () => {
      const existing = await db.journalEntries.get(id);
      if (existing === undefined) return false;
      await db.journalAttachments.where("journal_entry_id").equals(id).delete();
      await db.journalEntries.delete(id);
      return true;
    });
  } catch (error) {
    throw classifyStorageError(error);
  }
}

export async function clearJournalDatabase(): Promise<void> {
  const db = journalDatabase();
  try {
    await db.transaction("rw", db.journalEntries, db.journalAttachments, async () => {
      await db.journalAttachments.clear();
      await db.journalEntries.clear();
    });
  } catch (error) {
    throw classifyStorageError(error);
  }
}

export async function closeJournalDatabase(): Promise<void> {
  database?.close();
  database = null;
}
