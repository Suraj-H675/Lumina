"use client";

import {
  MAX_JOURNAL_ATTACHMENT_BYTES,
  applyJournalImport,
  listJournalAttachments,
  listJournalEntries,
  type JournalImageAttachment,
  type JournalImportWriteResult,
} from "./database";
import {
  MAX_JOURNAL_ENTRIES,
  journalEntryWithImportProvenance,
  validateJournalEntry,
  type JournalEntry,
} from "./model";

export const JOURNAL_EXPORT_FORMAT = "lumina-personal-data" as const;
export const JOURNAL_EXPORT_SCHEMA_VERSION = 1 as const;
export const MAX_JOURNAL_IMPORT_BYTES = 64 * 1024 * 1024;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

type ExportedAttachment = Readonly<{
  id: string;
  schema_version: 1;
  journal_entry_id: string;
  created_at: string;
  updated_at: string;
  mime_type: "image/jpeg" | "image/png";
  byte_size: number;
  sha256: string;
  data_base64: string;
}>;

type JournalExportSection = Readonly<{
  entries: JournalEntry[];
  attachments: ExportedAttachment[];
}>;

export type JournalExport = Readonly<{
  format: "lumina-personal-data";
  schema_version: 1;
  exported_at: string;
  sections: Readonly<{ journal: JournalExportSection }>;
  checksums: Readonly<{ journal: string }>;
}>;

export type ParsedJournalImport = Readonly<{
  exported_at: string;
  entries: JournalEntry[];
  attachments: JournalImageAttachment[];
}>;

export type JournalConflictDecision = "keep_local" | "use_imported";

export type JournalImportConflict = Readonly<{
  id: string;
  local_updated_at: string;
  incoming_updated_at: string;
  recommendation: JournalConflictDecision;
}>;

export type JournalImportPreview = Readonly<{
  added_ids: string[];
  conflicts: JournalImportConflict[];
  exported_at: string;
}>;

export class JournalExportError extends Error {
  readonly code:
    | "JOURNAL_EXPORT_INVALID"
    | "JOURNAL_EXPORT_TOO_LARGE"
    | "JOURNAL_IMPORT_INVALID"
    | "JOURNAL_IMPORT_CONFLICT_UNRESOLVED"
    | "JOURNAL_IMPORT_PREVIEW_STALE";

