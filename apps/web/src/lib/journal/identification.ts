"use client";

import type { IdentificationSolutionResponse } from "@lumina/api-client";

import {
  attachJournalImage,
  createJournalEntryInDatabase,
  deleteJournalEntry,
  type JournalStorageFailureReason,
} from "./database";
import {
  MAX_JOURNAL_OBJECTS,
  type ConfirmedJournalLocation,
  type ConfirmedObservationTime,
  type JournalEntry,
  type JournalEntryInput,
  type JournalObjectReference,
} from "./model";

export type IdentificationJournalInput = Readonly<{
  attachImage: boolean;
  camera: string;
  completedAt: string;
  conditions: string;
  locationLabel: string;
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  notes: string;
  observationTimeUtc: string | null;
  sourceImage: File | null;
  solution: IdentificationSolutionResponse;
  telescope: string;
  title: string;
}>;

export type IdentificationJournalSaveFailureReason =
  JournalStorageFailureReason | "invalid-journal-input" | "attachment-rollback-failed";

export class IdentificationJournalSaveError extends Error {
  readonly reason: IdentificationJournalSaveFailureReason;

  constructor(reason: IdentificationJournalSaveFailureReason) {
    super("The solved observation could not be saved to the local journal.");
    this.name = "IdentificationJournalSaveError";
    this.reason = reason;
  }
}

function confirmedTime(value: string | null): ConfirmedObservationTime | null {
  return value === null ? null : { confirmed_by_user: true, utc: value };
}

function confirmedLocation(input: IdentificationJournalInput): ConfirmedJournalLocation | null {
  const label = input.locationLabel.trim();
  const hasCoordinates = input.latitudeDeg !== null || input.longitudeDeg !== null;
  if (label.length === 0 && !hasCoordinates) return null;
  if (label.length === 0 || (input.latitudeDeg === null) !== (input.longitudeDeg === null)) {
    throw new IdentificationJournalSaveError("invalid-journal-input");
  }
  return {
    confirmed_by_user: true,
    label,
    latitude_deg: input.latitudeDeg,
    longitude_deg: input.longitudeDeg,
  };
}

function equipment(input: IdentificationJournalInput): string[] {
  const values: string[] = [];
  const telescope = input.telescope.trim();
  const camera = input.camera.trim();
  if (telescope.length > 0) values.push(`Telescope: ${telescope}`);
  if (camera.length > 0) values.push(`Camera: ${camera}`);
  return values;
}

function annotationObjects(solution: IdentificationSolutionResponse): JournalObjectReference[] {
  const seen = new Set<string>();
  const objects: JournalObjectReference[] = [];
  for (const annotation of solution.annotations) {
    for (const rawName of annotation.names) {
      const name = rawName.trim();
      if (name.length === 0) continue;
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      objects.push({ entity_id: null, name, source: "plate_annotation" });
      if (objects.length >= MAX_JOURNAL_OBJECTS) return objects;
    }
  }
  return objects;
}

export function identificationJournalEntryInput(
  input: IdentificationJournalInput,
  snapshotId: string,
): JournalEntryInput {
  if (input.completedAt.length === 0 || input.title.trim().length === 0) {
    throw new IdentificationJournalSaveError("invalid-journal-input");
  }
  const solverVersion = input.solution.solver_version?.trim() || "not reported";
  return {
    conditions: input.conditions.trim() || null,
    equipment: equipment(input),
    location: confirmedLocation(input),
    notes: input.notes.trim(),
    objects: annotationObjects(input.solution),
    observed_time: confirmedTime(input.observationTimeUtc),
    plate_solve: {
      center_dec_deg: input.solution.calibration.center_dec_deg,
      center_ra_deg: input.solution.calibration.center_ra_deg,
      frame: input.solution.wcs.coordinate_frame === "icrs" ? "ICRS" : "FK5 J2000",
      orientation_deg: input.solution.calibration.orientation_deg,
      parity: input.solution.calibration.parity === 1 ? "positive" : "negative",
      pixel_scale_arcsec: input.solution.calibration.pixel_scale_arcsec_per_pixel,
      radius_deg: input.solution.calibration.radius_deg,
      snapshot_id: snapshotId,
      solved_at: input.completedAt,
      solver_version: solverVersion,
      wcs_source_sha256: input.solution.wcs.source_sha256,
    },
    title: input.title,
  };
}

function localSnapshotId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new IdentificationJournalSaveError("storage-unavailable");
  }
  return crypto.randomUUID();
}

export async function saveIdentificationSolutionToJournal(
  input: IdentificationJournalInput,
): Promise<JournalEntry> {
  let entry: JournalEntry;
  try {
    entry = await createJournalEntryInDatabase(
      identificationJournalEntryInput(input, localSnapshotId()),
    );
  } catch (error) {
    if (error instanceof IdentificationJournalSaveError) throw error;
    const reason =
      typeof error === "object" && error !== null && "reason" in error
        ? (error as { reason: JournalStorageFailureReason }).reason
        : "storage-write-failed";
    throw new IdentificationJournalSaveError(reason);
  }

  if (!input.attachImage) return entry;
  if (input.sourceImage === null) {
    await rollbackEntry(entry.id);
    throw new IdentificationJournalSaveError("invalid-journal-input");
  }
  try {
    await attachJournalImage(entry.id, input.sourceImage);
    return entry;
  } catch (error) {
    try {
      await rollbackEntry(entry.id);
    } catch {
      throw new IdentificationJournalSaveError("attachment-rollback-failed");
    }
    const reason =
      typeof error === "object" && error !== null && "reason" in error
        ? (error as { reason: JournalStorageFailureReason }).reason
        : "storage-write-failed";
    throw new IdentificationJournalSaveError(reason);
  }
}

async function rollbackEntry(entryId: string): Promise<void> {
  const deleted = await deleteJournalEntry(entryId);
  if (!deleted) throw new IdentificationJournalSaveError("attachment-rollback-failed");
}