  constructor(code: JournalExportError["code"]) {
    super("The local journal export or import could not be safely processed.");
    this.name = "JournalExportError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle === undefined)
    throw new JournalExportError("JOURNAL_EXPORT_INVALID");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Text(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (!BASE64_PATTERN.test(value)) throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  let decoded: string;
  try {
    decoded = atob(value);
  } catch {
    throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  if (bytesToBase64(bytes) !== value) throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  return bytes;
}

function canonicalSection(section: JournalExportSection): string {
  return JSON.stringify(section);
}

function sortedEntries(entries: ReadonlyArray<JournalEntry>): JournalEntry[] {
  return [...entries].sort((left, right) => left.id.localeCompare(right.id));
}

function exportedAttachmentSkeleton(attachment: JournalImageAttachment): ExportedAttachment {
  return {
    byte_size: attachment.byte_size,
    created_at: attachment.created_at,
    data_base64: "",
    id: attachment.id,
    journal_entry_id: attachment.journal_entry_id,
    mime_type: attachment.mime_type,
    schema_version: 1,
    sha256: attachment.sha256,
    updated_at: attachment.updated_at,
  };
}

function encodedBase64Length(byteSize: number): number {
  return 4 * Math.ceil(byteSize / 3);
}

function estimatedExportBytes(
  exportedAt: string,
  entries: ReadonlyArray<JournalEntry>,
  attachments: ReadonlyArray<JournalImageAttachment>,
): number {
  const section: JournalExportSection = {
    attachments: attachments.map(exportedAttachmentSkeleton),
    entries: [...entries],
  };
  const skeleton: JournalExport = {
    checksums: { journal: "0".repeat(64) },
    exported_at: exportedAt,
    format: JOURNAL_EXPORT_FORMAT,
    schema_version: JOURNAL_EXPORT_SCHEMA_VERSION,
    sections: { journal: section },
  };
  return (
    new TextEncoder().encode(JSON.stringify(skeleton)).byteLength +
    attachments.reduce((total, attachment) => total + encodedBase64Length(attachment.byte_size), 0)
  );
}

function attachmentLinkageIsComplete(
  entries: ReadonlyArray<JournalEntry>,
  attachments: ReadonlyArray<JournalImageAttachment>,
): boolean {
  const attachmentsByEntry = new Map<string, Set<string>>();
  for (const attachment of attachments) {
    const current = attachmentsByEntry.get(attachment.journal_entry_id) ?? new Set<string>();
    if (current.has(attachment.id)) return false;
    current.add(attachment.id);
    attachmentsByEntry.set(attachment.journal_entry_id, current);
  }
  return entries.every((entry) => {
    const expected = new Set(entry.attachment_ids);
    const actual = attachmentsByEntry.get(entry.id) ?? new Set<string>();
    return expected.size === actual.size && [...actual].every((id) => expected.has(id));
  });
}

async function exportAttachment(attachment: JournalImageAttachment): Promise<ExportedAttachment> {
  const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
  const actualSha = await sha256Bytes(bytes);
  if (actualSha !== attachment.sha256) throw new JournalExportError("JOURNAL_EXPORT_INVALID");
  return {
    byte_size: attachment.byte_size,
    created_at: attachment.created_at,
    data_base64: bytesToBase64(bytes),
    id: attachment.id,
    journal_entry_id: attachment.journal_entry_id,
    mime_type: attachment.mime_type,
    schema_version: 1,
    sha256: attachment.sha256,
    updated_at: attachment.updated_at,
  };
}

export async function createJournalExport(
  exportedAt: string,
  selectedEntryIds?: ReadonlySet<string>,
): Promise<string> {
  if (!canonicalTimestamp(exportedAt)) throw new JournalExportError("JOURNAL_EXPORT_INVALID");
  const allEntries = await listJournalEntries();
  const selected =
    selectedEntryIds === undefined
      ? allEntries
      : allEntries.filter((entry) => selectedEntryIds.has(entry.id));
  if (selectedEntryIds !== undefined && selected.length !== selectedEntryIds.size) {
    throw new JournalExportError("JOURNAL_EXPORT_INVALID");
  }
  const entries = sortedEntries(selected);
  const entryIds = new Set(entries.map((entry) => entry.id));
  const attachments = await listJournalAttachments(entryIds);
  if (!attachmentLinkageIsComplete(entries, attachments)) {
    throw new JournalExportError("JOURNAL_EXPORT_INVALID");
  }
  if (estimatedExportBytes(exportedAt, entries, attachments) > MAX_JOURNAL_IMPORT_BYTES) {
    throw new JournalExportError("JOURNAL_EXPORT_TOO_LARGE");
  }
  const exportedAttachments: ExportedAttachment[] = [];
  for (const attachment of attachments)
    exportedAttachments.push(await exportAttachment(attachment));
  exportedAttachments.sort((left, right) => left.id.localeCompare(right.id));
  const section: JournalExportSection = { attachments: exportedAttachments, entries };
  const output: JournalExport = {
    checksums: { journal: await sha256Text(canonicalSection(section)) },
    exported_at: exportedAt,
    format: JOURNAL_EXPORT_FORMAT,
    schema_version: JOURNAL_EXPORT_SCHEMA_VERSION,
    sections: { journal: section },
  };
  const serialized = JSON.stringify(output);
  if (new TextEncoder().encode(serialized).byteLength > MAX_JOURNAL_IMPORT_BYTES) {
    throw new JournalExportError("JOURNAL_EXPORT_TOO_LARGE");
  }
  return serialized;
}

function parseExportedAttachment(value: unknown): ExportedAttachment {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "schema_version",
      "journal_entry_id",
      "created_at",
      "updated_at",
      "mime_type",
      "byte_size",
      "sha256",
      "data_base64",
    ]) ||
    typeof value.id !== "string" ||
    value.schema_version !== 1 ||
    typeof value.journal_entry_id !== "string" ||
    !canonicalTimestamp(value.created_at) ||
    !canonicalTimestamp(value.updated_at) ||
    (value.mime_type !== "image/jpeg" && value.mime_type !== "image/png") ||
    !Number.isInteger(value.byte_size) ||
    Number(value.byte_size) <= 0 ||
    Number(value.byte_size) > MAX_JOURNAL_ATTACHMENT_BYTES ||
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256) ||
    typeof value.data_base64 !== "string"
  ) {
    throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  }
  return value as ExportedAttachment;
}

async function importAttachment(value: ExportedAttachment): Promise<JournalImageAttachment> {
  const bytes = base64ToBytes(value.data_base64);
  if (bytes.byteLength !== value.byte_size) throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  if ((await sha256Bytes(bytes)) !== value.sha256)
    throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  return {
    blob: new Blob([ownedArrayBuffer(bytes)], { type: value.mime_type }),
    byte_size: value.byte_size,
    created_at: value.created_at,
    id: value.id,
    journal_entry_id: value.journal_entry_id,
    mime_type: value.mime_type,
    schema_version: 1,
    sha256: value.sha256,
    updated_at: value.updated_at,
  };
}

export async function parseJournalExport(raw: string): Promise<ParsedJournalImport> {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).byteLength > MAX_JOURNAL_IMPORT_BYTES
  ) {
    throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  }
  if (
    !isRecord(parsed) ||
    !hasOnlyKeys(parsed, ["format", "schema_version", "exported_at", "sections", "checksums"]) ||
    parsed.format !== JOURNAL_EXPORT_FORMAT ||
    parsed.schema_version !== JOURNAL_EXPORT_SCHEMA_VERSION ||
    !canonicalTimestamp(parsed.exported_at) ||
    !isRecord(parsed.sections) ||
    !hasOnlyKeys(parsed.sections, ["journal"]) ||
    !isRecord(parsed.sections.journal) ||
    !hasOnlyKeys(parsed.sections.journal, ["entries", "attachments"]) ||
    !Array.isArray(parsed.sections.journal.entries) ||
    parsed.sections.journal.entries.length > MAX_JOURNAL_ENTRIES ||
    !Array.isArray(parsed.sections.journal.attachments) ||
    !isRecord(parsed.checksums) ||
    !hasOnlyKeys(parsed.checksums, ["journal"]) ||
    typeof parsed.checksums.journal !== "string" ||
    !SHA256_PATTERN.test(parsed.checksums.journal)
  ) {
    throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  }

  const entries: JournalEntry[] = [];
  const entryIds = new Set<string>();
  for (const value of parsed.sections.journal.entries) {
    const entry = validateJournalEntry(value);
    if (entry === null || entryIds.has(entry.id))
      throw new JournalExportError("JOURNAL_IMPORT_INVALID");
    entryIds.add(entry.id);
    entries.push(entry);
  }
  const exportedAttachments = parsed.sections.journal.attachments.map(parseExportedAttachment);
  const section: JournalExportSection = {
    attachments: exportedAttachments,
    entries,
  };
  if ((await sha256Text(canonicalSection(section))) !== parsed.checksums.journal) {
    throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  }
  const attachments = await Promise.all(exportedAttachments.map(importAttachment));
  const attachmentIds = new Set<string>();
  const attachmentsByEntry = new Map<string, string[]>();
  for (const attachment of attachments) {
    if (attachmentIds.has(attachment.id) || !entryIds.has(attachment.journal_entry_id)) {
      throw new JournalExportError("JOURNAL_IMPORT_INVALID");
    }
    attachmentIds.add(attachment.id);
    const group = attachmentsByEntry.get(attachment.journal_entry_id) ?? [];
    group.push(attachment.id);
    attachmentsByEntry.set(attachment.journal_entry_id, group);
  }
  for (const entry of entries) {
    const expected = new Set(entry.attachment_ids);
    const actual = attachmentsByEntry.get(entry.id) ?? [];
    if (expected.size !== actual.length || actual.some((id) => !expected.has(id))) {
      throw new JournalExportError("JOURNAL_IMPORT_INVALID");
    }
  }
  return {
    attachments,
    entries: sortedEntries(entries),
    exported_at: parsed.exported_at,
  };
}

export async function previewJournalImport(
  bundle: ParsedJournalImport,
): Promise<JournalImportPreview> {
  const localEntries = await listJournalEntries();
  const localById = new Map(localEntries.map((entry) => [entry.id, entry]));
  const addedIds: string[] = [];
  const conflicts: JournalImportConflict[] = [];
  for (const incoming of bundle.entries) {
    const local = localById.get(incoming.id);
    if (local === undefined) {
      addedIds.push(incoming.id);
      continue;
    }
    conflicts.push({
      id: incoming.id,
      incoming_updated_at: incoming.updated_at,
      local_updated_at: local.updated_at,
      recommendation: incoming.updated_at > local.updated_at ? "use_imported" : "keep_local",
    });
  }
  return {
    added_ids: addedIds.sort(),
    conflicts: conflicts.sort((left, right) => left.id.localeCompare(right.id)),
    exported_at: bundle.exported_at,
  };
}

export async function applyJournalImportPreview(
  bundle: ParsedJournalImport,
  preview: JournalImportPreview,
  decisions: ReadonlyMap<string, JournalConflictDecision>,
  importedAt: string,
): Promise<JournalImportWriteResult> {
  if (!canonicalTimestamp(importedAt) || preview.exported_at !== bundle.exported_at) {
    throw new JournalExportError("JOURNAL_IMPORT_PREVIEW_STALE");
  }
  for (const conflict of preview.conflicts) {
    if (!decisions.has(conflict.id)) {
      throw new JournalExportError("JOURNAL_IMPORT_CONFLICT_UNRESOLVED");
    }
  }
  if ([...decisions.keys()].some((id) => !preview.conflicts.some((item) => item.id === id))) {
    throw new JournalExportError("JOURNAL_IMPORT_INVALID");
  }

  const currentById = new Map((await listJournalEntries()).map((entry) => [entry.id, entry]));
  const conflictById = new Map(preview.conflicts.map((conflict) => [conflict.id, conflict]));
  for (const incoming of bundle.entries) {
    const current = currentById.get(incoming.id);
    const expectedConflict = conflictById.get(incoming.id);
    if (expectedConflict === undefined) {
      if (current !== undefined) throw new JournalExportError("JOURNAL_IMPORT_PREVIEW_STALE");
      continue;
    }
    if (current === undefined || current.updated_at !== expectedConflict.local_updated_at) {
      throw new JournalExportError("JOURNAL_IMPORT_PREVIEW_STALE");
    }
  }

  const importedEntries = bundle.entries.map((entry) =>
    journalEntryWithImportProvenance(entry, bundle.exported_at, importedAt),
  );
  const replaceIds = new Set(
    preview.conflicts
      .filter((conflict) => decisions.get(conflict.id) === "use_imported")
      .map((conflict) => conflict.id),
  );
  return applyJournalImport(importedEntries, bundle.attachments, replaceIds);
}
